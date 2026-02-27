package dev.agentdeck.ui.component

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.agentdeck.net.PromptOption
import dev.agentdeck.ui.theme.AgentDeckColors

@Composable
fun PermissionDialog(
    question: String?,
    options: List<PromptOption>,
    onSelectOption: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            if (question != null) {
                Text(
                    text = question,
                    style = MaterialTheme.typography.titleMedium,
                    color = AgentDeckColors.Amber,
                )
                Spacer(modifier = Modifier.height(12.dp))
            }

            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                itemsIndexed(options) { index, option ->
                    OptionButton(
                        option = option,
                        isPrimary = index == 0,
                        onClick = { onSelectOption(index) },
                    )
                }
            }
        }
    }
}

@Composable
private fun OptionButton(
    option: PromptOption,
    isPrimary: Boolean,
    onClick: () -> Unit,
) {
    if (isPrimary) {
        Button(
            onClick = onClick,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = AgentDeckColors.Green),
            shape = RoundedCornerShape(12.dp),
        ) {
            Column(modifier = Modifier.padding(vertical = 4.dp)) {
                Text(text = option.label, style = MaterialTheme.typography.titleMedium)
                if (option.description != null) {
                    Text(
                        text = option.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.7f),
                    )
                }
            }
        }
    } else {
        OutlinedButton(
            onClick = onClick,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
        ) {
            Column(modifier = Modifier.padding(vertical = 4.dp)) {
                Text(text = option.label, style = MaterialTheme.typography.titleMedium)
                if (option.description != null) {
                    Text(
                        text = option.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
