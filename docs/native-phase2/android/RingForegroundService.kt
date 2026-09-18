package com.smspro.order

import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper

/**
 * Foreground service that plays a looping alarm ring for an incoming order and auto-stops
 * at `expires_at`. USAGE_ALARM audio attributes make it ring through silent/DND, matching a
 * call-style alert. Started/stopped by [OrderFcmService], [OrderActionReceiver], and the
 * Dart bridge (stopRing / startRing).
 */
class RingForegroundService : Service() {

    private var player: MediaPlayer? = null
    private val handler = Handler(Looper.getMainLooper())
    private var autoStop: Runnable? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopSelfCleanly()
                return START_NOT_STICKY
            }
            else -> {
                val event = intent?.extras?.let { OrderEvent.fromBundle(it) }
                startRinging(event)
            }
        }
        return START_STICKY
    }

    private fun startRinging(event: OrderEvent?) {
        OrderNotifications.ensureChannels(this)

        // A persistent low-importance notification is required for a foreground service.
        val fgNotification = androidx.core.app.NotificationCompat
            .Builder(this, OrderNotifications.RING_CHANNEL_ID)
            .setSmallIcon(applicationInfo.icon)
            .setContentTitle("Incoming order ringing")
            .setContentText(event?.let { "Order #${it.orderId}" } ?: "Tap the notification to respond")
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                OrderNotifications.INCOMING_NOTIFICATION_ID + 1,
                fgNotification,
                // FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK (declared in the manifest).
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
            )
        } else {
            startForeground(OrderNotifications.INCOMING_NOTIFICATION_ID + 1, fgNotification)
        }

        startPlayer()
        scheduleAutoStop(event)
    }

    private fun startPlayer() {
        if (player != null) return
        val uri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        player = MediaPlayer().apply {
            setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)          // rings through silent/DND
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build(),
            )
            isLooping = true
            setDataSource(this@RingForegroundService, uri)
            setOnPreparedListener { start() }
            prepareAsync()
        }

        // Nudge the alarm stream so the tone is audible even if the user lowered it.
        (getSystemService(Context.AUDIO_SERVICE) as? AudioManager)?.let { am ->
            val max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM)
            if (am.getStreamVolume(AudioManager.STREAM_ALARM) == 0) {
                am.setStreamVolume(AudioManager.STREAM_ALARM, (max * 0.7).toInt(), 0)
            }
        }
    }

    private fun scheduleAutoStop(event: OrderEvent?) {
        autoStop?.let { handler.removeCallbacks(it) }
        val expiresInMs = event?.expiresAtMs?.let { it - System.currentTimeMillis() }
        val delay = (expiresInMs ?: DEFAULT_RING_MS).coerceIn(3_000L, MAX_RING_MS)
        autoStop = Runnable { stopSelfCleanly() }.also { handler.postDelayed(it, delay) }
    }

    private fun stopSelfCleanly() {
        autoStop?.let { handler.removeCallbacks(it) }
        autoStop = null
        try {
            player?.stop()
            player?.release()
        } catch (_: Exception) {
        }
        player = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        stopSelfCleanly()
        super.onDestroy()
    }

    companion object {
        const val ACTION_START = "com.smspro.order.RING_START"
        const val ACTION_STOP = "com.smspro.order.RING_STOP"
        private const val DEFAULT_RING_MS = 30_000L
        private const val MAX_RING_MS = 60_000L

        fun start(context: Context, event: OrderEvent) {
            val intent = Intent(context, RingForegroundService::class.java).apply {
                action = ACTION_START
                putExtras(event.toBundle())
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, RingForegroundService::class.java).apply { action = ACTION_STOP }
            try {
                context.startService(intent)
            } catch (_: Exception) {
                // If the service isn't running, nothing to stop.
            }
        }
    }
}
