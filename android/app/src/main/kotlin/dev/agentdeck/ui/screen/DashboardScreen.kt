package dev.agentdeck.ui.screen

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.agentdeck.net.AgentState
import dev.agentdeck.state.AgentStateHolder
import dev.agentdeck.state.SessionMetrics
import dev.agentdeck.state.TimelineStore
import dev.agentdeck.ui.component.PermissionDialog
import dev.agentdeck.ui.component.StatusCard
import dev.agentdeck.ui.component.SyncIndicator
import dev.agentdeck.ui.component.TimelineList
import dev.agentdeck.ui.component.UsageSummaryCard

@Composable
fun DashboardScreen(
    stateHolder: AgentStateHolder,
    isEink: Boolean,
) {
    val state by stateHolder.state.collectAsState()
    val timelineEntries by TimelineStore.instance.entries.collectAsState()
    val metrics by SessionMetrics.instance.metrics.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        StatusCard(
            agentState = state.agentState,
            projectName = state.projectName,
            modelName = state.modelName,
            agentType = state.agentType,
            currentTool = state.currentTool,
            toolProgress = state.toolProgress,
        )

        // Usage summary card
        UsageSummaryCard(
            usage = state.usage,
            metrics = metrics,
        )

        // Permission/option prompt
        if (state.agentState == AgentState.AWAITING_PERMISSION ||
            state.agentState == AgentState.AWAITING_OPTION ||
            state.agentState == AgentState.AWAITING_DIFF
        ) {
            PermissionDialog(
                question = state.question,
                options = state.options,
                onSelectOption = { index ->
                    dev.agentdeck.net.BridgeConnection.instance.sendSelectOption(index)
                },
            )
        }

        // Timeline header with sync indicator
        if (timelineEntries.isNotEmpty()) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Timeline",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                SyncIndicator(metrics = metrics)
            }
            TimelineList(
                entries = timelineEntries,
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
            )
        } else if (state.agentState == AgentState.DISCONNECTED) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "Not connected to bridge",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
