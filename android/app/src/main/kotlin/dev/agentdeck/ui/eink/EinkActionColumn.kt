package dev.agentdeck.ui.eink

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dev.agentdeck.net.AgentState
import dev.agentdeck.state.DashboardState
import dev.agentdeck.state.TimelineEntry
import kotlinx.coroutines.delay

/**
 * CENTER column (45%) — "The Action"
 * Upper: active context (tool log, permission, or status).
 * Lower: timeline.
 */
@Composable
fun EinkActionColumn(
    state: DashboardState,
    timelineEntries: List<TimelineEntry>,
    onSelectOption: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth()) {
        // Upper: Active Context (~40%)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .weight(0.4f)
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            when (state.agentState) {
                AgentState.PROCESSING -> {
                    // Tick counter animation (cycles ., .., ...)
                    var tickCount by remember { mutableIntStateOf(0) }
                    LaunchedEffect(state.currentTool) {
                        tickCount = 0
                        while (true) {
                            delay(1000)
                            tickCount++
                        }
                    }
                    val tickDots = ".".repeat((tickCount % 3) + 1)

                    // Terminal-style tool log (recent tool_request entries)
                    val recentTools = timelineEntries
                        .filter { it.type == "tool_request" }
                        .takeLast(3)

                    if (recentTools.isEmpty() && state.currentTool != null) {
                        Text(
                            text = "> ${state.currentTool} $tickDots",
                            style = MaterialTheme.typography.bodyMedium.copy(
                                fontFamily = FontFamily.Monospace,
                                fontWeight = FontWeight.Bold,
                            ),
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                    } else {
                        recentTools.forEachIndexed { index, entry ->
                            val toolName = entry.summary.removePrefix("Tool: ")
                            val suffix = if (index == recentTools.lastIndex) " $tickDots" else ""
                            Text(
                                text = "> $toolName$suffix",
                                style = MaterialTheme.typography.bodyMedium.copy(
                                    fontFamily = FontFamily.Monospace,
                                    fontWeight = FontWeight.Bold,
                                ),
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                        }
                    }

                    if (state.toolInput != null) {
                        Text(
                            text = "  \"${state.toolInput}\"",
                            style = MaterialTheme.typography.bodySmall.copy(
                                fontFamily = FontFamily.Monospace,
                            ),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 2,
                        )
                    }

                    if (state.toolProgress != null) {
                        Text(
                            text = "  (${state.toolProgress})",
                            style = MaterialTheme.typography.bodySmall.copy(
                                fontFamily = FontFamily.Monospace,
                            ),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                AgentState.AWAITING_PERMISSION,
                AgentState.AWAITING_OPTION,
                AgentState.AWAITING_DIFF -> {
                    EinkPermissionPanel(
                        question = state.question,
                        options = state.options,
                        onSelectOption = onSelectOption,
                    )
                }

                AgentState.IDLE -> {
                    Text(
                        text = "Waiting for prompt...",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }

                AgentState.DISCONNECTED -> {
                    Text(
                        text = "No connection",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
            }
        }

        // Divider
        HorizontalDivider(thickness = 1.dp, color = Color.Black)

        // Lower: Timeline (~60%)
        EinkTimelinePanel(
            entries = timelineEntries,
            modifier = Modifier.weight(0.6f),
        )
    }
}
