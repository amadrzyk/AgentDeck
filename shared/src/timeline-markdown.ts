/**
 * Lightweight markdown parser for timeline detail panes.
 *
 * Output is a flat array of typed lines that each platform renders natively
 * (SwiftUI / Compose). Pure data — no rendering. Mirrors the Apple parser at
 * apple/AgentDeck/UI/Monitor/TimelineStripView.swift `TimelineMarkdownLine`
 * (which now consumes this module's output via a thin Swift port).
 *
 * Grammar (line-oriented, no inline parsing):
 *   - ``` toggles a code fence; lines inside become `code`
 *   - empty / whitespace-only line → `blank`
 *   - `# `..`### ` (1-3 hashes + space) → `heading`
 *   - `- ` or `* ` → `bullet`
 *   - `<digits>.` or `<digits>)` followed by space → `numbered`
 *   - `> ` → `quote`
 *   - anything else → `text`
 *
 * Everything inside a fence is verbatim, including any markers above.
 */

export type MarkdownLine =
  | { kind: 'blank' }
  | { kind: 'heading'; level: 1 | 2 | 3; content: string }
  | { kind: 'bullet'; content: string }
  | { kind: 'numbered'; marker: string; content: string }
  | { kind: 'quote'; content: string }
  | { kind: 'code'; content: string }
  | { kind: 'text'; content: string };

export function parseTimelineMarkdown(text: string): MarkdownLine[] {
  if (!text) return [];
  const out: MarkdownLine[] = [];
  let inCodeFence = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim();

    if (trimmed.startsWith('```')) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) {
      out.push({ kind: 'code', content: rawLine });
      continue;
    }
    if (trimmed.length === 0) {
      out.push({ kind: 'blank' });
      continue;
    }

    const heading = parseHeading(trimmed);
    if (heading) {
      out.push({ kind: 'heading', level: heading.level, content: heading.content });
      continue;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      out.push({ kind: 'bullet', content: trimmed.slice(2) });
      continue;
    }

    const numbered = parseNumbered(trimmed);
    if (numbered) {
      out.push({ kind: 'numbered', marker: numbered.marker, content: numbered.content });
      continue;
    }

    if (trimmed.startsWith('> ')) {
      out.push({ kind: 'quote', content: trimmed.slice(2) });
      continue;
    }

    out.push({ kind: 'text', content: rawLine });
  }

  // Match Apple's "always at least one line" contract: empty result → emit text(text)
  return out.length === 0 ? [{ kind: 'text', content: text }] : out;
}

function parseHeading(trimmed: string): { level: 1 | 2 | 3; content: string } | null {
  let level = 0;
  for (const ch of trimmed) {
    if (ch === '#') level += 1;
    else break;
  }
  if (level < 1 || level > 3) return null;
  if (trimmed.charAt(level) !== ' ') return null;
  return { level: level as 1 | 2 | 3, content: trimmed.slice(level + 1) };
}

function parseNumbered(trimmed: string): { marker: string; content: string } | null {
  const m = trimmed.match(/^(\d+)([.)])\s+(.*)$/);
  if (!m) return null;
  return { marker: `${m[1]}${m[2]}`, content: m[3] };
}
