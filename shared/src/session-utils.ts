/**
 * session-utils.ts — Shared session ordering, numbering, and tier grouping.
 * Single source of truth used by: TUI renderer, Plugin, Android, Apple, MenuBarExtra.
 */

// ===== State Ranking =====

/**
 * Rank agent states by priority (lower = higher priority).
 * processing=0, awaiting=1, idle=2, disconnected=3, unknown=4.
 */
export function stateRank(state: string | undefined): number {
  switch (state) {
    case 'processing': return 0;
    case 'awaiting_permission':
    case 'awaiting_option':
    case 'awaiting_diff': return 1;
    case 'idle': return 2;
    case 'disconnected': return 3;
    default: return 4;
  }
}

// ===== Session Tier =====

export type SessionTier = 'attention' | 'active' | 'idle';

export function sessionTier(state: string | undefined): SessionTier {
  switch (state) {
    case 'awaiting_permission':
    case 'awaiting_option':
    case 'awaiting_diff':
      return 'attention';
    case 'processing':
      return 'active';
    default:
      return 'idle';
  }
}

// ===== Agent Type Ranking (stable ordering by agent kind) =====

/**
 * Rank agent types for stable ordering.
 * openclaw=0 (always first), claude-code=1, codex-cli=2, opencode=3, others=4.
 */
export function agentTypeRank(agentType: string | undefined): number {
  switch (agentType) {
    case 'openclaw': return 0;
    case 'claude-code': return 1;
    case 'codex-cli': return 2;
    case 'opencode': return 3;
    default: return 4;
  }
}

// ===== Sorting =====

/**
 * Sort sessions with stable ordering that does NOT jump on state changes.
 *
 * Order: agentType (openclaw first → claude-code → codex → opencode)
 *   → projectName alphabetically
 *   → startedAt ascending (oldest first) for stability
 *   → id as final tiebreaker
 *
 * Returns a new array (never mutates input).
 */
export function sortSessions<T extends { state?: string; projectName?: string; agentType?: string; startedAt?: string; id?: string }>(sessions: T[]): T[] {
  return [...sessions].sort((a, b) => {
    // 1. Agent type group (openclaw first, then by agent kind)
    const typeRank = agentTypeRank(a.agentType) - agentTypeRank(b.agentType);
    if (typeRank !== 0) return typeRank;

    // 2. Project name alphabetically (case-insensitive — must match Swift
    // DashboardDataRules.sortSessionPayloads' localizedCaseInsensitiveCompare
    // and Android EinkAgentColumn / SessionListPanel sort, otherwise mixed-case
    // project names render in different order on Stream Deck vs. Apple/Android.)
    const nameCompare = (a.projectName || '').localeCompare(b.projectName || '', undefined, { sensitivity: 'base' });
    if (nameCompare !== 0) return nameCompare;

    // 3. Start time ascending (oldest first = stable position)
    if (a.startedAt && b.startedAt) {
      const diff = new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();
      if (diff !== 0) return diff;
    }

    // 4. Session ID as final tiebreaker
    return (a.id || '').localeCompare(b.id || '');
  });
}

// ===== Display Name Assignment =====

export interface SessionDisplayInfo {
  /** Original session (unmodified) */
  session: { id: string; projectName: string; agentType?: string; state?: string; [key: string]: unknown };
  /** Display name with optional #N suffix */
  displayName: string;
  /** Session tier for UI grouping */
  tier: SessionTier;
}

/**
 * Assign display names with #N suffixes for duplicate (projectName, agentType) tuples.
 * Input is NOT mutated. Returns new display info objects.
 *
 * @param sessions - Already-sorted sessions array
 */
export function assignDisplayNames<T extends { id: string; projectName: string; agentType?: string; state?: string }>(
  sessions: T[],
): (SessionDisplayInfo & { session: T })[] {
  // Count occurrences of each (projectName, agentType) pair
  const counts = new Map<string, number>();
  for (const s of sessions) {
    const key = `${s.projectName}:${s.agentType || ''}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  // Assign sequential numbers
  const seq = new Map<string, number>();
  return sessions.map(s => {
    const key = `${s.projectName}:${s.agentType || ''}`;
    const n = (seq.get(key) || 0) + 1;
    seq.set(key, n);
    const needsSuffix = (counts.get(key) || 1) > 1;
    const displayName = needsSuffix ? `${s.projectName} #${n}` : s.projectName;
    return {
      session: s,
      displayName,
      tier: sessionTier(s.state),
    };
  });
}
