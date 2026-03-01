package dev.agentdeck.terrarium.creature

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import dev.agentdeck.terrarium.AgentCreatureState
import dev.agentdeck.terrarium.CreatureSlot
import dev.agentdeck.terrarium.OctopusVisualState
import dev.agentdeck.terrarium.TetraVisualState
import dev.agentdeck.terrarium.TerrariumLayout
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.random.Random

/**
 * Data particles — visualize data flow between agent creatures.
 *
 * Replaces the Tetra school with abstract luminous particles that travel
 * between agent positions via bezier curves.
 *
 * Behavior:
 * - STREAMING: particles emit from active (TYPING/THINKING) agents toward environment
 * - CIRCLING: particles orbit slowly around active creatures
 * - HOVERING: particles cluster near option area
 * - ABSENT: no particles
 */
class DataParticleSystem : Creature {

    enum class ParticleType(val color: Color) {
        TOOL_CALL(Color(0xFF00E5FF)),       // Cyan — tool calls
        COMMUNICATION(Color(0xFFFBBF24)),   // Amber — inter-agent messages
        DATA_TRANSFER(Color(0xFF22C55E)),   // Green — data exchange
    }

    private data class DataParticle(
        var x: Float, var y: Float,
        var vx: Float, var vy: Float,
        var progress: Float,    // 0..1 travel progress
        var alpha: Float,
        var type: ParticleType,
        var alive: Boolean,
        var sourceX: Float, var sourceY: Float,
        var targetX: Float, var targetY: Float,
        var cpX: Float, var cpY: Float, // bezier control point
    )

    private var visualState by mutableStateOf(TetraVisualState.CIRCLING)
    private var time by mutableFloatStateOf(0f)
    private val particles = Array(MAX_PARTICLES) {
        DataParticle(0.5f, 0.5f, 0f, 0f, 0f, 0f, ParticleType.TOOL_CALL, false,
            0.5f, 0.5f, 0.5f, 0.5f, 0.5f, 0.5f)
    }
    private var spawnTimer = 0f

    /** Agent creature positions (updated from TerrariumScreen). */
    private var agentSlots: List<CreatureSlot> = emptyList()
    private var agentStates: List<AgentCreatureState> = emptyList()

    fun setState(newState: TetraVisualState) {
        visualState = newState
    }

    /** Update agent positions so particles know where to travel. */
    fun setAgentPositions(slots: List<CreatureSlot>, states: List<AgentCreatureState>) {
        agentSlots = slots
        agentStates = states
    }

    override fun update(dt: Float) {
        time += dt

        if (visualState == TetraVisualState.ABSENT) return

        // Seed initial particles so the scene doesn't start empty
        if (spawnTimer == 0f && particles.none { it.alive }) {
            repeat(5) { spawnParticle() }
        }

        // Spawn new particles
        spawnTimer += dt
        val spawnRate = when (visualState) {
            TetraVisualState.STREAMING -> 0.08f  // Rapid during tool use
            TetraVisualState.CIRCLING -> 0.5f    // Slow ambient
            TetraVisualState.HOVERING -> 0.3f    // Medium during interaction
            TetraVisualState.ABSENT -> Float.MAX_VALUE
        }
        if (spawnTimer >= spawnRate) {
            spawnTimer = 0f
            spawnParticle()
        }

        // Update particles
        for (p in particles) {
            if (!p.alive) continue

            when (visualState) {
                TetraVisualState.STREAMING -> updateBezierTravel(p, dt)
                TetraVisualState.CIRCLING -> updateOrbit(p, dt)
                TetraVisualState.HOVERING -> updateDrift(p, dt)
                TetraVisualState.ABSENT -> {}
            }

            // Fade out dying particles
            if (p.progress >= 1f || p.alpha <= 0f) {
                p.alive = false
            }
        }
    }

    override fun draw(scope: DrawScope) {
        if (visualState == TetraVisualState.ABSENT) return

        val w = scope.size.width
        val h = scope.size.height

        for (p in particles) {
            if (!p.alive || p.alpha < 0.01f) continue

            val sx = p.x * w
            val sy = p.y * h
            val radius = w * 0.008f * (0.6f + p.alpha * 0.4f)

            // Tail trail for STREAMING particles
            if (visualState == TetraVisualState.STREAMING && p.progress > 0.05f) {
                val tailLength = 0.02f
                val tailT = (p.progress - tailLength).coerceAtLeast(0f)
                val oneMinusTail = 1f - tailT
                val tailX = oneMinusTail * oneMinusTail * p.sourceX + 2f * oneMinusTail * tailT * p.cpX + tailT * tailT * p.targetX
                val tailY = oneMinusTail * oneMinusTail * p.sourceY + 2f * oneMinusTail * tailT * p.cpY + tailT * tailT * p.targetY
                scope.drawLine(
                    color = p.type.color.copy(alpha = p.alpha * 0.3f),
                    start = Offset(tailX * w, tailY * h),
                    end = Offset(sx, sy),
                    strokeWidth = radius * 0.6f,
                    cap = StrokeCap.Round,
                    blendMode = BlendMode.Screen,
                )
            }

            // Core dot
            scope.drawCircle(
                color = p.type.color.copy(alpha = p.alpha * 0.9f),
                radius = radius,
                center = Offset(sx, sy),
                blendMode = BlendMode.Screen,
            )

            // Glow halo
            scope.drawCircle(
                color = p.type.color.copy(alpha = p.alpha * 0.35f),
                radius = radius * 3f,
                center = Offset(sx, sy),
                blendMode = BlendMode.Screen,
            )
        }

        // Draw arrival glow effect at active agent positions
        if (visualState == TetraVisualState.STREAMING && agentSlots.isNotEmpty()) {
            val glowAlpha = (sin(time * 4f) * 0.5f + 0.5f) * 0.15f
            for (i in agentStates.indices) {
                if (i >= agentSlots.size) break
                val state = agentStates[i]
                if (state.visualState == OctopusVisualState.TYPING ||
                    state.visualState == OctopusVisualState.THINKING) {
                    val slot = agentSlots[i]
                    scope.drawCircle(
                        color = ParticleType.TOOL_CALL.color.copy(alpha = glowAlpha),
                        radius = w * 0.03f,
                        center = Offset(slot.centerXFraction * w, slot.centerYFraction * h),
                        blendMode = BlendMode.Screen,
                    )
                }
            }
        }
    }

    private fun spawnParticle() {
        // Find a dead slot
        val slot = particles.firstOrNull { !it.alive } ?: return

        val type = ParticleType.entries[Random.nextInt(ParticleType.entries.size)]

        when (visualState) {
            TetraVisualState.STREAMING -> {
                // Emit from an active agent toward environment
                val activeIdx = agentStates.indexOfFirst {
                    it.visualState == OctopusVisualState.TYPING ||
                    it.visualState == OctopusVisualState.THINKING
                }
                val srcSlot = if (activeIdx >= 0 && activeIdx < agentSlots.size) {
                    agentSlots[activeIdx]
                } else {
                    CreatureSlot(TerrariumLayout.OCTOPUS_CENTER_X_FRACTION,
                        TerrariumLayout.OCTOPUS_CENTER_Y_FRACTION, 1f)
                }

                slot.sourceX = srcSlot.centerXFraction + Random.nextFloat() * 0.02f - 0.01f
                slot.sourceY = srcSlot.centerYFraction + Random.nextFloat() * 0.02f - 0.01f
                slot.targetX = Random.nextFloat() * 0.4f + 0.3f
                slot.targetY = Random.nextFloat() * 0.3f + 0.6f
                slot.cpX = (slot.sourceX + slot.targetX) / 2f + Random.nextFloat() * 0.1f - 0.05f
                slot.cpY = (slot.sourceY + slot.targetY) / 2f + Random.nextFloat() * 0.1f - 0.05f
            }
            TetraVisualState.CIRCLING -> {
                // Orbit around a random agent
                val idx = if (agentSlots.isNotEmpty()) Random.nextInt(agentSlots.size) else 0
                val center = agentSlots.getOrElse(idx) {
                    CreatureSlot(TerrariumLayout.OCTOPUS_CENTER_X_FRACTION,
                        TerrariumLayout.OCTOPUS_CENTER_Y_FRACTION, 1f)
                }
                slot.sourceX = center.centerXFraction
                slot.sourceY = center.centerYFraction
                slot.targetX = center.centerXFraction // orbit, not travel
                slot.targetY = center.centerYFraction
            }
            TetraVisualState.HOVERING -> {
                // Cluster near right side
                slot.sourceX = 0.55f + Random.nextFloat() * 0.15f
                slot.sourceY = 0.3f + Random.nextFloat() * 0.2f
                slot.targetX = slot.sourceX
                slot.targetY = slot.sourceY
            }
            TetraVisualState.ABSENT -> return
        }

        slot.x = slot.sourceX
        slot.y = slot.sourceY
        slot.vx = 0f
        slot.vy = 0f
        slot.progress = 0f
        slot.alpha = 0.8f + Random.nextFloat() * 0.2f
        slot.type = type
        slot.alive = true
    }

    private fun updateBezierTravel(p: DataParticle, dt: Float) {
        p.progress += dt * 0.8f // ~1.25 seconds to travel
        val t = p.progress.coerceIn(0f, 1f)

        // Quadratic bezier
        val oneMinusT = 1f - t
        p.x = oneMinusT * oneMinusT * p.sourceX + 2f * oneMinusT * t * p.cpX + t * t * p.targetX
        p.y = oneMinusT * oneMinusT * p.sourceY + 2f * oneMinusT * t * p.cpY + t * t * p.targetY

        // Fade near end
        p.alpha = if (t > 0.7f) (1f - t) / 0.3f else p.alpha.coerceAtMost(1f)
    }

    private fun updateOrbit(p: DataParticle, dt: Float) {
        p.progress += dt * 0.2f // slow orbit
        val angle = time * 1.5f + p.progress * PI.toFloat() * 4f
        val orbitRadius = 0.04f + p.progress * 0.02f

        p.x = p.sourceX + cos(angle) * orbitRadius
        p.y = p.sourceY + sin(angle) * orbitRadius * 0.6f

        p.alpha -= dt * 0.15f // slow fade
    }

    private fun updateDrift(p: DataParticle, dt: Float) {
        p.progress += dt * 0.3f
        val hover = sin(time * 2f + p.progress * 10f) * 0.002f

        p.x += hover * dt * 20f
        p.y += sin(time * 1.5f + p.x * 10f) * 0.001f * dt * 20f

        p.alpha -= dt * 0.2f
    }

    companion object {
        private const val MAX_PARTICLES = 40
    }
}
