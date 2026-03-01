package dev.agentdeck.ui.monitor

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.agentdeck.net.OcSessionStatus
import dev.agentdeck.net.SessionInfo
import dev.agentdeck.terrarium.TerrariumColors
import dev.agentdeck.ui.eink.formatCount

/**
 * Left-bottom HUD panel — "MULTI-AGENT"
 * Shows sibling sessions, worker count, OC session status.
 * Only visible when there's multi-session or OC data.
 */
@Composable
fun MultiAgentPanel(
    siblingSessions: List<SessionInfo>,
    workerSessionCount: Int?,
    sessionStatus: OcSessionStatus?,
    modifier: Modifier = Modifier,
) {
    // Only show if there's multi-agent data
    val hasData = siblingSessions.isNotEmpty() ||
        (workerSessionCount != null && workerSessionCount > 0) ||
        sessionStatus != null
    if (!hasData) return

    Column(
        modifier = modifier
            .background(TerrariumColors.HUDBg, RoundedCornerShape(8.dp))
            .padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Text(
            text = "MULTI-AGENT",
            color = TerrariumColors.HUDSubtext,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace,
        )

        // Sibling sessions
        if (siblingSessions.isNotEmpty()) {
            siblingSessions.forEach { session ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = if (session.alive) "\u25CF" else "\u25CB",
                        color = if (session.alive) TerrariumColors.LEDGreen else TerrariumColors.HUDSubtext,
                        fontSize = 10.sp,
                    )
                    Text(
                        text = session.projectName ?: "Session ${session.port}",
                        color = TerrariumColors.HUDText,
                        fontSize = 10.sp,
                        fontFamily = FontFamily.Monospace,
                    )
                }
            }
        }

        // Worker count
        if (workerSessionCount != null && workerSessionCount > 0) {
            Text(
                text = "Workers: $workerSessionCount",
                color = TerrariumColors.HUDText,
                fontSize = 11.sp,
                fontFamily = FontFamily.Monospace,
            )
        }

        // OC session status
        if (sessionStatus != null) {
            if (sessionStatus.contextTokens != null) {
                Text(
                    text = "Ctx: ${formatCount(sessionStatus.contextTokens)}",
                    color = TerrariumColors.HUDSubtext,
                    fontSize = 10.sp,
                    fontFamily = FontFamily.Monospace,
                )
            }
            if (sessionStatus.uptime != null) {
                val m = sessionStatus.uptime / 60
                val s = sessionStatus.uptime % 60
                Text(
                    text = "Up: ${m}m ${s}s",
                    color = TerrariumColors.HUDSubtext,
                    fontSize = 10.sp,
                    fontFamily = FontFamily.Monospace,
                )
            }
        }
    }
}
