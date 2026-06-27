/**
 * Cockpit settings — reads/writes the parallel-agent compare set under
 * `cockpit.agents` in ~/.agentdeck/settings.json. Preserves all other settings.
 *
 * This is the agent set `agentdeck start` broadcasts a prompt to. Defaults to
 * claude/codex/opencode; the user changes it with `agentdeck agents ...`.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const SETTINGS_DIR = join(homedir(), '.agentdeck');
const SETTINGS_PATH = join(SETTINGS_DIR, 'settings.json');

export const DEFAULT_COCKPIT_AGENTS = ['claude', 'codex', 'opencode'];

function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function writeSettings(settings: Record<string, unknown>): void {
  mkdirSync(SETTINGS_DIR, { recursive: true });
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');
}

/** The agent set used by cockpit `start`. Falls back to the default when unset. */
export function loadCockpitAgents(): string[] {
  const settings = readSettings();
  const cockpit = settings.cockpit as { agents?: unknown } | undefined;
  const agents = cockpit?.agents;
  if (Array.isArray(agents) && agents.length > 0 && agents.every((a) => typeof a === 'string')) {
    return agents as string[];
  }
  return [...DEFAULT_COCKPIT_AGENTS];
}

export function saveCockpitAgents(agents: string[]): void {
  const settings = readSettings();
  const cockpit = (settings.cockpit && typeof settings.cockpit === 'object')
    ? settings.cockpit as Record<string, unknown>
    : {};
  cockpit.agents = agents;
  settings.cockpit = cockpit;
  writeSettings(settings);
}
