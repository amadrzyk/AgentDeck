package dev.agentdeck.terrarium.environment

import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import dev.agentdeck.terrarium.TerrariumColors
import kotlin.math.sin

/**
 * Holographic UI elements — semi-transparent keyboard and cards near the octopus.
 * Drawn with Screen blend mode for a glowing effect.
 * Note: Most holo elements are drawn by OctopusCreature itself for correct positioning.
 * This class provides shared utility methods for holographic rendering.
 */
object HolographicUI {

    /** Draw a holographic data panel at the given position. */
    fun drawDataPanel(
        scope: DrawScope,
        x: Float, y: Float,
        width: Float, height: Float,
        time: Float,
        lineCount: Int = 4,
    ) {
        // Panel background
        scope.drawRoundRect(
            color = TerrariumColors.HoloBlue.copy(alpha = 0.1f),
            topLeft = Offset(x, y),
            size = Size(width, height),
            cornerRadius = CornerRadius(4f),
            blendMode = BlendMode.Screen,
        )

        // Panel border
        scope.drawRoundRect(
            color = TerrariumColors.HoloText.copy(alpha = 0.2f),
            topLeft = Offset(x, y),
            size = Size(width, height),
            cornerRadius = CornerRadius(4f),
            style = Stroke(width = 1f),
            blendMode = BlendMode.Screen,
        )

        // Scan line animation
        val scanY = y + ((time * 0.5f) % 1f) * height
        scope.drawLine(
            color = TerrariumColors.TetraNeon.copy(alpha = 0.15f),
            start = Offset(x + 2f, scanY),
            end = Offset(x + width - 2f, scanY),
            strokeWidth = 1f,
            blendMode = BlendMode.Screen,
        )

        // Data lines
        val lineSpacing = height / (lineCount + 1)
        for (i in 1..lineCount) {
            val lineY = y + i * lineSpacing
            val lineWidth = width * (0.4f + sin(time + i * 2f) * 0.15f)
            scope.drawLine(
                color = TerrariumColors.HoloText.copy(alpha = 0.15f),
                start = Offset(x + 6f, lineY),
                end = Offset(x + 6f + lineWidth, lineY),
                strokeWidth = 1.5f,
                blendMode = BlendMode.Screen,
            )
        }
    }
}
