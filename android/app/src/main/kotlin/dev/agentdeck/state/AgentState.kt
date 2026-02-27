package dev.agentdeck.state

import dev.agentdeck.net.AgentState
import dev.agentdeck.net.BridgeConnection
import dev.agentdeck.net.BridgeEvent
import dev.agentdeck.net.ConnectionStatus
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
                    )
                }
                lastKnownState = _state.value
            }

            is BridgeEvent.Usage -> {
                _state.update { it.copy(usage = event.data) }
                lastKnownState = _state.value
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
            }

            is BridgeEvent.Disconnected -> {
                _state.update {
                    it.copy(
                        bridgeConnected = false,
                        agentState = AgentState.DISCONNECTED,
                    )
                }
            }
        }
    }
}
