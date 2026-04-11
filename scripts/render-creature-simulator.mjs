#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderFrame, resetDirector } from '../bridge/dist/pixoo/pixoo-renderer.js';
import {
  initTerrarium,
  setOctopi,
  setJellyfish,
  setCrayfish,
  setVoiceAssistantState,
  updateTerrarium,
  renderTerrariumFrame,
} from '../bridge/dist/tui/terrarium.js';
import { renderDashboard } from '../bridge/dist/tui/renderer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(__dirname, '../tools/creature-simulator/index.html');
const outDir = path.resolve('/tmp/agentdeck-creature-simulator');
const outPath = path.join(outDir, 'index.html');

const AGENTS = {
  claude: { type: 'claude-code', name: 'Claude' },
  codex: { type: 'codex-cli', name: 'Codex' },
  opencode: { type: 'opencode', name: 'OpenCode' },
  openclaw: { type: 'openclaw', name: 'OpenClaw' },
};
const STATES = ['idle', 'working', 'sleeping', 'asking'];

function withSeed(seed, fn) {
  const originalRandom = Math.random;
  let state = seed >>> 0;
  Math.random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  try {
    return fn();
  } finally {
    Math.random = originalRandom;
  }
}

function simStateToBridge(state) {
  if (state === 'working') return 'processing';
  if (state === 'asking') return 'awaiting_option';
  return 'idle';
}

function buildSessions(selectedAgent, state) {
  const ordered = [
    { key: 'claude', id: 's-claude', alive: true, agentType: 'claude-code', state: selectedAgent === 'claude' ? simStateToBridge(state) : 'idle', projectName: 'Claude', modelName: 'opus-4' },
    { key: 'codex', id: 's-codex', alive: true, agentType: 'codex-cli', state: selectedAgent === 'codex' ? simStateToBridge(state) : 'idle', projectName: 'Codex', modelName: 'gpt-5-codex' },
    { key: 'opencode', id: 's-open', alive: true, agentType: 'opencode', state: selectedAgent === 'opencode' ? simStateToBridge(state) : 'idle', projectName: 'OpenCode', modelName: 'opencode' },
    { key: 'openclaw', id: 's-claw', alive: true, agentType: 'openclaw', state: selectedAgent === 'openclaw' && state === 'working' ? 'processing' : 'idle', projectName: 'OpenClaw', modelName: 'OPENCLAW' },
  ];
  const selected = ordered.find((session) => session.key === selectedAgent);
  const rest = ordered.filter((session) => session.key !== selectedAgent);
  return selected ? [selected, ...rest].map(({ key, ...session }) => session) : ordered.map(({ key, ...session }) => session);
}

function buildUsage(now) {
  return {
    fiveHourPercent: 46,
    sevenDayPercent: 72,
    fiveHourResetsAt: new Date(now + 1000 * 60 * 90).toISOString(),
    sevenDayResetsAt: new Date(now + 1000 * 60 * 60 * 28).toISOString(),
  };
}

function buildStateEvent(selectedAgent, state) {
  return {
    state: simStateToBridge(state),
    agentType: AGENTS[selectedAgent].type,
    gatewayAvailable: true,
    gatewayHasError: false,
  };
}

function renderPixooData() {
  const now = Date.UTC(2026, 2, 28, 12, 0, 0);
  const result = {};
  for (const agent of Object.keys(AGENTS)) {
    for (const state of STATES) {
      resetDirector();
      const frame = renderFrame(
        buildStateEvent(agent, state),
        buildUsage(now),
        buildSessions(agent, state),
        now + STATES.indexOf(state) * 1000 + Object.keys(AGENTS).indexOf(agent) * 250,
      );
      result[`${agent}:${state}`] = {
        width: 64,
        height: 64,
        b64: Buffer.from(frame).toString('base64'),
      };
    }
  }
  return result;
}

function stripAnsi(str) {
  return str.replace(
    /[\u001B\u009B][[\]()#;?]*(?:(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~])/g,
    '',
  );
}

function ansiScreenToLines(text, cols, rows) {
  const screen = Array.from({ length: rows }, () => Array(cols).fill(' '));
  let row = 0;
  let col = 0;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (ch === '\u001b' && text[i + 1] === '[') {
      let j = i + 2;
      while (j < text.length && !/[A-Za-z]/.test(text[j])) j++;
      const final = text[j];
      const params = text.slice(i + 2, j);
      if (final === 'H' || final === 'f') {
        const [r = '1', c = '1'] = params.split(';');
        row = Math.max(0, Math.min(rows - 1, Number(r) - 1));
        col = Math.max(0, Math.min(cols - 1, Number(c) - 1));
      } else if (final === 'K' && params === '2') {
        screen[row].fill(' ');
        col = 0;
      }
      i = j + 1;
      continue;
    }
    if (ch === '\n') {
      row = Math.min(rows - 1, row + 1);
      col = 0;
      i++;
      continue;
    }
    if (row >= 0 && row < rows && col >= 0 && col < cols) {
      screen[row][col] = ch;
    }
    col++;
    i++;
  }

  return screen.map((line) => line.join('').replace(/\s+$/g, ''));
}

function renderTuiData() {
  return withSeed(12345, () => {
    const result = {};
    for (const agent of Object.keys(AGENTS)) {
      for (const state of STATES) {
        const ctx = initTerrarium();
        const sessions = [
          { id: 's-claude', state: agent === 'claude' ? simStateToBridge(state) : 'idle', name: 'Claude', agentType: 'claude-code' },
          { id: 's-codex', state: agent === 'codex' ? simStateToBridge(state) : 'idle', name: 'Codex', agentType: 'codex-cli' },
          { id: 's-open', state: agent === 'opencode' ? simStateToBridge(state) : 'idle', name: 'OpenCode', agentType: 'opencode' },
          { id: 's-claw', state: agent === 'openclaw' && state === 'working' ? 'processing' : 'idle', name: 'OpenClaw', agentType: 'openclaw' },
        ];
        setOctopi(ctx, sessions);
        setJellyfish(ctx, sessions);
        setCrayfish(ctx, true, agent === 'openclaw' && state === 'working', 'OpenClaw', false);
        setVoiceAssistantState(ctx, 'disabled');
        for (let frame = 0; frame < 36; frame++) updateTerrarium(ctx, frame);
        const cols = 120;
        const rows = 30;
        const terrariumLines = renderTerrariumFrame(ctx, cols - Math.max(20, Math.floor(cols * 0.22)) - 3, Math.max(3, Math.floor((rows - 3) * 0.42)), 36);
        const dashboardState = {
          state: simStateToBridge(state),
          connectionStatus: 'connected',
          isStale: false,
          projectName: AGENTS[agent].name,
          modelName: agent === 'claude' ? 'opus-4' : agent === 'codex' ? 'gpt-5-codex' : agent === 'opencode' ? 'opencode' : 'OPENCLAW',
          currentTool: state === 'working' ? 'Read file' : null,
          sessions: buildSessions(agent, state),
          usage: {
            fiveHourPercent: 46,
            sevenDayPercent: 72,
            fiveHourResetsAt: '1h24m',
            sevenDayResetsAt: '1d12h',
            inputTokens: 123400,
            outputTokens: 56700,
            estimatedCostUsd: 12.34,
          },
          modelCatalog: [],
          timeline: [],
          helpVisible: false,
          currentPort: 9120,
          agentType: 'daemon',
          gatewayAvailable: true,
          crayfishRouting: agent === 'openclaw' && state === 'working',
          gatewayHasError: false,
          voiceAssistantState: 'disabled',
          voiceAssistantText: null,
          voiceAssistantResponseText: null,
        };
        const ansi = renderDashboard(dashboardState, cols, rows, terrariumLines, 36, 0);
        const lines = ansiScreenToLines(ansi, cols, rows);
        result[`${agent}:${state}`] = { width: cols, height: rows, lines };
      }
    }
    return result;
  });
}

function renderTuiTerrariumData() {
  return withSeed(12345, () => {
    const result = {};
    for (const agent of Object.keys(AGENTS)) {
      for (const state of STATES) {
        const ctx = initTerrarium();
        const sessions = [
          { id: 's-claude', state: agent === 'claude' ? simStateToBridge(state) : 'idle', name: 'Claude', agentType: 'claude-code' },
          { id: 's-codex', state: agent === 'codex' ? simStateToBridge(state) : 'idle', name: 'Codex', agentType: 'codex-cli' },
          { id: 's-open', state: agent === 'opencode' ? simStateToBridge(state) : 'idle', name: 'OpenCode', agentType: 'opencode' },
          { id: 's-claw', state: agent === 'openclaw' && state === 'working' ? 'processing' : 'idle', name: 'OpenClaw', agentType: 'openclaw' },
        ];
        setOctopi(ctx, sessions);
        setJellyfish(ctx, sessions);
        setCrayfish(ctx, true, agent === 'openclaw' && state === 'working', 'OpenClaw', false);
        setVoiceAssistantState(ctx, 'disabled');
        for (let frame = 0; frame < 36; frame++) updateTerrarium(ctx, frame);
        const width = 84;
        const height = 18;
        const terrariumLines = renderTerrariumFrame(ctx, width, height, 36).map((line) => stripAnsi(line));
        result[`${agent}:${state}`] = { width, height, lines: terrariumLines };
      }
    }
    return result;
  });
}

const simulatorData = {
  pixoo: renderPixooData(),
  tui: renderTuiData(),
  tuiTerrarium: renderTuiTerrariumData(),
};

const dataPath = path.resolve(__dirname, '../tools/creature-simulator/sim-data.js');
fs.writeFileSync(dataPath, `window.__SIM_DATA = ${JSON.stringify(simulatorData)};`);
console.log(`Simulator data generated at ${dataPath}`);
