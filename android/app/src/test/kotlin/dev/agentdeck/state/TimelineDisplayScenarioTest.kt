package dev.agentdeck.state

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TimelineDisplayScenarioTest {

    @Test
    fun `multi-agent dashboard timeline projects meaningful session rows`() {
        val entries = listOf(
            event(1_000, "chat_start", "Fix Android timeline", "claude-a", "claude-code", "AgentDeck", startedAt = 1_000),
            event(2_000, "tool_request", "Edit TimelineStrip.kt", "claude-a", "claude-code", "AgentDeck"),
            event(6_000, "chat_response", "Android Timeline now shows unit-session summaries", "claude-a", "claude-code", "AgentDeck", startedAt = 1_000, endedAt = 6_000),
            event(6_200, "chat_end", "Completed", "claude-a", "claude-code", "AgentDeck", startedAt = 1_000, endedAt = 6_200),
            event(6_500, "eval_result", "★ turn 91% [code] Android timeline projection verified", "claude-a", "claude-code", "AgentDeck", startedAt = 1_000, endedAt = 6_200),

            event(1_500, "chat_start", "Audit parser", "codex-a", "codex-cli", "Compiler", startedAt = 1_500),
            event(2_500, "tool_exec", "Bash: pnpm vitest", "codex-a", "codex-cli", "Compiler"),

            event(2_200, "chat_response", "OpenClaw routed dashboard health check", "openclaw-a", "openclaw", "Gateway", startedAt = 2_000, endedAt = 2_200),
            event(2_800, "chat_response", "OpenCode generated Rust port summary", "opencode-a", "opencode", "RustPort", startedAt = 2_000, endedAt = 2_800),
        ).sortedBy { it.timestamp }

        val display = timelineDisplayGroups(groupConsecutive(entries))
        val renderedKeys = display.map { "${it.entry.sessionId}:${it.entry.type}:${it.entry.projectName}" }

        assertFalse(
            "Completed Claude turn should be represented by response/eval rows, not stale chat_start",
            renderedKeys.contains("claude-a:chat_start:AgentDeck"),
        )
        assertFalse(
            "chat_end should not duplicate a chat_response for the same turn",
            renderedKeys.contains("claude-a:chat_end:AgentDeck"),
        )
        assertTrue(renderedKeys.contains("claude-a:chat_response:AgentDeck"))
        assertTrue(renderedKeys.contains("claude-a:eval_result:AgentDeck"))
        assertTrue(
            "In-flight Codex turn should remain visible until completion",
            renderedKeys.contains("codex-a:chat_start:Compiler"),
        )
        assertTrue(renderedKeys.contains("openclaw-a:chat_response:Gateway"))
        assertTrue(renderedKeys.contains("opencode-a:chat_response:RustPort"))

        val agentTypes = display.mapNotNull { it.entry.agentType }.distinct()
        assertEquals(4, agentTypes.size)
        assertTrue(agentTypes.containsAll(listOf("claude-code", "codex-cli", "openclaw", "opencode")))
    }

    @Test
    fun `same timestamp summaries stay separate by agent and project`() {
        val entries = listOf(
            event(10_000, "chat_end", "Summary", "claude-a", "claude-code", "AgentDeck"),
            event(10_050, "chat_end", "Summary", "claude-b", "claude-code", "ViewTrans"),
            event(10_100, "chat_end", "Summary", "codex-a", "codex-cli", "AgentDeck"),
        )

        val groups = groupConsecutive(entries)

        assertEquals(3, groups.size)
        assertEquals(listOf("AgentDeck", "ViewTrans", "AgentDeck"), groups.map { it.entry.projectName })
        assertEquals(listOf("claude-code", "claude-code", "codex-cli"), groups.map { it.entry.agentType })
    }

    private fun event(
        timestamp: Long,
        type: String,
        summary: String,
        sessionId: String,
        agentType: String,
        projectName: String,
        startedAt: Long? = null,
        endedAt: Long? = null,
    ) = TimelineEntry(
        timestamp = timestamp,
        type = type,
        summary = summary,
        sessionId = sessionId,
        agentType = agentType,
        projectName = projectName,
        startedAt = startedAt,
        endedAt = endedAt,
    )
}
