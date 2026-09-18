package com.smspro.order

import android.content.Context

/**
 * Auth context shared from the web app (WebView) to native, so the notification Accept/Reject
 * receiver can call the backend directly even when the app was killed.
 *
 * Dart writes this via the `setAuthContext` bridge handler whenever the logged-in
 * module/token changes (see order_native.dart). Tokens live only in app-private prefs.
 */
object AuthContextStore {
    private const val PREFS = "order_auth_context"

    fun setBaseUrl(context: Context, baseUrl: String) =
        prefs(context).edit().putString("base_url", baseUrl).apply()

    fun getBaseUrl(context: Context): String =
        prefs(context).getString("base_url", "") ?: ""

    /** ownerType is USER / RESTAURANT / DELIVERY_PARTNER / ADMIN. */
    fun setAccessToken(context: Context, ownerType: String, token: String) =
        prefs(context).edit().putString("token_${ownerType.uppercase()}", token).apply()

    fun getAccessToken(context: Context, ownerType: String): String =
        prefs(context).getString("token_${ownerType.uppercase()}", "") ?: ""

    fun setFcmToken(context: Context, token: String) =
        prefs(context).edit().putString("fcm_token", token).apply()

    fun getFcmToken(context: Context): String =
        prefs(context).getString("fcm_token", "") ?: ""

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
