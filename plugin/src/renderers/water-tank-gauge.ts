/**
 * Water-tank usage gauge — a 144×144 keypad tile (classic Stream Deck / XL).
 *
 * The tank's water level represents the REMAINING quota (100 − usedPercent), so
 * the tank visibly drains as the agent burns through its window. Each tile is
 * self-identifying: the water hue carries the agent brand (Claude = terracotta,
 * Codex = blue) and the top label names the window ("5H"/"7D", or "CX 5H"/"CX 7D"
 * for Codex). A subtle surface-wave line sits at the waterline, the headline
 * percent is the remaining quota, and a reset countdown ("2h13m" / "6d") sits at
 * the bottom. Severity (low REMAINING = warning) is encoded on the headline +
 * tank rim without overriding the agent hue.
 */
import { Brand } from '@agentdeck/shared';
import { formatResetTime } from '../utility-modes/usage.js';

const W = 144;
const H = 144;

// Tank geometry within the 144×144 canvas.
const TANK_X = 42;
const TANK_Y = 32;
const TANK_W = 60;
const TANK_H = 82;

const BG = '#0f172a';
const TANK_EMPTY = '#0b1220';
const RIM = '#33415a';
const RIM_CRITICAL = '#ef4444';
const LABEL_DIM = '#64748b';
const TEXT_HEALTHY = '#f1f5f9';
const TEXT_DIM = '#475569';
const COUNTDOWN = '#94a3b8';

/** Agent-brand water palette (fill + lighter surface highlight). */
const PALETTE: Record<'claude' | 'codex', { water: string; surface: string }> = {
  // Claude terracotta family (Brand.claudeCode = #C07058)
  claude: { water: Brand.claudeCode, surface: '#E0A48F' },
  // Codex blue family (Brand.codex = #6166E0)
  codex: { water: Brand.codex, surface: '#9AA0F4' },
};

export interface WaterTankGaugeData {
  agent: 'claude' | 'codex';
  /** Which rolling window this tile represents (drives the label fallback). */
  window: '5h' | '7d';
  /** Tile label, e.g. "5H", "7D", "CX 5H", "CX 7D". */
  label: string;
  /** Percent of the window already consumed (0–100). */
  usedPercent: number;
  /** ISO-8601 reset instant for the countdown. */
  resetsAt?: string;
  /** False when no live quota exists — draws an empty tank + "—". */
  known?: boolean;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function svgWrap(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${inner}</svg>`;
}

function clampPct(p: number): number {
  return Math.max(0, Math.min(100, p));
}

/** Severity by REMAINING quota: less left = hotter. Keeps the agent hue intact. */
function remainingSeverityColor(remaining: number): string {
  if (remaining <= 15) return '#ef4444'; // critical — almost out
  if (remaining <= 35) return '#eab308'; // warning — running low
  return TEXT_HEALTHY;
}

export function renderWaterTankGauge(data: WaterTankGaugeData): string {
  const known = data.known !== false;
  const agent = data.agent === 'codex' ? 'codex' : 'claude';
  const pal = PALETTE[agent];
  const label = data.label || (agent === 'codex' ? `CX ${data.window.toUpperCase()}` : data.window.toUpperCase());

  const tank = `<rect x="${TANK_X}" y="${TANK_Y}" width="${TANK_W}" height="${TANK_H}" rx="9" fill="${TANK_EMPTY}"/>`;
  const labelEl = `<text x="72" y="20" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="13" font-weight="bold" fill="${known ? pal.water : LABEL_DIM}">${esc(label)}</text>`;

  if (!known) {
    return svgWrap(
      `<rect width="${W}" height="${H}" fill="${BG}"/>` +
      tank +
      `<rect x="${TANK_X}" y="${TANK_Y}" width="${TANK_W}" height="${TANK_H}" rx="9" fill="none" stroke="${RIM}" stroke-width="2.5"/>` +
      labelEl +
      `<text x="72" y="84" text-anchor="middle" font-family="Arial,sans-serif" font-size="30" font-weight="bold" fill="${TEXT_DIM}">—</text>`,
    );
  }

  const used = clampPct(data.usedPercent);
  const remaining = clampPct(100 - used);
  const waterH = Math.round((TANK_H * remaining) / 100);
  const waterY = TANK_Y + TANK_H - waterH;
  const critical = remaining <= 15;
  const headColor = remainingSeverityColor(remaining);

  // Water body with a wavy top edge. Quadratic bumps give a gentle surface
  // ripple; the body extends to the tank floor and is clipped to the rounded
  // tank so the corners stay clean.
  const seg = TANK_W / 2;
  const amp = remaining > 1 && remaining < 100 ? 3 : 0;
  const surfacePath =
    `M ${TANK_X} ${waterY} q ${seg / 2} ${-amp} ${seg} 0 q ${seg / 2} ${amp} ${seg} 0`;
  const bodyPath =
    `${surfacePath} L ${TANK_X + TANK_W} ${TANK_Y + TANK_H} L ${TANK_X} ${TANK_Y + TANK_H} Z`;

  const clipId = `tank-${agent}-${data.window}`;
  const water = remaining > 0
    ? `<g clip-path="url(#${clipId})">` +
        `<path d="${bodyPath}" fill="${pal.water}"/>` +
        `<path d="${surfacePath}" fill="none" stroke="${pal.surface}" stroke-width="2" stroke-linecap="round" opacity="0.85"/>` +
      `</g>`
    : '';

  const rimColor = critical ? RIM_CRITICAL : RIM;
  const reset = formatResetTime(data.resetsAt);

  return svgWrap(
    `<defs><clipPath id="${clipId}"><rect x="${TANK_X}" y="${TANK_Y}" width="${TANK_W}" height="${TANK_H}" rx="9"/></clipPath></defs>` +
    `<rect width="${W}" height="${H}" fill="${BG}"/>` +
    tank +
    water +
    `<rect x="${TANK_X}" y="${TANK_Y}" width="${TANK_W}" height="${TANK_H}" rx="9" fill="none" stroke="${rimColor}" stroke-width="2.5"/>` +
    labelEl +
    // Headline = remaining quota. Dark stroke halo keeps it legible over water.
    `<text x="72" y="82" text-anchor="middle" font-family="Arial,sans-serif" font-size="30" font-weight="bold" fill="${headColor}" stroke="${BG}" stroke-width="3.5" paint-order="stroke" stroke-linejoin="round">${Math.round(remaining)}%</text>` +
    (reset ? `<text x="72" y="132" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="${COUNTDOWN}">${esc(reset)}</text>` : ''),
  );
}
