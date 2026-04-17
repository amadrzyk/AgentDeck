/**
 * APME eval utility mode — shows latest eval scores on encoder LCD.
 * Rotate: cycle through recent evals. Push: refresh from daemon.
 */
import type { UtilityMode, RefreshCallback } from './types.js';
import { BRIDGE_WS_PORT } from '@agentdeck/shared';
import { dlog, dwarn } from '../log.js';

const TAG = 'APME';

export interface ApmeEvalEntry {
  runId: string;
  category: string;
  overall: number;     // 0-100
  model: string;
  axes?: Record<string, number>;
  ts: number;
}

let recentEvals: ApmeEvalEntry[] = [];
let onRefresh: RefreshCallback | null = null;

/** Called from plugin.ts when an apme_eval / eval_result timeline event arrives */
export function pushApmeEval(entry: ApmeEvalEntry): void {
  recentEvals = [entry, ...recentEvals].slice(0, 20);
  onRefresh?.();
}

/** Called from plugin.ts to bulk-load scorecard data */
export function setApmeScorecard(entries: ApmeEvalEntry[]): void {
  recentEvals = entries.slice(0, 20);
  onRefresh?.();
}

export function createApmeMode(refresh: RefreshCallback): UtilityMode {
  let viewIndex = 0;
  onRefresh = refresh;

  async function fetchScorecard(): Promise<void> {
    try {
      const port = (globalThis as any).__daemonPort ?? BRIDGE_WS_PORT;
      const res = await fetch(`http://127.0.0.1:${port}/apme/runs?limit=20`);
      if (!res.ok) { dwarn(TAG, `fetch failed: ${res.status}`); return; }
      const data = await res.json() as any[];
      recentEvals = data.map(r => ({
        runId: r.id ?? r.runId ?? '',
        category: r.taskCategory ?? r.task_category ?? 'general',
        overall: Math.round((r.compositeScore ?? r.composite_score ?? 0) * 100),
        model: r.modelId ?? r.model_id ?? '',
        ts: r.endedAt ? new Date(r.endedAt).getTime() : Date.now(),
      })).slice(0, 20);
      viewIndex = 0;
      dlog(TAG, `Loaded ${recentEvals.length} evals`);
    } catch (err) {
      dwarn(TAG, `Fetch error: ${err}`);
    }
    refresh();
  }

  return {
    id: 'apme',
    label: 'APME',

    async onActivate() {
      await fetchScorecard();
    },

    async onResume() {
      refresh();
    },

    async onRotate(ticks) {
      if (recentEvals.length === 0) return;
      viewIndex = (viewIndex + ticks + recentEvals.length) % recentEvals.length;
      refresh();
    },

    async onPush() {
      await fetchScorecard();
    },

    getFeedback() {
      if (recentEvals.length === 0) {
        return {
          title: 'APME',
          icon: '\u2605',    // ★
          value: 'No evals',
          indicator: { value: 0, bar_fill_c: '#64748b' },
        };
      }

      const entry = recentEvals[viewIndex % recentEvals.length];
      const pct = entry.overall;
      const color = pct >= 70 ? '#4ade80' : pct >= 40 ? '#fbbf24' : '#f87171';
      const modelShort = entry.model.replace(/^claude-/, '').replace(/-\d+$/, '');

      return {
        title: `APME ${entry.category.slice(0, 8).toUpperCase()}`,
        icon: '\u2605',    // ★
        value: `${pct}% ${modelShort}`,
        indicator: { value: pct, bar_fill_c: color },
      };
    },
  };
}
