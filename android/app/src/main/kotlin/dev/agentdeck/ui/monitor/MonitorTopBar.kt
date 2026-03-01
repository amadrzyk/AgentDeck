package dev.agentdeck.ui.monitor

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.agentdeck.net.AgentState
import dev.agentdeck.net.PermissionMode
import dev.agentdeck.terrarium.TerrariumColors
import dev.agentdeck.ui.component.stateColor
import dev.agentdeck.ui.component.stateLabel

/**
 * Top bar HUD: project + state + mode (left) / model + agent type (right).
 * Semi-transparent over terrarium background.
 */
@Composable
fun MonitorTopBar(
    agentState: AgentState,
    projectName: String?,
    modelName: String?,
    agentType: String?,
    permissionMode: PermissionMode,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        // Left: project name + state + mode
        Column {
            if (projectName != null) {
                Text(
                    text = projectName,
                    color = TerrariumColors.HUDText,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    modifier = Modifier
                        .background(TerrariumColors.HUDBg, RoundedCornerShape(4.dp))
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                )
            }

            Row(
                modifier = Modifier.padding(top = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // State label with color
                Text(
                    text = stateLabel(agentState),
                    color = stateColor(agentState),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    modifier = Modifier
                        .background(TerrariumColors.HUDBg, RoundedCornerShape(4.dp))
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                )

                // Permission mode (if not default)
                if (permissionMode != PermissionMode.DEFAULT) {
                    Text(
                        text = "mode:${permissionMode.name.lowercase()}",
                        color = TerrariumColors.HUDSubtext,
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace,
                        modifier = Modifier
                            .background(TerrariumColors.HUDBg, RoundedCornerShape(4.dp))
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                    )
                }
            }
        }

        Spacer(modifier = Modifier.weight(1f))

        // Right: model + agent type
        Column(horizontalAlignment = Alignment.End) {
            if (modelName != null) {
                Text(
                    text = modelName,
                    color = TerrariumColors.HUDSubtext,
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace,
                    modifier = Modifier
                        .background(TerrariumColors.HUDBg, RoundedCornerShape(4.dp))
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                )
            }
            if (agentType != null) {
                Text(
                    text = agentType,
                    color = TerrariumColors.HUDSubtext.copy(alpha = 0.6f),
                    fontSize = 10.sp,
                    fontFamily = FontFamily.Monospace,
                    modifier = Modifier
                        .background(TerrariumColors.HUDBg, RoundedCornerShape(4.dp))
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                )
            }
        }
    }
}
