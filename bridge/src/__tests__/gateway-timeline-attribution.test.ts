import { describe, it, expect } from 'vitest';
import type { TimelineEntry } from '@agentdeck/shared';
import { enrichGatewayTimelineEntry } from '../daemon-server.js';

// Regression: OpenClaw Gateway cron activity was landing in the timeline with
// agentType=null and projectName="AgentDeck" (the daemon's hardcoded fallback),
// so it never rendered as OpenClaw and polluted the AgentDeck project group.
// The adapter emits bare entries; the daemon must stamp the OpenClaw origin
// before the BridgeCore attributor applies its own defaults.
describe('enrichGatewayTimelineEntry', () => {
  it('stamps agentType/projectName onto a bare OpenClaw adapter entry', () => {
    const bare: TimelineEntry = {
      ts: 1781136020315,
      type: 'chat_start',
      raw: '자동 작업',
      automated: true,
    };
    const out = enrichGatewayTimelineEntry(bare);
    expect(out.agentType).toBe('openclaw');
    expect(out.projectName).toBe('OpenClaw');
    // Untouched fields survive.
    expect(out.automated).toBe(true);
    expect(out.raw).toBe('자동 작업');
    expect(out.type).toBe('chat_start');
  });

  it('preserves agentType/projectName the adapter already set', () => {
    const tagged: TimelineEntry = {
      ts: 1781016605821,
      type: 'model_call',
      raw: '[cron:abc] daily review',
      agentType: 'openclaw',
      projectName: 'OpenClaw',
    };
    const out = enrichGatewayTimelineEntry(tagged);
    expect(out.agentType).toBe('openclaw');
    expect(out.projectName).toBe('OpenClaw');
  });

  it('does not mutate the input entry', () => {
    const bare: TimelineEntry = { ts: 1, type: 'chat_end', raw: 'x' };
    enrichGatewayTimelineEntry(bare);
    expect(bare.agentType).toBeUndefined();
    expect(bare.projectName).toBeUndefined();
  });
});
