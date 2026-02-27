package dev.agentdeck.util

import android.os.Build

object EinkDetector {

    private val EINK_MANUFACTURERS = setOf(
        "crema",
        "onyx",
        "kobo",
        "boyue",
        "pocketbook",
        "remarkable",
        "supernote",
        "bigme",
        "dasung",
        "hisense",   // Some Hisense models have e-ink screens
    )

    private val EINK_MODELS = setOf(
        "crema",
        "nova",       // Onyx Boox Nova
        "note",       // Onyx Boox Note
        "poke",       // Onyx Boox Poke
        "leaf",       // Onyx Boox Leaf
        "tab ultra",  // Onyx Boox Tab Ultra
    )

    fun isEinkDevice(): Boolean {
        val manufacturer = Build.MANUFACTURER.lowercase()
        val model = Build.MODEL.lowercase()
        val product = Build.PRODUCT.lowercase()

        // Check manufacturer
        if (EINK_MANUFACTURERS.any { manufacturer.contains(it) }) return true

        // Check model name
        if (EINK_MODELS.any { model.contains(it) }) return true

        // Check for common e-ink system properties in product name
        if (product.contains("eink") || product.contains("e-ink")) return true

        return false
    }

    fun getDeviceInfo(): String {
        return "${Build.MANUFACTURER} ${Build.MODEL} (${Build.PRODUCT})"
    }
}
