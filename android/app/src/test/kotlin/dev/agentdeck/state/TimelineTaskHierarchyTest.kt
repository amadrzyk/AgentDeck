package dev.agentdeck.state

import dev.agentdeck.ui.timeline.TimelineIconKey
import dev.agentdeck.ui.timeline.parseTimelineMarkdown
import dev.agentdeck.ui.timeline.timelineDetailIsRedundant
import dev.agentdeck.ui.timeline.timelineIconKey
import dev.agentdeck.ui.timeline.TimelineMarkdownLine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TimelineTaskHierarchyTest {

    @Test
    fun `same project two sessions are not the same context anymore`() {
        // Two distinct Claude sessions in the same project. Earlier code fell
        // through to (projectName, agentType) when only one side carried a
        // sessionId — collapsing them into a single timeline row. The
        // tightened rule requires both sides to share a sessionId.
        val a = entry("chat_end", sessionId = "sess-1", projectName = "AgentDeck", agentType = "claude-code")
        val b = entry("chat_end", sessionId = "sess-2", projectName = "AgentDeck", agentType = "claude-code")
        assertFalse("two sessions in same project must not group", sameTimelineContext(a, b))
    }

    @Test
    fun `taskId is the strongest grouping key`() {
        val a = entry("tool_request", sessionId = "sess-1", taskId = "task-A")
        val b = entry("tool_resolved", sessionId = "sess-2", taskId = "task-A")
        assertTrue("entries with same taskId share context", sameTimelineContext(a, b))
    }

    @Test
    fun `task entries never group with each other`() {
        val entries = listOf(
            entry("task_start", timestamp = 1_000, summary = "Task 1", taskId = "a"),
            entry("task_start", timestamp = 2_000, summary = "Task 1", taskId = "b"),
            entry("task_end",   timestamp = 3_000, summary = "Task 1", taskId = "a"),
            entry("task_end",   timestamp = 4_000, summary = "Task 1", taskId = "b"),
        )
        val groups = groupConsecutive(entries)
        assertEquals(4, groups.size)
        assertTrue(groups.all { it.count == 1 })
    }

    @Test
    fun `task hierarchy is never elided by display projection`() {
        val entries = listOf(
            entry("task_start", timestamp = 1_000, taskId = "a"),
            entry("chat_start", timestamp = 2_000, sessionId = "s", taskId = "a", startedAt = 2_000),
            entry("chat_end",   timestamp = 6_000, sessionId = "s", taskId = "a", startedAt = 2_000, endedAt = 6_000),
            entry("task_end",   timestamp = 6_500, taskId = "a"),
        )
        val display = timelineDisplayGroups(groupConsecutive(entries))
        val types = display.map { it.entry.type }
        assertTrue(types.contains("task_start"))
        assertTrue(types.contains("task_end"))
    }

    @Test
    fun `iconKey resolves to Task for task entries`() {
        assertEquals(TimelineIconKey.Task, timelineIconKey("task_start"))
        assertEquals(TimelineIconKey.Task, timelineIconKey("task_end"))
    }

    @Test
    fun `iconKey resolves tool_request status to success error awaiting`() {
        assertEquals(TimelineIconKey.Success, timelineIconKey("tool_request", "approved"))
        assertEquals(TimelineIconKey.Error, timelineIconKey("tool_request", "denied"))
        assertEquals(TimelineIconKey.Awaiting, timelineIconKey("tool_request", "pending"))
        assertEquals(TimelineIconKey.Awaiting, timelineIconKey("tool_request"))
    }

    @Test
    fun `eink glyphs are constant 4-char width`() {
        for (key in TimelineIconKey.values()) {
            assertEquals("eink glyph for $key", 4, key.einkGlyph.length)
        }
    }

    @Test
    fun `markdown parser parity with shared - basics`() {
        assertEquals(
            listOf(TimelineMarkdownLine.Plain("hello")),
            parseTimelineMarkdown("hello"),
        )
        val out = parseTimelineMarkdown("# Title\n- bullet\n1. one")
        assertEquals(3, out.size)
        assertTrue(out[0] is TimelineMarkdownLine.Heading)
        assertTrue(out[1] is TimelineMarkdownLine.Bullet)
        assertTrue(out[2] is TimelineMarkdownLine.Numbered)
    }

    @Test
    fun `markdown parser code fence is verbatim`() {
        val out = parseTimelineMarkdown("text\n```\n# not heading\n- not bullet\n```\nback")
        assertEquals(4, out.size)
        assertEquals(TimelineMarkdownLine.Plain("text"), out[0])
        assertTrue(out[1] is TimelineMarkdownLine.Code)
        assertEquals("# not heading", (out[1] as TimelineMarkdownLine.Code).content)
        assertTrue(out[2] is TimelineMarkdownLine.Code)
        assertEquals(TimelineMarkdownLine.Plain("back"), out[3])
    }

    @Test
    fun `detail redundancy fires when prefix matches summary`() {
        // The LLM summarizer often starts the response with a paraphrase of
        // the summary line. Both rendered side-by-side looks like duplicate
        // content with a slight color difference.
        assertTrue(
            timelineDetailIsRedundant(
                detail = "Did the thing. The change touches three files.",
                raw = "Did the thing · 4s",
            ),
        )
    }

    @Test
    fun `detail redundancy does not fire when content is genuinely new`() {
        assertFalse(
            timelineDetailIsRedundant(
                detail = "Notes:\n- updated parser\n- added tests",
                raw = "Refactor · 12s · 4 tools",
            ),
        )
    }

    private fun entry(
        type: String,
        timestamp: Long = 0L,
        summary: String = "x",
        sessionId: String? = null,
        projectName: String? = null,
        agentType: String? = null,
        runId: String? = null,
        taskId: String? = null,
        startedAt: Long? = null,
        endedAt: Long? = null,
    ) = TimelineEntry(
        timestamp = timestamp,
        type = type,
        summary = summary,
        sessionId = sessionId,
        projectName = projectName,
        agentType = agentType,
        runId = runId,
        taskId = taskId,
        startedAt = startedAt,
        endedAt = endedAt,
    )

    @Suppress("unused")
    private fun assertNotSameContext(a: TimelineEntry, b: TimelineEntry) {
        assertNotEquals(true, sameTimelineContext(a, b))
    }
}
