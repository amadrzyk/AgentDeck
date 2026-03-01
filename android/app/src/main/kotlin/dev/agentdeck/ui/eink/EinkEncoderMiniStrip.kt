package dev.agentdeck.ui.eink

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import dev.agentdeck.net.EncoderSlotState

/**
 * Compact single-row encoder status: icon + value for each encoder.
 * Displayed at bottom of landscape Dashboard, above footer.
 */
@Composable
fun EinkEncoderMiniStrip(
    encoderStates: List<EncoderSlotState>,
    modifier: Modifier = Modifier,
) {
    val monoStyle = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace)

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        encoderStates.forEach { enc ->
            val icon = enc.icon ?: encoderTypeIcon(enc.encoderType)
            val value = enc.value ?: enc.header
            Text(
                text = "$icon $value",
                style = monoStyle,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

private fun encoderTypeIcon(type: String): String = when (type) {
    "utility" -> "\u266B"    // music note
    "action" -> "\u25B6"     // play
    "terminal" -> "\u25A3"   // square
    "voice" -> "\u25CF"      // circle
    else -> "\u25CB"         // open circle
}
