/**
 * Agent logo SVG paths for watermark rendering on session button.
 *
 * Each logo is a centered path designed for a 144x144 button canvas.
 * Used at low opacity (0.05–0.12) as background watermarks.
 */

import type { AgentType } from '@agentdeck/shared';

/**
 * Claude AI symbol — official sparkle/starburst from Anthropic brand.
 * viewBox 0 0 16 16 (Bootstrap Icons, MIT license).
 */
export const CLAUDE_LOGO_PATH =
  'm3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z';

/**
 * OpenClaw lobster — official logo paths from openclaw.ai brand assets.
 * Original viewBox 0 0 120 120, rendered at 1:1 inside 144x144 button.
 * Source: Dashboard Icons (CC-BY-4.0)
 */
export const OC_BODY =
  'M60 10 C30 10 15 35 15 55 C15 75 30 95 45 100 L45 110 L55 110 L55 100 C55 100 60 102 65 100 L65 110 L75 110 L75 100 C90 95 105 75 105 55 C105 35 90 10 60 10Z';
export const OC_CLAW_L =
  'M20 45 C5 40 0 50 5 60 C10 70 20 65 25 55 C28 48 25 45 20 45Z';
export const OC_CLAW_R =
  'M100 45 C115 40 120 50 115 60 C110 70 100 65 95 55 C92 48 95 45 100 45Z';
const OC_ANTENNA_L = 'M45 15 Q35 5 30 8';
const OC_ANTENNA_R = 'M75 15 Q85 5 90 8';

/** Codex CLI knot/clover — official SVG from codex brand assets. viewBox 0 0 24 24. */
export const CODEX_LOGO_PATH =
  'M9.064 3.344a4.578 4.578 0 012.285-.312c1 .115 1.891.54 2.673 1.275.01.01.024.017.037.021a.09.09 0 00.043 0 4.55 4.55 0 013.046.275l.047.022.116.057a4.581 4.581 0 012.188 2.399c.209.51.313 1.041.315 1.595a4.24 4.24 0 01-.134 1.223.123.123 0 00.03.115c.594.607.988 1.33 1.183 2.17.289 1.425-.007 2.71-.887 3.854l-.136.166a4.548 4.548 0 01-2.201 1.388.123.123 0 00-.081.076c-.191.551-.383 1.023-.74 1.494-.9 1.187-2.222 1.846-3.711 1.838-1.187-.006-2.239-.44-3.157-1.302a.107.107 0 00-.105-.024c-.388.125-.78.143-1.204.138a4.441 4.441 0 01-1.945-.466 4.544 4.544 0 01-1.61-1.335c-.152-.202-.303-.392-.414-.617a5.81 5.81 0 01-.37-.961 4.582 4.582 0 01-.014-2.298.124.124 0 00.006-.056.085.085 0 00-.027-.048 4.467 4.467 0 01-1.034-1.651 3.896 3.896 0 01-.251-1.192 5.189 5.189 0 01.141-1.6c.337-1.112.982-1.985 1.933-2.618.212-.141.413-.251.601-.33.215-.089.43-.164.646-.227a.098.098 0 00.065-.066 4.51 4.51 0 01.829-1.615 4.535 4.535 0 011.837-1.388z';

/**
 * Render an agent logo as an SVG watermark group for the 144x144 button canvas.
 * Returns an SVG `<g>` element positioned at button center with the logo at ~72px.
 *
 * Simulator spec: centered mark, 72px target size.
 */
export function agentLogoWatermark(
  agent: AgentType,
  color: string,
  opacity = 0.12,
): string {
  if (agent === 'claude-code') {
    // 16x16 viewBox → scale(4.5) = 72px, translate(-8,-8) centers at origin
    return `<g transform="translate(72,72) scale(4.5) translate(-8,-8)" opacity="${opacity}"><path d="${CLAUDE_LOGO_PATH}" fill="${color}"/></g>`;
  }
  if (agent === 'codex-cli') {
    // 24x24 viewBox → scale(3) = 72px
    return [
      `<defs><linearGradient id="cx-g" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#B1A7FF"/><stop offset="48%" stop-color="#7A9DFF"/><stop offset="100%" stop-color="#3941FF"/></linearGradient></defs>`,
      `<g transform="translate(72,72) scale(3) translate(-12,-12)" opacity="${opacity}"><path d="${CODEX_LOGO_PATH}" fill="url(#cx-g)"/></g>`,
    ].join('');
  }
  if (agent === 'opencode') {
    // Nested square: 72px outer, gap, inner square
    const s = 72;
    const half = s / 2;
    const ring = s * 0.18;
    const inner = s * 0.5;
    return [
      `<g opacity="${opacity}">`,
      `<rect x="${72 - half}" y="${72 - half}" width="${s}" height="${s}" fill="#F1ECEC"/>`,
      `<rect x="${72 - half + ring}" y="${72 - half + ring}" width="${s - ring * 2}" height="${s - ring * 2}" fill="#4B4646"/>`,
      `<rect x="${72 - inner / 2}" y="${72 - inner / 2}" width="${inner}" height="${inner}" fill="#4B4646"/>`,
      `</g>`,
    ].join('');
  }
  // OpenClaw lobster: original brand colors, scaled to ~72px
  return [
    `<defs><linearGradient id="oc-g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ff4d4d"/><stop offset="100%" stop-color="#991b1b"/></linearGradient></defs>`,
    `<g transform="translate(36,36) scale(0.6)" opacity="${opacity}">`,
    `<path d="${OC_BODY}" fill="url(#oc-g)"/>`,
    `<path d="${OC_CLAW_L}" fill="url(#oc-g)"/>`,
    `<path d="${OC_CLAW_R}" fill="url(#oc-g)"/>`,
    `<path d="${OC_ANTENNA_L}" stroke="#ff4d4d" stroke-width="3" stroke-linecap="round" fill="none"/>`,
    `<path d="${OC_ANTENNA_R}" stroke="#ff4d4d" stroke-width="3" stroke-linecap="round" fill="none"/>`,
    `<circle cx="45" cy="35" r="6" fill="#050810"/>`,
    `<circle cx="75" cy="35" r="6" fill="#050810"/>`,
    `<circle cx="46" cy="34" r="2.5" fill="#00e5cc"/>`,
    `<circle cx="76" cy="34" r="2.5" fill="#00e5cc"/>`,
    `</g>`,
  ].join('');
}
