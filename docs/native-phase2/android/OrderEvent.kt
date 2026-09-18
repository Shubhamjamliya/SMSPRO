package com.smspro.order

import android.os.Bundle

/**
 * The order-event envelope as delivered in an FCM **data** message. Mirrors the backend
 * envelope produced by orderEvents.service.js (event_id, seq, type, order_id, ring,
 * expires_at, …). `target` is "OWNER_TYPE:id" so native knows which role/endpoint to hit
 * for Accept/Reject.
 */
data class OrderEvent(
    val eventId: String,
    val type: String,
    val orderId: String,
    val target: String,
    val ring: Boolean,
    val expiresAtMs: Long?,
    val title: String,
    val body: String,
    val raw: Map<String, String>,
) {
    val ownerType: String get() = target.substringBefore(":", "").uppercase()

    fun toBundle(): Bundle = Bundle().apply {
        putString("event_id", eventId)
        putString("type", type)
        putString("order_id", orderId)
        putString("target", target)
        putBoolean("ring", ring)
        expiresAtMs?.let { putLong("expires_at_ms", it) }
        putString("title", title)
        putString("body", body)
        // Preserve any extra keys the receiver may need (e.g. order_mongo_id).
        raw.forEach { (k, v) -> if (getString(k) == null) putString("x_$k", v) }
    }

    companion object {
        fun fromData(data: Map<String, String>): OrderEvent {
            val expiresIso = data["expires_at"]
            return OrderEvent(
                eventId = data["event_id"] ?: data["eventId"] ?: "",
                type = data["type"] ?: data["event_type"] ?: "ORDER_STATUS_UPDATE",
                orderId = data["order_id"] ?: data["orderId"] ?: "",
                target = data["target"] ?: "",
                ring = (data["ring"] ?: "false").equals("true", ignoreCase = true),
                expiresAtMs = parseIsoToMs(expiresIso),
                title = data["title"] ?: "",
                body = data["body"] ?: "",
                raw = data,
            )
        }

        fun fromBundle(b: Bundle): OrderEvent {
            val raw = HashMap<String, String>()
            for (key in b.keySet()) b.getString(key)?.let { raw[key.removePrefix("x_")] = it }
            return OrderEvent(
                eventId = b.getString("event_id") ?: "",
                type = b.getString("type") ?: "ORDER_STATUS_UPDATE",
                orderId = b.getString("order_id") ?: "",
                target = b.getString("target") ?: "",
                ring = b.getBoolean("ring", false),
                expiresAtMs = if (b.containsKey("expires_at_ms")) b.getLong("expires_at_ms") else null,
                title = b.getString("title") ?: "",
                body = b.getString("body") ?: "",
                raw = raw,
            )
        }

        private fun parseIsoToMs(iso: String?): Long? {
            if (iso.isNullOrBlank()) return null
            return try {
                // API 26+; the min-SDK for this app is assumed >= 26 (typical for Flutter).
                java.time.Instant.parse(iso).toEpochMilli()
            } catch (e: Exception) {
                null
            }
        }
    }
}
