package dev.agentdeck.ui.screen

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import dev.agentdeck.net.BridgeConnection
import dev.agentdeck.net.BridgeDiscovery
import dev.agentdeck.net.ConnectionStatus
import dev.agentdeck.net.DiscoveredBridge
import dev.agentdeck.util.QrScanner

@Composable
fun PairingScreen(
    connection: BridgeConnection,
    onPaired: () -> Unit,
) {
    val context = LocalContext.current
    var manualUrl by remember { mutableStateOf("") }
    var discoveredBridges by remember { mutableStateOf(emptyList<DiscoveredBridge>()) }
    val connectionStatus by connection.status.collectAsState()

    // mDNS discovery
    val discovery = remember { BridgeDiscovery(context) }
    LaunchedEffect(Unit) {
        discovery.discover().collect { bridges ->
            discoveredBridges = bridges
        }
    }

    // Auto-navigate back when connected
    LaunchedEffect(connectionStatus) {
        if (connectionStatus == ConnectionStatus.CONNECTED) {
            onPaired()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = "Connect to Bridge",
            style = MaterialTheme.typography.headlineMedium,
        )

        // QR Code scanner placeholder
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Scan QR Code",
                    style = MaterialTheme.typography.titleMedium,
                )
                Spacer(modifier = Modifier.height(8.dp))
                Button(
                    onClick = {
                        QrScanner.scan(context) { url ->
                            if (url != null) {
                                connection.connect(url)
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Open Camera")
                }
            }
        }

        // Discovered bridges
        if (discoveredBridges.isNotEmpty()) {
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Discovered Bridges",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.height(200.dp),
                    ) {
                        items(discoveredBridges) { bridge ->
                            OutlinedButton(
                                onClick = {
                                    connection.connect("ws://${bridge.host}:${bridge.port}")
                                },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Column {
                                    Text(bridge.name)
                                    Text(
                                        "${bridge.host}:${bridge.port}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // Manual entry
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Manual Connection",
                    style = MaterialTheme.typography.titleMedium,
                )
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = manualUrl,
                    onValueChange = { manualUrl = it },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("ws://192.168.1.x:9120?token=abc") },
                    singleLine = true,
                )
                Spacer(modifier = Modifier.height(8.dp))
                Button(
                    onClick = {
                        if (manualUrl.isNotBlank()) {
                            connection.connect(manualUrl.trim())
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = manualUrl.isNotBlank(),
                ) {
                    Text("Connect")
                }
            }
        }

        if (connectionStatus == ConnectionStatus.CONNECTING) {
            Text(
                text = "Connecting...",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}
