import { EventEmitter } from 'events';
import { execFile } from 'child_process';
import { debug } from './logger.js';

const POLL_INTERVAL_MS = 10_000;
const EXEC_TIMEOUT_MS = 5_000;

const PYTHON_SCRIPT = `
import ctypes, ctypes.util
cg = ctypes.CDLL(ctypes.util.find_library('CoreGraphics'))
cg.CGMainDisplayID.restype = ctypes.c_uint32
cg.CGDisplayIsAsleep.restype = ctypes.c_uint32
cg.CGDisplayIsAsleep.argtypes = [ctypes.c_uint32]
print(cg.CGDisplayIsAsleep(cg.CGMainDisplayID()))
`;

/**
 * Monitors macOS display sleep state via CoreGraphics.
 * Emits 'display_state_changed' with boolean (true = on, false = asleep)
 * only when the state actually changes.
 */
export class DisplayMonitor extends EventEmitter {
  private timer: ReturnType<typeof setInterval> | null = null;
  private displayOn = true;

  start(): void {
    if (this.timer) return;
    debug('display', 'DisplayMonitor started (10s poll)');
    this.poll(); // immediate first check
    this.timer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isDisplayOn(): boolean {
    return this.displayOn;
  }

  private poll(): void {
    execFile('python3', ['-c', PYTHON_SCRIPT], { timeout: EXEC_TIMEOUT_MS }, (err, stdout) => {
      if (err) {
        debug('display', `poll error: ${err.message}`);
        return; // keep last known state
      }
      const trimmed = stdout.trim();
      const nowOn = trimmed !== '1'; // "0" = awake, "1" = asleep
      if (nowOn !== this.displayOn) {
        this.displayOn = nowOn;
        debug('display', `display state changed: ${nowOn ? 'ON' : 'ASLEEP'}`);
        this.emit('display_state_changed', nowOn);
      }
    });
  }
}
