/**
 * Native 11×11 creature glyphs for the Timebox Mini micro layout.
 *
 * The Timebox Mini has only 121 LEDs. Downscaling the 32×32 terrarium creature to
 * 11×11 bottoms out at a fuzzy silhouette — so for this device the creatures are
 * **hand-authored directly at 11×11** as bold, high-contrast bitmaps. Every pixel
 * is intentional, which is dramatically more legible than any downscale.
 *
 * Each glyph is an 11-row × 11-col string grid. Characters map to colors:
 *   '.' transparent (shows the status-color background)
 *   'B' body   'A' arm/tentacle/leg   'C' claw/shell   'E' eye
 * `work` is an optional second frame for a simple processing animation (leg wiggle).
 */

export type RGB = readonly [number, number, number];
export type MicroCreature = 'octopus' | 'jellyfish' | 'opencode' | 'crayfish';
export type MicroState = 'idle' | 'working' | 'asking';

export const MICRO_SIZE = 11;

interface Glyph {
  colors: Record<string, RGB>;
  idle: string[];
  work?: string[];
}

// Claude Code — terracotta octopus (#C07058): rounded full-width body, two 2×2
// near-black negative-space eyes (canonical octopusEye), side arm nubs, four
// dangling leg pairs. Mirrors OCTOPUS_GRID_HD/MD's silhouette at 11×11.
const OCTOPUS: Glyph = {
  colors: { B: [235, 130, 90], A: [200, 100, 72], E: [16, 9, 9] },
  idle: [
    '..BBBBBBB..',
    '.BBBBBBBBB.',
    'BBBBBBBBBBB',
    'BBEEBBBEEBB',
    'BBEEBBBEEBB',
    'ABBBBBBBBBA',
    'ABBBBBBBBBA',
    '.BBBBBBBBB.',
    '.BBBBBBBBB.',
    'BB.BB.BB.BB',
    'B..B...B..B',
  ],
  work: [
    '..BBBBBBB..',
    '.BBBBBBBBB.',
    'BBBBBBBBBBB',
    'BBEEBBBEEBB',
    'BBEEBBBEEBB',
    'ABBBBBBBBBA',
    'ABBBBBBBBBA',
    '.BBBBBBBBB.',
    '.BBBBBBBBB.',
    'BB.BB.BB.BB',
    '..B.B.B.B..',
  ],
};

// Codex — indigo cloud (#6166E0): cloud/clover body with top bumps and bottom
// tentacle lobes (mirrors JELLYFISH_GRID_HD/MD), carrying a white `>` chevron +
// `_` terminal prompt — the Codex identity. Keyed 'jellyfish' to match the
// renderer's creatureType for codex agents.
const JELLYFISH: Glyph = {
  colors: { B: [120, 126, 236], M: [238, 240, 255] },
  idle: [
    '..BB.BB....',
    '.BBBBBBBB..',
    'BBBBBBBBBBB',
    'BBBBBBBBBBB',
    'BMMBBBBBBBB',
    'BBMMBBBBBBB',
    'BMMBBBBBBBB',
    'BBBBMMMMBBB',
    'BBBBBBBBBBB',
    '.BB.BB.BB..',
    '.B...B...B.',
  ],
};

// OpenCode — two overlapping HOLLOW squares (the canonical opencode.svg ring
// logo; no filled core — a solid center reads as a shadow). Light stroke so it
// reads (#3a3a3a brand gray is too dark for LEDs). Mirrors OPENCODE_GRID_HD.
const OPENCODE: Glyph = {
  colors: { F: [232, 232, 232] },
  idle: [
    'FFFFFF.....',
    'F....F.....',
    'F....F.....',
    'F..FFFFFF..',
    'F..F...F...',
    'FFFF...F...',
    '...F...F...',
    '...F...F...',
    '...FFFFFF..',
    '...........',
    '...........',
  ],
};

// OpenClaw — red crayfish (#FF4D4D): round body, antennae curving to the top
// corners, two side-claw blobs, two teal eyes (canonical crayfishEye #00E5CC),
// two leg stubs. Mirrors CRAYFISH_GRID_HD/MD.
const CRAYFISH: Glyph = {
  colors: { B: [255, 92, 92], C: [210, 52, 52], A: [225, 180, 170], E: [0, 229, 204] },
  idle: [
    'A.........A',
    '.A.......A.',
    '..A.....A..',
    '...BBBBB...',
    '..BBBBBBB..',
    'CCBBEBEBBCC',
    'CCBBBBBBBCC',
    '..BBBBBBB..',
    '..BBBBBBB..',
    '...BB.BB...',
    '...B...B...',
  ],
  work: [
    'A.........A',
    '.A.......A.',
    '..A.....A..',
    '...BBBBB...',
    '..BBBBBBB..',
    '.CBBEBEBBC.',
    '.CBBBBBBBC.',
    '..BBBBBBB..',
    '..BBBBBBB..',
    '...B.B.B...',
    '..B..B..B..',
  ],
};

const GLYPHS: Record<MicroCreature, Glyph> = {
  octopus: OCTOPUS,
  jellyfish: JELLYFISH,
  opencode: OPENCODE,
  crayfish: CRAYFISH,
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
  for (let y = 0; y < MICRO_SIZE; y++) {
    const row = grid[y];
    for (let x = 0; x < MICRO_SIZE; x++) {
      const col = g.colors[row[x]];
      if (!col) continue;
      const i = (y * MICRO_SIZE + x) * 3;
      buf[i] = col[0]; buf[i + 1] = col[1]; buf[i + 2] = col[2];
    }
  }
}
