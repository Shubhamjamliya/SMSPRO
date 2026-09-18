package com.smspro.order

// ⚠️ Replace `com.smspro` above and everywhere below with your Flutter app's
// applicationId (see android/app/build.gradle `applicationId`). Place these .kt files under
// android/app/src/main/kotlin/<your/package/path>/order/.

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat

/**
 * Notification channels + the full-screen "incoming order" notification with Accept/Reject.
 *
 * The ORDERS channel is IMPORTANCE_HIGH with a full-screen intent so a new order shows over
 * the lock screen even when the app is killed. Audio for the persistent ring is owned by
 * [RingForegroundService] (USAGE_ALARM), so this channel's own sound is silent to avoid a
 * double tone.
 */
object OrderNotifications {

    const val ORDERS_CHANNEL_ID = "orders_high_priority"
    const val RING_CHANNEL_ID = "orders_ring_foreground"
    const val INCOMING_NOTIFICATION_ID = 4711

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Full-screen incoming-order channel (silent — ring service plays the alarm tone).
        val orders = NotificationChannel(
            ORDERS_CHANNEL_ID,
            "New Orders",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Alerts for new incoming orders"
            setSound(null, null)
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 500, 500, 500)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }

        // Low-importance channel for the persistent foreground-service notification.
        val ring = NotificationChannel(
            RING_CHANNEL_ID,
            "Order Ringing",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Shown while an incoming order is ringing"
            setSound(null, null)
        }

        nm.createNotificationChannel(orders)
        nm.createNotificationChannel(ring)
    }

    /** Full-screen incoming-order notification with Accept / Reject actions. */
    fun buildIncomingOrderNotification(context: Context, event: OrderEvent): Notification {
        ensureChannels(context)

        // Tapping the body (or Accept) deep-links into the app at the order.
        val contentIntent = deepLinkIntent(context, event)
        val fullScreenPending = PendingIntent.getActivity(
            context,
            event.orderId.hashCode(),
            contentIntent,
            pendingFlags(),
        )

        val acceptPending = actionPending(context, event, OrderActionReceiver.ACTION_ACCEPT)
        val rejectPending = actionPending(context, event, OrderActionReceiver.ACTION_REJECT)

        return NotificationCompat.Builder(context, ORDERS_CHANNEL_ID)
            .setSmallIcon(context.applicationInfo.icon)
            .setContentTitle(event.title.ifBlank { "New order #${event.orderId}" })
            .setContentText(event.body.ifBlank { "Tap to view the order" })
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setOngoing(true)
            .setFullScreenIntent(fullScreenPending, true) // shows over the lock screen
            .setContentIntent(fullScreenPending)
            .addAction(0, "Accept", acceptPending)
            .addAction(0, "Reject", rejectPending)
            .build()
    }

    private fun actionPending(context: Context, event: OrderEvent, action: String): PendingIntent {
        val intent = Intent(context, OrderActionReceiver::class.java).apply {
            this.action = action
            putExtras(event.toBundle())
        }
        return PendingIntent.getBroadcast(
            context,
            (action + event.orderId).hashCode(),
            intent,
            pendingFlags(),
        )
    }

    private fun deepLinkIntent(context: Context, event: OrderEvent): Intent {
        // Launches the Flutter activity with a deep-link path the web app reads on resume.
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?: Intent(Intent.ACTION_MAIN)
        launch.action = Intent.ACTION_VIEW
        launch.data = Uri.parse("smspro://order/${event.orderId}")
        launch.putExtras(event.toBundle())
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return launch
    }

    private fun pendingFlags(): Int {
        var flags = PendingIntent.FLAG_UPDATE_CURRENT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags = flags or PendingIntent.FLAG_IMMUTABLE
        }
        return flags
    }

    fun cancelIncoming(context: Context) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(INCOMING_NOTIFICATION_ID)
    }
}
