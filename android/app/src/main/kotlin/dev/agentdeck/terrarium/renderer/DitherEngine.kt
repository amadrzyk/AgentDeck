package dev.agentdeck.terrarium.renderer

import android.graphics.Bitmap
import android.graphics.Color

/**
 * Floyd-Steinberg dithering engine — converts ARGB bitmap to 1-bit (pure black/white).
 * Error diffusion weights: 7/16, 3/16, 5/16, 1/16.
 */
object DitherEngine {

    /**
     * Apply Floyd-Steinberg dithering in-place.
     * Input: ARGB_8888 bitmap. Output: same bitmap with only #000000 and #FFFFFF pixels.
     */
    fun floydSteinberg(bitmap: Bitmap) {
        val w = bitmap.width
        val h = bitmap.height

        // Work with luminance values as floats for error accumulation
        val lum = FloatArray(w * h)
        for (y in 0 until h) {
            for (x in 0 until w) {
                val pixel = bitmap.getPixel(x, y)
                val r = Color.red(pixel)
                val g = Color.green(pixel)
                val b = Color.blue(pixel)
                // ITU-R BT.601 luminance
                lum[y * w + x] = 0.299f * r + 0.587f * g + 0.114f * b
            }
        }

        for (y in 0 until h) {
            for (x in 0 until w) {
                val idx = y * w + x
                val oldVal = lum[idx]
                val newVal = if (oldVal > 127.5f) 255f else 0f
                lum[idx] = newVal

                val error = oldVal - newVal

                // Diffuse error to neighbors
                if (x + 1 < w)
                    lum[idx + 1] += error * 7f / 16f
                if (y + 1 < h) {
                    if (x - 1 >= 0)
                        lum[(y + 1) * w + x - 1] += error * 3f / 16f
                    lum[(y + 1) * w + x] += error * 5f / 16f
                    if (x + 1 < w)
                        lum[(y + 1) * w + x + 1] += error * 1f / 16f
                }
            }
        }

        // Write back to bitmap
        for (y in 0 until h) {
            for (x in 0 until w) {
                val v = if (lum[y * w + x] > 127.5f) 255 else 0
                bitmap.setPixel(x, y, Color.rgb(v, v, v))
            }
        }
    }

    /**
     * Apply dithering with adjustable threshold for dissolve effects.
     * [threshold] 0.0 = normal dither, 1.0 = all white (dissolved).
     */
    fun floydSteinbergWithThreshold(bitmap: Bitmap, threshold: Float) {
        val adjustedThreshold = 127.5f + threshold * 127.5f

        val w = bitmap.width
        val h = bitmap.height
        val lum = FloatArray(w * h)

        for (y in 0 until h) {
            for (x in 0 until w) {
                val pixel = bitmap.getPixel(x, y)
                val r = Color.red(pixel)
                val g = Color.green(pixel)
                val b = Color.blue(pixel)
                lum[y * w + x] = 0.299f * r + 0.587f * g + 0.114f * b
            }
        }

        for (y in 0 until h) {
            for (x in 0 until w) {
                val idx = y * w + x
                val oldVal = lum[idx]
                val newVal = if (oldVal > adjustedThreshold) 255f else 0f
                lum[idx] = newVal

                val error = oldVal - newVal

                if (x + 1 < w)
                    lum[idx + 1] += error * 7f / 16f
                if (y + 1 < h) {
                    if (x - 1 >= 0)
                        lum[(y + 1) * w + x - 1] += error * 3f / 16f
                    lum[(y + 1) * w + x] += error * 5f / 16f
                    if (x + 1 < w)
                        lum[(y + 1) * w + x + 1] += error * 1f / 16f
                }
            }
        }

        for (y in 0 until h) {
            for (x in 0 until w) {
                val v = if (lum[y * w + x] > 127.5f) 255 else 0
                bitmap.setPixel(x, y, Color.rgb(v, v, v))
            }
        }
    }
}
