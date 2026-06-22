/**
 * TRMNL device telemetry — a runtime-only, per-MAC snapshot of the headers a
 * BYOS panel reports on each /api/setup or /api/display poll (firmware version,
 * battery voltage, WiFi signal, panel resolution). This is NOT persisted to
 * settings.json: polls arrive every ~180s and writing the settings file on each
 * one would thrash it and race the user's manual edits. The daemon status
 * snapshot reads this map for diagnostics; it's lost on daemon restart, which is
 * fine — the next poll repopulates it.
 */
import { normalizeMac } from './trmnl-settings.js';

export interface DeviceTelemetry {
  /** Normalized MAC identity (matches TrmnlDevice.mac). */
  mac: string;
  fwVersion: string;
  batteryVoltage: number | null;
  rssi: number | null;
  width: number | null;
  height: number | null;
  /** Cadence the device says it's polling at (we still dictate it on response). */
  refreshRate: number | null;
  userAgent: string;
  /** Epoch ms of the most recent poll. */
  lastSeen: number;
}

export interface TelemetryInput {
  fwVersion?: string;
  batteryVoltage?: number | null;
  rssi?: number | null;
  width?: number | null;
  height?: number | null;
  refreshRate?: number | null;
  userAgent?: string;
}

const telemetry = new Map<string, DeviceTelemetry>();

/**
 * Upsert the last-seen telemetry for a device. `now` is injected at the daemon
 * boundary (defaults to wall clock) so layout/render code stays clock-free.
 */
export function recordTelemetry(mac: string, t: TelemetryInput, now: number = Date.now()): void {
  const key = normalizeMac(mac);
  if (!key) return;
  telemetry.set(key, {
    mac: key,
    fwVersion: t.fwVersion ?? '',
    batteryVoltage: t.batteryVoltage ?? null,
    rssi: t.rssi ?? null,
    width: t.width ?? null,
    height: t.height ?? null,
    refreshRate: t.refreshRate ?? null,
    userAgent: t.userAgent ?? '',
    lastSeen: now,
  });
}

/** Snapshot of all known device telemetry, most-recently-seen first. */
export function getTelemetry(): DeviceTelemetry[] {
  return [...telemetry.values()].sort((a, b) => b.lastSeen - a.lastSeen);
}

/** Test helper — clear the runtime map. */
export function _resetTelemetry(): void {
  telemetry.clear();
}
