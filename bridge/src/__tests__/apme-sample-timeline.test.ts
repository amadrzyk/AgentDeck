import { describe, it, expect } from 'vitest';
import { sampleEventToTimeline } from '../apme/sample-to-timeline.js';
import { openclawSessionToolToSpans, openclawSessionMessageToSpans } from '../apme/adapters/openclaw-hook.js';
import type { ApmeSampleEventRow, AdapterContext } from '@agentdeck/shared';

const header = { sessionId: 's', runId: 'r', taskId: 't', agentType: 'openclaw' as const, projectName: 'demo' };

function row(partial: Partial<ApmeSampleEventRow> & { kind: ApmeSampleEventRow['kind'] }): ApmeSampleEventRow {
  return { taskId: 't', runId: 'r', seq: 0, ts: 1000, turnIndex: 0, ...partial };
}

describe('sampleEventToTimeline projection', () => {
  it('projects user_message → chat_start', () => {
    const e = sampleEventToTimeline(row({ kind: 'user_message', payload: JSON.stringify({ text: 'fix bug' }) }), header);
    expect(e).toMatchObject({ type: 'chat_start', raw: 'fix bug', sessionId: 's', taskId: 't' });
  });

  it('projects a text assistant_message → chat_response but skips tool_only', () => {
    const text = sampleEventToTimeline(row({ kind: 'assistant_message', payload: JSON.stringify({ text: 'done', responseKind: 'text' }) }), header);
    expect(text).toMatchObject({ type: 'chat_response', raw: 'done' });
    const toolOnly = sampleEventToTimeline(row({ kind: 'assistant_message', payload: JSON.stringify({ text: '', responseKind: 'tool_only' }) }), header);
    expect(toolOnly).toBeNull();
  });

  it('projects tool → tool_resolved with status mapping + input summary', () => {
    const ok = sampleEventToTimeline(row({ kind: 'tool', toolName: 'Bash', toolStatus: 'success', payload: JSON.stringify({ input: { command: 'pnpm test' } }) }), header);
    expect(ok).toMatchObject({ type: 'tool_resolved', raw: 'Bash · pnpm test', status: 'approved' });
    const err = sampleEventToTimeline(row({ kind: 'tool', toolName: 'Edit', toolStatus: 'error', toolError: 'boom' }), header);
    expect(err).toMatchObject({ type: 'tool_resolved', status: 'denied', detail: 'boom' });
  });

  it('skips model and state events (no standalone row)', () => {
    expect(sampleEventToTimeline(row({ kind: 'model', model: 'claude-opus-4-8' }), header)).toBeNull();
    expect(sampleEventToTimeline(row({ kind: 'state', payload: JSON.stringify({ to: 'processing' }) }), header)).toBeNull();
  });
});

describe('OpenClaw session.tool / session.message → spans (previously dropped)', () => {
  const ctx: AdapterContext = { agentType: 'openclaw', sessionId: 'sess', traceId: 'trace', activeTurnId: undefined, cwd: '/tmp/p' };

  it('maps a running tool to a tool_call span carrying input', () => {
    const spans = openclawSessionToolToSpans(ctx, { name: 'Bash', status: 'running', input: { cmd: 'ls' } });
    expect(spans.length).toBe(1);
    expect(spans[0].kind).toBe('tool_call');
    expect(spans[0].attributes['agentdeck.tool_name']).toBe('Bash');
  });

  it('maps a completed tool to a tool_result span carrying output', () => {
    const spans = openclawSessionToolToSpans(ctx, { name: 'Bash', status: 'success', output: 'ok' });
    expect(spans[0].kind).toBe('tool_result');
  });

  it('maps a user message to turn_start and assistant to turn_response', () => {
    const u = openclawSessionMessageToSpans(ctx, { role: 'user', text: 'hello' });
    expect(u[0].kind).toBe('turn_start');
    expect(u[0].attributes['agentdeck.prompt_text']).toBe('hello');
    const a = openclawSessionMessageToSpans(ctx, { role: 'assistant', text: 'hi back' });
    expect(a[0].kind).toBe('turn_response');
  });

  it('drops empty/blank messages and nameless tools', () => {
    expect(openclawSessionMessageToSpans(ctx, { role: 'user', text: '   ' })).toEqual([]);
    expect(openclawSessionToolToSpans(ctx, { status: 'running' })).toEqual([]);
  });
});
