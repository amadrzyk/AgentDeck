/**
 * SVG pixmap renderer for the Usage Dial (E3).
 * 200x100, #0f172a bg. Shows rate limit gauges, token counts, cost.
 */
import { gaugeBar, formatResetTime, formatTokens, type UsageModeData } from '../utility-modes/usage.js';

const W = 200;
const H = 100;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function svgWrap(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${inner}</svg>`;
}

function gaugeColor(pct: number): string {
  return pct > 80 ? '#ef4444' : pct > 50 ? '#eab308' : '#22c55e';
}

export type UsagePage = 'overview' | '5h' | '7d' | 'session' | 'extra';
export const USAGE_PAGES: UsagePage[] = ['overview', '5h', '7d', 'session', 'extra'];

/** Overview: 5h + 7d gauges stacked — % and reset on separate lines */
export function renderUsageOverview(data: UsageModeData): string {
  const pct5 = data.fiveHourPercent ?? 0;
  const pct7 = data.sevenDayPercent ?? 0;
  const reset5 = formatResetTime(data.fiveHourResetsAt);
  const reset7 = formatResetTime(data.sevenDayResetsAt);
  const c5 = gaugeColor(pct5);
  const c7 = gaugeColor(pct7);

  return svgWrap(`
    <rect width="${W}" height="${H}" fill="#0f172a"/>
    <text x="100" y="14" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#94a3b8">USAGE</text>
    <text x="18" y="33" font-family="Arial,sans-serif" font-size="11" fill="#94a3b8">5H</text>
    <text x="42" y="33" font-family="monospace" font-size="12" fill="${c5}">${esc(gaugeBar(pct5, 8))}</text>
    <text x="190" y="33" text-anchor="end" font-family="Arial,sans-serif" font-size="12" font-weight="bold" fill="#ffffff">${Math.round(pct5)}%</text>
    ${reset5 ? `<text x="190" y="44" text-anchor="end" font-family="Arial,sans-serif" font-size="11" fill="#94a3b8">${esc(reset5)}</text>` : ''}
    <text x="18" y="61" font-family="Arial,sans-serif" font-size="11" fill="#94a3b8">7D</text>
    <text x="42" y="61" font-family="monospace" font-size="12" fill="${c7}">${esc(gaugeBar(pct7, 8))}</text>
    <text x="190" y="61" text-anchor="end" font-family="Arial,sans-serif" font-size="12" font-weight="bold" fill="#ffffff">${Math.round(pct7)}%</text>
    ${reset7 ? `<text x="190" y="72" text-anchor="end" font-family="Arial,sans-serif" font-size="11" fill="#94a3b8">${esc(reset7)}</text>` : ''}
    <rect x="0" y="96" width="${W}" height="4" rx="2" fill="${gaugeColor(Math.max(pct5, pct7))}" opacity="0.6"/>
  `);
}

/** Detail view for a single rate limit (5h or 7d) — % and reset split */
export function renderUsageDetail(data: UsageModeData, page: '5h' | '7d'): string {
  const is5h = page === '5h';
  const pct = (is5h ? data.fiveHourPercent : data.sevenDayPercent) ?? 0;
  const reset = formatResetTime(is5h ? data.fiveHourResetsAt : data.sevenDayResetsAt);
  const title = is5h ? '5H LIMIT' : '7D LIMIT';
  const color = gaugeColor(pct);

  return svgWrap(`
    <rect width="${W}" height="${H}" fill="#0f172a"/>
    <text x="100" y="20" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" fill="#94a3b8">${title}</text>
    <text x="100" y="46" text-anchor="middle" font-family="monospace" font-size="14" fill="${color}">${esc(gaugeBar(pct, 12))}</text>
    <text x="100" y="70" text-anchor="middle" font-family="Arial,sans-serif" font-size="20" font-weight="bold" fill="#ffffff">${Math.round(pct)}%</text>
    ${reset ? `<text x="100" y="86" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" fill="#94a3b8">resets in ${esc(reset)}</text>` : ''}
    <rect x="0" y="96" width="${W}" height="4" rx="2" fill="${color}" opacity="0.6"/>
  `);
}

/** Session stats: tokens + cost */
export function renderUsageSession(data: UsageModeData): string {
  const inp = formatTokens(data.inputTokens);
  const out = formatTokens(data.outputTokens);
  const cost = data.estimatedCostUsd != null ? `$${data.estimatedCostUsd.toFixed(2)}` : '';
  const dur = data.sessionDurationSec != null ? formatDuration(data.sessionDurationSec) : '';

  return svgWrap(`
    <rect width="${W}" height="${H}" fill="#0f172a"/>
    <text x="100" y="20" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" fill="#94a3b8">SESSION</text>
    <text x="100" y="48" text-anchor="middle" font-family="monospace" font-size="14" fill="#60a5fa">\u25B2${esc(inp)}  \u25BC${esc(out)}</text>
    <text x="100" y="74" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="bold" fill="#ffffff">${esc(cost || '\u2014')}</text>
    ${dur ? `<text x="100" y="90" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" fill="#64748b">${esc(dur)}</text>` : ''}
    <rect x="0" y="96" width="${W}" height="4" rx="2" fill="#60a5fa" opacity="0.6"/>
  `);
}

/** Extra usage tier gauge + credit info */
export function renderUsageExtra(data: UsageModeData): string {
  if (!data.extraUsageEnabled) {
    return svgWrap(`
      <rect width="${W}" height="${H}" fill="#0f172a"/>
      <text x="100" y="20" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" fill="#94a3b8">EXTRA USAGE</text>
      <text x="100" y="58" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" fill="#475569">disabled</text>
      <rect x="0" y="96" width="${W}" height="4" rx="2" fill="#6b7280" opacity="0.4"/>
    `);
  }
  const pct = data.extraUsageUtilization ?? 0;
  const color = pct > 80 ? '#ef4444' : '#60a5fa';
  const used = data.extraUsageUsedCredits;
  const limit = data.extraUsageMonthlyLimit;
  const creditLine = used != null && limit != null
    ? `$${used.toFixed(2)} / $${limit.toFixed(2)}`
    : used != null ? `$${used.toFixed(2)} used` : '';
  return svgWrap(`
    <rect width="${W}" height="${H}" fill="#0f172a"/>
    <text x="100" y="20" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" fill="#94a3b8">EXTRA USAGE</text>
    <text x="100" y="44" text-anchor="middle" font-family="monospace" font-size="14" fill="${color}">${esc(gaugeBar(pct, 12))}</text>
    <text x="100" y="64" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="bold" fill="#ffffff">${Math.round(pct)}%</text>
    ${creditLine ? `<text x="100" y="82" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" fill="#64748b">${esc(creditLine)}</text>` : ''}
    <rect x="0" y="96" width="${W}" height="4" rx="2" fill="${color}" opacity="0.6"/>
  `);
}

/** Disconnected / no data yet */
export function renderUsageDisconnected(): string {
  return svgWrap(`
    <rect width="${W}" height="${H}" fill="#0f172a"/>
    <text x="100" y="20" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" fill="#475569">USAGE</text>
    <text x="100" y="55" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" fill="#475569" opacity="0.5">\uD83D\uDCCA</text>
    <text x="100" y="78" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#475569">Waiting...</text>
    <rect x="60" y="90" width="80" height="2" rx="1" fill="#475569" opacity="0.2"/>
  `);
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m${s > 0 ? ` ${s}s` : ''}`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h${rm > 0 ? ` ${rm}m` : ''}`;
}
