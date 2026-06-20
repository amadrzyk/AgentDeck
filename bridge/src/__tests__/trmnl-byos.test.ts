import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  handleTrmnlSetup,
  handleTrmnlDisplay,
  handleTrmnlImage,
} from '../trmnl/byos-server.js';
import { findDeviceByMac } from '../trmnl/trmnl-settings.js';

const ORIGINAL_DATA_DIR = process.env.AGENTDECK_DATA_DIR;

function fakeReq(headers: Record<string, string>) {
  // Node lowercases header names; mirror that.
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  if (!lower.host) lower.host = '192.168.1.50:9120';
  return { headers: lower } as any;
}

interface Captured {
  status: number;
  headers: Record<string, any>;
  body: any; // parsed JSON for json responses, raw Buffer otherwise
  raw: any;
}

function fakeRes(): { res: any; captured: Captured } {
  const captured: Captured = { status: 0, headers: {}, body: undefined, raw: undefined };
  const res = {
    writeHead(status: number, headers: Record<string, any>) {
      captured.status = status;
      captured.headers = headers ?? {};
    },
    end(payload?: any) {
      captured.raw = payload;
      if (Buffer.isBuffer(payload)) captured.body = payload;
      else {
        try {
          captured.body = JSON.parse(payload);
        } catch {
          captured.body = payload;
        }
      }
    },
  };
  return { res, captured };
}

const MAC = 'AA:BB:CC:DD:EE:01';

describe('TRMNL BYOS handlers', () => {
  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'trmnl-byos-'));
    process.env.AGENTDECK_DATA_DIR = dir;
  });

  afterAll(() => {
    if (ORIGINAL_DATA_DIR === undefined) delete process.env.AGENTDECK_DATA_DIR;
    else process.env.AGENTDECK_DATA_DIR = ORIGINAL_DATA_DIR;
  });

  it('/api/setup enrolls a new device and issues an api_key', () => {
    const { res, captured } = fakeRes();
    handleTrmnlSetup(fakeReq({ ID: MAC }), res);

    expect(captured.status).toBe(200);
    expect(captured.body.status).toBe(200);
    expect(captured.body.api_key).toMatch(/^[0-9a-f]{32}$/);
    expect(captured.body.friendly_id).toMatch(/^[A-Z2-9]{6}$/);
    expect(captured.body.image_url).toMatch(/^http:\/\/192\.168\.1\.50:9120\/trmnl\/image\/[0-9a-f]{16}\.png$/);

    // Persisted to settings.
    const dev = findDeviceByMac(MAC);
    expect(dev?.apiKey).toBe(captured.body.api_key);
  });

  it('/api/setup without an ID header is a 400', () => {
    const { res, captured } = fakeRes();
    handleTrmnlSetup(fakeReq({}), res);
    expect(captured.status).toBe(400);
  });

  it('/api/setup rejects an unknown MAC when autoRegister is off', () => {
    writeFileSync(
      join(process.env.AGENTDECK_DATA_DIR!, 'settings.json'),
      JSON.stringify({ trmnl: { autoRegister: false, devices: [] } }),
    );
    const { res, captured } = fakeRes();
    handleTrmnlSetup(fakeReq({ ID: MAC }), res);
    expect(captured.status).toBe(404);
  });

  it('/api/display returns image + cadence for an enrolled device', () => {
    const setup = fakeRes();
    handleTrmnlSetup(fakeReq({ ID: MAC }), setup.res);
    const apiKey = setup.captured.body.api_key as string;

    const { res, captured } = fakeRes();
    handleTrmnlDisplay(fakeReq({ ID: MAC, 'Access-Token': apiKey }), res);

    expect(captured.status).toBe(200);
    expect(captured.body.status).toBe(0);
    expect(captured.body.refresh_rate).toBe('180');
    expect(captured.body.reset_firmware).toBe(false);
    expect(captured.body.update_firmware).toBe(false);
    expect(captured.body.image_url).toContain(`/trmnl/image/${captured.body.filename}.png`);
  });

  it('/api/display still serves a screen with a mismatched Access-Token (soft auth)', () => {
    // Real devices carry an api_key issued by a previous/cloud server; we must
    // not hard-reject on token mismatch (it would brick same-LAN hardware).
    handleTrmnlSetup(fakeReq({ ID: MAC }), fakeRes().res);
    const { res, captured } = fakeRes();
    handleTrmnlDisplay(fakeReq({ ID: MAC, 'Access-Token': 'deadbeef' }), res);
    expect(captured.status).toBe(200);
    expect(captured.body.status).toBe(0);
  });

  it('/api/display auto-enrolls an unknown device and serves a real screen (autoRegister on)', () => {
    // Devices that skip /api/setup (kept a prior api_key) poll display directly —
    // they must get status 0, not be stuck on "not registered".
    const { res, captured } = fakeRes();
    handleTrmnlDisplay(fakeReq({ ID: 'FF:FF:FF:FF:FF:FF' }), res);
    expect(captured.status).toBe(200);
    expect(captured.body.status).toBe(0);
    expect(captured.body.image_url).toContain(`/trmnl/image/${captured.body.filename}.png`);
    expect(findDeviceByMac('FF:FF:FF:FF:FF:FF')).toBeTruthy();
  });

  it('/api/display returns 202 for an unknown device when autoRegister is off', () => {
    writeFileSync(
      join(process.env.AGENTDECK_DATA_DIR!, 'settings.json'),
      JSON.stringify({ trmnl: { autoRegister: false, devices: [] } }),
    );
    const { res, captured } = fakeRes();
    handleTrmnlDisplay(fakeReq({ ID: 'AB:CD:EF:00:11:22' }), res);
    expect(captured.status).toBe(200);
    expect(captured.body.status).toBe(202);
    expect(captured.body.filename).toBe('setup');
  });

  it('keeps the same filename across polls when the state is unchanged', () => {
    handleTrmnlSetup(fakeReq({ ID: MAC }), fakeRes().res);
    const a = fakeRes();
    const b = fakeRes();
    handleTrmnlDisplay(fakeReq({ ID: MAC }), a.res);
    handleTrmnlDisplay(fakeReq({ ID: MAC }), b.res);
    expect(a.captured.body.filename).toBe(b.captured.body.filename);
  });

  it('/trmnl/image serves a PNG body', () => {
    handleTrmnlSetup(fakeReq({ ID: MAC }), fakeRes().res);
    const { res, captured } = fakeRes();
    handleTrmnlImage(fakeReq({ ID: MAC }), res);
    expect(captured.headers['Content-Type']).toBe('image/png');
    expect(Buffer.isBuffer(captured.body)).toBe(true);
    expect(captured.body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
  });
});
