package dev.agentdeck.ui.timeline

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.agentdeck.terrarium.TerrariumColors

/**
 * Compose renderer for parsed timeline markdown. Mirrors the SwiftUI
 * `TimelineMarkdownPreview` view in `TimelineStripView.swift` — same line
 * shapes, sizes, and colors so the dashboards read consistently across
 * platforms.
 */
@Composable
fun TimelineMarkdownView(
    text: String,
    modifier: Modifier = Modifier,
) {
    val lines = remember(text) { parseTimelineMarkdown(text) }
    val tight = TextStyle(platformStyle = PlatformTextStyle(includeFontPadding = false))
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        for (line in lines) {
            when (line) {
                TimelineMarkdownLine.Blank -> Spacer(modifier = Modifier.height(4.dp))
                is TimelineMarkdownLine.Heading -> Text(
                    text = line.content,
                    color = TerrariumColors.HUDText.copy(alpha = 0.95f),
                    fontSize = if (line.level == 1) 11.sp else 10.sp,
                    fontWeight = FontWeight.Bold,
                    style = tight,
                )
                is TimelineMarkdownLine.Bullet -> Row(
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Text(
                        text = "•",
                        color = TerrariumColors.HUDSubtext.copy(alpha = 0.78f),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                        style = tight,
                    )
                    Text(
                        text = line.content,
                        color = TerrariumColors.HUDSubtext.copy(alpha = 0.86f),
                        fontSize = 10.sp,
                        softWrap = true,
                        style = tight,
                    )
                }
                is TimelineMarkdownLine.Numbered -> Row(
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Text(
                        text = line.marker,
                        color = TerrariumColors.HUDSubtext.copy(alpha = 0.78f),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Medium,
                        fontFamily = FontFamily.Monospace,
                        modifier = Modifier.width(22.dp),
                        style = tight,
                    )
                    Text(
                        text = line.content,
                        color = TerrariumColors.HUDSubtext.copy(alpha = 0.86f),
                        fontSize = 10.sp,
                        softWrap = true,
                        style = tight,
                    )
                }
                is TimelineMarkdownLine.Quote -> Text(
                    text = "│ ${line.content}",
                    color = TerrariumColors.HUDSubtext.copy(alpha = 0.72f),
                    fontSize = 10.sp,
                    softWrap = true,
                    style = tight,
                )
                is TimelineMarkdownLine.Code -> Text(
                    text = if (line.content.isEmpty()) " " else line.content,
                    color = TerrariumColors.LEDGreen.copy(alpha = 0.8f),
                    fontSize = 9.sp,
                    fontFamily = FontFamily.Monospace,
                    softWrap = true,
                    style = tight,
                )
                is TimelineMarkdownLine.Plain -> Text(
                    text = line.content,
                    color = TerrariumColors.HUDSubtext.copy(alpha = 0.86f),
                    fontSize = 10.sp,
                    softWrap = true,
                    style = tight,
                )
            }
        }
    }
}

/**
 * Whether a detail blob duplicates the summary row enough to suppress.
 * Mirrors the Swift `detailIsRedundant(detail:raw:)` rule. Real entries
 * from `~/.agentdeck/timeline.json` look like:
 *   raw    = "정리\n\nfocusSession 의 시각 효과 추가됨..."
 *   detail = "## 정리\n\n**focusSession 의 시각 효과 추가됨**..."
 * — i.e. detail is the markdown-formatted version of raw. Strip markdown
 * from detail and compare the FULL strings (not just the first paragraph).
 */
fun timelineDetailIsRedundant(detail: String, raw: String): Boolean {
    if (detail == raw) return true
    val nRaw = normalizeForFuzzy(raw)
    val strippedDetail = stripMarkdownInline(detail)
    val nDetail = normalizeForFuzzy(strippedDetail)

    if (nRaw.isNotEmpty() && nDetail.isNotEmpty()) {
        if (nRaw == nDetail) return true
        val rTokens = nRaw.split(' ')
        val dTokens = nDetail.split(' ')
        // Detail covers raw fully, raw covers ≥ 85% of detail's tokens → redundant.
        val common = rTokens.take(dTokens.size)
        if (dTokens.size >= 3 && common == dTokens.take(common.size)) {
            val ratio = common.size.toDouble() / dTokens.size.coerceAtLeast(1)
            if (ratio >= 0.85) return true
        }
        val r8 = rTokens.take(8)
        val d8 = dTokens.take(8)
        if (r8.size >= 3 && r8 == d8) return true
    }

    // Legacy first-paragraph rule (heuristic summary "Topic · 4s · 2 tools" form).
    val firstPara = detail.split("\n\n").firstOrNull() ?: detail
    val nDetailPara = normalizeForFuzzy(stripMarkdownInline(firstPara))
    if (nRaw.isNotEmpty() && nDetailPara.isNotEmpty()) {
        if (nDetailPara.startsWith(nRaw)) return true
        val rawHead = raw.split(" · ").firstOrNull()?.takeIf { it.isNotBlank() }
        if (rawHead != null) {
            val nHead = normalizeForFuzzy(rawHead)
            if (nHead.isNotEmpty() && nHead.split(' ').size >= 2 && nDetailPara.startsWith(nHead)) {
                return true
            }
        }
        val rawTokens = nRaw.split(' ').take(6)
        val detailTokens = nDetailPara.split(' ').take(6)
        if (rawTokens.size >= 3 && rawTokens == detailTokens) return true
    }
    return false
}

/**
 * Lightweight inline markdown stripper. Mirrors `cleanDetailText` from
 * `shared/src/timeline.ts`.
 */
fun stripMarkdownInline(s: String): String {
    if (s.isEmpty()) return s
    var out = s
    // Code fences ```lang\n...\n``` → contents
    out = out.replace(Regex("```[\\w]*\\n?([\\s\\S]*?)```"), "$1")
    // Bold **x** → x
    out = out.replace(Regex("\\*\\*([^*]+)\\*\\*"), "$1")
    // Italic *x* (not **) → x
    out = out.replace(Regex("(?<!\\*)\\*([^*\\n]+)\\*(?!\\*)"), "$1")
    // Headings (multiline)
    out = out.replace(Regex("(?m)^#{1,6}\\s+"), "")
    // Blockquote
    out = out.replace(Regex("(?m)^>\\s+"), "")
    // List bullets
    out = out.replace(Regex("(?m)^[-*]\\s+"), "")
    // Links [text](url) → text
    out = out.replace(Regex("\\[([^\\]]+)]\\([^)]+\\)"), "$1")
    // Inline code
    out = out.replace(Regex("`([^`]+)`"), "$1")
    return out.trim()
}

/** Lightweight text-stripping mirror of `cleanRawText` from shared. Used to
 *  keep markdown decorators out of the summary row in the timeline. */
fun stripMarkdownForSummary(s: String): String {
    if (s.isEmpty()) return s
    var out = s
    out = out.replace(Regex("\\*\\*([^*]+)\\*\\*"), "$1")
    out = out.replace(Regex("(?m)^#{1,6}\\s+"), "")
    out = out.replace(Regex("\\[([^\\]]+)]\\([^)]+\\)"), "$1")
    out = out.replace(Regex("`([^`]+)`"), "$1")
    return out.trim()
}

private fun normalizeForFuzzy(s: String): String =
    s.lowercase()
        .map { if (it.isLetterOrDigit()) it else ' ' }
        .joinToString("")
        .split(' ')
        .filter { it.isNotEmpty() }
        .joinToString(" ")
