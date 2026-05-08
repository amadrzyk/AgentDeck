package dev.agentdeck.ui.eink

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dev.agentdeck.state.GroupedEntry
import dev.agentdeck.state.TimelineEntry
import dev.agentdeck.state.groupConsecutive
import dev.agentdeck.state.timelineDisplayGroups
import dev.agentdeck.ui.component.BrandIcon
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun EinkTimelinePanel(
    entries: List<TimelineEntry>,
    modifier: Modifier = Modifier,
) {
    val recentEntries = remember(entries) {
        entries.takeLast(80)
    }
    val displayGroups = remember(recentEntries) {
        timelineDisplayGroups(groupConsecutive(recentEntries))
    }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()

    // Track entry count for new-item detection
    var lastSeenCount by remember { mutableIntStateOf(displayGroups.size) }
    val hasNewItems by remember(displayGroups.size) {
        derivedStateOf { displayGroups.size > lastSeenCount }
    }

    // Check if scrolled near bottom
    val isNearBottom by remember {
        derivedStateOf {
            val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            lastVisible >= listState.layoutInfo.totalItemsCount - 2
        }
    }

    // Auto-scroll only if already at bottom
    LaunchedEffect(displayGroups.size) {
        if (isNearBottom && displayGroups.isNotEmpty()) {
            listState.scrollToItem(displayGroups.size - 1)
        }
    }

    Box(modifier = modifier.fillMaxSize()) {
        if (displayGroups.isEmpty()) {
            Text(
                text = "No timeline events",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.align(Alignment.Center),
            )
        } else {
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(0.dp),
            ) {
                items(displayGroups, key = { "${it.entry.timestamp}-${it.entry.type}-${it.entry.summary}-${it.count}" }) { group ->
                    EinkTimelineItem(group)
                    HorizontalDivider(
                        thickness = 1.dp,
                        color = Color.Black,
                    )
                }
            }

            // New items indicator at bottom
            if (hasNewItems && !isNearBottom) {
                Text(
                    text = "\u25BC NEW",
                    style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 8.dp)
                        .clickable {
                            scope.launch {
                                listState.scrollToItem(displayGroups.size - 1)
                                lastSeenCount = displayGroups.size
                            }
                        },
                )
            }
        }
    }
}

@Composable
private fun EinkTimelineItem(group: GroupedEntry) {
    val entry = group.entry
    val source = sourceLabel(entry)
    val countSuffix = if (group.count > 1) " (×${group.count})" else ""
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        // Timestamp
        Text(
            text = formatTime(entry.timestamp),
            style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Box(
            modifier = Modifier
                .width(18.dp)
                .height(18.dp),
            contentAlignment = Alignment.Center,
        ) {
            BrandIcon(agentType = entry.agentType, isEink = true, size = 15.dp)
        }

        // Type prefix
        Text(
            text = typePrefix(entry.type),
            style = MaterialTheme.typography.bodyMedium.copy(
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold,
            ),
            color = MaterialTheme.colorScheme.onSurface,
        )

        // Summary + detail
        Column(modifier = Modifier.weight(1f)) {
            if (source.isNotEmpty()) {
                Text(
                    text = source,
                    style = MaterialTheme.typography.bodySmall.copy(
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold,
                    ),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                text = entry.summary + countSuffix,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            if (entry.detail != null) {
                Text(
                    text = entry.detail,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                )
            }
        }
    }
}

private fun typePrefix(type: String): String = when {
    type.contains("tool") -> "Tool"
    type.contains("model") -> "Model"
    type.contains("chat") -> "Chat"
    type.contains("error") -> "Error"
    type.contains("approval") || type.contains("permission") -> "Perm"
    type.contains("memory") -> "Memory"
    type.contains("scheduled") -> "Sched"
    type.contains("user") -> "User"
    type.contains("eval") -> "Eval"
    else -> "\u00B7"
}

private fun sourceLabel(entry: TimelineEntry): String {
    val project = entry.projectName?.takeIf { it.isNotBlank() }
    val agent = when (entry.agentType) {
        "claude-code" -> "Claude"
        "codex-cli" -> "Codex"
        "openclaw" -> "OpenClaw"
        "opencode" -> "OpenCode"
        "daemon" -> "Daemon"
        null -> ""
        else -> "Agent"
    }
    return when {
        project != null && agent.isNotEmpty() -> "$project · $agent"
        project != null -> project
        else -> agent
    }
}

private val timeFormat = SimpleDateFormat("HH:mm:ss", Locale.US)

private fun formatTime(timestamp: Long): String {
    return timeFormat.format(Date(timestamp))
}
