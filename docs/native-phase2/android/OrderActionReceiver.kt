package com.smspro.order

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * Handles Accept / Reject tapped on the incoming-order notification. Calls the backend
 * directly (OkHttp) with the stored auth token + an Idempotency-Key, stops the ring, cancels
 * the notification, and deep-links into the app.
 *
 * Endpoints (match Backend routes):
 *   DELIVERY_PARTNER  accept -> PATCH {base}/food/delivery/orders/{id}/accept
 *                     reject -> PATCH {base}/food/delivery/orders/{id}/reject
 *   RESTAURANT        accept -> PATCH {base}/food/restaurant/orders/{id}/status  {"orderStatus":"confirmed"}
 *                     reject -> PATCH {base}/food/restaurant/orders/{id}/status  {"orderStatus":"cancelled_by_restaurant"}
 */
class OrderActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val event = intent.extras?.let { OrderEvent.fromBundle(it) } ?: return
        val accept = intent.action == ACTION_ACCEPT

        // Stop the ring + clear the notification immediately for a responsive feel.
        RingForegroundService.stop(context)
        OrderNotifications.cancelIncoming(context)

        val appContext = context.applicationContext
        // Network off the main thread; goAsync keeps the receiver alive briefly.
        val pending = goAsync()
        Thread {
            try {
                callBackend(appContext, event, accept)
            } catch (e: Exception) {
                Log.w(TAG, "Accept/Reject backend call failed: ${e.message}")
            } finally {
                pending.finish()
            }
        }.start()

        // Deep-link into the app so the user lands on the order.
        launchApp(context, event)
    }

    private fun callBackend(context: Context, event: OrderEvent, accept: Boolean) {
        val base = AuthContextStore.getBaseUrl(context).trimEnd('/')
        val owner = event.ownerType
        val token = AuthContextStore.getAccessToken(context, owner)
        if (base.isEmpty() || token.isEmpty()) {
            Log.w(TAG, "Missing base url or token for $owner; skipping direct call (app will reconcile on open).")
            return
        }

        val (url, body) = when (owner) {
            "DELIVERY_PARTNER" -> {
                val path = if (accept) "accept" else "reject"
                "$base/food/delivery/orders/${event.orderId}/$path" to "{}"
            }
            "RESTAURANT" -> {
                val status = if (accept) "confirmed" else "cancelled_by_restaurant"
                "$base/food/restaurant/orders/${event.orderId}/status" to "{\"orderStatus\":\"$status\"}"
            }
            else -> {
                Log.w(TAG, "Unsupported ownerType for action: $owner")
                return
            }
        }

        val request = Request.Builder()
            .url(url)
            .patch(body.toRequestBody(JSON))
            .header("Authorization", "Bearer $token")
            // Idempotency-Key ties this action to the event so a retry can't double-apply.
            .header("Idempotency-Key", "act:${event.eventId.ifBlank { UUID.randomUUID().toString() }}")
            .header("Content-Type", "application/json")
            .build()

        client.newCall(request).execute().use { resp ->
            Log.i(TAG, "Order ${event.orderId} ${if (accept) "accept" else "reject"} -> HTTP ${resp.code}")
        }
    }

    private fun launchApp(context: Context, event: OrderEvent) {
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
        launch.action = Intent.ACTION_VIEW
        launch.data = Uri.parse("smspro://order/${event.orderId}")
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        launch.putExtras(event.toBundle())
        context.startActivity(launch)
    }

    companion object {
        const val ACTION_ACCEPT = "com.smspro.order.ACTION_ACCEPT"
        const val ACTION_REJECT = "com.smspro.order.ACTION_REJECT"
        private const val TAG = "OrderActionReceiver"
        private val JSON = "application/json; charset=utf-8".toMediaType()
        private val client = OkHttpClient.Builder()
            .callTimeout(15, TimeUnit.SECONDS)
            .build()
    }
}
