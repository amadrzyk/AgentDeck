package dev.agentdeck.service

import android.content.ContentResolver
import android.os.PowerManager
import android.provider.Settings
import android.util.Log

/**
 * Controls display brightness/timeout in response to host display sleep events.
 *
 * LCD tablets: Forces manual brightness mode, sets brightness to 0, then
 * SCREEN_OFF_TIMEOUT to 2s so the backlight turns off completely.
 * On wake: restores timeout first, sends WAKEUP, then restores brightness + mode.
 *
 * E-ink devices: Sets SCREEN_OFF_TIMEOUT to 3s (allows natural sleep),
 * restores MAX + WAKEUP on wake.
 */
class BrightnessController(
    private val contentResolver: ContentResolver,
    private val powerManager: PowerManager,
    private val isEink: Boolean,
) {
    companion object {
        private const val TAG = "BrightnessController"
        private const val EINK_SLEEP_TIMEOUT_MS = 3_000
        private const val LCD_OFF_TIMEOUT_MS = 2_000
    }

    private var isDimmed = false
    private var savedBrightness: Int? = null
    private var savedBrightnessMode: Int? = null
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
            // Save current brightness mode (auto/manual)
            savedBrightnessMode = Settings.System.getInt(
                contentResolver, Settings.System.SCREEN_BRIGHTNESS_MODE,
                Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL
            )
            // Force manual mode so brightness=0 is respected
            Settings.System.putInt(
                contentResolver, Settings.System.SCREEN_BRIGHTNESS_MODE,
                Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL
            )

            // Save and set brightness to minimum
            savedBrightness = Settings.System.getInt(
                contentResolver, Settings.System.SCREEN_BRIGHTNESS, 128
            )
            Settings.System.putInt(contentResolver, Settings.System.SCREEN_BRIGHTNESS, 0)

            // Save screen-off timeout and set to 2s for full backlight off
            savedScreenOffTimeout = Settings.System.getInt(
                contentResolver, Settings.System.SCREEN_OFF_TIMEOUT, 60_000
            )
            Settings.System.putInt(
                contentResolver, Settings.System.SCREEN_OFF_TIMEOUT, LCD_OFF_TIMEOUT_MS
            )

            Log.i(TAG, "LCD dim: brightness ${savedBrightness}→0, mode ${savedBrightnessMode}→MANUAL, timeout ${savedScreenOffTimeout}→${LCD_OFF_TIMEOUT_MS}ms")
        } catch (e: SecurityException) {
            Log.w(TAG, "Cannot dim LCD (no WRITE_SETTINGS): ${e.message}")
            savedBrightness = null
            savedBrightnessMode = null
            savedScreenOffTimeout = null
        }
    }

    private fun restoreLcd() {
        try {
            // Restore timeout first — prevents re-sleep after wake
            savedScreenOffTimeout?.let { timeout ->
                Settings.System.putInt(
                    contentResolver, Settings.System.SCREEN_OFF_TIMEOUT, timeout
                )
            }

            // Wake the screen (it may be off from the 2s timeout)
            if (!powerManager.isInteractive) {
                try {
                    Runtime.getRuntime().exec(arrayOf("input", "keyevent", "KEYCODE_WAKEUP"))
                    Log.d(TAG, "Sent KEYCODE_WAKEUP to wake LCD")
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to send KEYCODE_WAKEUP: ${e.message}")
                }
            }

            // Restore brightness
            val brightness = savedBrightness ?: 128
            Settings.System.putInt(contentResolver, Settings.System.SCREEN_BRIGHTNESS, brightness)

            // Restore brightness mode (auto/manual)
            savedBrightnessMode?.let { mode ->
                Settings.System.putInt(
                    contentResolver, Settings.System.SCREEN_BRIGHTNESS_MODE, mode
                )
            }

            Log.i(TAG, "LCD restored: brightness=$brightness, mode=${savedBrightnessMode}, timeout=${savedScreenOffTimeout}")
        } catch (e: SecurityException) {
            Log.w(TAG, "Cannot restore LCD: ${e.message}")
        }
        savedBrightness = null
        savedBrightnessMode = null
        savedScreenOffTimeout = null
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
