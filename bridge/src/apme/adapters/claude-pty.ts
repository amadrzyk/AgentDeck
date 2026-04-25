/**
 * Claude Code PTY parser → TelemetrySpan adapter.
 *
 * Two distinct emission points:
 *
 *  1. **Parser events** (`tool_start` / `tool_end` / `spinner_start` / `idle` /
 *     `spinner_stop`) — fired by the BridgeCore output parser as terminal text
 *     scrolls. We map these to lifecycle spans (`tool_call` / `tool_result`)
 *     plus generic `raw_step` for state transitions. This is the **fallback**
 *     when Claude Code 2.1+ hooks are flaky (memory: feedback_apme_stop_hook).
 *
 *  2. **Extracted response text** — `spinner_stop` triggers a 500 ms timeout
 *     in the bridge, the PTY ringbuffer tail is scanned for the `⏺` marker,
 *     and the cleaned text is fed to `claudePtyResponseToSpan` to emit a
 *     `turn_response` span.
 *
 * Splitting these into two functions keeps each call site free to do its own
 * timing / extraction work without smuggling sentinels through `data`.
 */

import { randomUUID } from 'crypto';
import type {
  AdapterContext,
  TelemetrySpan,
  TelemetryAttributes,
} from '@agentdeck/shared';
import { spanNameForKind } from '@agentdeck/shared';

const PARSER_TO_KIND: Record<string, TelemetrySpan['kind'] | undefined> = {
  tool_start: 'tool_call',
  tool_end: 'tool_result',
  spinner_start: 'raw_step',
  spinner_stop: 'raw_step',
  idle: 'raw_step',
};

export function claudePtyParserEventToSpans(
  ctx: AdapterContext,
  event: string,
  data: Record<string, unknown> = {},
): TelemetrySpan[] {
  const kind = PARSER_TO_KIND[event];
  if (!kind) return [];
  const ts = Date.now();
  const toolName = typeof data.tool_name === 'string' ? data.tool_name : undefined;
  const base: TelemetryAttributes = {
    'agentdeck.agent_type': ctx.agentType,
    ...(ctx.cwd ? { 'agentdeck.cwd': ctx.cwd } : {}),
  };
  let attributes: TelemetryAttributes;
  if (kind === 'tool_call' || kind === 'tool_result') {
    attributes = {
      ...base,
      ...(toolName ? { 'gen_ai.tool.name': toolName, 'agentdeck.tool_name': toolName } : {}),
      'agentdeck.raw_payload': data,
      // Map the parser event back to the legacy hook event name so the
      // collector's existing dispatch (PreToolUse/PostToolUse) keeps firing.
      'agentdeck.raw_event': event === 'tool_start' ? 'PreToolUse' : 'PostToolUse',
    };
  } else {
    attributes = {
      ...base,
      'agentdeck.raw_event': event === 'spinner_start' ? 'processing' : event,
      'agentdeck.raw_payload': data,
    };
  }
  return [{
    traceId: ctx.traceId,
    spanId: randomUUID(),
    parentSpanId: ctx.activeTurnId,
    name: spanNameForKind(kind),
    kind,
    ts,
    attributes,
  }];
}

/** Extracted PTY response text → `turn_response` span. The caller is responsible
 *  for the actual extraction (PTY ringbuffer + `⏺` marker + cleaning) since
 *  that logic is intertwined with `BridgeCore` timing. */
export function claudePtyResponseToSpan(
  ctx: AdapterContext,
  response: string,
  options: { fallbackToLastClosed?: boolean } = {},
): TelemetrySpan | null {
  if (!response || response.trim().length < 2) return null;
  return {
    traceId: ctx.traceId,
    spanId: randomUUID(),
    parentSpanId: ctx.activeTurnId,
    name: spanNameForKind('turn_response'),
    kind: 'turn_response',
    ts: Date.now(),
    attributes: {
      'agentdeck.agent_type': ctx.agentType,
      ...(ctx.cwd ? { 'agentdeck.cwd': ctx.cwd } : {}),
      'agentdeck.response_text': response,
      ...(options.fallbackToLastClosed ? { 'agentdeck.fallback_to_last_closed': true } : {}),
    },
  };
}
