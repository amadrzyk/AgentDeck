package dev.agentdeck.terrarium

import android.util.Log
import dev.agentdeck.net.AgentState
import dev.agentdeck.state.DashboardState
import dev.agentdeck.terrarium.creature.AgentMark

private const val TAG = "Terrarium"

/** Visual states for each creature and the environment. */

enum class OctopusVisualState {
    SLEEPING,    // Curled up at bottom, dim, eyes closed
    FLOATING,    // Gentle sine bob, tentacles wave
    THINKING,    // Head hue rotation, tentacles curl inward
    TYPING,      // Tentacles on holographic keyboard, rapid motions
    OFFERING,    // 4 tentacles form O, 4 form X (permission)
    PRESENTING,  // Tentacles hold rectangular "cards" (options)
    REVIEWING,   // Tentacles hold two "documents" side by side
}

enum class CrayfishVisualState {
    DORMANT,    // Partially hidden behind rocks
    SITTING,    // Idle on rock, claws at rest
    OBSERVING,  // Watching activity — gentle claw fidget, eyes tracking
    ROUTING,    // Claws clap, eyes flash, signal lines emit (OpenClaw orchestrating)
    WAITING,    // Claws raised
}

enum class TetraVisualState {
    ABSENT,     // Not visible (disconnected)
    CIRCLING,   // Boids algorithm, orbiting attractor
    STREAMING,  // Line up, streak horizontally, code trail particles
    HOVERING,   // Formation near options area
}

enum class EnvironmentVisualState {
    DARK,    // Disconnected — dim/off
    CALM,    // Idle — gentle caustics, slow bubbles
    ACTIVE,  // Processing — bright caustics, more bubbles
    ALERT,   // Awaiting input — pulsing highlights
}

/** Per-agent creature state for multi-session rendering. */
data class AgentCreatureState(
    val sessionId: String,
    val agentType: String?,
    val mark: AgentMark?,
    val visualState: OctopusVisualState,
    val isPrimary: Boolean,
    val layoutSlot: Int,
)

/** Combined visual state for the entire terrarium scene. */
data class TerrariumState(
    val octopus: OctopusVisualState,
    val crayfish: CrayfishVisualState,
    val tetra: TetraVisualState,
    val environment: EnvironmentVisualState,
    val currentTool: String? = null,
    val toolProgress: String? = null,
    val projectName: String? = null,
    val modelName: String? = null,
    val agentType: String? = null,
    val hasError: Boolean = false,
    /** Multi-session: all coding agent creatures (octopuses). */
    val agents: List<AgentCreatureState> = emptyList(),
    /** OpenClaw backend worker count. */
    val workerCrayfishCount: Int = 0,
)

/** Map DashboardState to visual TerrariumState. */
fun DashboardState.toTerrariumState(): TerrariumState {
    val isOpenClaw = agentType == "openclaw"
    val hasTool = currentTool != null
    Log.d(TAG, "toTerrariumState: agentState=$agentState, agentType=$agentType, isOpenClaw=$isOpenClaw, hasTool=$hasTool")

    val octopus = when (agentState) {
        AgentState.DISCONNECTED -> OctopusVisualState.SLEEPING
        AgentState.IDLE -> OctopusVisualState.FLOATING
        AgentState.PROCESSING -> if (hasTool) OctopusVisualState.TYPING else OctopusVisualState.THINKING
        AgentState.AWAITING_PERMISSION -> OctopusVisualState.OFFERING
        AgentState.AWAITING_OPTION -> OctopusVisualState.PRESENTING
        AgentState.AWAITING_DIFF -> OctopusVisualState.REVIEWING
    }

    val crayfish = when (agentState) {
        AgentState.DISCONNECTED -> CrayfishVisualState.DORMANT
        AgentState.IDLE -> CrayfishVisualState.SITTING
        AgentState.PROCESSING -> when {
            isOpenClaw -> CrayfishVisualState.ROUTING
            else -> CrayfishVisualState.OBSERVING
        }
        AgentState.AWAITING_PERMISSION,
        AgentState.AWAITING_OPTION,
        AgentState.AWAITING_DIFF -> CrayfishVisualState.WAITING
    }

    val tetra = when (agentState) {
        AgentState.DISCONNECTED -> TetraVisualState.ABSENT
        AgentState.IDLE -> TetraVisualState.CIRCLING
        AgentState.PROCESSING -> if (hasTool) TetraVisualState.STREAMING else TetraVisualState.CIRCLING
        AgentState.AWAITING_PERMISSION,
        AgentState.AWAITING_OPTION,
        AgentState.AWAITING_DIFF -> TetraVisualState.HOVERING
    }

    val environment = when (agentState) {
        AgentState.DISCONNECTED -> EnvironmentVisualState.DARK
        AgentState.IDLE -> EnvironmentVisualState.CALM
        AgentState.PROCESSING -> EnvironmentVisualState.ACTIVE
        AgentState.AWAITING_PERMISSION,
        AgentState.AWAITING_OPTION,
        AgentState.AWAITING_DIFF -> EnvironmentVisualState.ALERT
    }

    Log.d(TAG, "Terrarium mapped: octopus=$octopus, crayfish=$crayfish, tetra=$tetra, env=$environment")

    // Build multi-agent creature list from sibling sessions
    val agents = mutableListOf<AgentCreatureState>()

    // Primary agent (currently connected session)
    agents.add(
        AgentCreatureState(
            sessionId = sessionId ?: "primary",
            agentType = agentType,
            mark = AgentMark.fromAgentType(agentType),
            visualState = octopus,
            isPrimary = true,
            layoutSlot = 0,
        )
    )

    // Sibling sessions (coding agents only — not the current session)
    var slot = 1
    for (sibling in siblingSessions) {
        if (sibling.id == sessionId) continue // skip self
        val siblingType = sibling.agentType
        if (siblingType == "openclaw") continue // crayfish, not octopus
        agents.add(
            AgentCreatureState(
                sessionId = sibling.id,
                agentType = siblingType,
                mark = AgentMark.fromAgentType(siblingType),
                visualState = OctopusVisualState.FLOATING, // siblings always appear floating
                isPrimary = false,
                layoutSlot = slot++,
            )
        )
    }

    return TerrariumState(
        octopus = octopus,
        crayfish = crayfish,
        tetra = tetra,
        environment = environment,
        currentTool = currentTool,
        toolProgress = toolProgress,
        projectName = projectName,
        modelName = modelName,
        agentType = agentType,
        agents = agents,
        workerCrayfishCount = workerSessionCount ?: 0,
    )
}
