package dev.agentdeck.ui.screen

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.agentdeck.net.AgentState
import dev.agentdeck.net.BridgeConnection
import dev.agentdeck.state.AgentStateHolder
import dev.agentdeck.ui.component.PermissionDialog
import dev.agentdeck.ui.component.QuickActions

@Composable
fun ControlScreen(
    stateHolder: AgentStateHolder,
    connection: BridgeConnection,
    isEink: Boolean,
) {
    val state by stateHolder.state.collectAsState()
    var promptText by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = "Control",
            style = MaterialTheme.typography.headlineMedium,
        )

        // Permission/Option prompt if active
        if (state.agentState == AgentState.AWAITING_PERMISSION ||
            state.agentState == AgentState.AWAITING_OPTION ||
            state.agentState == AgentState.AWAITING_DIFF
        ) {
            PermissionDialog(
                question = state.question,
                options = state.options,
                onSelectOption = { index -> connection.sendSelectOption(index) },
            )
        }

        // Quick actions
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Quick Actions",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(modifier = Modifier.height(12.dp))
                QuickActions(
                    agentState = state.agentState,
                    onAction = { action ->
                        when (action) {
                            "go_on" -> connection.sendPrompt("go on")
                            "review" -> connection.sendPrompt("/review")
                            "commit" -> connection.sendPrompt("/commit")
                            "clear" -> connection.sendPrompt("/compact")
                            "stop" -> connection.sendInterrupt()
                        }
                    },
                    onInterrupt = { connection.sendInterrupt() },
                    onEscape = { connection.sendEscape() },
                )
            }
        }

        // Send custom prompt
        if (state.agentState == AgentState.IDLE) {
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Custom Prompt",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = promptText,
                        onValueChange = { promptText = it },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("Type a prompt...") },
                        trailingIcon = {
                            IconButton(
                                onClick = {
                                    if (promptText.isNotBlank()) {
                                        connection.sendPrompt(promptText.trim())
                                        promptText = ""
                                    }
                                },
                            ) {
                                Icon(
                                    Icons.AutoMirrored.Filled.Send,
                                    contentDescription = "Send",
                                )
                            }
                        },
                        singleLine = false,
                        maxLines = 4,
                    )
                }
            }
        }

        // Suggested prompt
        if (state.suggestedPrompt != null && state.agentState == AgentState.IDLE) {
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Suggested",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = state.suggestedPrompt!!,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }
    }
}
