/**
 * Native 11×11 creature glyphs for the Timebox Mini micro layout.
 *
 * The Timebox Mini has only 121 LEDs. Downscaling the 32×32 terrarium creature to
 * 11×11 bottoms out at a fuzzy silhouette — so for this device the creatures are
 * **hand-authored directly at 11×11** as bold, high-contrast bitmaps. Every pixel
 * is intentional, which is dramatically more legible than any downscale. Treat
 * this screen as a status badge, not a shrunken aquarium: one dominant creature,
 * no labels, no HUD chrome, and only the pixels that identify the canonical mark.
 *
 * The glyphs are the canonical brand marks (matching assets/logos/*_creature_gen.png
 * and design/brand/*.svg), not loose creature approximations:
 *   Claude  → rusty robot (rectangular body, dark cutout eyes, arms, legs)
 *   Codex   → lavender cloud carrying a white `>_` terminal prompt
 *   OpenClaw→ red lobster (side claws, antennae, teal eyes)
 *   OpenCode→ hollow rectangular ring logo
 *   Antigravity→ peak/arc logo
 * The MicroCreature keys are legacy internal codenames kept for the renderer
 * mapping — only the art behind them is brand-true.
 *
 * Each glyph is an 11-row × 11-col string grid. Characters map to colors:
 *   '.' transparent (shows the status-color background)
 *   'B' body   'A' arm/antenna/leg   'C' claw   'D' joint/shadow   'E' eye   'K' cutout   'M' prompt mark   'F' logo frame
 *   Antigravity additionally uses gradient bands: L/T/Q/Y/O/R/P/V/U/N plus K for black cutout.
 * `work` is an optional second frame for a simple processing animation (leg wiggle).
 */

export type RGB = readonly [number, number, number];
export type MicroCreature = 'octopus' | 'jellyfish' | 'opencode' | 'crayfish' | 'antigravity';
export type MicroState = 'idle' | 'working' | 'asking';

export const MICRO_SIZE = 11;

interface Glyph {
  colors: Record<string, RGB>;
  idle: string[];
  work?: string[];
}

// Claude Code — rusty robot (design/brand/claudecode.svg): broad rectangular
// body, full-width side arms, straight vertical legs, and two narrow vertical
// cutout eyes. The eyes occupy two LED rows because the SVG holes are taller
// than they are wide; the legs stay aligned instead of wiggling.
const OCTOPUS: Glyph = {
  colors: { B: [235, 130, 90], D: [150, 84, 64], K: [0, 0, 0] },
  idle: [
    '...........',
    '.BBBBBBBBB.',
    '.BBBBBBBBB.',
    '.BBKBBBKBB.',
    '.BBKBBBKBB.',
    'BBBBBBBBBBB',
    'BBBBBBBBBBB',
    '.BBBBBBBBB.',
    '..BB...BB..',
    '..BB...BB..',
    '...........',
  ],
  work: [
    '...........',
    '.BBBBBBBBB.',
    '.BBBBBBBBB.',
    '.BBKBBBKBB.',
    '.BBKBBBKBB.',
    'BBBBBBBBBBB',
    'BBBBBBBBBBB',
    '.BBBBBBBBB.',
    '..BB...BB..',
    '..BB...BB..',
    '...........',
  ],
};

// Codex — lavender cloud (assets/logos/cloud_creature_gen.png, design/brand/codex.svg):
// puffy cloud outline with no dangling legs, plus an oversized `>_` prompt. The
// prompt is deliberately brighter than the body so it survives the LED diffuser.
const JELLYFISH: Glyph = {
  colors: { B: [120, 126, 236], M: [238, 240, 255] },
  idle: [
    '...........',
    '...BBBBB...',
    '.BBBBBBBBB.',
    'BBBBBBBBBBB',
    'BBMBBBBBBBB',
    'BBBMMBBBBBB',
    'BBMBBBBBBBB',
    'BBBBBMMMBBB',
    'BBBBBBBBBBB',
    '.BBBBBBBBB.',
    '...BBBBB...',
  ],
};

// OpenCode — canonical opencode.svg: a single tall rectangular ring, not two
// overlapping squares and not a filled core. Light stroke so it reads on LEDs
// (#3a3a3a brand gray is too dark for this panel).
const OPENCODE: Glyph = {
  colors: { F: [232, 232, 232] },
  idle: [
    '...........',
    '..FFFFFFF..',
    '..FFFFFFF..',
    '..FF...FF..',
    '..FF...FF..',
    '..FF...FF..',
    '..FF...FF..',
    '..FF...FF..',
    '..FFFFFFF..',
    '..FFFFFFF..',
    '...........',
  ],
};

// Antigravity — rainbow peak/arc mark, simplified for an 11×11 matrix. The
// central hollow is transparent, not black, so the status field shows through
// like the open space in the official arc silhouette.
const ANTIGRAVITY: Glyph = {
  colors: {
    L: [92, 214, 77],
    T: [31, 198, 179],
    Q: [58, 199, 235],
    Y: [245, 203, 36],
    O: [255, 132, 16],
    R: [255, 82, 65],
    P: [183, 92, 182],
    V: [102, 111, 225],
    U: [36, 126, 255],
    N: [41, 184, 238],
  },
  idle: [
    '.....O.....',
    '....YOR....',
    '...LYORP...',
    '...LYORPV..',
    '...LTQRPV..',
    '..LTQRPVU..',
    '..TQ...VU..',
    '..Q.....U..',
    '.NQ.....UU.',
    '.N.......UU',
    '...........',
  ],
  work: [
    '....YO.....',
    '....YORP...',
    '...LYORPV..',
    '...LTQRPV..',
    '..LTQRPVU..',
    '..TQ...VU..',
    '..Q.....U..',
    '.NQ.....UU.',
    '.N.......UU',
    '...........',
    '...........',
  ],
};

// OpenClaw — red mechanical lobster (assets/logos/lobster_creature_gen.png,
// Pixoo LOD): side claws, small antennae, teal eyes, and a tapered body. The
// full asset's raised claws are too tall for 11px and read as a different head.
const CRAYFISH: Glyph = {
  colors: { B: [255, 92, 92], C: [210, 52, 52], A: [225, 180, 170], E: [0, 229, 204] },
  idle: [
    '...A...A...',
    '....A.A....',
    '....BBB....',
    '...BEBEB...',
    'C.BBBBBBB.C',
    'CC.BBBBB.CC',
    '.CBBBBBBB.C',
    '..BBBBBBB..',
    '...BBBBB...',
    '...BB.BB...',
    '..BB...BB..',
  ],
  work: [
    '....A.A....',
    '...A...A...',
    '....BBB....',
    '...BEBEB...',
    '.CBBBBBBB.C',
    'CC.BBBBB.CC',
    'C.BBBBBBB.C',
    '..BBBBBBB..',
    '...BBBBB...',
    '...B.B.B...',
    '..BB...BB..',
  ],
};

const GLYPHS: Record<MicroCreature, Glyph> = {
  octopus: OCTOPUS,
  jellyfish: JELLYFISH,
  opencode: OPENCODE,
  crayfish: CRAYFISH,
  antigravity: ANTIGRAVITY,
};

/** Dark status-color field so the bright creature pops. Amber awaiting pulses. */
export function microStatusBg(
  state: 'idle' | 'processing' | 'awaiting' | 'error',
  animFrame: number,
): RGB {
  switch (state) {
    case 'error': return [64, 18, 18];
    case 'awaiting': {
      const p = 0.78 + 0.22 * ((Math.sin(animFrame * 0.25) + 1) / 2);
      return [Math.round(74 * p), Math.round(50 * p), Math.round(10 * p)];
    }
    case 'processing': return [10, 28, 64];
    default: return [16, 56, 28];
  }
}

/**
 * Paint a creature glyph onto an 11×11 RGB buffer (only non-transparent pixels).
 * `working` alternates two leg frames; `asking` reuses the idle pose (the amber
 * field already signals "awaiting").
 */
export function paintMicroGlyph(
  buf: Uint8Array,
  creature: MicroCreature,
  state: MicroState,
  animFrame: number,
): void {
  const g = GLYPHS[creature];
  const grid = state === 'working' && g.work && ((animFrame >> 2) & 1) ? g.work : g.idle;
  const drift = creature === 'antigravity' ? Math.floor(animFrame / 6) % 4 : 0;
  const offsetX = creature === 'antigravity' && state === 'working'
    ? (drift === 1 ? 1 : drift === 3 ? -1 : 0)
    : 0;
  const offsetY = creature === 'antigravity' && state !== 'idle' && (drift === 0 || drift === 1) ? -1 : 0;
  for (let y = 0; y < MICRO_SIZE; y++) {
    const row = grid[y];
    for (let x = 0; x < MICRO_SIZE; x++) {
      const col = g.colors[row[x]];
      if (!col) continue;
      const dx = x + offsetX;
      const dy = y + offsetY;
      if (dx < 0 || dx >= MICRO_SIZE || dy < 0 || dy >= MICRO_SIZE) continue;
      const i = (dy * MICRO_SIZE + dx) * 3;
      buf[i] = col[0]; buf[i + 1] = col[1]; buf[i + 2] = col[2];
    }
  }
}
