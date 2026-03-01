package dev.agentdeck.terrarium.creature

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import android.util.Log
import dev.agentdeck.terrarium.CrayfishVisualState
import dev.agentdeck.terrarium.TerrariumColors
import dev.agentdeck.terrarium.TerrariumLayout
import dev.agentdeck.terrarium.TerrariumTiming
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

/**
 * Crayfish (OpenClaw) — bottom-right on rocks.
 * Segmented body (carapace + abdomen + tail fan) with articulated claws.
 *
 * ROUTING state: vigorous claw clapping, body rocking, shell glow pulse,
 * expanding signal waves, antenna wiggle — clearly visible orchestration activity.
 */
class CrayfishCreature(
    private val centerXFraction: Float = TerrariumLayout.CRAYFISH_CENTER_X_FRACTION,
    private val centerYFraction: Float = TerrariumLayout.CRAYFISH_CENTER_Y_FRACTION,
    private val scaleFactor: Float = 1f,
) : Creature {

    private var visualState by mutableStateOf(CrayfishVisualState.SITTING)
    private var time by mutableFloatStateOf(0f)
    private var transitionProgress by mutableFloatStateOf(1f)

    fun setState(newState: CrayfishVisualState) {
        if (newState != visualState) {
            Log.d("Terrarium", "Crayfish: $visualState -> $newState")
            visualState = newState
            transitionProgress = 0f
        }
    }

    override fun update(dt: Float) {
        time += dt
        if (transitionProgress < 1f) {
            transitionProgress = (transitionProgress + dt * 2f).coerceAtMost(1f)
        }
    }

    override fun draw(scope: DrawScope) {
        val w = scope.size.width
        val h = scope.size.height

        val cx = w * centerXFraction
        val cy = h * centerYFraction
        val bodyWidth = w * TerrariumLayout.CRAYFISH_WIDTH_FRACTION * scaleFactor

        val alpha = when (visualState) {
            CrayfishVisualState.DORMANT -> 0.4f
            else -> 1f
        }

        // Dormant: shift down behind rocks
        // ROUTING: forward-backward rock
        // OBSERVING: gentle sway
        val effectiveCX: Float
        val effectiveCY: Float
        when (visualState) {
            CrayfishVisualState.DORMANT -> {
                effectiveCX = cx
                effectiveCY = cy + bodyWidth * 0.5f
            }
            CrayfishVisualState.ROUTING -> {
                // Body rocks forward/backward
                val rock = sin(time * 2f * PI.toFloat() / (TerrariumTiming.CLAW_CLAP_PERIOD_MS / 1000f))
                effectiveCX = cx + rock * bodyWidth * 0.08f
                effectiveCY = cy + sin(time * 5f) * bodyWidth * 0.03f
            }
            CrayfishVisualState.OBSERVING -> {
                // Gentle side-to-side sway — watching the octopus work
                effectiveCX = cx + sin(time * 1.5f) * bodyWidth * 0.03f
                effectiveCY = cy + sin(time * 2f) * bodyWidth * 0.015f
            }
            else -> {
                effectiveCX = cx
                effectiveCY = cy
            }
        }

        // ROUTING: draw signal waves BEHIND creature (larger, more visible)
        if (visualState == CrayfishVisualState.ROUTING) {
            drawSignalWaves(scope, effectiveCX, effectiveCY, bodyWidth, w)
        }

        // ROUTING: shell glow pulse underneath
        if (visualState == CrayfishVisualState.ROUTING) {
            val glowPulse = (sin(time * 4f) * 0.5f + 0.5f)
            val glowRadius = bodyWidth * (0.5f + glowPulse * 0.2f)
            scope.drawCircle(
                color = TerrariumColors.CrayfishEye.copy(alpha = 0.15f * glowPulse),
                radius = glowRadius,
                center = Offset(effectiveCX, effectiveCY),
            )
        }

        // Tail fan
        drawTailFan(scope, effectiveCX, effectiveCY, bodyWidth, alpha)

        // Abdomen segments
        drawAbdomen(scope, effectiveCX, effectiveCY, bodyWidth, alpha)

        // Carapace (main body) — pulses brighter during ROUTING
        drawCarapace(scope, effectiveCX, effectiveCY, bodyWidth, alpha)

        // Antennae (animated during ROUTING)
        drawAntennae(scope, effectiveCX, effectiveCY, bodyWidth, alpha)

        // Claws — large dramatic movement during ROUTING
        drawClaws(scope, effectiveCX, effectiveCY, bodyWidth, alpha)

        // Eyes — flash during ROUTING, larger for visibility
        drawEyes(scope, effectiveCX, effectiveCY, bodyWidth, alpha)
    }

    private fun drawCarapace(scope: DrawScope, cx: Float, cy: Float, bodyWidth: Float, alpha: Float) {
        val carapaceW = bodyWidth * 0.6f
        val carapaceH = bodyWidth * 0.35f

        // ROUTING: shell pulses red→orange. OBSERVING: subtle warm glow
        val shellColor = when (visualState) {
            CrayfishVisualState.ROUTING -> {
                val pulse = sin(time * 4f) * 0.5f + 0.5f
                lerpColor(TerrariumColors.CrayfishShell, Color(0xFFFF8C42), pulse)
            }
            CrayfishVisualState.OBSERVING -> {
                val pulse = sin(time * 2f) * 0.5f + 0.5f
                lerpColor(TerrariumColors.CrayfishShell, Color(0xFFE84020), pulse * 0.3f)
            }
            else -> TerrariumColors.CrayfishShell
        }

        scope.drawOval(
            color = shellColor.copy(alpha = alpha),
            topLeft = Offset(cx - carapaceW / 2, cy - carapaceH / 2),
            size = Size(carapaceW, carapaceH),
        )

        // Center stripe
        scope.drawOval(
            color = TerrariumColors.CrayfishDark.copy(alpha = alpha * 0.5f),
            topLeft = Offset(cx - carapaceW * 0.3f, cy - carapaceH * 0.15f),
            size = Size(carapaceW * 0.6f, carapaceH * 0.3f),
        )
    }

    private fun drawAbdomen(scope: DrawScope, cx: Float, cy: Float, bodyWidth: Float, alpha: Float) {
        val segmentWidth = bodyWidth * 0.12f
        val segmentHeight = bodyWidth * 0.25f

        for (i in 0 until 4) {
            // ROUTING: segments undulate. OBSERVING: subtle movement
            val segWiggle = when (visualState) {
                CrayfishVisualState.ROUTING -> sin(time * 6f + i * 1.2f) * bodyWidth * 0.01f
                CrayfishVisualState.OBSERVING -> sin(time * 3f + i * 0.8f) * bodyWidth * 0.005f
                else -> 0f
            }

            val segX = cx + bodyWidth * 0.3f + i * segmentWidth
            scope.drawOval(
                color = TerrariumColors.CrayfishDark.copy(alpha = alpha * 0.9f),
                topLeft = Offset(segX, cy - segmentHeight / 2 + i * 2f + segWiggle),
                size = Size(segmentWidth * 1.1f, segmentHeight * (1f - i * 0.05f)),
            )
        }
    }

    private fun drawTailFan(scope: DrawScope, cx: Float, cy: Float, bodyWidth: Float, alpha: Float) {
        val tailX = cx + bodyWidth * 0.75f
        val fanWidth = bodyWidth * 0.2f
        val fanHeight = bodyWidth * 0.35f

        // ROUTING: tail fan flicks. OBSERVING: gentle flick
        val fanSpread = when (visualState) {
            CrayfishVisualState.ROUTING -> 1f + sin(time * 8f) * 0.3f
            CrayfishVisualState.OBSERVING -> 1f + sin(time * 3f) * 0.1f
            else -> 1f
        }

        for (i in -1..1) {
            val path = Path().apply {
                moveTo(tailX, cy)
                lineTo(tailX + fanWidth, cy + i * fanHeight * 0.4f * fanSpread - fanHeight * 0.1f)
                lineTo(tailX + fanWidth, cy + i * fanHeight * 0.4f * fanSpread + fanHeight * 0.1f)
                close()
            }
            scope.drawPath(
                path = path,
                color = TerrariumColors.CrayfishShell.copy(alpha = alpha * 0.7f),
            )
        }
    }

    private fun drawAntennae(scope: DrawScope, cx: Float, cy: Float, bodyWidth: Float, alpha: Float) {
        val antennaLength = bodyWidth * 0.4f

        for (side in listOf(-1f, 1f)) {
            val baseX = cx - bodyWidth * 0.25f
            val baseY = cy + side * bodyWidth * 0.05f

            // ROUTING: antennae sweep actively. OBSERVING: slow twitch
            val antennaAngle = when (visualState) {
                CrayfishVisualState.ROUTING -> sin(time * 7f + side * 1.5f) * 25f
                CrayfishVisualState.OBSERVING -> side * 15f + sin(time * 3f + side * 2f) * 10f
                else -> side * 15f
            }

            scope.rotate(
                degrees = antennaAngle,
                pivot = Offset(baseX, baseY),
            ) {
                drawLine(
                    color = TerrariumColors.CrayfishDark.copy(alpha = alpha * 0.7f),
                    start = Offset(baseX, baseY),
                    end = Offset(baseX - antennaLength, baseY + side * antennaLength * 0.3f),
                    strokeWidth = bodyWidth * 0.012f,
                    cap = StrokeCap.Round,
                )
                // Antenna tip dot
                drawCircle(
                    color = TerrariumColors.CrayfishEye.copy(alpha = alpha * 0.5f),
                    radius = bodyWidth * 0.012f,
                    center = Offset(baseX - antennaLength, baseY + side * antennaLength * 0.3f),
                )
            }
        }
    }

    private fun drawClaws(scope: DrawScope, cx: Float, cy: Float, bodyWidth: Float, alpha: Float) {
        val clawLength = bodyWidth * 0.45f // longer claws for visibility

        val clawAngle = when (visualState) {
            CrayfishVisualState.ROUTING -> {
                // Vigorous clap — ±40° range, faster period
                val clap = sin(time * 2f * PI.toFloat() / (TerrariumTiming.CLAW_CLAP_PERIOD_MS / 1000f))
                clap * 40f
            }
            CrayfishVisualState.OBSERVING -> {
                // Gentle fidget — ±15° slow wave
                10f + sin(time * 2f) * 15f
            }
            CrayfishVisualState.WAITING -> 30f // Raised high
            else -> 10f // Resting
        }

        // ROUTING: pincer open/close. OBSERVING: gentle pincer twitch
        val pincerSpread = when (visualState) {
            CrayfishVisualState.ROUTING -> {
                val openClose = abs(sin(time * 2f * PI.toFloat() / (TerrariumTiming.CLAW_CLAP_PERIOD_MS / 1000f * 0.5f)))
                bodyWidth * (0.03f + openClose * 0.06f)
            }
            CrayfishVisualState.OBSERVING -> {
                bodyWidth * (0.04f + sin(time * 2.5f) * 0.015f)
            }
            else -> bodyWidth * 0.04f
        }

        for (side in listOf(-1f, 1f)) {
            val baseX = cx - bodyWidth * 0.25f
            val baseY = cy + side * bodyWidth * 0.12f

            scope.rotate(
                degrees = side * clawAngle,
                pivot = Offset(baseX, baseY),
            ) {
                // Arm segment — thicker for visibility
                drawLine(
                    color = TerrariumColors.CrayfishClaw.copy(alpha = alpha),
                    start = Offset(baseX, baseY),
                    end = Offset(baseX - clawLength * 0.6f, baseY),
                    strokeWidth = bodyWidth * 0.06f,
                    cap = StrokeCap.Round,
                )

                // Claw pincer — two lines forming V with animated spread
                val pinchX = baseX - clawLength * 0.6f
                val tipX = baseX - clawLength
                drawLine(
                    color = TerrariumColors.CrayfishClaw.copy(alpha = alpha),
                    start = Offset(pinchX, baseY),
                    end = Offset(tipX, baseY - pincerSpread),
                    strokeWidth = bodyWidth * 0.045f,
                    cap = StrokeCap.Round,
                )
                drawLine(
                    color = TerrariumColors.CrayfishClaw.copy(alpha = alpha),
                    start = Offset(pinchX, baseY),
                    end = Offset(tipX, baseY + pincerSpread),
                    strokeWidth = bodyWidth * 0.045f,
                    cap = StrokeCap.Round,
                )

                // ROUTING: spark at claw tips when clapping shut
                if (visualState == CrayfishVisualState.ROUTING && pincerSpread < bodyWidth * 0.04f) {
                    drawCircle(
                        color = TerrariumColors.CrayfishEye.copy(alpha = 0.8f),
                        radius = bodyWidth * 0.025f,
                        center = Offset(tipX, baseY),
                    )
                }
            }
        }
    }

    private fun drawEyes(scope: DrawScope, cx: Float, cy: Float, bodyWidth: Float, alpha: Float) {
        val eyeRadius = bodyWidth * 0.04f // bigger eyes
        val eyeX = cx - bodyWidth * 0.22f

        for (side in listOf(-1f, 1f)) {
            val eyeY = cy + side * bodyWidth * 0.08f

            // Eye stalk
            scope.drawLine(
                color = TerrariumColors.CrayfishDark.copy(alpha = alpha),
                start = Offset(cx - bodyWidth * 0.18f, cy + side * bodyWidth * 0.05f),
                end = Offset(eyeX, eyeY),
                strokeWidth = bodyWidth * 0.025f,
            )

            // ROUTING: eyes alternate bright flash. OBSERVING: slow pulse
            val eyeColor: Color
            val effectiveRadius: Float
            when (visualState) {
                CrayfishVisualState.ROUTING -> {
                    val flash = sin(time * 2f * PI.toFloat() / (TerrariumTiming.EYE_FLASH_PERIOD_MS / 1000f) + side)
                    val intensity = flash * 0.5f + 0.5f
                    eyeColor = lerpColor(TerrariumColors.CrayfishEye, Color(0xFFFFFFFF), intensity * 0.5f)
                    effectiveRadius = eyeRadius * (1f + intensity * 0.4f)

                    // Glow ring around eye
                    scope.drawCircle(
                        color = TerrariumColors.CrayfishEye.copy(alpha = 0.3f * intensity),
                        radius = effectiveRadius * 1.8f,
                        center = Offset(eyeX, eyeY),
                    )
                }
                CrayfishVisualState.OBSERVING -> {
                    val pulse = sin(time * 3f + side) * 0.5f + 0.5f
                    eyeColor = lerpColor(TerrariumColors.CrayfishEye, Color(0xFFFFFFFF), pulse * 0.3f)
                    effectiveRadius = eyeRadius * (1f + pulse * 0.2f)
                }
                else -> {
                    eyeColor = TerrariumColors.CrayfishEye
                    effectiveRadius = eyeRadius
                }
            }

            scope.drawCircle(
                color = eyeColor.copy(alpha = alpha),
                radius = effectiveRadius,
                center = Offset(eyeX, eyeY),
            )
        }
    }

    private fun drawSignalWaves(scope: DrawScope, cx: Float, cy: Float, bodyWidth: Float, canvasWidth: Float) {
        // Much larger signal waves that radiate outward — clearly visible orchestration
        val waveSpeed = time * 2f
        val maxRadius = canvasWidth * 0.15f // much larger radius

        for (i in 0 until 4) {
            val progress = ((waveSpeed + i * 0.25f) % 1f)
            val radius = bodyWidth * 0.3f + progress * maxRadius
            val waveAlpha = (1f - progress) * 0.35f

            // Full 120° arc facing left (toward other creatures)
            scope.drawArc(
                color = TerrariumColors.CrayfishEye.copy(alpha = waveAlpha),
                startAngle = 120f,
                sweepAngle = 120f,
                useCenter = false,
                topLeft = Offset(cx - radius, cy - radius),
                size = Size(radius * 2, radius * 2),
                style = Stroke(width = 3f + (1f - progress) * 2f),
            )
        }

        // Small data dots traveling along signal arcs
        for (i in 0 until 6) {
            val dotProgress = ((time * 3f + i * 0.16f) % 1f)
            val dotRadius = bodyWidth * 0.3f + dotProgress * maxRadius
            val dotAngle = (150f + dotProgress * 40f) * PI.toFloat() / 180f
            val dotX = cx + cos(dotAngle) * dotRadius
            val dotY = cy + sin(dotAngle) * dotRadius
            val dotAlpha = (1f - dotProgress) * 0.6f

            scope.drawCircle(
                color = TerrariumColors.TetraNeon.copy(alpha = dotAlpha),
                radius = bodyWidth * 0.015f,
                center = Offset(dotX, dotY),
            )
        }
    }

    private fun lerpColor(a: Color, b: Color, t: Float): Color {
        return Color(
            red = a.red + (b.red - a.red) * t,
            green = a.green + (b.green - a.green) * t,
            blue = a.blue + (b.blue - a.blue) * t,
            alpha = a.alpha + (b.alpha - a.alpha) * t,
        )
    }
}
