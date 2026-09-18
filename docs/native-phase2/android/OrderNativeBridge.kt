package com.smspro.order

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * MethodChannel bridge between the Flutter/Dart layer and this native order module.
 *
 * Dart → Native (methods handled here):
 *   startRing(map)          start the alarm foreground service for an event
 *   stopRing()              stop the ring
 *   getFcmToken()           return the stored FCM token
 *   openBatterySettings()   open battery-optimisation / autostart settings
 *   setAuthContext(map)     { baseUrl, tokens: { RESTAURANT|DELIVERY_PARTNER|...: token } }
 *
 * Native → Dart (invoked when the engine is alive):
 *   onOrderEvent(map)       a fresh FCM event (Dart forwards to window.onNativeEvent)
 *   onFcmToken(string)      a refreshed FCM token
 *
 * Wire it up in MainActivity.configureFlutterEngine(flutterEngine) by calling
 * `OrderNativeBridge.register(flutterEngine, this)`.
 */
object OrderNativeBridge {
    const val CHANNEL = "com.smspro/order_native"

    private var channel: MethodChannel? = null
    private var appContext: Context? = null
    private val main = Handler(Looper.getMainLooper())

    fun register(engine: FlutterEngine, context: Context) {
        appContext = context.applicationContext
        val ch = MethodChannel(engine.dartExecutor.binaryMessenger, CHANNEL)
        channel = ch
        ch.setMethodCallHandler { call, result ->
            val ctx = appContext ?: context.applicationContext
            when (call.method) {
                "startRing" -> {
                    @Suppress("UNCHECKED_CAST")
                    val map = (call.arguments as? Map<String, Any?>)?.mapValues { it.value?.toString() ?: "" }
                        ?: emptyMap()
                    RingForegroundService.start(ctx, OrderEvent.fromData(map))
                    result.success(true)
                }
                "stopRing" -> {
                    RingForegroundService.stop(ctx)
                    result.success(true)
                }
                "getFcmToken" -> result.success(AuthContextStore.getFcmToken(ctx))
                "openBatterySettings" -> {
                    openBatterySettings(ctx)
                    result.success(true)
                }
                "setAuthContext" -> {
                    (call.argument<String>("baseUrl"))?.let { AuthContextStore.setBaseUrl(ctx, it) }
                    (call.argument<Map<String, String>>("tokens"))?.forEach { (owner, token) ->
                        AuthContextStore.setAccessToken(ctx, owner, token)
                    }
                    result.success(true)
                }
                else -> result.notImplemented()
            }
        }
    }

    fun deliverToFlutterIfAlive(event: OrderEvent) {
        val ch = channel ?: return
        main.post { ch.invokeMethod("onOrderEvent", event.raw) }
    }

    fun deliverTokenToFlutterIfAlive(token: String) {
        val ch = channel ?: return
        main.post { ch.invokeMethod("onFcmToken", token) }
    }

    /** Best-effort: request ignore-battery-optimisations, then OEM autostart pages. */
    private fun openBatterySettings(context: Context) {
        try {
            val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        } catch (_: Exception) {
            try {
                context.startActivity(
                    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                        .setData(Uri.parse("package:${context.packageName}"))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
            } catch (_: Exception) { /* give up silently */ }
        }
        openOemAutostart(context)
    }

    /** Xiaomi/Oppo/Vivo/etc. autostart managers — wrapped so an unknown OEM is a no-op. */
    private fun openOemAutostart(context: Context) {
        val components = listOf(
            "com.miui.securitycenter" to "com.miui.permcenter.autostart.AutoStartManagementActivity",
            "com.coloros.safecenter" to "com.coloros.safecenter.permission.startup.StartupAppListActivity",
            "com.coloros.safecenter" to "com.coloros.safecenter.startupapp.StartupAppListActivity",
            "com.vivo.permissionmanager" to "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
            "com.oppo.safe" to "com.oppo.safe.permission.startup.StartupAppListActivity",
            "com.letv.android.letvsafe" to "com.letv.android.letvsafe.AutobootManageActivity",
        )
        val manufacturer = Build.MANUFACTURER.lowercase()
        if (manufacturer !in listOf("xiaomi", "oppo", "vivo", "letv", "realme", "oneplus")) return
        for ((pkg, cls) in components) {
            try {
                val intent = Intent().setClassName(pkg, cls).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
                return
            } catch (_: Exception) { /* try next */ }
        }
    }
}
