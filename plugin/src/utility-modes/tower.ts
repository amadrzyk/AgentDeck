/**
 * Control Tower utility mode — condensed session overview on encoder LCD.
 * Rotate: cycle through sessions. Push: focus the selected session.
 * Overview page shows attention/active/idle counts.
 */
import type { UtilityMode, RefreshCallback } from './types.js';

const TAG = 'Tower';

export interface TowerSessionInfo {
  sessionId: string;
  projectName: string;
  agentType: string;
  state: string;
  modelName?: string;
}

let sessions: TowerSessionInfo[] = [];
let daemonConnected = false;
let onRefresh: RefreshCallback | null = null;

/** Called from plugin.ts when sessions_list event arrives */
export function updateTowerSessions(list: TowerSessionInfo[], connected: boolean): void {
  sessions = list;
  daemonConnected = connected;
  onRefresh?.();
}

export function createTowerMode(refresh: RefreshCallback): UtilityMode {
  // Page 0 = overview, 1+ = individual sessions
  let page = 0;
  onRefresh = refresh;

  function attentionCount(): number {
    return sessions.filter(s =>
      s.state === 'awaiting_permission' || s.state === 'awaiting_input' || s.state === 'diff_review',
    ).length;
  }

  function activeCount(): number {
    return sessions.filter(s => s.state === 'processing' || s.state === 'thinking').length;
  }

  function idleCount(): number {
    return sessions.filter(s =>
      s.state === 'idle' || s.state === 'disconnected' || s.state === 'connected',
    ).length;
  }

  return {
    id: 'tower',
    label: 'TOWER',

    async onActivate() {
      page = 0;
      refresh();
    },

    async onResume() {
      refresh();
    },

    async onRotate(ticks) {
      if (sessions.length === 0) return;
      const maxPage = sessions.length; // 0=overview, 1..N=sessions
      page = ((page + ticks) % (maxPage + 1) + (maxPage + 1)) % (maxPage + 1);
      refresh();
    },

    async onPush() {
      // Could send focus command; for now just return to overview
      page = 0;
      refresh();
    },

    getFeedback() {
      if (!daemonConnected) {
        return {
          title: 'TOWER',
          icon: '\uD83D\uDFE5', // 🟥
          value: 'Offline',
          indicator: { value: 0, bar_fill_c: '#ef4444' },
        };
      }

      if (sessions.length === 0) {
        return {
          title: 'TOWER',
          icon: '\uD83D\uDFE2', // 🟢
          value: 'No sessions',
          indicator: { value: 100, bar_fill_c: '#22c55e' },
        };
      }

      // Overview page
      if (page === 0) {
        const attn = attentionCount();
        const active = activeCount();
        const idle = idleCount();
        const total = sessions.length;
        const barColor = attn > 0 ? '#f59e0b' : active > 0 ? '#22c55e' : '#64748b';
        const barPct = total > 0 ? Math.round((active / total) * 100) : 0;

        const parts: string[] = [];
        if (attn > 0) parts.push(`${attn}\u26A0`);   // ⚠
        if (active > 0) parts.push(`${active}\u25B6`); // ▶
        if (idle > 0) parts.push(`${idle}\u23F8`);     // ⏸

        return {
          title: `TOWER ${total}`,
          icon: '\uD83D\uDDD4', // 🗔
          value: parts.join(' '),
          indicator: { value: barPct, bar_fill_c: barColor },
        };
      }

      // Session detail page
      const idx = page - 1;
      if (idx >= sessions.length) {
        page = 0;
        return this.getFeedback();
      }

      const s = sessions[idx];
      const stateIcon = s.state.includes('await') ? '\u26A0'  // ⚠
        : s.state === 'processing' || s.state === 'thinking' ? '\u25B6'  // ▶
        : '\u23F8';  // ⏸
      const stateColor = s.state.includes('await') ? '#f59e0b'
        : s.state === 'processing' || s.state === 'thinking' ? '#22c55e'
        : '#64748b';

      const agentShort = s.agentType === 'claude-code' ? 'CC'
        : s.agentType === 'openclaw' ? 'OpenClaw'
        : s.agentType === 'opencode' ? 'OpenCode'
        : s.agentType === 'codex' ? 'Codex'
        : s.agentType?.slice(0, 6) ?? '';

      const proj = s.projectName?.split('/').pop()?.slice(0, 12) ?? '';

      return {
        title: `${stateIcon} ${agentShort}`,
        icon: stateIcon,
        value: proj || s.sessionId.slice(0, 8),
        indicator: { value: s.state === 'processing' ? 80 : s.state.includes('await') ? 50 : 20, bar_fill_c: stateColor },
      };
    },
  };
}
