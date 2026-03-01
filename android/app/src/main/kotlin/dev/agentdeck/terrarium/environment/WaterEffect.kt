package dev.agentdeck.terrarium.environment

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import dev.agentdeck.terrarium.EnvironmentVisualState
import dev.agentdeck.terrarium.TerrariumColors
import dev.agentdeck.terrarium.TerrariumTiming
import kotlin.math.PI
import kotlin.math.sin

/**
 * Caustics light pattern — overlapping sine meshes drawn with overlay blend.
 * Intensity varies with environment state.
 */
class WaterEffect {

    private var envState by mutableStateOf(EnvironmentVisualState.CALM)
    private var time by mutableFloatStateOf(0f)

    fun setState(state: EnvironmentVisualState) {
        envState = state
    }

    fun update(dt: Float) {
        time += dt * TerrariumTiming.CAUSTICS_SPEED
    }

    fun draw(scope: DrawScope) {
        if (envState == EnvironmentVisualState.DARK) return

        val w = scope.size.width
        val h = scope.size.height

        val alpha = when (envState) {
            EnvironmentVisualState.DARK -> 0f
            EnvironmentVisualState.CALM -> 0.08f
            EnvironmentVisualState.ACTIVE -> 0.12f
            EnvironmentVisualState.ALERT -> 0.10f
        }

        // Draw two overlapping caustic layers with different phases
        drawCausticLayer(scope, w, h, alpha, phase = 0f)
        drawCausticLayer(scope, w, h, alpha * 0.6f, phase = PI.toFloat() * 0.7f)
    }

    private fun drawCausticLayer(
        scope: DrawScope, w: Float, h: Float, alpha: Float, phase: Float,
    ) {
        val cellSize = w / GRID_SIZE

        for (row in 0 until GRID_SIZE) {
            for (col in 0 until GRID_SIZE) {
                val baseX = col * cellSize
                val baseY = row * cellSize

                // Distorted diamond shape
                val offset1 = sin(time + col * 0.5f + phase) * cellSize * 0.3f
                val offset2 = sin(time * 0.7f + row * 0.4f + phase) * cellSize * 0.3f

                val cx = baseX + cellSize / 2 + offset1
                val cy = baseY + cellSize / 2 + offset2

                val size = cellSize * (0.3f + sin(time * 1.3f + col + row + phase) * 0.15f)

                val path = Path().apply {
                    moveTo(cx, cy - size)
                    lineTo(cx + size * 0.8f, cy)
                    lineTo(cx, cy + size)
                    lineTo(cx - size * 0.8f, cy)
                    close()
                }

                scope.drawPath(
                    path = path,
                    color = TerrariumColors.CausticsLight.copy(alpha = alpha),
                    blendMode = BlendMode.Overlay,
                )
            }
        }
    }

    companion object {
        private const val GRID_SIZE = 8
    }
}
