package dev.agentdeck.net

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit
import kotlin.math.min

enum class ConnectionStatus {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
}

class BridgeConnection private constructor() {

    companion object {
        val instance: BridgeConnection by lazy { BridgeConnection() }
        private const val INITIAL_BACKOFF_MS = 1000L
        private const val MAX_BACKOFF_MS = 30_000L
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS) // No read timeout for WS
        .pingInterval(30, TimeUnit.SECONDS)
        .build()

    private var webSocket: WebSocket? = null
    private var backoffMs = INITIAL_BACKOFF_MS
    private var shouldReconnect = false

    private val _status = MutableStateFlow(ConnectionStatus.DISCONNECTED)
    val status: StateFlow<ConnectionStatus> = _status.asStateFlow()

    private val _url = MutableStateFlow<String?>(null)
    val url: StateFlow<String?> = _url.asStateFlow()

    var onEvent: ((BridgeEvent) -> Unit)? = null

    fun connect(wsUrl: String) {
        _url.value = wsUrl
        shouldReconnect = true
        backoffMs = INITIAL_BACKOFF_MS
        doConnect(wsUrl)
    }

    fun disconnect() {
        shouldReconnect = false
        webSocket?.close(1000, "User disconnect")
        webSocket = null
        _status.value = ConnectionStatus.DISCONNECTED
        onEvent?.invoke(BridgeEvent.Disconnected)
    }

    fun send(message: String) {
        webSocket?.send(message)
    }

    fun sendRespond(value: String) = send(PluginCommands.respond(value))
    fun sendSelectOption(index: Int) = send(PluginCommands.selectOption(index))
    fun sendPrompt(text: String) = send(PluginCommands.sendPrompt(text))
    fun sendInterrupt() = send(PluginCommands.interrupt())
    fun sendEscape() = send(PluginCommands.escape())
    fun sendQueryUsage() = send(PluginCommands.queryUsage())

    private fun doConnect(wsUrl: String) {
        if (_status.value == ConnectionStatus.CONNECTING) return
        _status.value = ConnectionStatus.CONNECTING

        val request = Request.Builder()
            .url(wsUrl)
            .build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                _status.value = ConnectionStatus.CONNECTED
                backoffMs = INITIAL_BACKOFF_MS
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                val event = parseBridgeMessage(text)
                if (event != null) {
                    onEvent?.invoke(event)
                }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(1000, null)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                _status.value = ConnectionStatus.DISCONNECTED
                onEvent?.invoke(BridgeEvent.Disconnected)
                scheduleReconnect()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                _status.value = ConnectionStatus.DISCONNECTED
                onEvent?.invoke(BridgeEvent.Disconnected)
                scheduleReconnect()
            }
        })
    }

    private fun scheduleReconnect() {
        if (!shouldReconnect) return
        val currentUrl = _url.value ?: return

        scope.launch {
            delay(backoffMs)
            backoffMs = min(backoffMs * 2, MAX_BACKOFF_MS)
            if (shouldReconnect && _status.value == ConnectionStatus.DISCONNECTED) {
                doConnect(currentUrl)
            }
        }
    }
}
