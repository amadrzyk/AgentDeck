import { describe, it, expect } from 'vitest';
import { buildSessionDeck } from '../d200h-layout.js';

// Locks the list-view USAGE behaviour of the shared session deck (D200H /
// Ulanzi): with `showUsage`, the last two positions are pinned to 5H/7D quota
// gauges, sessions/paging reflow into the remaining keys, and the tiles refresh
// usage on press. Guards the surface that replaces the missing encoder LCD.

const POS = ['0_0', '1_0', '2_0', '3_0', '4_0', '0_1', '1_1', '2_1', '3_1', '4_1', '0_2', '1_2', '2_2', '3_2', '4_2'];

const sortedPos = [...POS].sort((a, b) => {
  const [ac, ar] = a.split('_').map(Number);
  const [bc, br] = b.split('_').map(Number);
  return ar !== br ? ar - br : ac - bc;
});
const LAST = sortedPos[sortedPos.length - 1];   // 4_2
const PREV = sortedPos[sortedPos.length - 2];   // 3_2
const NEXT_SLOT = sortedPos[sortedPos.length - 3]; // 2_2

const mkSessions = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `s${i}`, alive: true, port: 9121 + i, projectName: `p${i}`,
    agentType: 'claude-code', state: 'idle',
  }));

const baseState = (sessions: number, over: Record<string, unknown> = {}) => ({
  state: 'IDLE',
  allSessions: mkSessions(sessions),
  fiveHourPercent: 42,
  sevenDayPercent: 17,
  usageKnown: true,
  ...over,
});

describe('buildSessionDeck list-view usage tiles', () => {
  it('pins 5H/7D to the last two positions and wires them to query_usage', () => {
    const deck = buildSessionDeck(baseState(3), { mode: 'list', showUsage: true }, POS);
    const prev = deck.get(PREV)!;
    const last = deck.get(LAST)!;
    expect(prev.svg).toContain('5H');
    // Water-tank headline is REMAINING quota (100 − used). 42% used → 58% left.
    expect(prev.svg).toContain('58%');
    expect(last.svg).toContain('7D');
    expect(last.svg).toContain('83%'); // 17% used → 83% left
    expect(prev.action).toEqual({ kind: 'command', command: { type: 'query_usage' } });
    expect(last.action).toEqual({ kind: 'command', command: { type: 'query_usage' } });
  });

  it('does not reserve usage slots when showUsage is off (regression: full grid)', () => {
    const deck = buildSessionDeck(baseState(3), { mode: 'list' }, POS);
    const last = deck.get(LAST)!;
    expect(last.svg).not.toContain('7D');
    // No query_usage command anywhere.
    const cmds = [...deck.values()].map((c) => c.action).filter((a) => a?.kind === 'command');
    expect(cmds).toHaveLength(0);
  });

  it('draws "—" when usage is unknown', () => {
    const deck = buildSessionDeck(baseState(1, { usageKnown: false, fiveHourPercent: 0, sevenDayPercent: 0 }),
      { mode: 'list', showUsage: true }, POS);
    expect(deck.get(PREV)!.svg).toContain('—');
    expect(deck.get(LAST)!.svg).toContain('—');
  });

  it('fits sessions into the 13 non-usage keys without paging', () => {
    const deck = buildSessionDeck(baseState(13), { mode: 'list', showUsage: true }, POS);
    const opens = [...deck.values()].filter((c) => c.action?.kind === 'open');
    expect(opens).toHaveLength(13);
    // No NEXT page button — everything fits.
    const pages = [...deck.values()].filter((c) => c.action?.kind === 'page');
    expect(pages).toHaveLength(0);
    // Usage still pinned.
    expect(deck.get(LAST)!.svg).toContain('7D');
  });

  it('paginates when sessions exceed capacity, NEXT→ sits just before the usage tiles', () => {
    // 15 sessions, 15 keys, 2 reserved for usage → cap 13; overflow → 12/page + NEXT.
    const deck = buildSessionDeck(baseState(15), { mode: 'list', showUsage: true }, POS);
    const next = deck.get(NEXT_SLOT)!;
    expect(next.action).toEqual({ kind: 'page', delta: 1 });
    expect(next.svg).toContain('1/2'); // page indicator
    // 12 sessions on page 1.
    const opens = [...deck.values()].filter((c) => c.action?.kind === 'open');
    expect(opens).toHaveLength(12);
    // Usage tiles still present on the paginated page.
    expect(deck.get(PREV)!.svg).toContain('5H');
    expect(deck.get(LAST)!.svg).toContain('7D');
  });

  it('page 2 keeps the usage tiles pinned and shows the remainder', () => {
    const deck = buildSessionDeck(baseState(15), { mode: 'list', page: 1, showUsage: true }, POS);
    const opens = [...deck.values()].filter((c) => c.action?.kind === 'open');
    expect(opens).toHaveLength(3); // 15 - 12
    expect(deck.get(LAST)!.svg).toContain('7D');
  });

  it('shows usage even with zero sessions', () => {
    const deck = buildSessionDeck(baseState(0), { mode: 'list', showUsage: true }, POS);
    expect(deck.get(PREV)!.svg).toContain('5H');
    expect(deck.get(LAST)!.svg).toContain('7D');
  });

  it('appends Codex 5H/7D tiles when codexRateLimits is present (each datum)', () => {
    const codex = {
      codexRateLimits: {
        primary: { usedPercent: 30, windowMinutes: 300, resetsAt: undefined },
        secondary: { usedPercent: 10, windowMinutes: 10080, resetsAt: undefined },
        planType: 'plus',
      },
    };
    const deck = buildSessionDeck(baseState(2, codex), { mode: 'list', showUsage: true }, POS);
    // 4 trailing keys reserved: Claude 5H/7D + Codex 5H/7D, in placement order.
    const tail = sortedPos.slice(sortedPos.length - 4);
    expect(deck.get(tail[0])!.svg).toContain('5H');   // Claude 5H
    expect(deck.get(tail[1])!.svg).toContain('7D');   // Claude 7D
    expect(deck.get(tail[2])!.svg).toContain('CX 5H'); // Codex primary → 70% left
    expect(deck.get(tail[2])!.svg).toContain('70%');
    expect(deck.get(tail[3])!.svg).toContain('CX 7D'); // Codex secondary → 90% left
    expect(deck.get(tail[3])!.svg).toContain('90%');
    // Codex water hue is the brand blue, distinct from Claude terracotta.
    expect(deck.get(tail[2])!.svg).toContain('#6166E0');
    expect(deck.get(tail[0])!.svg).toContain('#C07058');
  });

  it('renders only the Codex window whose datum exists', () => {
    const onlyPrimary = {
      codexRateLimits: { primary: { usedPercent: 25, windowMinutes: 300 } },
    };
    const deck = buildSessionDeck(baseState(2, onlyPrimary), { mode: 'list', showUsage: true }, POS);
    const tail = sortedPos.slice(sortedPos.length - 3);
    expect(tail.map((p) => deck.get(p)!.svg).some((s) => s.includes('CX 5H'))).toBe(true);
    expect(tail.map((p) => deck.get(p)!.svg).some((s) => s.includes('CX 7D'))).toBe(false);
  });

  it('still reserves usage on a tiny deck (few keys), keeping >=1 session slot', () => {
    // Only 3 keys placed: old `slots.length >= 6` gate dropped ALL usage here.
    const tiny = ['0_0', '1_0', '2_0'];
    const deck = buildSessionDeck(baseState(1), { mode: 'list', showUsage: true }, tiny);
    // 2 trailing keys = Claude 5H/7D; first key stays for the session.
    expect(deck.get('1_0')!.svg).toContain('5H');
    expect(deck.get('2_0')!.svg).toContain('7D');
    const opens = [...deck.values()].filter((c) => c.action?.kind === 'open');
    expect(opens.length).toBeGreaterThanOrEqual(1);
  });

  it('never starves the only key on a 1-key deck (usage yields to the session)', () => {
    const deck = buildSessionDeck(baseState(1), { mode: 'list', showUsage: true }, ['0_0']);
    // maxReserve = 0 → no usage tile; the single key shows the session.
    expect(deck.get('0_0')!.action?.kind).toBe('open');
  });
});
