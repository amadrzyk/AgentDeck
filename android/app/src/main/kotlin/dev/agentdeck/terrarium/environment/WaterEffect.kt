package dev.agentdeck.terrarium.environment

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import dev.agentdeck.terrarium.EnvironmentVisualState
import dev.agentdeck.terrarium.TerrariumColors
import dev.agentdeck.terrarium.TerrariumLayout
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
    private var surfaceTime by mutableFloatStateOf(0f)

    fun setState(state: EnvironmentVisualState) {
        envState = state
    }

    fun update(dt: Float) {
        time += dt * TerrariumTiming.CAUSTICS_SPEED
        val speedMul = when (envState) {
            EnvironmentVisualState.DARK -> 0.3f
            EnvironmentVisualState.CALM -> 1.0f
            EnvironmentVisualState.ACTIVE -> 1.6f
            EnvironmentVisualState.ALERT -> 1.1f
        }
        surfaceTime += dt * TerrariumTiming.SURFACE_WAVE_SPEED * speedMul
    }

    /**
     * Draw animated water surface — filled wave regions create air/water contrast.
     *
     * Instead of thin stroke lines (invisible), we fill the area ABOVE the wave curve
     * with a lighter tint. The surface is perceived as the boundary between two regions,
     * not as a drawn line.
     */
    fun drawSurface(scope: DrawScope) {
        val w = scope.size.width
        val h = scope.size.height
        val surfaceY = h * TerrariumLayout.WATER_SURFACE_Y_FRACTION

        // Amplitude relative to canvas — visible at any resolution
        val amp = h * when (envState) {
            EnvironmentVisualState.DARK -> 0.003f
            EnvironmentVisualState.CALM -> 0.008f
            EnvironmentVisualState.ACTIVE -> 0.014f
            EnvironmentVisualState.ALERT -> 0.009f
        }
        val fillAlpha = when (envState) {
            EnvironmentVisualState.DARK -> 0.03f
            EnvironmentVisualState.CALM -> 0.08f
            EnvironmentVisualState.ACTIVE -> 0.12f
            EnvironmentVisualState.ALERT -> 0.09f
        }

        val twoPi = 2f * PI.toFloat()

        // (1) Primary wave — filled from curve up to top of canvas
        //     Creates the main air/water tonal boundary
        drawFilledWave(scope, w, surfaceY, amp,
            freq = twoPi / (w * 0.6f),
            phase = surfaceTime * twoPi,
            fillAlpha = fillAlpha)

        // (2) Secondary wave — shorter wavelength, smaller amplitude, opposite direction
        //     Overlaps with primary to create natural interference shimmer
        drawFilledWave(scope, w, surfaceY, amp * 0.4f,
            freq = twoPi / (w * 0.35f),
            phase = -surfaceTime * twoPi * 1.4f + 1.5f,
            fillAlpha = fillAlpha * 0.5f)

        // (3) Sub-surface glow — bright gradient just below the wave line
        //     Simulates light refraction at water surface
        val glowDepth = h * 0.025f
        scope.drawRect(
            brush = Brush.verticalGradient(
                colors = listOf(
                    Color.White.copy(alpha = fillAlpha * 0.7f),
                    Color.Transparent,
                ),
                startY = surfaceY,
                endY = surfaceY + glowDepth,
            ),
            topLeft = Offset(0f, surfaceY),
            size = Size(w, glowDepth),
        )
    }

    /**
     * Fill the region from a sine wave curve up to y=0 (top of canvas).
     * The filled area represents "air" — slightly brighter than water below.
     */
    private fun drawFilledWave(
        scope: DrawScope, w: Float, baseY: Float, amplitude: Float,
        freq: Float, phase: Float, fillAlpha: Float,
    ) {
        val path = Path().apply {
            // Start at top-left corner
            moveTo(0f, 0f)

            // Walk the wave curve left to right
            val step = 3f
            var x = 0f
            while (x <= w) {
                val y = baseY + sin(freq * x + phase) * amplitude
                lineTo(x, y)
                x += step
            }
            // Ensure we reach the right edge
            lineTo(w, baseY + sin(freq * w + phase) * amplitude)

            // Close back to top-right → top-left
            lineTo(w, 0f)
            close()
        }
        scope.drawPath(
            path = path,
            color = Color.White.copy(alpha = fillAlpha),
        )
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
