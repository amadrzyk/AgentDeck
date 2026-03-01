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
import androidx.compose.ui.graphics.drawscope.withTransform
import dev.agentdeck.terrarium.OctopusVisualState
import dev.agentdeck.terrarium.TerrariumColors
import dev.agentdeck.terrarium.TerrariumLayout
import dev.agentdeck.terrarium.TerrariumTiming
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * Octopus — coding agent avatar.
 * Oval body with gradient, 2 eyes, 8 bezier tentacles with independent sine wave offsets.
 * Position and scale are parameterized for multi-session rendering.
 */
class OctopusCreature(
    private val centerXFraction: Float = TerrariumLayout.OCTOPUS_CENTER_X_FRACTION,
    private val centerYFraction: Float = TerrariumLayout.OCTOPUS_CENTER_Y_FRACTION,
    private val scaleFactor: Float = 1f,
) : Creature {

    private var visualState by mutableStateOf(OctopusVisualState.FLOATING)
    private var time by mutableFloatStateOf(0f)
    private var transitionProgress by mutableFloatStateOf(1f)
    private var agentMark: AgentMark? by mutableStateOf(null)

    fun setState(newState: OctopusVisualState) {
        if (newState != visualState) {
            visualState = newState
            transitionProgress = 0f
        }
    }

    fun setMark(newMark: AgentMark?) {
        agentMark = newMark
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

        val bodyRadius = w * TerrariumLayout.OCTOPUS_BODY_RADIUS_FRACTION * scaleFactor
        val centerX = w * centerXFraction
        val tentacleLength = w * TerrariumLayout.TENTACLE_LENGTH_FRACTION * scaleFactor

        // Float bob
        val bobOffset = when (visualState) {
            OctopusVisualState.SLEEPING -> 0f
            else -> sin(time * 2f * PI.toFloat() / (TerrariumTiming.FLOAT_PERIOD_MS / 1000f)) *
                h * TerrariumTiming.FLOAT_AMPLITUDE_FRACTION
        }
        val centerY = h * centerYFraction + bobOffset

        // Sleeping: lower position, dimmer
        val effectiveCenterY = if (visualState == OctopusVisualState.SLEEPING) {
            h * 0.82f
        } else centerY

        val bodyAlpha = if (visualState == OctopusVisualState.SLEEPING) 0.4f else 1f

        // Draw tentacles first (behind body)
        drawTentacles(scope, centerX, effectiveCenterY, bodyRadius, tentacleLength, bodyAlpha)

        // Draw body (oval)
        val bodyColor = when (visualState) {
            OctopusVisualState.THINKING -> {
                // Hue rotation effect via color cycling
                val hueShift = (sin(time * TerrariumTiming.THINKING_PULSE_SPEED) * 0.5f + 0.5f)
                lerpColor(TerrariumColors.OctopusBody, Color(0xFF818CF8), hueShift)
            }
            else -> TerrariumColors.OctopusBody
        }

        scope.drawOval(
            color = bodyColor.copy(alpha = bodyAlpha),
            topLeft = Offset(centerX - bodyRadius, effectiveCenterY - bodyRadius * 1.2f),
            size = Size(bodyRadius * 2f, bodyRadius * 2.4f),
        )

        // Inner body highlight
        scope.drawOval(
            color = TerrariumColors.OctopusTentacle.copy(alpha = 0.3f * bodyAlpha),
            topLeft = Offset(centerX - bodyRadius * 0.6f, effectiveCenterY - bodyRadius * 0.8f),
            size = Size(bodyRadius * 1.2f, bodyRadius * 1.6f),
        )

        // Agent brand mark (watermark on body)
        agentMark?.let { drawAgentMark(scope, it, centerX, effectiveCenterY, bodyRadius, bodyAlpha) }

        // Draw eyes
        drawEyes(scope, centerX, effectiveCenterY, bodyRadius, bodyAlpha)

        // Holographic keyboard for TYPING state
        if (visualState == OctopusVisualState.TYPING) {
            drawHolographicKeyboard(scope, centerX, effectiveCenterY, bodyRadius)
        }

        // Option cards for PRESENTING state
        if (visualState == OctopusVisualState.PRESENTING) {
            drawOptionCards(scope, centerX, effectiveCenterY, bodyRadius)
        }

        // Document review for REVIEWING state
        if (visualState == OctopusVisualState.REVIEWING) {
            drawReviewDocs(scope, centerX, effectiveCenterY, bodyRadius)
        }
    }

    private fun drawAgentMark(
        scope: DrawScope,
        agentMark: AgentMark,
        cx: Float, cy: Float,
        bodyRadius: Float,
        alpha: Float,
    ) {
        // Scale SVG path to fit ~60% of body size, centered on body
        val markSize = bodyRadius * 1.4f // 70% of body diameter
        val scale = markSize / agentMark.viewBoxWidth

        scope.withTransform({
            translate(
                left = cx - (agentMark.viewBoxWidth * scale) / 2f,
                top = cy - (agentMark.viewBoxHeight * scale) / 2f - bodyRadius * 0.1f,
            )
            scale(scale, scale)
        }) {
            drawPath(
                path = agentMark.path,
                color = Color(0xFF00E5FF).copy(alpha = 0.4f * alpha),
            )
        }
    }

    private fun drawTentacles(
        scope: DrawScope,
        cx: Float, cy: Float,
        bodyRadius: Float,
        tentacleLength: Float,
        alpha: Float,
    ) {
        val baseY = cy + bodyRadius * 0.8f

        for (i in 0 until 8) {
            val angle = -PI.toFloat() * 0.8f + (i / 7f) * PI.toFloat() * 1.6f
            val startX = cx + cos(angle) * bodyRadius * 0.7f
            val startY = baseY

            val waveOffset = when (visualState) {
                OctopusVisualState.SLEEPING -> 0f
                OctopusVisualState.THINKING -> {
                    // Curl inward
                    sin(time * TerrariumTiming.THINKING_PULSE_SPEED + i * 0.5f) * tentacleLength * 0.1f
                }
                OctopusVisualState.TYPING -> {
                    // Rapid small motions
                    sin(time * TerrariumTiming.TYPING_SPEED + i * 1.2f) * tentacleLength * 0.15f
                }
                else -> {
                    // Gentle wave
                    sin(time * TerrariumTiming.TENTACLE_WAVE_SPEED + i * 0.8f) * tentacleLength * 0.2f
                }
            }

            val endX = startX + cos(angle) * tentacleLength + waveOffset
            val endY = startY + tentacleLength * 0.8f

            // Bezier control points
            val cp1x = startX + cos(angle) * tentacleLength * 0.3f + waveOffset * 0.5f
            val cp1y = startY + tentacleLength * 0.3f
            val cp2x = startX + cos(angle) * tentacleLength * 0.6f + waveOffset
            val cp2y = startY + tentacleLength * 0.6f

            val path = Path().apply {
                moveTo(startX, startY)
                cubicTo(cp1x, cp1y, cp2x, cp2y, endX, endY)
            }

            scope.drawPath(
                path = path,
                color = TerrariumColors.OctopusTentacle.copy(alpha = alpha * 0.8f),
                style = Stroke(
                    width = bodyRadius * 0.15f * (1f - i * 0.02f),
                    cap = StrokeCap.Round,
                ),
            )
        }
    }

    private fun drawEyes(scope: DrawScope, cx: Float, cy: Float, bodyRadius: Float, alpha: Float) {
        val eyeSpacing = bodyRadius * 0.45f
        val eyeY = cy - bodyRadius * 0.2f
        val eyeRadius = bodyRadius * 0.18f

        val isClosed = visualState == OctopusVisualState.SLEEPING

        for (side in listOf(-1f, 1f)) {
            val eyeX = cx + side * eyeSpacing

            if (isClosed) {
                // Closed eyes — horizontal line
                scope.drawLine(
                    color = TerrariumColors.OctopusEye.copy(alpha = alpha * 0.5f),
                    start = Offset(eyeX - eyeRadius, eyeY),
                    end = Offset(eyeX + eyeRadius, eyeY),
                    strokeWidth = 2f,
                )
            } else {
                // Eye white
                scope.drawCircle(
                    color = TerrariumColors.OctopusEye.copy(alpha = alpha),
                    radius = eyeRadius,
                    center = Offset(eyeX, eyeY),
                )
                // Pupil
                scope.drawCircle(
                    color = TerrariumColors.OctopusPupil.copy(alpha = alpha),
                    radius = eyeRadius * 0.5f,
                    center = Offset(eyeX + side * eyeRadius * 0.1f, eyeY),
                )
            }
        }
    }

    private fun drawHolographicKeyboard(scope: DrawScope, cx: Float, cy: Float, bodyRadius: Float) {
        val kbWidth = bodyRadius * 4f
        val kbHeight = bodyRadius * 1.5f
        val kbY = cy + bodyRadius * 2.5f

        // Semi-transparent keyboard background
        scope.drawRoundRect(
            color = TerrariumColors.HoloBlue.copy(alpha = 0.15f),
            topLeft = Offset(cx - kbWidth / 2, kbY),
            size = Size(kbWidth, kbHeight),
            cornerRadius = androidx.compose.ui.geometry.CornerRadius(4f),
        )

        // Key grid lines
        val rows = 3
        val cols = 10
        for (r in 0..rows) {
            val y = kbY + (r.toFloat() / rows) * kbHeight
            scope.drawLine(
                color = TerrariumColors.HoloText.copy(alpha = 0.2f),
                start = Offset(cx - kbWidth / 2, y),
                end = Offset(cx + kbWidth / 2, y),
                strokeWidth = 0.5f,
            )
        }
        for (c in 0..cols) {
            val x = cx - kbWidth / 2 + (c.toFloat() / cols) * kbWidth
            scope.drawLine(
                color = TerrariumColors.HoloText.copy(alpha = 0.2f),
                start = Offset(x, kbY),
                end = Offset(x, kbY + kbHeight),
                strokeWidth = 0.5f,
            )
        }

        // Active key highlight
        val activeCol = ((time * TerrariumTiming.TYPING_SPEED * 2f) % cols).toInt()
        val activeRow = ((time * TerrariumTiming.TYPING_SPEED) % rows).toInt()
        val keyW = kbWidth / cols
        val keyH = kbHeight / rows
        scope.drawRoundRect(
            color = TerrariumColors.TetraNeon.copy(alpha = 0.4f),
            topLeft = Offset(cx - kbWidth / 2 + activeCol * keyW, kbY + activeRow * keyH),
            size = Size(keyW, keyH),
            cornerRadius = androidx.compose.ui.geometry.CornerRadius(2f),
        )
    }

    private fun drawOptionCards(scope: DrawScope, cx: Float, cy: Float, bodyRadius: Float) {
        val cardWidth = bodyRadius * 2f
        val cardHeight = bodyRadius * 1.2f
        val startY = cy - bodyRadius * 1.5f

        for (i in 0 until 3) {
            val offsetX = (i - 1) * cardWidth * 1.2f
            scope.drawRoundRect(
                color = TerrariumColors.HoloBlue.copy(alpha = 0.2f),
                topLeft = Offset(cx + offsetX - cardWidth / 2, startY),
                size = Size(cardWidth, cardHeight),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(4f),
            )
            // Card border
            scope.drawRoundRect(
                color = TerrariumColors.HoloText.copy(alpha = 0.4f),
                topLeft = Offset(cx + offsetX - cardWidth / 2, startY),
                size = Size(cardWidth, cardHeight),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(4f),
                style = Stroke(width = 1f),
            )
        }
    }

    private fun drawReviewDocs(scope: DrawScope, cx: Float, cy: Float, bodyRadius: Float) {
        val docWidth = bodyRadius * 2.5f
        val docHeight = bodyRadius * 3f
        val docY = cy - bodyRadius * 0.5f

        for (side in listOf(-1f, 1f)) {
            val docX = cx + side * docWidth * 0.7f - docWidth / 2

            // Document background
            scope.drawRoundRect(
                color = TerrariumColors.HoloBlue.copy(alpha = 0.12f),
                topLeft = Offset(docX, docY),
                size = Size(docWidth, docHeight),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(2f),
            )

            // Text lines
            for (line in 0 until 8) {
                val lineY = docY + 8f + line * (docHeight / 9f)
                val lineWidth = docWidth * (0.5f + (line * 17 % 5) * 0.1f)
                scope.drawLine(
                    color = TerrariumColors.HoloText.copy(alpha = 0.25f),
                    start = Offset(docX + 6f, lineY),
                    end = Offset(docX + 6f + lineWidth, lineY),
                    strokeWidth = 1.5f,
                )
            }

            // Side label (+/-)
            val diffColor = if (side < 0) Color(0x60EF4444) else Color(0x6022C55E)
            scope.drawRoundRect(
                color = diffColor,
                topLeft = Offset(docX, docY),
                size = Size(3f, docHeight),
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
