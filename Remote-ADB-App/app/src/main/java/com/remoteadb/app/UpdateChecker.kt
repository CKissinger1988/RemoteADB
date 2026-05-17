package com.remoteadb.app

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class UpdateInfo(
    val currentVersion: String,
    val latestVersion: String,
    val downloadUrl: String,
    val releaseUrl: String,
)

object UpdateChecker {

    private const val RELEASES_API = "https://api.github.com/repos/CKissinger1988/RemoteADB/releases/latest"
    private const val APK_ASSET_PREFIX = "remote-adb-v"

    fun checkForUpdate(currentVersion: String): UpdateInfo? {
        return try {
            val conn = URL(RELEASES_API).openConnection() as HttpURLConnection
            conn.setRequestProperty("User-Agent", "RemoteADB-App")
            conn.setRequestProperty("Accept", "application/vnd.github.v3+json")
            conn.connectTimeout = 10_000
            conn.readTimeout = 10_000
            conn.connect()
            if (conn.responseCode != 200) {
                conn.disconnect()
                return null
            }
            val body = conn.inputStream.bufferedReader().readText()
            conn.disconnect()

            val json = JSONObject(body)
            val tagName = json.optString("tag_name").takeIf { it.isNotEmpty() } ?: return null
            val latest = tagName.removePrefix("v")
            if (compareVersions(latest, currentVersion) <= 0) return null

            val assets = json.optJSONArray("assets")
            var downloadUrl = ""
            if (assets != null) {
                for (i in 0 until assets.length()) {
                    val asset = assets.getJSONObject(i)
                    val name = asset.optString("name")
                    if (name.startsWith(APK_ASSET_PREFIX) && name.endsWith(".apk")) {
                        downloadUrl = asset.optString("browser_download_url")
                        break
                    }
                }
            }

            UpdateInfo(
                currentVersion = currentVersion,
                latestVersion = latest,
                downloadUrl = downloadUrl,
                releaseUrl = json.optString("html_url"),
            )
        } catch (_: Exception) {
            null
        }
    }

    private fun compareVersions(a: String, b: String): Int {
        val pa = a.split(".").map { it.toIntOrNull() ?: 0 }
        val pb = b.split(".").map { it.toIntOrNull() ?: 0 }
        val len = maxOf(pa.size, pb.size)
        for (i in 0 until len) {
            val diff = (pa.getOrElse(i) { 0 }) - (pb.getOrElse(i) { 0 })
            if (diff != 0) return diff
        }
        return 0
    }
}
