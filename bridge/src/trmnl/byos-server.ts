/**
 * TRMNL BYOS (Bring Your Own Server) HTTP handlers, mounted on the daemon hub.
 *
 * Implements the minimal TRMNL device contract so a stock-firmware panel pointed
 * at `http://<daemon-host>:9120` renders the AgentDeck dashboard:
 *
 *   GET  /api/setup    ID:<mac>                       → { api_key, friendly_id, image_url }
 *   GET  /api/display  ID:<mac> Access-Token:<key>    → { image_url, filename, refresh_rate, ... }
 *   GET  /trmnl/image/<hash>.png                      → 1-bit PNG frame
 *   POST /api/log      ID:<mac>                        → 204 (device logs, debug only)
 *
 * The device authenticates only by MAC (ID header); the api_key issued at setup
 * is a soft gate on /api/display. This is LAN-local hardware, so no token is
 * required to fetch the image itself. See docs: https://docs.trmnl.com/go/diy/byos
 */
import type { IncomingMessage, ServerResponse } from 'http';
import {
  ensureDevice,
  findDeviceByMac,
  loadTrmnlConfig,
  normalizeMac,
} from './trmnl-settings.js';
import { getTrmnlFrame, forceRenderTrmnlFrame } from './frame-cache.js';
import { debug } from '../logger.js';

const TAG = 'trmnl-byos';

function header(req: IncomingMessage, name: string): string {
  const v = req.headers[name.toLowerCase()];
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

function imageBase(req: IncomingMessage): string {
  // The device reached us at exactly this host:port — reuse it so the image_url
  // is always resolvable from the device's perspective (no IP guessing).
  return `http://${req.headers.host ?? 'localhost'}`;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(payload);
}

/** GET /api/setup — enroll the device (by MAC) and hand back an api_key. */
export function handleTrmnlSetup(req: IncomingMessage, res: ServerResponse): void {
  const mac = header(req, 'ID');
  if (!mac) {
    sendJson(res, 400, { status: 400, message: 'Missing ID (MAC) header' });
    return;
  }
  const { device, created } = ensureDevice(mac);
  if (!device) {
    // autoRegister is off and this MAC isn't enrolled.
    debug(TAG, `setup rejected for ${normalizeMac(mac)} (autoRegister off, not enrolled)`);
    sendJson(res, 404, { status: 404, message: 'Device not enrolled. Add it to settings.trmnl.devices.' });
    return;
  }
  if (created) {
    debug(TAG, `enrolled TRMNL ${device.mac} as ${device.friendlyId}`);
    forceRenderTrmnlFrame(); // make the very first served image reflect live state
  }
  const frame = getTrmnlFrame();
  sendJson(res, 200, {
    status: 200,
    api_key: device.apiKey,
    friendly_id: device.friendlyId,
    image_url: `${imageBase(req)}/trmnl/image/${frame.contentHash}.png`,
    filename: frame.contentHash,
    message: 'Welcome to AgentDeck',
  });
}

/** GET /api/display — return the next image + polling cadence. */
export function handleTrmnlDisplay(req: IncomingMessage, res: ServerResponse): void {
  const mac = header(req, 'ID');
  const cfg = loadTrmnlConfig();
  const device = mac ? findDeviceByMac(mac) : undefined;

  if (!device) {
    // Not enrolled — tell the firmware to (re)run setup by reporting reset.
    debug(TAG, `display from unenrolled ${normalizeMac(mac)} — requesting setup`);
    sendJson(res, 200, {
      status: 202,
      image_url: `${imageBase(req)}/trmnl/image/setup.png`,
      filename: 'setup',
      refresh_rate: String(cfg.refreshRate),
      reset_firmware: false,
      update_firmware: false,
      firmware_url: null,
    });
    return;
  }

  // Soft auth: if the device presents an Access-Token, it must match.
  const token = header(req, 'Access-Token');
  if (token && token !== device.apiKey) {
    debug(TAG, `display token mismatch for ${device.mac}`);
    sendJson(res, 401, { status: 401, message: 'Invalid Access-Token' });
    return;
  }

  const frame = getTrmnlFrame();
  sendJson(res, 200, {
    status: 0,
    image_url: `${imageBase(req)}/trmnl/image/${frame.contentHash}.png`,
    filename: frame.contentHash,
    refresh_rate: String(cfg.refreshRate),
    reset_firmware: false,
    update_firmware: false,
    firmware_url: null,
  });
}

/** GET /trmnl/image/<hash>.png — serve the current 1-bit PNG frame. */
export function handleTrmnlImage(_req: IncomingMessage, res: ServerResponse): void {
  // We only ever hold the latest frame; serve it regardless of the requested
  // hash (the device always wants the freshest screen). The hash in the URL is
  // purely a cache-buster so the firmware re-downloads when it changes.
  const frame = getTrmnlFrame();
  res.writeHead(200, {
    'Content-Type': frame.contentType,
    'Content-Length': frame.buffer.length,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(frame.buffer);
}

/** POST /api/log — accept device logs (debug only). */
export function handleTrmnlLog(req: IncomingMessage, res: ServerResponse): void {
  let body = '';
  req.on('data', (c: Buffer) => {
    body += c;
    if (body.length > 64_000) req.destroy();
  });
  req.on('end', () => {
    const mac = normalizeMac(header(req, 'ID'));
    debug(TAG, `log from ${mac}: ${body.slice(0, 500)}`);
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
    res.end();
  });
  req.on('error', () => {
    try {
      res.writeHead(204);
      res.end();
    } catch {
      /* ignore */
    }
  });
}

/** True for any path this module owns, so the daemon router can delegate. */
export function isTrmnlImagePath(pathname: string): boolean {
  return pathname.startsWith('/trmnl/image/');
}
