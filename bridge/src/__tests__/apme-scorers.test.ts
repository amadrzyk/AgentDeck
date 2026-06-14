import { describe, it, expect } from 'vitest';
import { TrajectoryQualityScorer, ToolEfficiencyScorer, runSampleScorers } from '../apme/scorers/index.js';
import type { SessionSample, TrajectoryEvent } from '@agentdeck/shared';

function sampleWith(events: TrajectoryEvent[]): SessionSample {
  return {
    id: 't', runId: 'r', sessionId: 's', agentType: 'claude-code', index: 0,
    boundarySignal: 'session_end', startedAt: 0, endedAt: 1,
    model: { modelId: 'claude-opus-4-8' }, events,
    cost: { inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: 0 },
  };
}

const tool = (name: string, input: unknown, status: 'success' | 'error' = 'success'): TrajectoryEvent =>
  ({ kind: 'tool', ts: 0, turnIndex: 0, name, input, status });

describe('TrajectoryQualityScorer', () => {
  it('penalizes consecutive identical tool calls (churn)', () => {
    const churny = sampleWith([tool('Bash', { cmd: 'ls' }), tool('Bash', { cmd: 'ls' }), tool('Bash', { cmd: 'ls' })]);
    const clean = sampleWith([tool('Read', { f: 'a' }), tool('Edit', { f: 'a' }), tool('Bash', { cmd: 'test' })]);
    const churnScore = TrajectoryQualityScorer.score(churny)[0].score;
    const cleanScore = TrajectoryQualityScorer.score(clean)[0].score;
    expect(cleanScore).toBeGreaterThan(churnScore);
    expect(cleanScore).toBe(1);
  });

  it('penalizes tool errors', () => {
    const errs = sampleWith([tool('Bash', { c: '1' }, 'error'), tool('Bash', { c: '2' }, 'error')]);
    expect(TrajectoryQualityScorer.score(errs)[0].score).toBeLessThan(0.6);
  });

  it('does not apply with fewer than 2 tools', () => {
    expect(TrajectoryQualityScorer.appliesTo(sampleWith([tool('Read', {})]))).toBe(false);
  });
});

describe('ToolEfficiencyScorer', () => {
  it('is the success rate of resolved tools', () => {
    const s = sampleWith([tool('Read', {}, 'success'), tool('Bash', {}, 'error'), tool('Edit', {}, 'success'), tool('Read', { x: 1 }, 'success')]);
    expect(ToolEfficiencyScorer.score(s)[0].score).toBeCloseTo(0.75, 2);
  });
});

describe('runSampleScorers', () => {
  it('runs only applicable scorers and tags layer/scorer', () => {
    const s = sampleWith([tool('Read', {}), tool('Edit', {})]);
    const results = runSampleScorers(s);
    expect(results.length).toBe(2);
    expect(results.every((r) => r.layer === 'trajectory')).toBe(true);
    expect(results.map((r) => r.metric).sort()).toEqual(['tool_efficiency', 'trajectory_quality']);
  });

  it('returns nothing for a toolless conversation sample', () => {
    const s = sampleWith([{ kind: 'user_message', ts: 0, turnIndex: 0, text: 'hi' }, { kind: 'assistant_message', ts: 1, turnIndex: 0, text: 'hello', responseKind: 'text' }]);
    expect(runSampleScorers(s).length).toBe(0);
  });
});
