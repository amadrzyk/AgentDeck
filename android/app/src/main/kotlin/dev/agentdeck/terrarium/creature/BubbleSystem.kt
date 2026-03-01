package dev.agentdeck.terrarium.creature

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.DrawScope
import dev.agentdeck.terrarium.EnvironmentVisualState
import dev.agentdeck.terrarium.TerrariumColors
import dev.agentdeck.terrarium.TerrariumTiming
import kotlin.math.PI
import kotlin.math.sin
import kotlin.random.Random

/**
 * Particle engine for bubbles rising from the bottom.
 * Ring buffer (max 50). Spawn rate depends on environment state.
 */
class BubbleSystem : Creature {

    private data class Bubble(
        var x: Float,
        var y: Float,
        var radius: Float,
        var speed: Float,
        var wobblePhase: Float,
        var wobbleAmp: Float,
        var alpha: Float,
        var alive: Boolean = true,
    )

    private val bubbles = Array(MAX_BUBBLES) {
        Bubble(0f, 0f, 0f, 0f, 0f, 0f, 0f, alive = false)
    }
    private var nextSlot = 0
    private var timeSinceSpawn = 0f
    private var envState by mutableStateOf(EnvironmentVisualState.CALM)
    private var time by mutableFloatStateOf(0f)

    fun setState(state: EnvironmentVisualState) {
        envState = state
    }

    override fun update(dt: Float) {
        time += dt
        timeSinceSpawn += dt * 1000f

        val spawnInterval = when (envState) {
            EnvironmentVisualState.DARK -> Float.MAX_VALUE // no bubbles
            EnvironmentVisualState.CALM -> TerrariumTiming.CALM_SPAWN_INTERVAL_MS
            EnvironmentVisualState.ACTIVE -> TerrariumTiming.ACTIVE_SPAWN_INTERVAL_MS
            EnvironmentVisualState.ALERT -> TerrariumTiming.ACTIVE_SPAWN_INTERVAL_MS * 1.5f
        }

        // Spawn new bubbles
        while (timeSinceSpawn >= spawnInterval) {
            timeSinceSpawn -= spawnInterval
            spawnBubble()
        }

        // Update existing bubbles
        for (bubble in bubbles) {
            if (!bubble.alive) continue

            bubble.y -= bubble.speed * dt
            bubble.x += sin(time * TerrariumTiming.BUBBLE_WOBBLE_SPEED + bubble.wobblePhase) *
                bubble.wobbleAmp * dt

            // Fade out near top
            if (bubble.y < 0.1f) {
                bubble.alpha = (bubble.y / 0.1f).coerceIn(0f, 1f)
            }

            // Kill if off screen
            if (bubble.y < -0.02f) {
                bubble.alive = false
            }
        }
    }

    override fun draw(scope: DrawScope) {
        val w = scope.size.width
        val h = scope.size.height

        for (bubble in bubbles) {
            if (!bubble.alive) continue

            val screenX = bubble.x * w
            val screenY = bubble.y * h
            val screenRadius = bubble.radius * w

            // Bubble body
            scope.drawCircle(
                color = TerrariumColors.BubbleWhite.copy(alpha = bubble.alpha * 0.3f),
                radius = screenRadius,
                center = Offset(screenX, screenY),
            )

            // Bubble highlight (upper-left)
            scope.drawCircle(
                color = TerrariumColors.BubbleHighlight.copy(alpha = bubble.alpha * 0.5f),
                radius = screenRadius * 0.3f,
                center = Offset(
                    screenX - screenRadius * 0.25f,
                    screenY - screenRadius * 0.25f,
                ),
            )
        }
    }

    private fun spawnBubble() {
        val bubble = bubbles[nextSlot]
        nextSlot = (nextSlot + 1) % MAX_BUBBLES

        val isError = envState == EnvironmentVisualState.ALERT

        bubble.x = Random.nextFloat() * 0.8f + 0.1f // 10%-90% width
        bubble.y = 0.95f + Random.nextFloat() * 0.05f // bottom
        bubble.radius = if (isError) {
            Random.nextFloat() * 0.008f + 0.005f
        } else {
            Random.nextFloat() * 0.005f + 0.002f
        }
        bubble.speed = TerrariumTiming.BUBBLE_RISE_SPEED * (0.7f + Random.nextFloat() * 0.6f)
        bubble.wobblePhase = Random.nextFloat() * 2f * PI.toFloat()
        bubble.wobbleAmp = Random.nextFloat() * 0.02f + 0.005f
        bubble.alpha = 1f
        bubble.alive = true
    }

    companion object {
        private const val MAX_BUBBLES = 50
    }
}
