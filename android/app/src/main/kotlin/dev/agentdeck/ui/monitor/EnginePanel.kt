package dev.agentdeck.ui.monitor

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.agentdeck.net.UsageUpdate
import dev.agentdeck.state.MetricsSnapshot
import dev.agentdeck.terrarium.TerrariumColors
import dev.agentdeck.ui.eink.formatCount
import dev.agentdeck.ui.eink.formatDurationLong

/**
 * Right HUD panel — "ENGINE"
 * Rate limit gauges, tokens, cost, message count, uptime.
 */
@Composable
fun EnginePanel(
    usage: UsageUpdate,
    metrics: MetricsSnapshot,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .background(TerrariumColors.HUDBg, RoundedCornerShape(8.dp))
            .padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Text(
            text = "ENGINE",
            color = TerrariumColors.HUDSubtext,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace,
        )

        // Rate limit gauges
        if (usage.fiveHourPercent != null) {
            HudGauge(label = "5h", percent = usage.fiveHourPercent)
        }
        if (usage.sevenDayPercent != null) {
            HudGauge(label = "7d", percent = usage.sevenDayPercent)
        }

        Spacer(modifier = Modifier.height(2.dp))

        // Token count
        val totalTok = usage.inputTokens + usage.outputTokens
        HudInfoRow("Tok", formatCount(totalTok))

        // Cost
        if (usage.estimatedCostUsd != null) {
            HudInfoRow("Cost", "$${String.format("%.2f", usage.estimatedCostUsd)}")
        }

        // Message count
        HudInfoRow("Msg", "${metrics.messageCount}")

        // Uptime
        val uptimeText = if (metrics.connectedSince != null) {
            formatDurationLong(System.currentTimeMillis() - metrics.connectedSince)
        } else {
            "--:--"
        }
        HudInfoRow("UP", uptimeText)
    }
}

@Composable
private fun HudGauge(label: String, percent: Double) {
    val pct = percent.coerceIn(0.0, 100.0).toInt()
    val filled = (pct * 6 / 100).coerceAtMost(6)
    val empty = 6 - filled
    val bar = "\u2588".repeat(filled) + "\u2591".repeat(empty)
    val color = when {
        percent >= 90 -> TerrariumColors.LEDRed
        percent >= 70 -> TerrariumColors.LEDAmber
        else -> TerrariumColors.LEDGreen
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            text = "$label",
            color = TerrariumColors.HUDSubtext,
            fontSize = 10.sp,
            fontFamily = FontFamily.Monospace,
        )
        Text(
            text = "[$bar]",
            color = color,
            fontSize = 10.sp,
            fontFamily = FontFamily.Monospace,
        )
        Text(
            text = "$pct%",
            color = color,
            fontSize = 10.sp,
            fontFamily = FontFamily.Monospace,
        )
    }
}

@Composable
private fun HudInfoRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = "$label:",
            color = TerrariumColors.HUDSubtext,
            fontSize = 11.sp,
            fontFamily = FontFamily.Monospace,
        )
        Text(
            text = value,
            color = TerrariumColors.HUDText,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace,
        )
    }
}
