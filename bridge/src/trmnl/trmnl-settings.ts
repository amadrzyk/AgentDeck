/**
 * TRMNL BYOS settings — reads/writes the `trmnl` block in
 * ~/.agentdeck/settings.json, preserving all other keys (same pattern as
 * pixoo-settings.ts).
 *
 * Shape:
 *   "trmnl": {
 *     "enabled": false,            // force the module on even with no device yet
 *     "refreshRate": 180,          // seconds between device polls
 *     "autoRegister": true,        // auto-enroll a device that hits /api/setup
 *     "devices": [ { mac, apiKey, friendlyId, name? } ]
 *   }
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomBytes } from 'crypto';

// Resolve lazily so tests (and explicit pinning) can redirect via
// AGENTDECK_DATA_DIR, matching apme/settings.ts and esp32-serial.ts.
function settingsDir(): string {
  return process.env.AGENTDECK_DATA_DIR || join(homedir(), '.agentdeck');
}
function settingsPath(): string {
  return join(settingsDir(), 'settings.json');
}

export const TRMNL_DEFAULT_REFRESH = 180;

export interface TrmnlDevice {
  /** Normalized (uppercase, colon-separated) MAC address — the device identity. */
  mac: string;
  /** Secret issued at /api/setup, presented back as the Access-Token header. */
  apiKey: string;
  /** Short human-friendly id shown on the device + in logs. */
  friendlyId: string;
  /** Optional user label. */
  name?: string;
}

export interface TrmnlConfig {
  enabled: boolean;
  refreshRate: number;
  autoRegister: boolean;
  devices: TrmnlDevice[];
}

function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(settingsPath(), 'utf-8'));
  } catch {
    return {};
  }
}

function writeSettings(settings: Record<string, unknown>): void {
  mkdirSync(settingsDir(), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2) + '\n');
}

/** Load the trmnl config with defaults filled in. */
export function loadTrmnlConfig(): TrmnlConfig {
  const raw = (readSettings().trmnl ?? {}) as Partial<TrmnlConfig>;
  const refreshRate =
    typeof raw.refreshRate === 'number' && raw.refreshRate >= 5 ? Math.floor(raw.refreshRate) : TRMNL_DEFAULT_REFRESH;
  return {
    enabled: raw.enabled === true,
    refreshRate,
    autoRegister: raw.autoRegister !== false, // default on
    devices: Array.isArray(raw.devices) ? raw.devices.filter((d) => d && typeof d.mac === 'string') : [],
  };
}

function saveTrmnlConfig(cfg: TrmnlConfig): void {
  const settings = readSettings();
  settings.trmnl = cfg;
  writeSettings(settings);
}

/** Normalize a MAC to uppercase colon-separated form for stable identity. */
export function normalizeMac(mac: string): string {
  const hex = (mac || '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (hex.length !== 12) return (mac || '').trim().toUpperCase();
  return hex.match(/.{2}/g)!.join(':');
}

export function findDeviceByMac(mac: string): TrmnlDevice | undefined {
  const norm = normalizeMac(mac);
  return loadTrmnlConfig().devices.find((d) => normalizeMac(d.mac) === norm);
}

function genFriendlyId(): string {
  // 6 chars from an unambiguous base32 alphabet (no 0/1/O/I).
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/**
 * Find or create a device record for the given MAC. Returns the device and
 * whether it was newly created. Respects `autoRegister`: when off, a new MAC
 * is NOT persisted and `created` is false with `device` undefined.
 */
export function ensureDevice(mac: string, name?: string): { device?: TrmnlDevice; created: boolean } {
  const cfg = loadTrmnlConfig();
  const norm = normalizeMac(mac);
  const existing = cfg.devices.find((d) => normalizeMac(d.mac) === norm);
  if (existing) return { device: existing, created: false };
  if (!cfg.autoRegister) return { created: false };

  const device: TrmnlDevice = {
    mac: norm,
    apiKey: randomBytes(16).toString('hex'),
    friendlyId: genFriendlyId(),
    name,
  };
  cfg.devices.push(device);
  saveTrmnlConfig(cfg);
  return { device, created: true };
}

export function removeDevice(mac: string): boolean {
  const cfg = loadTrmnlConfig();
  const norm = normalizeMac(mac);
  const filtered = cfg.devices.filter((d) => normalizeMac(d.mac) !== norm);
  if (filtered.length === cfg.devices.length) return false;
  cfg.devices = filtered;
  saveTrmnlConfig(cfg);
  return true;
}
