/**
 * Test helper: creates an isolated temporary directory for ~/.agentdeck/ file operations.
 * Sets AGENTDECK_DATA_DIR env var so session-registry and auth modules use it.
 */
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

export interface TempDataDir {
  path: string;
  sessionsFile: string;
  daemonFile: string;
  authTokenFile: string;
  cleanup: () => void;
}

export function createTempDataDir(): TempDataDir {
  const path = join(tmpdir(), `agentdeck-test-${randomUUID()}`);
  mkdirSync(path, { recursive: true });

  // Set env var for modules that support it
  process.env.AGENTDECK_DATA_DIR = path;

  return {
    path,
    sessionsFile: join(path, 'sessions.json'),
    daemonFile: join(path, 'daemon.json'),
    authTokenFile: join(path, 'auth-token'),
    cleanup: () => {
      delete process.env.AGENTDECK_DATA_DIR;
      try {
        rmSync(path, { recursive: true, force: true });
      } catch { /* ignore */ }
    },
  };
}
