package dev.agentdeck.ui.eink

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dev.agentdeck.net.UsageUpdate

/**
 * RIGHT column (30%) — "The Engine"
 * Token counters, rate limit gauges, cost, duration.
 */
@Composable
fun EinkEngineColumn(
    usage: UsageUpdate,
    messageCount: Long = 0,
    modifier: Modifier = Modifier,
) {
    val monoStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        // Tokens header
        Text(
            text = "Tokens",
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onSurface,
        )

        // In / Out / Tool
        Text(
            text = "In:  ${formatCount(usage.inputTokens)}",
            style = monoStyle,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = "Out: ${formatCount(usage.outputTokens)}",
            style = monoStyle,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = "Tool: ${usage.toolCalls}",
            style = monoStyle,
            color = MaterialTheme.colorScheme.onSurface,
        )

        Spacer(modifier = Modifier.height(8.dp))

        // Rate limit gauges (skip if no data)
        if (usage.fiveHourPercent != null) {
            EinkTextGauge(label = "5h", percent = usage.fiveHourPercent, barLength = 10)
        }
        if (usage.sevenDayPercent != null) {
            EinkTextGauge(label = "7d", percent = usage.sevenDayPercent, barLength = 10)
        }

        // Message count
        Text(
            text = "Msg: $messageCount",
            style = monoStyle,
            color = MaterialTheme.colorScheme.onSurface,
        )

        Spacer(modifier = Modifier.height(4.dp))

        // Cost
        if (usage.estimatedCostUsd != null) {
            Text(
                text = "Cost: $${String.format("%.2f", usage.estimatedCostUsd)}",
                style = monoStyle,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }

        // Duration
        if (usage.sessionDurationSec > 0) {
            Text(
                text = "Duration: ${formatDuration(usage.sessionDurationSec)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
