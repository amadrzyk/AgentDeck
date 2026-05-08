/**
 * Mid-session turn classification glue.
 *
 * Extracted from `bridge/src/index.ts` so non-index modules
 * (`apme/adapters/codex-turn-manager.ts`, future agent managers)
 * can call it without forcing a circular import on the bridge entry.
 *
 * The legacy logic was inline in wireAgentApme; this module preserves
 * the same behaviour byte-for-byte.
 */

import type { ApmeModule } from './index.js';
import { debug } from '../logger.js';

export async function classifyAndEnqueueTurn(
  apme: ApmeModule,
  sid: string,
): Promise<void> {
  const turnId = apme.collector.getActiveTurnId(sid);
  const runId = apme.collector.getRunId(sid);
  if (!turnId || !runId) return;
  const run = apme.store.getRun(runId);
  if (!run) return;

  let category = run.taskCategory ?? null;
  if (!category) {
    try {
      const { classifyRun } = await import('./classifier.js');
      const { category: c, signals } = classifyRun(apme.store, run.id);
      if (c && c !== 'unknown') {
        category = c;
        apme.store.updateRun(run.id, {
          taskCategory: c,
          taskSignals: JSON.stringify(signals),
          taskCategorySource: 'rule',
        });
      }
    } catch (err) {
      debug('APME', `mid-session classify failed: ${String(err)}`);
    }
  }
  if (category) {
    try { apme.store.updateTurn(turnId, { taskCategory: category }); }
    catch { /* ignore */ }
  }
  const NON_CODE = new Set(['conversation', 'planning', 'research', 'review']);
  if (category && NON_CODE.has(category)) {
    apme.runner.enqueueTurn({ runId: run.id, turnId, category });
  }
}
