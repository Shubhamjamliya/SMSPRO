// Phase 2 — Flutter/Dart glue for the real-time order system.
//
// Responsibilities (the critical killed-app ring path is owned by native Kotlin —
// OrderFcmService + RingForegroundService — see ../android/):
//   1. Request notification permission and fetch the FCM token, register it with the backend.
//   2. Register the flutter_inappwebview JS-bridge handlers the web app calls
//      (startRing / stopRing / getFcmToken / openBatterySettings / setAuthContext) — these
//      match Frontend/src/core/native/nativeBridge.js.
//   3. Receive events the native layer forwards while the engine is alive (onOrderEvent) and
//      inject them into the web app via `window.onNativeEvent(...)`.
//   4. Push the FCM token + auth context (base URL, per-role tokens) down to native so the
//      notification Accept/Reject receiver can call the backend when the app is killed.
//
// Deps (already in this app): flutter_inappwebview, firebase_messaging, firebase_core.

import 'dart:convert';
import 'package:flutter/services.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

class OrderNative {
  OrderNative._();
  static final OrderNative instance = OrderNative._();

  static const MethodChannel _channel =
      MethodChannel('com.smspro/order_native');

  InAppWebViewController? _webController;

  /// Call once during app startup (after Firebase.initializeApp()).
  Future<void> init() async {
    // Native → Dart callbacks (fired when the engine is alive).
    _channel.setMethodCallHandler((call) async {
      switch (call.method) {
        case 'onOrderEvent':
          _injectIntoWeb(Map<String, dynamic>.from(call.arguments as Map));
          break;
        case 'onFcmToken':
          await _registerTokenWithBackend(call.arguments as String);
          break;
      }
      return null;
    });

    // Notification permission (Android 13+ POST_NOTIFICATIONS + iOS alert/sound).
    await FirebaseMessaging.instance.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    final token = await FirebaseMessaging.instance.getToken();
    if (token != null) await _registerTokenWithBackend(token);
    FirebaseMessaging.instance.onTokenRefresh.listen(_registerTokenWithBackend);

    // Cold start from a notification tap → let the web app deep-link once it attaches.
    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) _pendingColdStart = initial.data;
  }

  Map<String, dynamic>? _pendingColdStart;

  /// Register the web-facing JS handlers. Call this when the InAppWebView is created:
  ///   onWebViewCreated: (controller) => OrderNative.instance.attachWebView(controller),
  void attachWebView(InAppWebViewController controller) {
    _webController = controller;

    controller.addJavaScriptHandler(
      handlerName: 'startRing',
      callback: (args) async {
        final payload = _firstMap(args);
        await _channel.invokeMethod('startRing', payload);
        return true;
      },
    );
    controller.addJavaScriptHandler(
      handlerName: 'stopRing',
      callback: (args) async {
        await _channel.invokeMethod('stopRing');
        return true;
      },
    );
    controller.addJavaScriptHandler(
      handlerName: 'getFcmToken',
      callback: (args) async {
        final native = await _channel.invokeMethod<String>('getFcmToken');
        if (native != null && native.isNotEmpty) return native;
        return await FirebaseMessaging.instance.getToken();
      },
    );
    controller.addJavaScriptHandler(
      handlerName: 'openBatterySettings',
      callback: (args) async {
        await _channel.invokeMethod('openBatterySettings');
        return true;
      },
    );
    // The web app calls this whenever the logged-in module/token changes so the native
    // Accept/Reject receiver can authenticate when the app is killed.
    controller.addJavaScriptHandler(
      handlerName: 'setAuthContext',
      callback: (args) async {
        final payload = _firstMap(args);
        await _channel.invokeMethod('setAuthContext', {
          'baseUrl': payload['baseUrl'] ?? '',
          'tokens': Map<String, String>.from(payload['tokens'] ?? {}),
        });
        return true;
      },
    );

    // Flush a cold-start notification into the web app once it's ready.
    final pending = _pendingColdStart;
    if (pending != null) {
      _pendingColdStart = null;
      _injectIntoWeb(pending);
    }
  }

  void _injectIntoWeb(Map<String, dynamic> event) {
    final controller = _webController;
    if (controller == null) return;
    final json = const JsonEncoder().convert(event);
    // window.onNativeEvent is installed by nativeBridge.js (dedups by event_id).
    controller.evaluateJavascript(source: 'window.onNativeEvent && window.onNativeEvent($json);');
  }

  Future<void> _registerTokenWithBackend(String token) async {
    // TODO: POST the token to your backend token endpoint for the active module, e.g.
    //   PATCH /food/{user|restaurant|delivery|admin}/fcm-token  { token, platform: 'mobile' }
    // Reuse the same call the web app makes (firebaseMessaging.js) or expose a JS handler.
    // Left as an integration point because the auth/module is owned by the web app.
    _webController?.evaluateJavascript(
      source: "window.onNativeFcmToken && window.onNativeFcmToken(${jsonEncode(token)});",
    );
  }

  Map<String, dynamic> _firstMap(List<dynamic> args) {
    if (args.isEmpty) return {};
    final first = args.first;
    if (first is Map) return Map<String, dynamic>.from(first);
    if (first is String) {
      try {
        return Map<String, dynamic>.from(jsonDecode(first) as Map);
      } catch (_) {}
    }
    return {};
  }
}
