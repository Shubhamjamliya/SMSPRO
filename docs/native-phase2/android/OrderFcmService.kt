package com.smspro.order

import android.app.NotificationManager
import android.content.Context
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Receives FCM messages even when the Flutter engine / app is killed (this native service is
 * started by the OS). The backend sends **data-only, high-priority** messages, so
 * `remoteMessage.data` carries the order-event envelope.
 *
 * On a `ring: true` event → start the alarm foreground service and post the full-screen
 * Accept/Reject notification. Non-ring events → post the standard notification and let the
 * web app reconcile via /sync when it next opens (Phase 3).
 *
 * NOTE: register this service in AndroidManifest.xml with the FCM MESSAGING_EVENT intent
 * filter (see AndroidManifest.additions.xml). It replaces Flutter's default background
 * message routing for the critical ring path.
 */
class OrderFcmService : FirebaseMessagingService() {

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        val data = remoteMessage.data
        if (data.isEmpty()) return

        val event = OrderEvent.fromData(data)
        if (event.orderId.isBlank()) return

        // Simple native de-dup: ignore an event_id we already showed recently.
        if (event.eventId.isNotBlank() && SeenEvents.isDuplicate(this, event.eventId)) return

        OrderNotifications.ensureChannels(this)

        if (event.ring) {
            RingForegroundService.start(this, event)
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(
                OrderNotifications.INCOMING_NOTIFICATION_ID,
                OrderNotifications.buildIncomingOrderNotification(this, event),
            )
        } else {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(
                event.orderId.hashCode(),
                OrderNotifications.buildIncomingOrderNotification(this, event),
            )
        }

        // If the Flutter engine happens to be alive, hand the event to it so the web app can
        // act immediately (dedup by event_id happens again on the web side).
        OrderNativeBridge.deliverToFlutterIfAlive(event)
    }

    override fun onNewToken(token: String) {
        // Persist so Dart can read + register it with the backend on next launch, and hand it
        // to a live engine immediately.
        AuthContextStore.setFcmToken(this, token)
        OrderNativeBridge.deliverTokenToFlutterIfAlive(token)
    }
}

/** Tiny rolling de-dup of recently seen event_ids, backed by SharedPreferences. */
object SeenEvents {
    private const val PREFS = "order_seen_events"
    private const val KEY = "ids"
    private const val LIMIT = 200

    @Synchronized
    fun isDuplicate(context: Context, eventId: String): Boolean {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val csv = prefs.getString(KEY, "") ?: ""
        val ids = if (csv.isEmpty()) ArrayDeque() else ArrayDeque(csv.split(","))
        if (ids.contains(eventId)) return true
        ids.addLast(eventId)
        while (ids.size > LIMIT) ids.removeFirst()
        prefs.edit().putString(KEY, ids.joinToString(",")).apply()
        return false
    }
}
