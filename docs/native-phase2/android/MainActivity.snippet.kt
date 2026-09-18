package com.smspro

// This is a SNIPPET showing the additions to your existing FlutterActivity-based
// MainActivity — not a full replacement. Merge the marked lines into your MainActivity.kt.

import android.os.Build
import android.os.Bundle
import com.smspro.order.OrderNativeBridge
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine

class MainActivity : FlutterActivity() {

    // ── ADD: register the order MethodChannel bridge with the Flutter engine ──
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        OrderNativeBridge.register(flutterEngine, this)
    }

    // ── ADD: let the full-screen intent show this activity over the lock screen ──
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
            )
        }
    }
}
