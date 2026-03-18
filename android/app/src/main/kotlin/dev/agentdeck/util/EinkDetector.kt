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
        "moaan",     // Xiaomi ecosystem e-ink brand (Pantone series)
        "moan",      // Alternative spelling
    )

    private val EINK_MODELS = setOf(
        "crema",
        "nova",       // Onyx Boox Nova
        "note",       // Onyx Boox Note
        "poke",       // Onyx Boox Poke
        "leaf",       // Onyx Boox Leaf
        "tab ultra",  // Onyx Boox Tab Ultra
        "pantone",    // MOAAN Pantone series (color e-ink)
    )

    /** Color e-ink devices (Kaleido 3, Gallery 3/4). B&W at full PPI, color at 1/4. */
    private val COLOR_EINK_MODELS = setOf(
        "pantone",    // MOAAN Pantone 6 (Kaleido 3)
        "tab ultra c",// Onyx Boox Tab Ultra C (Kaleido 3)
        "note air.*c",// Onyx Boox Note Air C series (Kaleido 3)
        "galy",       // Bigme Galy (Gallery 3)
        "inknote color", // Bigme inkNote Color+ (Gallery 4)
    )

    /** Color e-ink manufacturers where ALL models have color displays. */
    private val COLOR_EINK_MANUFACTURERS = setOf<String>()

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

    /**
     * Detect color e-ink display (Kaleido 3, Gallery 3/4).
     * Color e-ink renders B&W at full resolution (300 PPI) but color at 1/4 (150 PPI).
     * Use color only for large fills (creature bodies, gauge bars), never for small text.
     */
    fun isColorEink(): Boolean {
        val model = Build.MODEL.lowercase()
        val manufacturer = Build.MANUFACTURER.lowercase()

        if (COLOR_EINK_MANUFACTURERS.any { manufacturer.contains(it) }) return true
        return COLOR_EINK_MODELS.any { model.contains(it) || Regex(it).containsMatchIn(model) }
    }

    fun getDeviceInfo(): String {
        return "${Build.MANUFACTURER} ${Build.MODEL} (${Build.PRODUCT})"
    }
}
