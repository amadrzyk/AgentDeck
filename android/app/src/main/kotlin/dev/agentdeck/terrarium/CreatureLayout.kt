package dev.agentdeck.terrarium

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin

/**
 * Layout slot for positioning a creature in the terrarium.
 */
data class CreatureSlot(
    val centerXFraction: Float,
    val centerYFraction: Float,
    val scaleFactor: Float,
)

/**
 * Compute layout positions for multiple octopuses (coding agents).
 * Distributes them across the left-center area of the terrarium.
 */
fun layoutOctopuses(count: Int): List<CreatureSlot> {
    return when (count) {
        0 -> emptyList()
        1 -> listOf(
            CreatureSlot(
                TerrariumLayout.OCTOPUS_CENTER_X_FRACTION,
                TerrariumLayout.OCTOPUS_CENTER_Y_FRACTION,
                1.0f,
            )
        )
        2 -> listOf(
            CreatureSlot(0.30f, 0.42f, 0.85f),
            CreatureSlot(0.55f, 0.48f, 0.85f),
        )
        3 -> listOf(
            CreatureSlot(0.30f, 0.38f, 0.75f),
            CreatureSlot(0.52f, 0.38f, 0.75f),
            CreatureSlot(0.40f, 0.52f, 0.75f),
        )
        else -> {
            // Grid layout for 4+, shrinking as needed
            val scale = max(0.5f, 0.75f - (count - 3) * 0.05f)
            val cols = if (count <= 4) 2 else 3
            val rows = (count + cols - 1) / cols
            val startX = 0.20f
            val endX = 0.60f
            val startY = 0.32f
            val endY = 0.55f
            val dx = if (cols > 1) (endX - startX) / (cols - 1) else 0f
            val dy = if (rows > 1) (endY - startY) / (rows - 1) else 0f

            (0 until count).map { i ->
                val col = i % cols
                val row = i / cols
                CreatureSlot(
                    startX + col * dx,
                    startY + row * dy,
                    scale,
                )
            }
        }
    }
}

/**
 * Compute layout positions for OpenClaw worker crayfish.
 * Workers are smaller and arranged in an arc around the main crayfish position.
 */
fun layoutWorkerCrayfish(count: Int): List<CreatureSlot> {
    if (count == 0) return emptyList()

    val mainX = TerrariumLayout.CRAYFISH_CENTER_X_FRACTION
    val mainY = TerrariumLayout.CRAYFISH_CENTER_Y_FRACTION
    val arcRadius = 0.08f

    return (0 until count).map { i ->
        val angle = PI.toFloat() * 0.8f + (i.toFloat() / max(1, count - 1).toFloat()) * PI.toFloat() * 0.4f
        CreatureSlot(
            mainX + cos(angle) * arcRadius,
            mainY + sin(angle) * arcRadius,
            0.5f,
        )
    }
}
