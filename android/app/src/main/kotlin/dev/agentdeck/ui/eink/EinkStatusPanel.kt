package dev.agentdeck.ui.eink

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import dev.agentdeck.net.ModelCatalogEntry
import dev.agentdeck.state.DashboardState
import dev.agentdeck.state.SessionMetrics
import dev.agentdeck.util.formatCount
import dev.agentdeck.util.formatResetTime
import dev.agentdeck.util.formatUptime
import dev.agentdeck.util.gaugeBar

/**
 * RIGHT zone (32%) — Status panel for e-ink 3-zone layout.
 * Rate limits + engine/runtime sections.
 */
@Composable
fun EinkStatusPanel(
    state: DashboardState,
    modifier: Modifier = Modifier,
) {
    val monoStyle = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace)
    val usage = state.usage
    val metricsSnapshot by SessionMetrics.instance.metrics.collectAsState()

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        // Connection
        val connIcon = if (state.bridgeConnected) "\u25CF" else "\u25CB"
        val connLabel = if (state.bridgeConnected) "CONNECTED" else "DISCONNECTED"
        Text(text = "Conn: $connIcon $connLabel", style = monoStyle, color = MaterialTheme.colorScheme.onSurface)

        HorizontalDivider(thickness = 1.dp, color = Color.Black)

        // 5h rate limit + reset time
        usage.fiveHourPercent?.let { pct ->
            val bar = gaugeBar(pct)
            val reset = usage.fiveHourResetsAt?.let { formatResetTime(it) } ?: ""
            Text(text = "5h $bar ${pct.toInt()}%  $reset", style = monoStyle, color = MaterialTheme.colorScheme.onSurface)
        }

        // 7d rate limit + reset time
        usage.sevenDayPercent?.let { pct ->
            val bar = gaugeBar(pct)
            val reset = usage.sevenDayResetsAt?.let { formatResetTime(it) } ?: ""
            Text(text = "7d $bar ${pct.toInt()}%  $reset", style = monoStyle, color = MaterialTheme.colorScheme.onSurface)
        }

        HorizontalDivider(thickness = 1.dp, color = Color.Black)

        val openClaw = openClawDisplayLines(state.modelCatalog.orEmpty())
        if (openClaw.isNotEmpty()) {
            Text(text = "OpenClaw", style = monoStyle, color = MaterialTheme.colorScheme.onSurface)
            Text(text = openClaw.joinToString(", "), style = monoStyle, color = MaterialTheme.colorScheme.onSurface, maxLines = 1)
            HorizontalDivider(thickness = 1.dp, color = Color.Black)
        }

        val ollama = state.ollamaStatus?.takeIf { it.available }?.models.orEmpty()
        val runningOllama = ollama.filter { it.sizeVram > 0 }
        val ollamaSource = if (runningOllama.isNotEmpty()) runningOllama else ollama
        if (ollamaSource.isNotEmpty()) {
            Text(text = "OLLAMA", style = monoStyle, color = MaterialTheme.colorScheme.onSurface)
            Text(text = ollamaSource.joinToString(", ") { it.name }, style = monoStyle, color = MaterialTheme.colorScheme.onSurface, maxLines = 1)
            HorizontalDivider(thickness = 1.dp, color = Color.Black)
        }

        if (state.mlxModels.isNotEmpty()) {
            Text(text = "MLX", style = monoStyle, color = MaterialTheme.colorScheme.onSurface)
            Text(text = state.mlxModels.joinToString(", "), style = monoStyle, color = MaterialTheme.colorScheme.onSurface, maxLines = 1)
            HorizontalDivider(thickness = 1.dp, color = Color.Black)
        }

        antigravityDisplayLine(state)?.let { line ->
            Text(text = "AG", style = monoStyle, color = MaterialTheme.colorScheme.onSurface)
            Text(text = line, style = monoStyle, color = MaterialTheme.colorScheme.onSurface, maxLines = 1)
            HorizontalDivider(thickness = 1.dp, color = Color.Black)
        }

        if (state.subscriptions.isNotEmpty()) {
            Text(text = "Subs", style = monoStyle, color = MaterialTheme.colorScheme.onSurface)
            Text(text = state.subscriptions.joinToString(", ") { it.name }, style = monoStyle, color = MaterialTheme.colorScheme.onSurface, maxLines = 1)
            HorizontalDivider(thickness = 1.dp, color = Color.Black)
        }

        // Tokens
        val totalTok = usage.inputTokens.toLong() + usage.outputTokens.toLong()
        Text(text = "Tok: ${formatCount(totalTok)}", style = monoStyle, color = MaterialTheme.colorScheme.onSurface)

        // Cost
        usage.estimatedCostUsd?.let {
            Text(text = "Cost: $${"%.2f".format(it)}", style = monoStyle, color = MaterialTheme.colorScheme.onSurface)
        }

        // Messages + Uptime
        val msgCount = metricsSnapshot.messageCount
        val uptime = formatUptime(metricsSnapshot.connectedSince ?: 0L)
        Text(text = "Msg: $msgCount  UP: $uptime", style = monoStyle, color = MaterialTheme.colorScheme.onSurface)
    }
}

private fun openClawDisplayLines(modelCatalog: List<ModelCatalogEntry>): List<String> {
    val primary = modelCatalog.firstOrNull { it.available && it.role == "default" }
        ?: modelCatalog.firstOrNull { it.available }
    return primary?.let { listOf(it.name) } ?: emptyList()
}

private fun antigravityDisplayLine(state: DashboardState): String? {
    val status = state.antigravityStatus ?: return null
    return status.planName?.replace("Google AI ", "")?.takeIf { it.isNotBlank() }
}
