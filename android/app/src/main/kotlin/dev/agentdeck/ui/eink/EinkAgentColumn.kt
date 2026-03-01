package dev.agentdeck.ui.eink

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dev.agentdeck.net.PermissionMode
import dev.agentdeck.state.DashboardState

/**
 * LEFT column (25%) — "The Brain"
 * State marker, project, agent/model, permission mode, settings gear.
 */
@Composable
fun EinkAgentColumn(
    state: DashboardState,
    onSettingsClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        // State marker (large)
        Text(
            text = stateMarker(state.agentState),
            style = MaterialTheme.typography.titleLarge.copy(
                fontWeight = FontWeight.Bold,
            ),
            color = MaterialTheme.colorScheme.onSurface,
        )

        // Project name
        if (state.projectName != null) {
            Text(
                text = state.projectName,
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }

        // Agent type + model
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (state.agentType != null) {
                Text(
                    text = state.agentType,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (state.modelName != null) {
                Text(
                    text = state.modelName,
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontFamily = FontFamily.Monospace,
                    ),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        // Permission mode (only if not DEFAULT)
        if (state.permissionMode != PermissionMode.DEFAULT) {
            Text(
                text = "Mode: ${state.permissionMode.name}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }

        // Suggested prompt (IDLE)
        if (state.suggestedPrompt != null) {
            Text(
                text = "Suggested: ${state.suggestedPrompt}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
            )
        }

        // Sibling sessions
        if (state.siblingSessions.isNotEmpty()) {
            Text(
                text = "Sessions: ${state.siblingSessions.size}",
                style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onSurface,
            )
            state.siblingSessions.forEach { session ->
                val marker = if (session.alive) "\u25CF" else "\u25CB"
                Text(
                    text = "$marker ${session.projectName ?: "port:${session.port}"}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        // Worker count
        if (state.workerSessionCount != null && state.workerSessionCount > 0) {
            Text(
                text = "Workers: ${state.workerSessionCount}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }

        // OC session status
        if (state.sessionStatus != null) {
            val ss = state.sessionStatus
            if (ss.contextTokens != null) {
                Text(
                    text = "Ctx: ${formatCount(ss.contextTokens)}",
                    style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (ss.uptime != null) {
                Text(
                    text = "Up: ${formatDuration(ss.uptime)}",
                    style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        Spacer(modifier = Modifier.weight(1f))

        // Settings gear
        Text(
            text = "\u2699 Settings",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.clickable(onClick = onSettingsClick),
        )
    }
}
