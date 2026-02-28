package dev.agentdeck.ui.component

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import dev.agentdeck.net.UsageUpdate
import dev.agentdeck.state.MetricsSnapshot
import dev.agentdeck.ui.eink.formatCount
import dev.agentdeck.ui.eink.formatDuration
import dev.agentdeck.ui.eink.formatDurationLong
import dev.agentdeck.ui.theme.AgentDeckColors

/**
 * Compact usage summary card for DashboardScreen.
 * 2-row grid: rate limits + token/cost/uptime summary.
 */
@Composable
fun UsageSummaryCard(
    usage: UsageUpdate,
    metrics: MetricsSnapshot,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Row 1: Rate limit bars
            if (usage.fiveHourPercent != null || usage.sevenDayPercent != null) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    if (usage.fiveHourPercent != null) {
                        CompactGauge(
                            label = "5h",
                            percent = usage.fiveHourPercent,
                            modifier = Modifier.weight(1f),
                        )
                    }
                    if (usage.sevenDayPercent != null) {
                        CompactGauge(
                            label = "7d",
                            percent = usage.sevenDayPercent,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }

            // Row 2: Quick stats
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                StatChip(
                    label = "Tok",
                    value = formatCount(usage.inputTokens + usage.outputTokens),
                )
                StatChip(label = "Tool", value = "${usage.toolCalls}")
                if (usage.estimatedCostUsd != null) {
                    StatChip(
                        label = "$",
                        value = String.format("%.2f", usage.estimatedCostUsd),
                    )
                }
                val uptimeText = if (metrics.connectedSince != null) {
                    val elapsed = System.currentTimeMillis() - metrics.connectedSince
                    formatDurationLong(elapsed)
                } else {
                    formatDuration(usage.sessionDurationSec)
                }
                StatChip(label = "UP", value = uptimeText)
            }
        }
    }
}

@Composable
private fun CompactGauge(
    label: String,
    percent: Double,
    modifier: Modifier = Modifier,
) {
    val fraction = (percent / 100.0).coerceIn(0.0, 1.0).toFloat()
    val color = when {
        percent >= 90 -> AgentDeckColors.Red
        percent >= 70 -> AgentDeckColors.Amber
        else -> AgentDeckColors.Green
    }

    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "$label:",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        LinearProgressIndicator(
            progress = { fraction },
            modifier = Modifier
                .weight(1f)
                .height(6.dp)
                .clip(RoundedCornerShape(3.dp)),
            color = color,
            trackColor = MaterialTheme.colorScheme.surfaceVariant,
        )
        Text(
            text = "${percent.toInt()}%",
            style = MaterialTheme.typography.bodySmall,
            color = color,
        )
    }
}

@Composable
private fun StatChip(
    label: String,
    value: String,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = value,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
