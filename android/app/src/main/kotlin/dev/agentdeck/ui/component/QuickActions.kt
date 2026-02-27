package dev.agentdeck.ui.component

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.agentdeck.net.AgentState
import dev.agentdeck.ui.theme.AgentDeckColors

data class QuickAction(
    val label: String,
    val value: String,
    val isPrimary: Boolean = false,
)

@Composable
fun QuickActions(
    agentState: AgentState,
    onAction: (String) -> Unit,
    onInterrupt: () -> Unit,
    onEscape: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val actions = when (agentState) {
        AgentState.IDLE -> listOf(
            QuickAction("GO ON", "go_on", isPrimary = true),
            QuickAction("REVIEW", "review"),
            QuickAction("COMMIT", "commit"),
            QuickAction("CLEAR", "clear"),
        )
        AgentState.PROCESSING -> listOf(
            QuickAction("STOP", "stop", isPrimary = true),
        )
        else -> emptyList()
    }

    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (agentState == AgentState.PROCESSING) {
            Button(
                onClick = onInterrupt,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                colors = ButtonDefaults.buttonColors(containerColor = AgentDeckColors.Red),
            ) {
                Text("STOP", style = MaterialTheme.typography.titleMedium)
            }
        } else if (actions.isNotEmpty()) {
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                itemsIndexed(actions) { _, action ->
                    if (action.isPrimary) {
                        Button(
                            onClick = { onAction(action.value) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(56.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = AgentDeckColors.Green,
                            ),
                        ) {
                            Text(action.label, style = MaterialTheme.typography.titleMedium)
                        }
                    } else {
                        OutlinedButton(
                            onClick = { onAction(action.value) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(56.dp),
                        ) {
                            Text(action.label, style = MaterialTheme.typography.titleMedium)
                        }
                    }
                }
            }
        }

        if (agentState == AgentState.IDLE) {
            OutlinedButton(
                onClick = onEscape,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("ESC", style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}
