package dev.agentdeck.ui.component

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import dev.agentdeck.state.MetricsSnapshot
import dev.agentdeck.ui.theme.AgentDeckColors
import kotlinx.coroutines.delay

/**
 * Connection status indicator: small colored dot + "live" / "Xs ago" / "offline".
 */
@Composable
fun SyncIndicator(
    metrics: MetricsSnapshot,
    modifier: Modifier = Modifier,
) {
    var tickMs by remember { mutableLongStateOf(System.currentTimeMillis()) }

    LaunchedEffect(Unit) {
        while (true) {
            delay(1_000)
            tickMs = System.currentTimeMillis()
        }
    }

    val isConnected = metrics.connectedSince != null
    val agoSec = if (metrics.lastMessageAt != null) {
        ((tickMs - metrics.lastMessageAt) / 1000).toInt()
    } else {
        -1
    }

    val dotColor = when {
        !isConnected -> AgentDeckColors.SlateText
        agoSec < 5 -> AgentDeckColors.Green
        agoSec < 30 -> AgentDeckColors.Amber
        else -> AgentDeckColors.SlateText
    }

    val label = when {
        !isConnected -> "offline"
        agoSec < 2 -> "live"
        agoSec < 60 -> "${agoSec}s ago"
        agoSec < 3600 -> "${agoSec / 60}m ago"
        else -> "${agoSec / 3600}h ago"
    }

    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(dotColor),
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
