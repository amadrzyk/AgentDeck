import { describe, it, expect } from 'vitest';
import {
  deduplicateEntry,
  type TimelineEntry,
  type TaskBoundarySignal,
} from '../timeline.js';
import { timelineIconKey, EINK_ICON_GLYPHS } from '../timeline-icons.js';
import { parseTimelineMarkdown } from '../timeline-markdown.js';

// ============================================================
// Task hierarchy entries bypass dedup
// ============================================================
describe('deduplicateEntry — task hierarchy', () => {
  const baseEntry = (over: Partial<TimelineEntry> = {}): TimelineEntry => ({
    ts: 1_000_000,
    type: 'task_start',
    raw: 'Task 1',
    sessionId: 'sess',
    runId: 'run',
    taskId: 'task-a',
    ...over,
  });

  it('always adds task_start even with identical raw within 8s', () => {
    const existing = [baseEntry({ ts: 1_000_000 })];
    const next = baseEntry({ ts: 1_000_500, taskId: 'task-b' });
    const result = deduplicateEntry(next, existing);
    expect(result.action).toBe('add');
  });

  it('always adds task_end with same boundarySignal back-to-back', () => {
    const existing: TimelineEntry[] = [
      baseEntry({ type: 'task_end', boundarySignal: 'todo_complete' as TaskBoundarySignal }),
    ];
    const next = baseEntry({
      ts: 1_001_000,
      type: 'task_end',
      boundarySignal: 'todo_complete' as TaskBoundarySignal,
      taskId: 'task-b',
    });
    const result = deduplicateEntry(next, existing);
    expect(result.action).toBe('add');
  });

  it('still dedupes ordinary chat_start within 8s', () => {
    const existing: TimelineEntry[] = [
      { ts: 1_000_000, type: 'chat_start', raw: 'hello' },
    ];
    const next: TimelineEntry = { ts: 1_002_000, type: 'chat_start', raw: 'hello' };
    const result = deduplicateEntry(next, existing);
    expect(result.action).toBe('skip');
  });
});

// ============================================================
// timelineIconKey
// ============================================================
describe('timelineIconKey', () => {
  it('maps task entries to "task"', () => {
    expect(timelineIconKey({ type: 'task_start' })).toBe('task');
    expect(timelineIconKey({ type: 'task_end' })).toBe('task');
  });

  it('maps tool_request status to success/error/awaiting', () => {
    expect(timelineIconKey({ type: 'tool_request', status: 'approved' })).toBe('success');
    expect(timelineIconKey({ type: 'tool_request', status: 'denied' })).toBe('error');
    expect(timelineIconKey({ type: 'tool_request', status: 'pending' })).toBe('awaiting');
    expect(timelineIconKey({ type: 'tool_request' })).toBe('awaiting');
  });

  it('chat_start in flight is "running"; chat_end is "success"', () => {
    expect(timelineIconKey({ type: 'chat_start' })).toBe('running');
    expect(timelineIconKey({ type: 'chat_end' })).toBe('success');
    expect(timelineIconKey({ type: 'chat_response' })).toBe('success');
  });

  it('error → error; user_action → user; memory_recall → memory', () => {
    expect(timelineIconKey({ type: 'error' })).toBe('error');
    expect(timelineIconKey({ type: 'user_action' })).toBe('user');
    expect(timelineIconKey({ type: 'memory_recall' })).toBe('memory');
  });

  it('every key has an e-ink glyph of constant 4-char width', () => {
    for (const glyph of Object.values(EINK_ICON_GLYPHS)) {
      expect(glyph.length).toBe(4);
    }
  });
});

// ============================================================
// parseTimelineMarkdown — parity targets for the Apple/Android ports
// ============================================================
describe('parseTimelineMarkdown', () => {
  it('returns single text line for plain text', () => {
    expect(parseTimelineMarkdown('hello')).toEqual([{ kind: 'text', content: 'hello' }]);
  });

  it('parses headings 1-3 with required space', () => {
    expect(parseTimelineMarkdown('# Title')).toEqual([
      { kind: 'heading', level: 1, content: 'Title' },
    ]);
    expect(parseTimelineMarkdown('### Section')).toEqual([
      { kind: 'heading', level: 3, content: 'Section' },
    ]);
    // 4 hashes is text
    expect(parseTimelineMarkdown('#### too deep')[0].kind).toBe('text');
    // missing space is text
    expect(parseTimelineMarkdown('#NoSpace')[0].kind).toBe('text');
  });

  it('parses bullets and numbered lists', () => {
    expect(parseTimelineMarkdown('- item')).toEqual([{ kind: 'bullet', content: 'item' }]);
    expect(parseTimelineMarkdown('* star')).toEqual([{ kind: 'bullet', content: 'star' }]);
    expect(parseTimelineMarkdown('1. first\n2) second')).toEqual([
      { kind: 'numbered', marker: '1.', content: 'first' },
      { kind: 'numbered', marker: '2)', content: 'second' },
    ]);
  });

  it('handles code fence — verbatim lines, not interpreted', () => {
    const out = parseTimelineMarkdown('text\n```\n# not heading\n- not bullet\n```\nback');
    expect(out).toEqual([
      { kind: 'text', content: 'text' },
      { kind: 'code', content: '# not heading' },
      { kind: 'code', content: '- not bullet' },
      { kind: 'text', content: 'back' },
    ]);
  });

  it('blank line → blank kind', () => {
    expect(parseTimelineMarkdown('a\n\nb')).toEqual([
      { kind: 'text', content: 'a' },
      { kind: 'blank' },
      { kind: 'text', content: 'b' },
    ]);
  });

  it('quote lines parse', () => {
    expect(parseTimelineMarkdown('> quoted')).toEqual([{ kind: 'quote', content: 'quoted' }]);
  });
});
