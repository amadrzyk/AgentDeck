package dev.agentdeck.ui.monitor

import dev.agentdeck.net.ModelCatalogEntry
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Guards the HUD upstream OpenClaw row filter: only the model the user has
 * marked primary (`role == "default"`) is shown so the row reads as "what
 * OpenClaw is routing to right now" instead of dumping the full catalog.
 * When no default is tagged the row collapses — promoting a non-default
 * entry would silently override the explicit primary-only rule.
 */
class OpenClawDisplayLinesTest {

    @Test
    fun `keeps only default model when present`() {
        val lines = openClawDisplayLines(
            listOf(
                ModelCatalogEntry(key = "gpt-5.4", name = "GPT 5.4", role = "default", available = true),
                ModelCatalogEntry(key = "glm-4.5", name = "GLM-4.5", role = "configured", available = true),
                ModelCatalogEntry(key = "glm-4.5v", name = "GLM-4.5V", role = "fallback-1", available = true),
                ModelCatalogEntry(key = "deepseek-r1", name = "DeepSeek R1", role = "configured", available = true),
            )
        )

        assertEquals(listOf("GPT 5.4"), lines)
    }

    @Test
    fun `empty when no default tagged`() {
        val lines = openClawDisplayLines(
            listOf(
                ModelCatalogEntry(key = "glm-4.5", name = "GLM-4.5", role = "configured", available = true),
                ModelCatalogEntry(key = "glm-4.5v", name = "GLM-4.5V", role = "fallback-1", available = true),
            )
        )

        assertEquals(emptyList<String>(), lines)
    }

    @Test
    fun `empty when default is unavailable`() {
        val lines = openClawDisplayLines(
            listOf(
                ModelCatalogEntry(key = "gpt-5.4", name = "GPT 5.4", role = "default", available = false),
                ModelCatalogEntry(key = "glm-4.5", name = "GLM-4.5", role = "configured", available = true),
            )
        )

        assertEquals(emptyList<String>(), lines)
    }

    @Test
    fun `empty catalog yields empty list`() {
        assertEquals(emptyList<String>(), openClawDisplayLines(emptyList()))
    }
}
