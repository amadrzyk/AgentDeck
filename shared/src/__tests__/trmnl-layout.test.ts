import { describe, it, expect } from 'vitest';
import { renderTrmnlDashboard, TRMNL_WIDTH, TRMNL_HEIGHT } from '../trmnl-layout.js';

const NOW = new Date(2026, 5, 20, 14, 3, 0); // deterministic "14:03" stamp

const session = (id: string, agentType: string, state: string) => ({
  id,
  agentType,
  projectName: `proj-${id}`,
  modelName: 'claude-opus-4-8',
  state,
  alive: true,
  port: 9121,
});

describe('renderTrmnlDashboard', () => {
  it('produces a well-formed 800×480 SVG', () => {
    const svg = renderTrmnlDashboard({ state: 'IDLE', allSessions: [] }, { now: NOW });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain(`width="${TRMNL_WIDTH}"`);
    expect(svg).toContain(`height="${TRMNL_HEIGHT}"`);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    // A paper background rect must exist so the 1-bit threshold reads clean.
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('AgentDeck');
    expect(svg).toContain('14:03');
  });

  it('renders one row per session with agent label + status badge', () => {
    const svg = renderTrmnlDashboard(
      {
        state: 'PROCESSING',
        allSessions: [
          session('a', 'claude-code', 'processing'),
          session('b', 'codex-cli', 'awaiting_input'),
          session('c', 'opencode', 'idle'),
        ],
      },
      { now: NOW },
    );
    expect(svg).toContain('CLAUDE');
    expect(svg).toContain('CODEX');
    expect(svg).toContain('OPENCODE');
    expect(svg).toContain('WORKING');
    expect(svg).toContain('AWAITING');
    expect(svg).toContain('3 sessions · 1 working · 1 awaiting');
  });

  it('is monochrome — uses no color tokens beyond black/white', () => {
    const svg = renderTrmnlDashboard(
      { state: 'AWAITING_INPUT', allSessions: [session('a', 'claude-code', 'awaiting_input')] },
      { now: NOW },
    );
    // Every fill/stroke must be pure black or white (no #ef4444 etc.).
    const colors = [...svg.matchAll(/(?:fill|stroke)="(#[0-9a-fA-F]{3,6})"/g)].map((m) => m[1].toLowerCase());
    for (const c of colors) {
      expect(['#000', '#000000', '#fff', '#ffffff']).toContain(c);
    }
  });

  it('falls back to a single synthetic row when no sessions are present', () => {
    const svg = renderTrmnlDashboard(
      { state: 'IDLE', projectName: 'solo', modelName: 'gpt-5', agentType: 'codex-cli', allSessions: [] },
      { now: NOW },
    );
    expect(svg).toContain('CODEX');
    expect(svg).toContain('solo');
    expect(svg).toContain('1 session · 0 working · 0 awaiting');
  });

  it('shows an overflow note when sessions exceed the visible rows', () => {
    const many = Array.from({ length: 8 }, (_, i) => session(`s${i}`, 'claude-code', 'idle'));
    const svg = renderTrmnlDashboard({ state: 'IDLE', allSessions: many }, { now: NOW });
    expect(svg).toMatch(/\+\d+ more session/);
  });
});
