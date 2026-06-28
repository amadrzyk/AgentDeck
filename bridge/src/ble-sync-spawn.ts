/**
 * Shared spawn helper for the daemon-managed Python BLE sync clients
 * (iDotMatrix `sync.py`, Timebox `sync_ble.py`).
 *
 * Both clients were previously spawned with `stdio: 'ignore'`, which keeps the
 * child's verbose stdout from flooding the daemon log — but also discards the
 * crash traceback on stderr. A missing `bleak`/`idotmatrix` dependency, a stale
 * venv, or a bad BLE address then looks identical to a clean exit: the panel
 * goes dark and the daemon logs only "respawning in Ns" with no cause. This
 * helper keeps stdout muted but pipes stderr into a small ring buffer so the
 * manager can log *why* the sync died.
 */

import { spawn, type ChildProcess } from 'child_process';

export interface ManagedSyncChild {
  proc: ChildProcess;
  /** Last captured stderr lines, newest-last, joined with ' | ' (empty if none). */
  stderrTail: () => string;
}

/**
 * Spawn a Python sync child with stdout muted and stderr captured into a
 * bounded tail buffer.
 */
export function spawnPythonSync(
  venvPython: string,
  args: string[],
  maxTailLines = 8,
): ManagedSyncChild {
  // [stdin ignored, stdout ignored (debug flood), stderr piped for diagnostics]
  const proc = spawn(venvPython, args, { stdio: ['ignore', 'ignore', 'pipe'] });

  const tail: string[] = [];
  let partial = '';
  proc.stderr?.on('data', (chunk: Buffer) => {
    partial += chunk.toString();
    const lines = partial.split('\n');
    partial = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trimEnd();
      if (!trimmed) continue;
      tail.push(trimmed);
      if (tail.length > maxTailLines) tail.shift();
    }
  });

  return {
    proc,
    stderrTail: () => {
      const lines = partial.trim() ? [...tail, partial.trim()] : tail;
      return lines.slice(-maxTailLines).join(' | ');
    },
  };
}

/**
 * SIGTERM a managed sync child and wait (bounded) for it to exit, so the child's
 * OFFLINE / blank farewell frame finishes painting before the daemon process
 * exits.
 *
 * The Python sync clients trap SIGTERM, break their loop, push a final OFFLINE
 * (iDotMatrix) or black (Timebox) frame over BLE, then disconnect. That push
 * takes ~1s. If we only fire SIGTERM and return immediately (the old behaviour),
 * the daemon exits right away; when the daemon is a launchd job, launchd then
 * tears the job down and SIGKILLs the orphaned child mid-farewell — leaving the
 * stateful BLE panel frozen on its last dashboard frame instead of OFFLINE.
 * Awaiting the child's exit here keeps the daemon alive just long enough for the
 * farewell to land. Escalates to SIGKILL if the child overruns `timeoutMs`.
 */
export function terminateSyncChild(proc: ChildProcess, timeoutMs = 3_000): Promise<void> {
  return new Promise<void>((resolve) => {
    if (proc.exitCode !== null || proc.signalCode !== null) {
      resolve();
      return;
    }
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {
        /* already gone */
      }
      finish();
    }, timeoutMs);
    timer.unref?.();
    proc.once('exit', finish);
    try {
      proc.kill('SIGTERM');
    } catch {
      finish();
    }
  });
}
