package dev.agentdeck.ui.screen

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.agentdeck.net.BridgeConnection
import dev.agentdeck.net.ConnectionStatus
import dev.agentdeck.ui.theme.AgentDeckColors

@Composable
fun SettingsScreen(
    connection: BridgeConnection,
    isEink: Boolean,
    onNavigateToPairing: () -> Unit,
) {
    val connectionStatus by connection.status.collectAsState()
    val currentUrl by connection.url.collectAsState()
    var keepAlive by remember { mutableStateOf(true) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = "Settings",
            style = MaterialTheme.typography.headlineMedium,
        )

        // Connection
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Connection",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(modifier = Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "Status",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Text(
                        text = when (connectionStatus) {
                            ConnectionStatus.CONNECTED -> "Connected"
                            ConnectionStatus.CONNECTING -> "Connecting..."
                            ConnectionStatus.DISCONNECTED -> "Disconnected"
                        },
                        style = MaterialTheme.typography.labelLarge,
                        color = when (connectionStatus) {
                            ConnectionStatus.CONNECTED -> AgentDeckColors.Green
                            ConnectionStatus.CONNECTING -> AgentDeckColors.Amber
                            ConnectionStatus.DISCONNECTED -> AgentDeckColors.SlateText
                        },
                    )
                }

                if (currentUrl != null) {
                    Text(
                        text = currentUrl!!,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (connectionStatus == ConnectionStatus.CONNECTED) {
                        OutlinedButton(onClick = { connection.disconnect() }) {
                            Text("Disconnect")
                        }
                    } else {
                        Button(onClick = {
                            connection.connect("ws://127.0.0.1:9120")
                        }) {
                            Text("USB Connect")
                        }
                        OutlinedButton(onClick = onNavigateToPairing) {
                            Text("QR Pair")
                        }
                    }
                }
            }
        }

        // Foreground service
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Background Monitoring",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "Keep connection alive",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Switch(
                        checked = keepAlive,
                        onCheckedChange = { keepAlive = it },
                    )
                }
                Text(
                    text = "Maintains WebSocket connection when app is backgrounded via foreground service",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        // About
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "About",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "AgentDeck Android",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(
                    text = "v0.1.0",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = "Monitoring dashboard for AI coding agents",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }
}
