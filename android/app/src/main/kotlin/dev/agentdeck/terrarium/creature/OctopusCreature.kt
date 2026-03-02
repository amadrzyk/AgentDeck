package dev.agentdeck.terrarium.creature

import android.graphics.Paint
import android.graphics.Typeface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import dev.agentdeck.terrarium.OctopusVisualState
import dev.agentdeck.terrarium.TerrariumColors
import dev.agentdeck.terrarium.TerrariumLayout
import dev.agentdeck.terrarium.TerrariumTiming
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * Claude Code pixel mascot — 14×5 portrait-rectangle character (terracotta).
 * Each pixel is 1:2 (w:h) ratio. Thin gap between blocks for visual separation.
 * Rounded body with protruding animated arms and 4 stretch-animated tentacles.
 *
 * Pixel cell types:
 *   0=transparent, 1=body, 2=eye, 3=left arm, 4=right arm,
 *   5=left tentacle, 6=right tentacle
 *
 * Arms bob vertically. Tentacles stretch height (no position shift, no gaps).
 * THINKING state shows rotating Anthropic starburst behind the body.
 */
class OctopusCreature(
    private val centerXFraction: Float = TerrariumLayout.OCTOPUS_CENTER_X_FRACTION,
    private val centerYFraction: Float = TerrariumLayout.OCTOPUS_CENTER_Y_FRACTION,
    private val scaleFactor: Float = 1f,
    phaseOffset: Float = 0f,
    displayName: String? = null,
) : Creature {

    private var visualState by mutableStateOf(OctopusVisualState.FLOATING)
    private var time by mutableFloatStateOf(phaseOffset)
    private var transitionProgress by mutableFloatStateOf(1f)
    private var agentMark: AgentMark? by mutableStateOf(null)
    private var nameTag: String? by mutableStateOf(displayName)
    /** Whether to show name tag (only for multi-session). */
    private var showNameTag by mutableStateOf(displayName != null)

    fun setState(newState: OctopusVisualState) {
        if (newState != visualState) {
            visualState = newState
            transitionProgress = 0f
        }
    }

    fun setMark(newMark: AgentMark?) {
        agentMark = newMark
    }

    fun setDisplayName(name: String?, show: Boolean = name != null) {
        nameTag = name
        showNameTag = show
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

        // WORKING: draw starburst behind pixel body
        if (visualState == OctopusVisualState.WORKING) {
            drawStarburst(scope, centerX, effectiveCenterY, bodyRadius * 2.5f, bodyAlpha)
        }

        // Draw pixel body with animated tentacles
        drawPixelBody(scope, centerX, effectiveCenterY, bodyRadius, bodyAlpha)

        // ASKING: speech bubble with "?"
        if (visualState == OctopusVisualState.ASKING) {
            drawSpeechBubble(scope, centerX, effectiveCenterY, bodyRadius)
        }

        // Name tag (multi-session only)
        if (showNameTag && nameTag != null) {
            drawNameTag(scope, centerX, effectiveCenterY, bodyRadius, nameTag!!)
        }
    }

    // --- Tentacle animation offsets ---

    /** Y-offset for tentacle animation. Left and right pairs sway in opposite phase. */
    private fun tentacleOffset(isLeft: Boolean, pixelSize: Float): Float {
        val phase = if (isLeft) PI.toFloat() else 0f

        val (speed, amplitude) = when (visualState) {
            OctopusVisualState.WORKING -> 1.5f to 0.08f
            OctopusVisualState.FLOATING -> 2.0f to 0.15f
            OctopusVisualState.ASKING -> 1.5f to 0.10f
            OctopusVisualState.SLEEPING -> return 0f
        }

        return sin(time * speed + phase) * pixelSize * amplitude
    }

    /** Y-offset for arm animation. Gentle bob, opposite phase from tentacles. */
    private fun armOffset(isLeft: Boolean, pixelSize: Float): Float {
        val phase = if (isLeft) 0f else PI.toFloat()

        val (speed, amplitude) = when (visualState) {
            OctopusVisualState.WORKING -> 1.0f to 0.06f
            OctopusVisualState.FLOATING -> 1.5f to 0.12f
            OctopusVisualState.ASKING -> 1.5f to 0.08f
            OctopusVisualState.SLEEPING -> return 0f
        }

        return sin(time * speed + phase) * pixelSize * amplitude
    }

    private fun drawPixelBody(
        scope: DrawScope,
        cx: Float, cy: Float,
        bodyRadius: Float,
        alpha: Float,
    ) {
        val pixelW = bodyRadius * 2f / GRID_COLS
        val pixelH = pixelW * PIXEL_ASPECT
        val gridW = GRID_COLS * pixelW
        val gridH = GRID_ROWS * pixelH
        val startX = cx - gridW / 2f
        val startY = cy - gridH / 2f

        val bodyColor = bodyColorForState()
        val gap = PIXEL_GAP

        for (row in 0 until GRID_ROWS) {
            for (col in 0 until GRID_COLS) {
                val cell = PIXEL_GRID[row][col]
                if (cell == EMPTY) continue

                val px = startX + col * pixelW
                var py = startY + row * pixelH

                // Arm Y-offset (bob up/down)
                when (cell) {
                    LEFT_ARM -> py += armOffset(isLeft = true, pixelH)
                    RIGHT_ARM -> py += armOffset(isLeft = false, pixelH)
                }

                when (cell) {
                    EYE -> {
                        if (visualState == OctopusVisualState.SLEEPING) {
                            scope.drawRect(
                                color = TerrariumColors.ClaudeEye.copy(alpha = alpha * 0.6f),
                                topLeft = Offset(px + gap, py + pixelH * 0.4f),
                                size = Size(pixelW - gap * 2, pixelH * 0.2f),
                            )
                        } else {
                            scope.drawRect(
                                color = TerrariumColors.ClaudeEye.copy(alpha = alpha),
                                topLeft = Offset(px + gap, py + gap),
                                size = Size(pixelW - gap * 2, pixelH - gap * 2),
                            )
                        }
                    }
                    LEFT_LEG, RIGHT_LEG -> {
                        // Tentacles: stretch height, stay connected to body (no top gap)
                        val stretch = tentacleOffset(cell == LEFT_LEG, pixelH)
                        scope.drawRect(
                            color = bodyColor.copy(alpha = alpha),
                            topLeft = Offset(px + gap, py),
                            size = Size(
                                pixelW - gap * 2,
                                (pixelH + stretch - gap).coerceAtLeast(pixelH * 0.3f),
                            ),
                        )
                    }
                    else -> {
                        scope.drawRect(
                            color = bodyColor.copy(alpha = alpha),
                            topLeft = Offset(px + gap, py + gap),
                            size = Size(pixelW - gap * 2, pixelH - gap * 2),
                        )
                    }
                }
            }
        }
    }

    private fun bodyColorForState(): Color {
        return when (visualState) {
            OctopusVisualState.WORKING -> {
                val t = sin(time * TerrariumTiming.THINKING_PULSE_SPEED) * 0.5f + 0.5f
                lerpColor(TerrariumColors.ClaudeBody, TerrariumColors.ClaudeBodyLight, t)
            }
            else -> TerrariumColors.ClaudeBody
        }
    }

    /**
     * Anthropic sparkle/starburst — 10 radiating arms behind the pixel body.
     * Slowly rotates and pulses during THINKING state.
     */
    private fun drawStarburst(scope: DrawScope, cx: Float, cy: Float, radius: Float, alpha: Float) {
        val rotation = time * 0.5f
        val pulse = sin(time * TerrariumTiming.THINKING_PULSE_SPEED) * 0.15f + 0.85f

        for (i in 0 until STARBURST_ARM_COUNT) {
            val baseAngle = (i.toFloat() / STARBURST_ARM_COUNT) * 2f * PI.toFloat() + rotation
            val armLen = radius * pulse * STARBURST_ARM_LENGTHS[i % STARBURST_ARM_LENGTHS.size]
            val endX = cx + cos(baseAngle) * armLen
            val endY = cy + sin(baseAngle) * armLen

            scope.drawLine(
                color = TerrariumColors.ClaudeBody.copy(alpha = alpha * 0.35f),
                start = Offset(cx, cy),
                end = Offset(endX, endY),
                strokeWidth = radius * 0.10f,
                cap = StrokeCap.Round,
            )
        }
    }

    /** Speech bubble with "?" — shown during ASKING state. */
    private fun drawSpeechBubble(scope: DrawScope, cx: Float, cy: Float, bodyRadius: Float) {
        val pixelW = bodyRadius * 2f / GRID_COLS
        val gridH = GRID_ROWS * pixelW * PIXEL_ASPECT

        // Position: upper-right of the octopus head
        val bubbleX = cx + bodyRadius * 1.2f
        val bubbleY = cy - gridH / 2f - bodyRadius * 0.6f
        val bubbleR = bodyRadius * 0.7f

        // Gentle pulse
        val pulse = sin(time * 2.5f) * 0.08f + 1f
        val r = bubbleR * pulse

        // Bubble fill
        scope.drawCircle(
            color = Color.White.copy(alpha = 0.25f),
            radius = r,
            center = Offset(bubbleX, bubbleY),
        )
        // Bubble border
        scope.drawCircle(
            color = TerrariumColors.HUDText.copy(alpha = 0.5f),
            radius = r,
            center = Offset(bubbleX, bubbleY),
            style = Stroke(width = bodyRadius * 0.04f),
        )

        // Tail triangle pointing toward octopus head
        val tailPath = Path().apply {
            moveTo(bubbleX - r * 0.3f, bubbleY + r * 0.8f)
            lineTo(cx + bodyRadius * 0.5f, cy - gridH / 2f)
            lineTo(bubbleX - r * 0.05f, bubbleY + r * 0.95f)
            close()
        }
        scope.drawPath(tailPath, color = Color.White.copy(alpha = 0.25f))

        // "?" text via nativeCanvas
        val canvas = scope.drawContext.canvas.nativeCanvas
        val textSize = r * 1.2f
        canvas.drawText(
            "?", bubbleX, bubbleY + textSize * 0.35f,
            questionMarkPaint.apply { this.textSize = textSize },
        )
    }

    /** Name tag hat above the octopus — only shown in multi-session mode. */
    private fun drawNameTag(scope: DrawScope, cx: Float, cy: Float, bodyRadius: Float, name: String) {
        val pixelW = bodyRadius * 2f / GRID_COLS
        val gridH = GRID_ROWS * pixelW * PIXEL_ASPECT
        val hatY = cy - gridH / 2f - bodyRadius * 0.4f

        val hatWidth = bodyRadius * 1.8f
        val hatHeight = bodyRadius * 0.5f

        // Hat background
        scope.drawRoundRect(
            color = TerrariumColors.ClaudeBody.copy(alpha = 0.6f),
            topLeft = Offset(cx - hatWidth / 2, hatY - hatHeight),
            size = Size(hatWidth, hatHeight),
            cornerRadius = CornerRadius(4f, 4f),
        )

        // Name text
        val canvas = scope.drawContext.canvas.nativeCanvas
        val fontSize = hatHeight * 0.6f
        canvas.drawText(
            name, cx, hatY - hatHeight * 0.25f,
            nameTagPaint.apply { textSize = fontSize },
        )
    }

    private fun lerpColor(a: Color, b: Color, t: Float): Color {
        return Color(
            red = a.red + (b.red - a.red) * t,
            green = a.green + (b.green - a.green) * t,
            blue = a.blue + (b.blue - a.blue) * t,
            alpha = a.alpha + (b.alpha - a.alpha) * t,
        )
    }

    private val questionMarkPaint = Paint().apply {
        isAntiAlias = true
        color = android.graphics.Color.argb(180, 226, 232, 240) // HUDText ~70%
        textAlign = Paint.Align.CENTER
        typeface = Typeface.DEFAULT_BOLD
    }

    private val nameTagPaint = Paint().apply {
        isAntiAlias = true
        color = android.graphics.Color.argb(220, 226, 232, 240) // HUDText ~86%
        textAlign = Paint.Align.CENTER
        typeface = Typeface.create("sans-serif", Typeface.NORMAL)
    }

    companion object {
        // Pixel cell types
        private const val EMPTY = 0
        private const val BODY = 1
        private const val EYE = 2
        private const val LEFT_ARM = 3
        private const val RIGHT_ARM = 4
        private const val LEFT_LEG = 5
        private const val RIGHT_LEG = 6

        private const val GRID_COLS = 14
        private const val GRID_ROWS = 5

        /** Portrait pixel aspect ratio (height/width). */
        private const val PIXEL_ASPECT = 2.0f

        /** Gap between adjacent blocks for visual separation. */
        private const val PIXEL_GAP = 0.5f

        // Claude Code pixel mascot — 14 cols × 5 rows, portrait-rectangle pixels
        // 10w body + 2-block arm protrusion each side + 4 tentacles
        private val PIXEL_GRID = arrayOf(
            intArrayOf(0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0), // row 0: head (10w)
            intArrayOf(0, 0, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 0, 0), // row 1: eyes at 4,9 (10w)
            intArrayOf(3, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 4), // row 2: body + arms (14w)
            intArrayOf(0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0), // row 3: waist (10w)
            intArrayOf(0, 0, 0, 5, 0, 5, 0, 0, 6, 0, 6, 0, 0, 0), // row 4: tentacles ×4
        )

        // Starburst (Anthropic sparkle) — 10 arms with varying lengths
        private const val STARBURST_ARM_COUNT = 10
        private val STARBURST_ARM_LENGTHS = floatArrayOf(
            1.0f, 0.75f, 0.95f, 0.70f, 1.0f,
            0.80f, 0.90f, 0.72f, 0.98f, 0.78f,
        )
    }
}
