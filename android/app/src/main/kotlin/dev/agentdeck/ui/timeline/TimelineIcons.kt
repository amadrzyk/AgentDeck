package dev.agentdeck.ui.timeline

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Alarm
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.HourglassTop
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.Sync
import androidx.compose.ui.graphics.vector.ImageVector

/**
 * Semantic icon key for a timeline entry. Mirrors `shared/src/timeline-icons.ts`
 * (`TimelineIconKey`) and `apple/AgentDeck/UI/Monitor/TimelineStripView.swift`
 * (`TimelineIconKey`). Single source of truth for the abstract semantics.
 *
 * Each platform maps the key to its native form. On Android tablet we use
 * Material Icons (vector). On Android e-ink we use ASCII bracket markers
 * (see [einkGlyph]) — Material vector glyphs render at thin strokes after
 * 1-bit dither and ghost on partial refresh.
 */
enum class TimelineIconKey {
    Success, Error, Running, Awaiting, Tool, Model, User, Task, Scheduled, Memory;

    /** Material Icon for tablet/full-color surfaces. */
    val materialIcon: ImageVector
        get() = when (this) {
            Success -> Icons.Filled.CheckCircle
            Error -> Icons.Filled.Error
            Running -> Icons.Filled.Sync
            Awaiting -> Icons.Filled.HourglassTop
            Tool -> Icons.Filled.Build
            Model -> Icons.Filled.Psychology
            User -> Icons.Filled.Person
            Task -> Icons.Filled.Checklist
            Scheduled -> Icons.Filled.Alarm
            Memory -> Icons.Filled.Memory
        }

    /** ASCII bracket glyph for e-ink displays. Constant 4-char width for
     *  monospace alignment; high black coverage so the panel doesn't ghost. */
    val einkGlyph: String
        get() = when (this) {
            Success -> "[OK]"
            Error -> "[!!]"
            Running -> "[..]"
            Awaiting -> "[??]"
            Tool -> "[T ]"
            Model -> "[M ]"
            User -> "[U ]"
            Task -> "[==]"
            Scheduled -> "[S ]"
            Memory -> "[~ ]"
        }
}

/**
 * Resolve the icon key for a timeline entry by type + status.
 * Mirrors `timelineIconKey()` in shared/src/timeline-icons.ts.
 */
fun timelineIconKey(type: String, status: String? = null): TimelineIconKey = when (type) {
    "task_start", "task_end" -> TimelineIconKey.Task
    "chat_start" -> TimelineIconKey.Running
    "chat_end", "chat_response", "model_response" -> TimelineIconKey.Success
    "model_call" -> TimelineIconKey.Model
    "tool_request" -> when (status) {
        "approved" -> TimelineIconKey.Success
        "denied" -> TimelineIconKey.Error
        else -> TimelineIconKey.Awaiting
    }
    "tool_resolved" -> TimelineIconKey.Success
    "tool_exec" -> TimelineIconKey.Tool
    "error" -> TimelineIconKey.Error
    "user_action" -> TimelineIconKey.User
    "scheduled" -> TimelineIconKey.Scheduled
    "memory_recall" -> TimelineIconKey.Memory
    "eval_result" -> if (status == "denied") TimelineIconKey.Error else TimelineIconKey.Success
    else -> TimelineIconKey.Running
}

/** Whether this entry type carries detail-pane body content (not a hierarchy marker). */
fun entryHasDetailBody(type: String): Boolean = type != "task_start" && type != "task_end"
