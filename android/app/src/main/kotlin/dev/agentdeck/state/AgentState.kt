package dev.agentdeck.state

import dev.agentdeck.net.AgentCapabilities
import dev.agentdeck.net.AgentState
import dev.agentdeck.net.BridgeConnection
import dev.agentdeck.net.BridgeEvent
import dev.agentdeck.net.ModelCatalogEntry
import dev.agentdeck.net.OcSessionStatus
import dev.agentdeck.net.PermissionMode
import dev.agentdeck.net.PromptOption
import dev.agentdeck.net.StateUpdate
import dev.agentdeck.net.UsageUpdate
import dev.agentdeck.net.VoiceState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

data class DashboardState(
    val agentState: AgentState = AgentState.DISCONNECTED,
    val permissionMode: PermissionMode = PermissionMode.DEFAULT,
    val agentType: String? = null,
    val currentTool: String? = null,
    val toolInput: String? = null,
    val toolProgress: String? = null,
    val projectName: String? = null,
    val modelName: String? = null,
    val billingType: String? = null,
    val options: List<PromptOption> = emptyList(),
    val promptType: String? = null,
    val question: String? = null,
    val suggestedPrompt: String? = null,
    val remoteUrl: String? = null,
    val usage: UsageUpdate = UsageUpdate(),
    val voice: VoiceState = VoiceState(),
    val sessionId: String? = null,
    val bridgeConnected: Boolean = false,
    val agentCapabilities: AgentCapabilities? = null,
    val modelCatalog: List<ModelCatalogEntry>? = null,
    val sessionStatus: OcSessionStatus? = null,
    val pairingUrl: String? = null,
    val navigable: Boolean? = null,
    val cursorIndex: Int? = null,
)

class AgentStateHolder private constructor() {

    companion object {
        val instance: AgentStateHolder by lazy { AgentStateHolder() }
    }

    private val _state = MutableStateFlow(DashboardState())
    val state: StateFlow<DashboardState> = _state.asStateFlow()

    /** Last known state for offline cache display */
    private var lastKnownState: DashboardState? = null

    init {
        BridgeConnection.instance.onEvent = ::handleEvent
    }

    fun getLastKnownState(): DashboardState? = lastKnownState

    private fun handleEvent(event: BridgeEvent) {
        when (event) {
            is BridgeEvent.State -> {
                _state.update { current ->
                    current.copy(
                        agentState = event.data.state,
                        permissionMode = event.data.permissionMode,
                        agentType = event.data.agentType ?: current.agentType,
                        currentTool = event.data.currentTool,
                        toolInput = event.data.toolInput,
                        toolProgress = event.data.toolProgress,
                        projectName = event.data.projectName ?: current.projectName,
                        modelName = event.data.modelName ?: current.modelName,
                        billingType = event.data.billingType ?: current.billingType,
                        options = event.data.options ?: emptyList(),
                        promptType = event.data.promptType,
                        question = event.data.question,
                        suggestedPrompt = event.data.suggestedPrompt,
                        remoteUrl = event.data.remoteUrl ?: current.remoteUrl,
                        agentCapabilities = event.data.agentCapabilities ?: current.agentCapabilities,
                        modelCatalog = event.data.modelCatalog ?: current.modelCatalog,
                        sessionStatus = event.data.sessionStatus ?: current.sessionStatus,
                        pairingUrl = event.data.pairingUrl ?: current.pairingUrl,
                        navigable = event.data.navigable,
                        cursorIndex = event.data.cursorIndex,
                    )
                }
                lastKnownState = _state.value
                StateTimelineGenerator.instance.onStateUpdate(event.data)
                SessionMetrics.instance.onMessageReceived()
            }

            is BridgeEvent.Usage -> {
                _state.update { it.copy(usage = event.data) }
                lastKnownState = _state.value
                SessionMetrics.instance.onMessageReceived()
            }

            is BridgeEvent.Voice -> {
                _state.update { it.copy(voice = event.data) }
            }

            is BridgeEvent.Connected -> {
                _state.update {
                    it.copy(
                        bridgeConnected = true,
                        sessionId = event.sessionId,
                    )
                }
                SessionMetrics.instance.onConnected()
            }

            is BridgeEvent.Disconnected -> {
                _state.update {
                    it.copy(
                        bridgeConnected = false,
                        agentState = AgentState.DISCONNECTED,
                    )
                }
                SessionMetrics.instance.onDisconnected()
                StateTimelineGenerator.instance.onDisconnected()
            }
        }
    }
}
