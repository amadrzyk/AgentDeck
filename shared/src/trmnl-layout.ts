/**
 * TRMNL e-ink dashboard layout — renders the AgentDeck session overview as a
 * single 800×480 monochrome SVG, sized for the TRMNL 7.5" e-ink panel.
 *
 * Unlike the Stream Deck / D200H renderers (color tiles, fast refresh), this is
 * a slow-refresh, 1-bit surface: pure black on white, no color reliance, status
 * conveyed by labels + borders + shapes (DESIGN.md §10.4 e-ink rule). The bridge
 * rasterizes this SVG to a 1-bit PNG (bridge/src/trmnl/image-renderer.ts) which
 * the device pulls over the BYOS HTTP API.
 *
 * Reuses `parseState`/`DashState` (the shared deck state model) so it stays in
 * lockstep with the other surfaces, and `measureTextWidth`/`sliceByPx` for
 * CJK-aware truncation.
 */
import { parseState, type DashState } from './d200h-layout.js';
import { measureTextWidth, sliceByPx } from './svg-renderers/text-utils.js';
import type { SessionInfo } from './protocol.js';

export const TRMNL_WIDTH = 800;
export const TRMNL_HEIGHT = 480;

const SANS = 'IBM Plex Sans, sans-serif';
const MONO = 'JetBrains Mono, monospace';
const INK = '#000000';
const PAPER = '#ffffff';

function escXml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Truncate to fit `maxPx` at `fontSize`, appending an ellipsis when clipped. */
function truncatePx(s: string, maxPx: number, fontSize: number): string {
  if (!s) return '';
  if (measureTextWidth(s, fontSize) <= maxPx) return s;
  const [head] = sliceByPx(s, Math.max(0, maxPx - fontSize * 0.6), fontSize);
  return head.replace(/\s+$/, '') + '…';
}

const AGENT_LABEL: Record<string, string> = {
  'claude-code': 'CLAUDE',
  'codex-cli': 'CODEX',
  'codex-app': 'CODEX',
  codex: 'CODEX',
  opencode: 'OPENCODE',
  openclaw: 'OPENCLAW',
  daemon: 'AGENT',
};

function agentLabel(agentType?: string): string {
  return AGENT_LABEL[agentType ?? ''] ?? (agentType ? agentType.toUpperCase().slice(0, 8) : 'AGENT');
}

/** Normalized status verb for a session state. */
function statusLabel(state?: string): string {
  const s = (state ?? '').toLowerCase();
  if (s.startsWith('awaiting')) return 'AWAITING';
  if (s === 'processing') return 'WORKING';
  if (s === 'disconnected') return 'OFFLINE';
  if (s === 'idle') return 'IDLE';
  if (!s) return 'IDLE';
  return s.toUpperCase().slice(0, 9);
}

function fmtTokens(n: number): string {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

/** Hour:Minute for the "updated" stamp. Caller may pass a fixed Date for tests. */
function hhmm(now: Date): string {
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** Outline + filled gauge bar (no color — fill is solid ink). */
function gauge(x: number, y: number, w: number, h: number, pct: number): string {
  const clamped = Math.max(0, Math.min(100, pct));
  const fillW = Math.round((w * clamped) / 100);
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${INK}" stroke-width="1.5"/>`,
    fillW > 0 ? `<rect x="${x}" y="${y}" width="${fillW}" height="${h}" fill="${INK}"/>` : '',
  ].join('');
}

/** One session row. `y` is the row's top edge. */
function sessionRow(sess: SessionInfo, y: number, rowH: number): string {
  const pad = 24;
  const tagW = 108;
  const status = statusLabel(sess.state);
  const awaiting = status === 'AWAITING';
  const els: string[] = [];

  // Row separator (hairline above each row except the first is drawn by caller).
  // Agent tag box.
  els.push(
    `<rect x="${pad}" y="${y + 8}" width="${tagW}" height="${rowH - 16}" fill="none" stroke="${INK}" stroke-width="2"/>`,
    `<text x="${pad + tagW / 2}" y="${y + rowH / 2 + 6}" text-anchor="middle" font-family="${SANS}" font-size="18" font-weight="700" fill="${INK}">${escXml(agentLabel(sess.agentType))}</text>`,
  );

  // Project + model (middle column).
  const midX = pad + tagW + 18;
  const midW = 420;
  const project = truncatePx(sess.projectName || '(no project)', midW, 24);
  const model = truncatePx(sess.modelName || '', midW, 16);
  els.push(
    `<text x="${midX}" y="${y + rowH / 2 - 4}" font-family="${SANS}" font-size="24" font-weight="700" fill="${INK}">${escXml(project)}</text>`,
  );
  if (model) {
    els.push(
      `<text x="${midX}" y="${y + rowH / 2 + 22}" font-family="${MONO}" font-size="16" fill="${INK}">${escXml(model)}</text>`,
    );
  }

  // Status badge (right column). Awaiting gets a bold double border to stand out
  // without color; working gets a filled triangle marker.
  const badgeW = 154;
  const badgeX = TRMNL_WIDTH - pad - badgeW;
  const badgeY = y + 12;
  const badgeH = rowH - 24;
  if (awaiting) {
    els.push(
      `<rect x="${badgeX}" y="${badgeY}" width="${badgeW}" height="${badgeH}" fill="${INK}"/>`,
      `<text x="${badgeX + badgeW / 2}" y="${badgeY + badgeH / 2 + 7}" text-anchor="middle" font-family="${SANS}" font-size="20" font-weight="700" fill="${PAPER}">${status}</text>`,
    );
  } else {
    els.push(
      `<rect x="${badgeX}" y="${badgeY}" width="${badgeW}" height="${badgeH}" fill="none" stroke="${INK}" stroke-width="1.5"/>`,
    );
    if (status === 'WORKING') {
      const tx = badgeX + 18;
      const cy = badgeY + badgeH / 2;
      els.push(`<path d="M ${tx} ${cy - 7} L ${tx + 12} ${cy} L ${tx} ${cy + 7} Z" fill="${INK}"/>`);
      els.push(
        `<text x="${badgeX + badgeW / 2 + 10}" y="${cy + 6}" text-anchor="middle" font-family="${SANS}" font-size="18" font-weight="700" fill="${INK}">${status}</text>`,
      );
    } else {
      els.push(
        `<text x="${badgeX + badgeW / 2}" y="${badgeY + badgeH / 2 + 6}" text-anchor="middle" font-family="${SANS}" font-size="18" font-weight="600" fill="${INK}">${status}</text>`,
      );
    }
  }

  return els.join('');
}

export interface TrmnlRenderOpts {
  /** Override "now" for deterministic tests. */
  now?: Date;
}

/**
 * Render the dashboard SVG. Accepts either a raw broadcast state event or a
 * pre-parsed DashState.
 */
export function renderTrmnlDashboard(input: DashState | any, opts: TrmnlRenderOpts = {}): string {
  const state: DashState =
    input && Array.isArray((input as DashState).allSessions) && 'mode' in input
      ? (input as DashState)
      : parseState(input);
  const now = opts.now ?? new Date();

  const sessions: SessionInfo[] =
    state.allSessions.length > 0
      ? state.allSessions
      : [
          {
            id: 'local',
            agentType: state.agentType as any,
            projectName: state.projectName,
            modelName: state.modelName,
            state: (state.state || 'idle').toLowerCase(),
            alive: true,
            port: 0,
          },
        ];

  const els: string[] = [];
  // Paper background — ensures alpha=255 everywhere so the 1-bit threshold is clean.
  els.push(`<rect x="0" y="0" width="${TRMNL_WIDTH}" height="${TRMNL_HEIGHT}" fill="${PAPER}"/>`);

  // --- Header ---
  const headerH = 72;
  els.push(
    `<text x="24" y="48" font-family="${SANS}" font-size="34" font-weight="700" fill="${INK}">AgentDeck</text>`,
  );
  const awaitingCount = sessions.filter((s) => statusLabel(s.state) === 'AWAITING').length;
  const workingCount = sessions.filter((s) => statusLabel(s.state) === 'WORKING').length;
  const summary = `${sessions.length} session${sessions.length === 1 ? '' : 's'} · ${workingCount} working · ${awaitingCount} awaiting`;
  els.push(
    `<text x="${TRMNL_WIDTH - 24}" y="48" text-anchor="end" font-family="${SANS}" font-size="18" font-weight="600" fill="${INK}">${escXml(summary)}</text>`,
  );
  els.push(`<rect x="24" y="${headerH}" width="${TRMNL_WIDTH - 48}" height="3" fill="${INK}"/>`);

  // --- Session rows ---
  const bodyTop = headerH + 14;
  const footerTop = 412;
  const rowH = 64;
  const maxRows = Math.floor((footerTop - bodyTop) / rowH); // 5 rows
  const visible = sessions.slice(0, maxRows);
  const overflow = sessions.length - visible.length;

  if (state.allSessions.length === 0 && (state.state === 'DISCONNECTED' || state.state === 'disconnected')) {
    els.push(
      `<text x="${TRMNL_WIDTH / 2}" y="250" text-anchor="middle" font-family="${SANS}" font-size="28" font-weight="700" fill="${INK}">No active sessions</text>`,
      `<text x="${TRMNL_WIDTH / 2}" y="288" text-anchor="middle" font-family="${SANS}" font-size="18" fill="${INK}">Start Claude Code, Codex, or OpenCode to see them here</text>`,
    );
  } else {
    visible.forEach((sess, i) => {
      const y = bodyTop + i * rowH;
      if (i > 0) {
        els.push(`<rect x="24" y="${y}" width="${TRMNL_WIDTH - 48}" height="1" fill="${INK}"/>`);
      }
      els.push(sessionRow(sess, y, rowH));
    });
    if (overflow > 0) {
      els.push(
        `<text x="${TRMNL_WIDTH / 2}" y="${bodyTop + maxRows * rowH - 10}" text-anchor="middle" font-family="${SANS}" font-size="16" font-weight="600" fill="${INK}">+${overflow} more session${overflow === 1 ? '' : 's'}</text>`,
      );
    }
  }

  // --- Footer (usage + totals + timestamp) ---
  els.push(`<rect x="24" y="${footerTop}" width="${TRMNL_WIDTH - 48}" height="2" fill="${INK}"/>`);
  const fy = footerTop + 26;
  // 5H gauge
  els.push(
    `<text x="24" y="${fy + 4}" font-family="${SANS}" font-size="16" font-weight="700" fill="${INK}">5H</text>`,
    gauge(58, fy - 12, 150, 16, state.fiveHourPercent),
    `<text x="216" y="${fy + 4}" font-family="${MONO}" font-size="16" fill="${INK}">${Math.round(state.fiveHourPercent)}%</text>`,
  );
  // 7D gauge
  els.push(
    `<text x="278" y="${fy + 4}" font-family="${SANS}" font-size="16" font-weight="700" fill="${INK}">7D</text>`,
    gauge(312, fy - 12, 150, 16, state.sevenDayPercent),
    `<text x="470" y="${fy + 4}" font-family="${MONO}" font-size="16" fill="${INK}">${Math.round(state.sevenDayPercent)}%</text>`,
  );
  // tokens + cost + updated stamp (right aligned)
  const totals = `${fmtTokens(state.totalTokens)} tok · $${(state.totalCost || 0).toFixed(2)}`;
  els.push(
    `<text x="${TRMNL_WIDTH - 24}" y="${fy + 4}" text-anchor="end" font-family="${MONO}" font-size="16" fill="${INK}">${escXml(totals)}  ·  ${hhmm(now)}</text>`,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${TRMNL_WIDTH}" height="${TRMNL_HEIGHT}" viewBox="0 0 ${TRMNL_WIDTH} ${TRMNL_HEIGHT}">${els.join('')}</svg>`;
}
