package dev.agentdeck.service

import android.content.ContentResolver
import android.os.PowerManager
import android.provider.Settings
import android.util.Log

/**
 * Controls display brightness/timeout in response to host display sleep events.
 *
 * LCD tablets: Sets SCREEN_BRIGHTNESS to 0 (minimum), restores saved value on wake.
 * E-ink devices: Sets SCREEN_OFF_TIMEOUT to 15s (allows natural sleep), restores MAX + WAKEUP on wake.
 */
class BrightnessController(
    private val contentResolver: ContentResolver,
    private val powerManager: PowerManager,
    private val isEink: Boolean,
) {
    companion object {
        private const val TAG = "BrightnessController"
        private const val EINK_SLEEP_TIMEOUT_MS = 15_000
    }

    private var isDimmed = false
    private var savedBrightness: Int? = null
    private var savedScreenOffTimeout: Int? = null

    fun dim() {
        if (isDimmed) return
        isDimmed = true

        if (isEink) {
            dimEink()
        } else {
            dimLcd()
        }
    }

    fun restore() {
        if (!isDimmed) return
        isDimmed = false

        if (isEink) {
            restoreEink()
        } else {
            restoreLcd()
        }
    }

    fun isDimmed(): Boolean = isDimmed

    private fun dimLcd() {
        try {
            savedBrightness = Settings.System.getInt(
                contentResolver, Settings.System.SCREEN_BRIGHTNESS, 128
            )
            Settings.System.putInt(contentResolver, Settings.System.SCREEN_BRIGHTNESS, 0)
            Log.i(TAG, "LCD brightness: ${savedBrightness} → 0")
        } catch (e: SecurityException) {
            Log.w(TAG, "Cannot set brightness (no WRITE_SETTINGS): ${e.message}")
            savedBrightness = null
        }
    }

    private fun restoreLcd() {
        val saved = savedBrightness ?: 128
        try {
            Settings.System.putInt(contentResolver, Settings.System.SCREEN_BRIGHTNESS, saved)
            Log.i(TAG, "LCD brightness restored to $saved")
        } catch (e: SecurityException) {
            Log.w(TAG, "Cannot restore brightness: ${e.message}")
        }
        savedBrightness = null
    }

    private fun dimEink() {
        try {
            savedScreenOffTimeout = Settings.System.getInt(
                contentResolver, Settings.System.SCREEN_OFF_TIMEOUT, 60_000
            )
            Settings.System.putInt(
                contentResolver, Settings.System.SCREEN_OFF_TIMEOUT, EINK_SLEEP_TIMEOUT_MS
            )
            Log.i(TAG, "E-ink timeout: ${savedScreenOffTimeout}ms → ${EINK_SLEEP_TIMEOUT_MS}ms")
        } catch (e: SecurityException) {
            Log.w(TAG, "Cannot set screen_off_timeout: ${e.message}")
            savedScreenOffTimeout = null
        }
    }

    private fun restoreEink() {
        savedScreenOffTimeout?.let { saved ->
            try {
                Settings.System.putInt(
                    contentResolver, Settings.System.SCREEN_OFF_TIMEOUT, Int.MAX_VALUE
                )
                Log.i(TAG, "E-ink timeout restored to max")
            } catch (e: SecurityException) {
                Log.w(TAG, "Cannot restore screen_off_timeout: ${e.message}")
            }
        }
        savedScreenOffTimeout = null

        // Wake the screen
        if (!powerManager.isInteractive) {
            try {
                Runtime.getRuntime().exec(arrayOf("input", "keyevent", "KEYCODE_WAKEUP"))
                Log.d(TAG, "Sent KEYCODE_WAKEUP to wake e-ink screen")
            } catch (e: Exception) {
                Log.w(TAG, "Failed to send KEYCODE_WAKEUP: ${e.message}")
            }
        }
    }
}
