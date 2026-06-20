import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, describe, expect, it } from 'vitest';
import { buildDisplayStateEvent, loadDisplayDimInstruction, normalizeDisplayDimInstruction } from '../display-dim.js';

const originalDataDir = process.env.AGENTDECK_DATA_DIR;

afterEach(() => {
  if (originalDataDir === undefined) {
    delete process.env.AGENTDECK_DATA_DIR;
  } else {
    process.env.AGENTDECK_DATA_DIR = originalDataDir;
  }
});

describe('display dim settings', () => {
  it('defaults to enabled full-off when settings are missing', () => {
    process.env.AGENTDECK_DATA_DIR = mkdtempSync(join(tmpdir(), 'agentdeck-display-dim-'));
    expect(loadDisplayDimInstruction()).toEqual({ enabled: true, mode: 'off', level: 10 });
  });

  it('normalizes minimum-brightness settings', () => {
    expect(normalizeDisplayDimInstruction({ enabled: false, mode: 'min', level: 250 })).toEqual({
      enabled: false,
      mode: 'min',
      level: 100,
    });
  });

  it('embeds the resolved dim instruction in display_state events', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentdeck-display-dim-'));
    process.env.AGENTDECK_DATA_DIR = dir;
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({
      displaySleepDim: { enabled: true, mode: 'min', level: 25 },
    }));

    expect(buildDisplayStateEvent(false)).toEqual({
      type: 'display_state',
      displayOn: false,
      dim: { enabled: true, mode: 'min', level: 25 },
    });
  });
});
