package dev.agentdeck.ui.timeline

/**
 * Parsed markdown line for the timeline detail pane.
 *
 * Mirrors the parser in `shared/src/timeline-markdown.ts` and the Apple
 * `TimelineMarkdownLine` enum in `TimelineStripView.swift`. The grammar is
 * line-oriented (no inline parsing); each parser is hand-ported and snapshot
 * tests on each platform check parity against the same fixture set.
 */
sealed class TimelineMarkdownLine {
    object Blank : TimelineMarkdownLine()
    data class Heading(val level: Int, val content: String) : TimelineMarkdownLine()
    data class Bullet(val content: String) : TimelineMarkdownLine()
    data class Numbered(val marker: String, val content: String) : TimelineMarkdownLine()
    data class Quote(val content: String) : TimelineMarkdownLine()
    data class Code(val content: String) : TimelineMarkdownLine()
    data class Plain(val content: String) : TimelineMarkdownLine()
}

/**
 * Parse `text` into a flat list of typed lines for native rendering.
 *
 * Grammar:
 *   - ``` toggles a code fence; lines inside become Code (verbatim, including markers above)
 *   - empty / whitespace-only line → Blank
 *   - 1-3 leading hashes followed by a space → Heading
 *   - "- " or "* " → Bullet
 *   - "<digits>." or "<digits>)" + space → Numbered
 *   - "> " → Quote
 *   - anything else → Plain
 */
fun parseTimelineMarkdown(text: String): List<TimelineMarkdownLine> {
    if (text.isEmpty()) return emptyList()
    val out = mutableListOf<TimelineMarkdownLine>()
    var inCodeFence = false

    for (rawLine in text.split('\n').map { it.trimEnd('\r') }) {
        val trimmed = rawLine.trim()

        if (trimmed.startsWith("```")) {
            inCodeFence = !inCodeFence
            continue
        }
        if (inCodeFence) {
            out += TimelineMarkdownLine.Code(rawLine)
            continue
        }
        if (trimmed.isEmpty()) {
            out += TimelineMarkdownLine.Blank
            continue
        }

        val heading = parseHeading(trimmed)
        if (heading != null) {
            out += TimelineMarkdownLine.Heading(heading.first, heading.second)
            continue
        }

        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
            out += TimelineMarkdownLine.Bullet(trimmed.substring(2))
            continue
        }

        val numbered = NUMBERED_RE.matchEntire(trimmed)
        if (numbered != null) {
            out += TimelineMarkdownLine.Numbered(
                marker = numbered.groupValues[1] + numbered.groupValues[2],
                content = numbered.groupValues[3],
            )
            continue
        }

        if (trimmed.startsWith("> ")) {
            out += TimelineMarkdownLine.Quote(trimmed.substring(2))
            continue
        }

        out += TimelineMarkdownLine.Plain(rawLine)
    }

    return if (out.isEmpty()) listOf(TimelineMarkdownLine.Plain(text)) else out
}

private val NUMBERED_RE = Regex("""^(\d+)([.)])\s+(.*)$""")

private fun parseHeading(trimmed: String): Pair<Int, String>? {
    var level = 0
    for (ch in trimmed) {
        if (ch == '#') level += 1 else break
    }
    if (level !in 1..3) return null
    if (level >= trimmed.length || trimmed[level] != ' ') return null
    return level to trimmed.substring(level + 1)
}
