import { describe, it, expect } from 'vitest';
import { BridgeTimelineStore } from '../timeline-store.js';
import type { TimelineEntry } from '@agentdeck/shared';

// Phase 6 — timeline projection cutover. Suppression is OFF by default (zero
// behavior change); when ON, locally-emitted chat/tool rows are dropped while
// projected (bypass) + relayed (bypass) + task hierarchy rows pass through.

function entry(type: TimelineEntry['type'], raw: string, ts = 1000): TimelineEntry {
  return { ts, type, raw };
}

describe('BridgeTimelineStore projection cutover', () => {
  it('default OFF: every entry passes (no behavior change)', () => {
    const store = new BridgeTimelineStore();
    const seen: string[] = [];
    store.onEntry((e) => seen.push(e.type));
    store.addEntry(entry('chat_start', 'hi', 1));
    store.addEntry(entry('tool_resolved', 'Edit', 2));
    store.addEntry(entry('chat_response', 'done', 3));
    expect(seen).toEqual(['chat_start', 'tool_resolved', 'chat_response']);
  });

  it('ON: drops locally-emitted chat/tool rows', () => {
    const store = new BridgeTimelineStore();
    store.setSuppressLocalChatTool(true);
    const seen: string[] = [];
    store.onEntry((e) => seen.push(e.type));
    store.addEntry(entry('chat_start', 'hi', 1));
    store.addEntry(entry('tool_request', 'Bash', 2));
    store.addEntry(entry('chat_end', 'Completed', 3));
    expect(seen).toEqual([]);
  });

  it('ON: projected (bypass) chat/tool rows pass through', () => {
    const store = new BridgeTimelineStore();
    store.setSuppressLocalChatTool(true);
    const seen: string[] = [];
    store.onEntry((e) => seen.push(e.type));
    store.addEntry(entry('chat_start', 'hi', 1), { bypassSuppression: true });
    store.addEntry(entry('tool_resolved', 'Edit', 2), { bypassSuppression: true });
    expect(seen).toEqual(['chat_start', 'tool_resolved']);
  });

  it('ON: task hierarchy + error rows are never suppressed', () => {
    const store = new BridgeTimelineStore();
    store.setSuppressLocalChatTool(true);
    const seen: string[] = [];
    store.onEntry((e) => seen.push(e.type));
    store.addEntry(entry('task_start', 'Task 1', 1));
    store.addEntry(entry('task_end', 'Session end · 5s', 2));
    store.addEntry(entry('error', 'boom', 3));
    expect(seen).toEqual(['task_start', 'task_end', 'error']);
  });
});
