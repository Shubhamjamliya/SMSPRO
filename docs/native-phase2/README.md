# Phase 2 — Native (Flutter shell): killed-app FCM ring + full-screen Accept/Reject

These are **drop-in reference files** for the separate **Flutter WebView** app (the shell that
wraps this web app via `flutter_inappwebview`). They are not wired into `just_order` itself —
copy them into the Flutter project and adjust the package name / integration points marked
`⚠️` / `TODO`.

The web side of Phase 2 already lives in this repo:
- [`Frontend/src/core/native/nativeBridge.js`](../../Frontend/src/core/native/nativeBridge.js) — the JS bridge contract these files implement.
- [`Frontend/src/index.jsx`](../../Frontend/src/index.jsx) — installs `window.onNativeEvent`.

## What this delivers

A **new order rings through silent/DND and shows a full-screen Accept/Reject notification even
when the app is killed**, because the critical path is native Kotlin (started by the OS), not
Dart:

```
Backend sends FCM data-only, high-priority  { ring:"true", expires_at, event_id, target, order_id … }
        │
        ▼
OrderFcmService (Kotlin, runs even if app killed)
        ├─ RingForegroundService  → looping MediaPlayer, USAGE_ALARM (bypasses silent/DND), auto-stops at expires_at
        └─ full-screen notification (Accept / Reject) over the lock screen
        │
   user taps Accept/Reject
        ▼
OrderActionReceiver → PATCH backend (Bearer + Idempotency-Key) → stopRing → deep-link into WebView
        │  (engine alive?) 
        ▼
OrderNativeBridge → Dart → window.onNativeEvent(...) → nativeBridge.js dedups by event_id
```

## File map

| File | Copy to | Role |
|---|---|---|
| `android/OrderFcmService.kt` | `android/app/src/main/kotlin/<pkg>/order/` | FirebaseMessagingService — killed-app entry; rings + notifies |
| `android/RingForegroundService.kt` | same | Looping alarm foreground service; auto-stop at `expires_at` |
| `android/OrderNotifications.kt` | same | Channels + full-screen Accept/Reject notification |
| `android/OrderActionReceiver.kt` | same | Accept/Reject → backend (OkHttp + idempotency) → stop + deep-link |
| `android/OrderEvent.kt` | same | Envelope parsed from FCM `data` |
| `android/AuthContextStore.kt` | same | Base URL + per-role token, written by the web via `setAuthContext` |
| `android/OrderNativeBridge.kt` | same | MethodChannel: Dart↔native + native→Dart delivery + battery/autostart |
| `android/MainActivity.snippet.kt` | merge into `MainActivity.kt` | Register the bridge; show over lock screen |
| `android/AndroidManifest.additions.xml` | merge into `AndroidManifest.xml` | Permissions, service/receiver registration, deep link |
| `flutter/order_native.dart` | `lib/native/` | FCM init, token registration, JS-bridge handlers, event injection |

## Dependencies

- **pubspec.yaml**: `firebase_core`, `firebase_messaging`, `flutter_inappwebview` (this app
  already uses the last one).
- **android/app/build.gradle**: `implementation("com.squareup.okhttp3:okhttp:4.12.0")` and the
  Google services plugin + `google-services.json`. `compileSdk`/`targetSdk` 34+, `minSdk` 26+.

## Integration steps

1. Copy the Kotlin files into `.../<pkg>/order/` and fix the `package` line + `com.smspro`
   references to your applicationId.
2. Merge `AndroidManifest.additions.xml` and the `MainActivity.snippet.kt` lines.
3. Copy `order_native.dart`; in `main()` after `Firebase.initializeApp()`:
   ```dart
   await OrderNative.instance.init();
   ```
   and on the InAppWebView:
   ```dart
   onWebViewCreated: (c) => OrderNative.instance.attachWebView(c),
   ```
4. **Web app auth handoff** — so native can Accept/Reject when killed, have the web app call the
   bridge whenever the module/token changes:
   ```js
   import { callNative } from '@/core/native/nativeBridge'
   callNative('setAuthContext', { baseUrl: API_BASE_URL, tokens: { RESTAURANT: token /*or DELIVERY_PARTNER*/ } })
   ```
5. **Onboarding** — during first run of the restaurant/delivery app, request notifications and
   guide the user to disable battery optimisation:
   ```js
   import { openBatterySettings } from '@/core/native/nativeBridge'
   openBatterySettings() // opens ignore-battery-optimisations + OEM autostart (Xiaomi/Oppo/Vivo)
   ```

## ⚠️ Backend hook required to exercise the ring

Phase 1 stamps the envelope onto the **restaurant status** path only. For the **new-order ring**
to fire, the new-order dispatch must send a data-only FCM with `ring:true`. Minimal addition
(Phase 3 migrates all sites; this can be done now):

```js
// where a new order is offered to the restaurant / driver:
import { emitOrderEvent } from '../../../core/notifications/orderEvents.service.js';
await emitOrderEvent({
  type: 'NEW_ORDER',
  orderId: order.orderId,
  targets: [{ ownerType: 'RESTAURANT', ownerId: order.restaurantId }],
  ring: true,
  expiresInSec: 30,
  socketEventNames: ['new_order', 'new_order_available'], // keep existing web listeners working
  data: { title: `New order #${order.orderId}`, body: '...' },
  fcm: { title: 'New order', body: `#${order.orderId}` },
});
```

## How to test

1. **Foreground:** open the restaurant app, place a customer order → socket shows it instantly;
   FCM data event is deduped by `event_id` (no double alert).
2. **Backgrounded:** background the app, place an order → full-screen notification + alarm ring;
   Accept → order moves to `confirmed`, ring stops.
3. **Killed:** swipe the app away, place an order → still rings via `OrderFcmService`
   (verify battery optimisation is off); Reject → `cancelled_by_restaurant`, ring stops.
4. **Idempotency:** double-tap Accept fast → backend applies once (`Idempotency-Key: act:<event_id>`).
5. **Expiry:** don't respond → ring auto-stops at `expires_at`.

## Remaining gaps after Phase 2

- [x] Native killed-app FCM data handling · [x] Foreground alarm ring · [x] Full-screen intent + Accept/Reject · [x] JS bridge (startRing/stopRing/getFcmToken/openBatterySettings) · [x] `window.onNativeEvent` intake + event_id dedup · [x] Battery/autostart onboarding entry point
- [ ] **Backend:** migrate new-order + all order emits to `emitOrderEvent` with `ring/expires_at` (the hook above) — folded into **Phase 3**.
- [ ] **Phase 3:** transactional outbox + relay, `GET /sync?since_seq=N`, client gap detection, watchdog escalation/IVR → then remove the 6 polls.
- [ ] **Phase 4:** Redis driver-busy lock, sequential dispatch, GPS 4–5s.
