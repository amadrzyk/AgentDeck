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
/**
 * Cadence used only while an agent is AWAITING the user. NOT used for "working":
 * a battery e-ink panel deep-sleeps between polls and full-flashes the screen on
 * every refresh, so we only tighten the loop when the user actually needs to act.
 */
export const TRMNL_DEFAULT_REFRESH_ACTIVE = 60;
/** Floor on any cadence — too-frequent polls drain the panel battery + flash it. */
export const TRMNL_MIN_REFRESH = 30;
/**
 * Seconds the firmware waits for the image download before giving up (its
 * `image_url_timeout`). Generous so a slow/flaky WiFi link doesn't trip the
 * device's "not responding" (WIFI_FAILED) screen. Firmware caps at ~65s, so we
 * keep a healthy default (most "not responding" cycles are a lossy image GET
 * timing out, not a server error — see docs/devices.md TRMNL section).
 */
export const TRMNL_DEFAULT_IMAGE_TIMEOUT = 50;
/** Hard cap the firmware honors (it clamps `image_url_timeout` ~65s internally). */
export const TRMNL_MAX_IMAGE_TIMEOUT = 65;
/**
 * RSSI (dBm) at or below which the panel's WiFi link is treated as weak/lossy.
 * A weak link is the dominant real-world cause of "not responding" (WIFI_FAILED):
 * the image download drops packets and times out. RSSI is sent by the firmware on
 * every poll, so we can react per-poll. (-78 ≈ marginal; below it, retransmits
 * stack up and the default window can be too tight.)
 */
export const TRMNL_WEAK_RSSI_DBM = -78;
/** Image-download window served on a weak link — near the firmware cap. */
export const TRMNL_WEAK_LINK_IMAGE_TIMEOUT = 60;

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
  /** Idle/working cadence (seconds) — the slow, battery-friendly default. */
  refreshRate: number;
  /** Cadence (seconds) while a session is AWAITING the user. */
  refreshActive: number;
  /** Image-download timeout (seconds) handed to the firmware as image_url_timeout. */
  imageUrlTimeout: number;
  autoRegister: boolean;
  devices: TrmnlDevice[];
}

/**
 * Cadence for a poll. We only speed up for AWAITING (the user needs to act);
 * "working" stays on the slow cadence because a deep-sleep e-ink panel can't be
 * pushed and each wake full-flashes the screen + costs battery.
 */
export function effectiveRefreshRate(
  cfg: TrmnlConfig,
  activity: { awaiting: number; working: number },
): number {
  return Math.max(TRMNL_MIN_REFRESH, activity.awaiting > 0 ? cfg.refreshActive : cfg.refreshRate);
}

/**
 * Image-download timeout (seconds) for a single poll. Widens toward the firmware
 * cap when the panel reports a weak WiFi signal, so a lossy image GET still has
 * the maximum window to finish before the firmware shows "not responding"
 * (WIFI_FAILED) — the #1 source of TRMNL flicker on a marginal link. A strong link
 * keeps the lower default so a genuinely dead link doesn't hold the radio on
 * (battery). RSSI absent (older firmware) ⇒ default; the default itself is already
 * generous. Clamped to [5, firmware cap].
 */
export function effectiveImageTimeout(cfg: TrmnlConfig, opts: { rssi?: number | null } = {}): number {
  let t = cfg.imageUrlTimeout;
  if (opts.rssi != null && Number.isFinite(opts.rssi) && opts.rssi <= TRMNL_WEAK_RSSI_DBM) {
    t = Math.max(t, TRMNL_WEAK_LINK_IMAGE_TIMEOUT);
  }
  return Math.min(TRMNL_MAX_IMAGE_TIMEOUT, Math.max(5, Math.floor(t)));
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
  const refreshActive =
    typeof raw.refreshActive === 'number' && raw.refreshActive >= 5
      ? Math.floor(raw.refreshActive)
      : TRMNL_DEFAULT_REFRESH_ACTIVE;
  const imageUrlTimeout =
    typeof raw.imageUrlTimeout === 'number' && raw.imageUrlTimeout > 0
      ? Math.min(TRMNL_MAX_IMAGE_TIMEOUT, Math.floor(raw.imageUrlTimeout))
      : TRMNL_DEFAULT_IMAGE_TIMEOUT;
  return {
    enabled: raw.enabled === true,
    refreshRate,
    refreshActive,
    imageUrlTimeout,
    autoRegister: raw.autoRegister !== false, // default on
    devices: Array.isArray(raw.devices) ? raw.devices.filter((d) => d && typeof d.mac === 'string') : [],
  };
}

function saveTrmnlConfig(cfg: TrmnlConfig): void {
  const settings = readSettings();
  settings.trmnl = cfg;
  writeSettings(settings);
}

/**
 * Normalize a MAC to a stable identity key. A canonical 12-hex address becomes
 * uppercase colon-separated pairs; any other id (some firmware/cloud setups
 * report non-standard or punctuated identifiers) collapses to its bare uppercase
 * hex digits. Returning the raw, untrimmed string for the odd case would orphan
 * or duplicate a device whose punctuation varies between polls — so we always
 * derive a deterministic key from the hex content.
 */
export function normalizeMac(mac: string): string {
  const hex = (mac || '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (hex.length === 12) return hex.match(/.{2}/g)!.join(':');
  return hex || (mac || '').trim().toUpperCase();
}

/** True when two MAC spellings resolve to the same canonical identity. */
export function sameMac(a: string, b: string): boolean {
  return normalizeMac(a) === normalizeMac(b);
}

export function findDeviceByMac(mac: string): TrmnlDevice | undefined {
  return loadTrmnlConfig().devices.find((d) => sameMac(d.mac, mac));
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
  const existing = cfg.devices.find((d) => sameMac(d.mac, mac));
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
  const filtered = cfg.devices.filter((d) => !sameMac(d.mac, mac));
  if (filtered.length === cfg.devices.length) return false;
  cfg.devices = filtered;
  saveTrmnlConfig(cfg);
  return true;
}
