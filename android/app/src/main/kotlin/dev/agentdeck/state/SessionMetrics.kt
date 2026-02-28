package dev.agentdeck.state

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

data class MetricsSnapshot(
    val connectedSince: Long? = null,
    val lastMessageAt: Long? = null,
    val messageCount: Long = 0,
    val reconnectCount: Int = 0,
)

class SessionMetrics private constructor() {

    companion object {
        val instance: SessionMetrics by lazy { SessionMetrics() }
    }

    private val _metrics = MutableStateFlow(MetricsSnapshot())
    val metrics: StateFlow<MetricsSnapshot> = _metrics.asStateFlow()

    fun onConnected() {
        val now = System.currentTimeMillis()
        _metrics.update { current ->
            if (current.connectedSince != null) {
                current.copy(
                    connectedSince = now,
                    lastMessageAt = now,
                    reconnectCount = current.reconnectCount + 1,
                )
            } else {
                current.copy(
                    connectedSince = now,
                    lastMessageAt = now,
                )
            }
        }
    }

    fun onDisconnected() {
        _metrics.update { it.copy(connectedSince = null) }
    }

    fun onMessageReceived() {
        val now = System.currentTimeMillis()
        _metrics.update { it.copy(lastMessageAt = now, messageCount = it.messageCount + 1) }
    }

    fun reset() {
        _metrics.value = MetricsSnapshot()
    }
}
