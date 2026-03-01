package dev.agentdeck.ui.monitor

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.agentdeck.net.AgentState
import dev.agentdeck.terrarium.TerrariumColors

/**
 * Left HUD panel — "ACTIVITY"
 * Shows current tool + toolInput + toolProgress when PROCESSING,
 * suggestedPrompt when IDLE, question summary when AWAITING.
 */
@Composable
fun ActivityPanel(
    agentState: AgentState,
    currentTool: String?,
    toolInput: String?,
    toolProgress: String?,
    question: String?,
    suggestedPrompt: String?,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .background(TerrariumColors.HUDBg, RoundedCornerShape(8.dp))
            .padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            text = "ACTIVITY",
            color = TerrariumColors.HUDSubtext,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace,
        )

        when (agentState) {
            AgentState.PROCESSING -> {
                if (currentTool != null) {
                    Text(
                        text = "> $currentTool",
                        color = TerrariumColors.TetraNeon,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (toolInput != null) {
                    Text(
                        text = "  \"$toolInput\"",
                        color = TerrariumColors.HUDSubtext,
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (toolProgress != null) {
                    Text(
                        text = "  ($toolProgress)",
                        color = TerrariumColors.HUDSubtext.copy(alpha = 0.7f),
                        fontSize = 10.sp,
                        fontFamily = FontFamily.Monospace,
                    )
                }
            }

            AgentState.IDLE -> {
                if (suggestedPrompt != null) {
                    Text(
                        text = "Suggested:",
                        color = TerrariumColors.HUDSubtext,
                        fontSize = 10.sp,
                        fontFamily = FontFamily.Monospace,
                    )
                    Text(
                        text = suggestedPrompt,
                        color = TerrariumColors.HUDText,
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                } else {
                    Text(
                        text = "Waiting for prompt...",
                        color = TerrariumColors.HUDSubtext,
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace,
                    )
                }
            }

            AgentState.AWAITING_PERMISSION,
            AgentState.AWAITING_OPTION,
            AgentState.AWAITING_DIFF -> {
                if (question != null) {
                    Text(
                        text = question,
                        color = TerrariumColors.HUDText,
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                    )
                } else {
                    Text(
                        text = "Awaiting input...",
                        color = TerrariumColors.HUDSubtext,
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace,
                    )
                }
            }

            AgentState.DISCONNECTED -> {
                Text(
                    text = "No connection",
                    color = TerrariumColors.HUDSubtext,
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace,
                )
            }
        }
    }
}
