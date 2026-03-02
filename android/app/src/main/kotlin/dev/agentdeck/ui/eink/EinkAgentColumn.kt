package dev.agentdeck.ui.eink

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.agentdeck.net.AgentState
import dev.agentdeck.state.DashboardState

/**
 * LEFT zone (22%) — Agent panel for e-ink 3-zone layout.
 * Icon + display name (with #N suffix for duplicates) + model + state.
 *
 * Also exported as [EinkAgentColumn] for backward compatibility with portrait layout.
 */
@Composable
fun EinkAgentPanel(
    state: DashboardState,
    onSettingsClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val monoStyle = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace)

    // Build display list: primary + siblings (excluding self)
    data class AgentEntry(
        val projectName: String,
        val agentType: String?,
        val modelName: String?,
        val agentState: AgentState,
    )

    val entries = mutableListOf<AgentEntry>()

    // Primary agent
    entries += AgentEntry(
        projectName = state.projectName ?: "Agent",
        agentType = state.agentType,
        modelName = state.modelName,
        agentState = state.agentState,
    )

    // Siblings (skip self)
    state.siblingSessions.forEach { session ->
        if (session.id == state.sessionId) return@forEach
        entries += AgentEntry(
            projectName = session.projectName ?: "Agent",
            agentType = session.agentType,
            modelName = null,
            agentState = mapSessionState(session),
        )
    }

    // Count projectName occurrences for #N suffix
    val nameCounts = entries.groupBy { it.projectName }.mapValues { it.value.size }
    val nameCounters = mutableMapOf<String, Int>()

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        // Brand logo — largest text at top
        Text(
            text = "AgentDeck",
            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(modifier = Modifier.height(8.dp))

        entries.forEach { entry ->
            val icon = agentIcon(entry.agentType)
            val needsSuffix = (nameCounts[entry.projectName] ?: 1) > 1
            val suffix = if (needsSuffix) {
                val idx = (nameCounters[entry.projectName] ?: 0) + 1
                nameCounters[entry.projectName] = idx
                " #$idx"
            } else {
                ""
            }
            val displayName = "$icon ${entry.projectName}$suffix"

            EinkAgentBlock(
                displayName = displayName,
                modelName = entry.modelName,
                agentState = entry.agentState,
            )
        }

        // Worker count
        state.workerSessionCount?.takeIf { it > 0 }?.let {
            Text(text = "Workers: $it", style = monoStyle, color = MaterialTheme.colorScheme.onSurface)
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

/**
 * Compact agent identity block: display name (single line, ellipsis) + model·state on one line.
 */
@Composable
internal fun EinkAgentBlock(
    displayName: String,
    modelName: String?,
    agentState: AgentState,
) {
    val monoStyle = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace)

    // Model + state merged into one line: "  opus-4 · ◉ PROC" or "  ◉ PROC"
    val stateMarker = compactStateMarker(agentState)
    val subLine = if (modelName != null) {
        "  $modelName \u00B7 $stateMarker"
    } else {
        "  $stateMarker"
    }

    Column {
        Text(
            text = displayName,
            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text = subLine,
            style = monoStyle,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/**
 * Backward-compatible alias for [EinkAgentPanel].
 * Used by portrait layout and other screens that reference the old name.
 */
@Composable
fun EinkAgentColumn(
    state: DashboardState,
    onSettingsClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    EinkAgentPanel(state = state, onSettingsClick = onSettingsClick, modifier = modifier)
}

private fun agentIcon(agentType: String?): String = when (agentType) {
    "claude-code" -> "\uD83D\uDC19"  // octopus
    "openclaw" -> "\uD83E\uDD9E"     // lobster (closest to crayfish)
    else -> "\u25CF"                   // bullet
}

private fun mapSessionState(session: dev.agentdeck.net.SessionInfo): AgentState {
    if (!session.alive) return AgentState.DISCONNECTED
    return when (session.state) {
        "processing" -> AgentState.PROCESSING
        "idle" -> AgentState.IDLE
        "awaiting_permission", "awaiting_option", "awaiting_diff" -> AgentState.AWAITING_PERMISSION
        else -> AgentState.IDLE
    }
}
