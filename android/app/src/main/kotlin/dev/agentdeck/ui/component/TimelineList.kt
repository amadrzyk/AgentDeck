package dev.agentdeck.ui.component

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.agentdeck.state.TimelineEntry
import dev.agentdeck.ui.theme.AgentDeckColors
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun TimelineList(
    entries: List<TimelineEntry>,
    modifier: Modifier = Modifier,
) {
    val listState = rememberLazyListState()

    // Auto-scroll to bottom when new entries arrive
    LaunchedEffect(entries.size) {
        if (entries.isNotEmpty()) {
            listState.animateScrollToItem(entries.size - 1)
        }
    }

    LazyColumn(
        state = listState,
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(0.dp),
    ) {
        items(entries, key = { "${it.timestamp}-${it.type}" }) { entry ->
            TimelineItem(entry)
            HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f))
        }
    }
}

@Composable
private fun TimelineItem(entry: TimelineEntry) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = formatTime(entry.timestamp),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Column(modifier = Modifier.weight(1f)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = entry.type.replace("_", " "),
                    style = MaterialTheme.typography.labelLarge,
                    color = typeColor(entry.type),
                )
            }
            Text(
                text = entry.summary,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            if (entry.detail != null) {
                Text(
                    text = entry.detail,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 3,
                )
            }
        }
    }
}

private fun typeColor(type: String) = when {
    type.contains("tool") -> AgentDeckColors.Green
    type.contains("chat") || type.contains("model") -> AgentDeckColors.Blue
    type.contains("error") -> AgentDeckColors.Red
    type.contains("approval") || type.contains("permission") -> AgentDeckColors.Amber
    type.contains("memory") -> AgentDeckColors.Purple
    type.contains("scheduled") -> AgentDeckColors.Cyan
    else -> AgentDeckColors.SlateText
}

private val timeFormat = SimpleDateFormat("HH:mm:ss", Locale.US)

private fun formatTime(timestamp: Long): String {
    return timeFormat.format(Date(timestamp))
}
