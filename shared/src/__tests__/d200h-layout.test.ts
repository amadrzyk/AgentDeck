import { describe, it, expect } from 'vitest';
import { buildSessionDeck } from '../d200h-layout.js';

const positions = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `${i % 5}_${Math.floor(i / 5)}`);

describe('buildSessionDeck — daemon offline', () => {
  it('renders the OFFLINE hero on the center key for a DISCONNECTED state', () => {
    const pos = positions(13);
    const deck = buildSessionDeck({ state: 'DISCONNECTED', allSessions: [] }, { mode: 'list' }, pos);

    const heroCells = [...deck.values()].filter((c) => c.svg.includes('OFFLINE'));
    expect(heroCells).toHaveLength(1);

    // Hero sits at the center index of the sorted positions, not the corner.
    const sorted = [...deck.keys()].sort((a, b) => {
      const [ac, ar] = a.split('_').map(Number);
      const [bc, br] = b.split('_').map(Number);
      return ar !== br ? ar - br : ac - bc;
    });
    const heroPos = [...deck.entries()].find(([, c]) => c.svg.includes('OFFLINE'))![0];
    expect(heroPos).toBe(sorted[Math.floor(sorted.length / 2)]);
  });

  it('makes EVERY key launch the companion app while offline', () => {
    const deck = buildSessionDeck({ state: 'DISCONNECTED', allSessions: [] }, { mode: 'list' }, positions(14));
    expect(deck.size).toBe(14);
    for (const cell of deck.values()) {
      expect(cell.action).toEqual({ kind: 'launch' });
    }
  });

  it('does not show OFFLINE / launch when the daemon is connected', () => {
    const deck = buildSessionDeck({ state: 'IDLE', allSessions: [] }, { mode: 'list' }, positions(5));
    for (const cell of deck.values()) {
      expect(cell.svg).not.toContain('OFFLINE');
      expect(cell.action).not.toEqual({ kind: 'launch' });
    }
  });
});
