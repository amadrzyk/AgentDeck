package dev.agentdeck.ui.component

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import dev.agentdeck.net.AgentState
import dev.agentdeck.ui.theme.AgentDeckColors

@Composable
fun StatusCard(
    agentState: AgentState,
    projectName: String?,
    modelName: String?,
    agentType: String?,
    currentTool: String?,
    toolProgress: String?,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                // Status indicator dot
                Box(
                    modifier = Modifier
                        .size(12.dp)
                        .clip(CircleShape)
                        .background(stateColor(agentState))
                )

                Text(
                    text = stateLabel(agentState),
                    style = MaterialTheme.typography.titleLarge,
                    color = stateColor(agentState),
                )
            }

            if (projectName != null) {
                Text(
                    text = projectName,
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }

            Row(
                modifier = Modifier.padding(top = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                if (agentType != null) {
                    Text(
                        text = agentType,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (modelName != null) {
                    Text(
                        text = modelName,
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            if (currentTool != null && agentState == AgentState.PROCESSING) {
                Text(
                    text = currentTool + (toolProgress?.let { " ($it)" } ?: ""),
                    style = MaterialTheme.typography.bodyMedium,
                    color = AgentDeckColors.Blue,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }
    }
}

fun stateColor(state: AgentState) = when (state) {
    AgentState.IDLE -> AgentDeckColors.Green
    AgentState.PROCESSING -> AgentDeckColors.Blue
    AgentState.AWAITING_PERMISSION, AgentState.AWAITING_OPTION, AgentState.AWAITING_DIFF -> AgentDeckColors.Amber
    AgentState.DISCONNECTED -> AgentDeckColors.SlateText
}

fun stateLabel(state: AgentState) = when (state) {
    AgentState.DISCONNECTED -> "Disconnected"
    AgentState.IDLE -> "Idle"
    AgentState.PROCESSING -> "Processing"
    AgentState.AWAITING_PERMISSION -> "Permission Required"
    AgentState.AWAITING_OPTION -> "Awaiting Selection"
    AgentState.AWAITING_DIFF -> "Diff Review"
}
