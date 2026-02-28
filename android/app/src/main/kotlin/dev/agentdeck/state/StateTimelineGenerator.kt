package dev.agentdeck.state

import dev.agentdeck.net.AgentState
import dev.agentdeck.net.StateUpdate

class StateTimelineGenerator private constructor() {

    companion object {
        val instance: StateTimelineGenerator by lazy { StateTimelineGenerator() }
        private const val TOOL_DEDUP_MS = 2000L
        private val AWAITING_STATES = setOf(
            AgentState.AWAITING_PERMISSION,
            AgentState.AWAITING_OPTION,
            AgentState.AWAITING_DIFF,
        )
    }

    @Volatile private var previousState: AgentState = AgentState.DISCONNECTED
    @Volatile private var lastToolName: String? = null
    @Volatile private var lastToolTime: Long = 0

    fun onStateUpdate(update: StateUpdate) {
        val now = System.currentTimeMillis()
        val newState = update.state
        val store = TimelineStore.instance

        // State transitions
        when {
            // IDLE -> PROCESSING: chat started
            previousState == AgentState.IDLE && newState == AgentState.PROCESSING -> {
                store.addEntry(TimelineEntry(now, "chat_start", "Chat started"))
            }

            // -> AWAITING_PERMISSION: permission requested
            newState == AgentState.AWAITING_PERMISSION && previousState != AgentState.AWAITING_PERMISSION -> {
                val question = update.question ?: "Permission requested"
                store.addEntry(TimelineEntry(now, "permission", question))
            }

            // AWAITING -> PROCESSING: resumed
            previousState in AWAITING_STATES && newState == AgentState.PROCESSING -> {
                store.addEntry(TimelineEntry(now, "chat_start", "Resumed"))
            }

            // PROCESSING -> IDLE: chat completed
            previousState == AgentState.PROCESSING && newState == AgentState.IDLE -> {
                store.addEntry(TimelineEntry(now, "chat_end", "Chat completed"))
            }

            // -> DISCONNECTED (handled via onDisconnected)
            // DISCONNECTED -> else: connected
            previousState == AgentState.DISCONNECTED && newState != AgentState.DISCONNECTED -> {
                store.addEntry(TimelineEntry(now, "chat_start", "Connected"))
            }
        }

        // Tool tracking during PROCESSING (2s dedup)
        if (newState == AgentState.PROCESSING && update.currentTool != null) {
            val tool = update.currentTool
            if (tool != lastToolName || (now - lastToolTime) > TOOL_DEDUP_MS) {
                store.addEntry(TimelineEntry(now, "tool_request", "Tool: $tool"))
                lastToolName = tool
                lastToolTime = now
            }
        }

        previousState = newState
    }

    fun onDisconnected() {
        val now = System.currentTimeMillis()
        if (previousState != AgentState.DISCONNECTED) {
            TimelineStore.instance.addEntry(TimelineEntry(now, "error", "Disconnected"))
        }
        previousState = AgentState.DISCONNECTED
        lastToolName = null
    }
}
