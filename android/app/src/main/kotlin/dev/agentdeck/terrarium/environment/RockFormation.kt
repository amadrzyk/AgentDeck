package dev.agentdeck.terrarium.environment

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import dev.agentdeck.terrarium.EnvironmentVisualState
import dev.agentdeck.terrarium.TerrariumColors
import dev.agentdeck.terrarium.TerrariumLayout
import dev.agentdeck.terrarium.TerrariumTiming
import kotlin.math.sin

/**
 * Bottom terrain — sand gradient + rocky formations + LED cables.
 */
class RockFormation {

    private var envState by mutableStateOf(EnvironmentVisualState.CALM)
    private var time by mutableFloatStateOf(0f)

    fun setState(state: EnvironmentVisualState) {
        envState = state
    }

    fun update(dt: Float) {
        time += dt
    }

    fun draw(scope: DrawScope) {
        val w = scope.size.width
        val h = scope.size.height

        drawSand(scope, w, h)
        drawRocks(scope, w, h)
    }

    /** Draw LED cables on top of rocks (called separately for correct layering). */
    fun drawLEDs(scope: DrawScope, env: EnvironmentVisualState) {
        val w = scope.size.width
        val h = scope.size.height
        drawLEDCables(scope, w, h, env)
    }

    private fun drawSand(scope: DrawScope, w: Float, h: Float) {
        val sandTop = h * (1f - TerrariumLayout.SAND_HEIGHT_FRACTION)

        scope.drawRect(
            brush = Brush.verticalGradient(
                colors = listOf(TerrariumColors.SandLight, TerrariumColors.SandBase),
                startY = sandTop,
                endY = h,
            ),
            topLeft = Offset(0f, sandTop),
            size = Size(w, h - sandTop),
        )

        // Sand ripples
        for (i in 0 until 5) {
            val y = sandTop + (h - sandTop) * (0.2f + i * 0.15f)
            scope.drawLine(
                color = TerrariumColors.SandBase.copy(alpha = 0.3f),
                start = Offset(w * (i * 0.1f), y),
                end = Offset(w * (0.3f + i * 0.15f), y + 3f),
                strokeWidth = 1f,
            )
        }
    }

    private fun drawRocks(scope: DrawScope, w: Float, h: Float) {
        val bottomY = h * (1f - TerrariumLayout.SAND_HEIGHT_FRACTION)

        // Large rock cluster (right side, where crayfish sits)
        drawRock(scope, w * 0.7f, bottomY, w * 0.15f, w * 0.08f, TerrariumColors.RockMid)
        drawRock(scope, w * 0.8f, bottomY - w * 0.02f, w * 0.12f, w * 0.10f, TerrariumColors.RockDark)
        drawRock(scope, w * 0.75f, bottomY - w * 0.01f, w * 0.08f, w * 0.06f, TerrariumColors.RockLight)

        // Small rocks (left side)
        drawRock(scope, w * 0.05f, bottomY, w * 0.08f, w * 0.05f, TerrariumColors.RockDark)
        drawRock(scope, w * 0.12f, bottomY + w * 0.01f, w * 0.06f, w * 0.04f, TerrariumColors.RockMid)

        // Center small rock
        drawRock(scope, w * 0.45f, bottomY + w * 0.01f, w * 0.05f, w * 0.03f, TerrariumColors.RockLight)
    }

    private fun drawRock(scope: DrawScope, cx: Float, baseY: Float, rw: Float, rh: Float, color: Color) {
        val path = Path().apply {
            moveTo(cx - rw * 0.5f, baseY)
            cubicTo(
                cx - rw * 0.4f, baseY - rh * 0.8f,
                cx + rw * 0.4f, baseY - rh * 1.1f,
                cx + rw * 0.5f, baseY,
            )
            close()
        }
        scope.drawPath(path = path, color = color)

        // Highlight edge
        scope.drawPath(
            path = path,
            color = Color.White.copy(alpha = 0.05f),
            style = Stroke(width = 1f),
        )
    }

    private fun drawLEDCables(scope: DrawScope, w: Float, h: Float, env: EnvironmentVisualState) {
        val bottomY = h * (1f - TerrariumLayout.SAND_HEIGHT_FRACTION)

        val ledColor = when (env) {
            EnvironmentVisualState.DARK -> TerrariumColors.LEDRed.copy(alpha = 0.15f)
            EnvironmentVisualState.CALM -> TerrariumColors.LEDGreen
            EnvironmentVisualState.ACTIVE -> TerrariumColors.LEDAmber
            EnvironmentVisualState.ALERT -> TerrariumColors.LEDRed
        }

        // Pulse effect
        val pulse = sin(time * TerrariumTiming.LED_PULSE_SPEED) * 0.3f + 0.7f
        val effectiveColor = ledColor.copy(alpha = ledColor.alpha * pulse)

        // Cable from left rocks to right rocks
        val cablePath = Path().apply {
            moveTo(w * 0.1f, bottomY - w * 0.02f)
            quadraticBezierTo(w * 0.3f, bottomY + w * 0.02f, w * 0.5f, bottomY - w * 0.01f)
            quadraticBezierTo(w * 0.65f, bottomY + w * 0.01f, w * 0.75f, bottomY - w * 0.04f)
        }

        scope.drawPath(
            path = cablePath,
            color = effectiveColor.copy(alpha = effectiveColor.alpha * 0.4f),
            style = Stroke(
                width = 2f,
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 4f)),
                cap = StrokeCap.Round,
            ),
        )

        // LED dots along cable
        val dotCount = 8
        for (i in 0 until dotCount) {
            val t = i.toFloat() / (dotCount - 1)
            val dotX = w * (0.1f + t * 0.65f)
            val dotY = bottomY - w * 0.01f +
                sin(t * PI.toFloat() * 2f) * w * 0.015f

            val dotPulse = sin(time * TerrariumTiming.LED_PULSE_SPEED + i * 0.5f) * 0.4f + 0.6f
            scope.drawCircle(
                color = effectiveColor.copy(alpha = dotPulse * 0.8f),
                radius = w * 0.003f,
                center = Offset(dotX, dotY),
            )
        }
    }

    companion object {
        private val PI = kotlin.math.PI
    }
}
