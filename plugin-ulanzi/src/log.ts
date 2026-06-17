/**
 * Minimal logger for the Ulanzi main service. Ulanzi Studio captures stdout/stderr
 * of the launched `node app.js`, and the SDK also offers `$UD.logMessage`.
 * We keep this dependency-free (no @elgato/streamdeck like the SD plugin).
 */
import { appendFileSync } from 'node:fs';

const DEBUG = process.env.AGENTDECK_DEBUG === '1' || process.env.ROLLUP_WATCH === 'true';

// Studio launches us detached, so console output is hard to reach. Always
// mirror logs to a file we can read while debugging on real hardware.
const LOG_FILE = '/tmp/agentdeck-ulanzi.log';

function ts(): string {
  // Date.now is fine here (runtime logging, not a workflow script).
  return new Date().toISOString().slice(11, 23);
}

/** File sink for real-device diagnostics. Gated on DEBUG (Studio launches us
 *  detached, so set AGENTDECK_DEBUG=1 in the launch env to capture). */
export function flog(tag: string, ...args: unknown[]): void {
  if (!DEBUG) return;
  try {
    appendFileSync(LOG_FILE, `[${ts()}] [${tag}] ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`);
  } catch { /* best-effort */ }
}

export function dlog(tag: string, ...args: unknown[]): void {
  flog(tag, ...args);
  if (!DEBUG) return;
  console.log(`[${ts()}] [${tag}]`, ...args);
}
export function dinfo(tag: string, ...args: unknown[]): void {
  flog(tag, ...args);
  console.log(`[${ts()}] [${tag}]`, ...args);
}
export function dwarn(tag: string, ...args: unknown[]): void {
  flog(tag, 'WARN', ...args);
  console.warn(`[${ts()}] [${tag}] WARN`, ...args);
}
export function derr(tag: string, ...args: unknown[]): void {
  flog(tag, 'ERROR', ...args);
  console.error(`[${ts()}] [${tag}] ERROR`, ...args);
}
