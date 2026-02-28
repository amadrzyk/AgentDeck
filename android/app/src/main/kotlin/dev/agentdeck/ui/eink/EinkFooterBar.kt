package dev.agentdeck.ui.eink

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import dev.agentdeck.net.UsageUpdate
import dev.agentdeck.state.MetricsSnapshot
import kotlinx.coroutines.delay

/**
 * Single-row footer bar: UP: H:MM:SS | SYNC: Xs ago | Tok: 20.6K | $0.42
 * Ticks every 10s for e-ink (minimizes refresh).
 */
@Composable
fun EinkFooterBar(
    metrics: MetricsSnapshot,
    usage: UsageUpdate,
    isEink: Boolean = true,
    modifier: Modifier = Modifier,
) {
    // Tick counter for uptime/sync refresh
    var tickMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val tickInterval = if (isEink) 10_000L else 1_000L

    LaunchedEffect(tickInterval) {
        while (true) {
            delay(tickInterval)
            tickMs = System.currentTimeMillis()
        }
    }

    val monoStyle = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace)

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Uptime
        val uptimeText = if (metrics.connectedSince != null) {
            "UP: ${formatDurationLong(tickMs - metrics.connectedSince)}"
        } else {
            "UP: --:--:--"
        }
        Text(text = uptimeText, style = monoStyle, color = MaterialTheme.colorScheme.onSurface)

        // Sync (time since last message)
        val syncText = if (metrics.lastMessageAt != null) {
            val agoSec = ((tickMs - metrics.lastMessageAt) / 1000).toInt()
            when {
                agoSec < 2 -> "SYNC: live"
                agoSec < 60 -> "SYNC: ${agoSec}s ago"
                agoSec < 3600 -> "SYNC: ${agoSec / 60}m ago"
                else -> "SYNC: ${agoSec / 3600}h ago"
            }
        } else {
            "SYNC: --"
        }
        Text(text = syncText, style = monoStyle, color = MaterialTheme.colorScheme.onSurfaceVariant)

        // Total tokens
        val totalTok = usage.inputTokens + usage.outputTokens
        Text(
            text = "Tok: ${formatCount(totalTok)}",
            style = monoStyle,
            color = MaterialTheme.colorScheme.onSurface,
        )

        // Cost
        if (usage.estimatedCostUsd != null) {
            Text(
                text = "$${String.format("%.2f", usage.estimatedCostUsd)}",
                style = monoStyle,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}
