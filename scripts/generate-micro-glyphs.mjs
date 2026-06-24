// Generate the Swift mirror of the Timebox Mini 11×11 micro-glyph data from the
// TS SSOT (bridge/src/pixoo/micro-glyphs.ts), so the App Store macOS daemon and the
// Node CLI can never drift. Mirrors the generate-creature-glyphs.mjs codegen pattern.
//
// micro-glyphs.ts stays the single source of truth (it is imported at runtime by the
// compiled bridge — the bridge runs from dist with plain `tsc`, which does not copy a
// JSON sidecar, so the data must remain inline TS). This script parses the four glyph
// object literals out of that file and emits the consuming Swift data table.
//
// Output: apple/AgentDeck/Daemon/Modules/MicroGlyphs.generated.swift (committed).
// After running, the hand-written MicroGlyphs.swift consumes `generatedGlyphs`.
//
//   pnpm generate-micro-glyphs

import { writeFileSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcFile = resolve(__dirname, '../bridge/src/pixoo/micro-glyphs.ts');
const outFile = resolve(__dirname, '../apple/AgentDeck/Daemon/Modules/MicroGlyphs.generated.swift');

// TS const name → TS MicroCreature key (the renderer mapping in micro-glyphs.ts GLYPHS).
const CONSTS = [
  ['OCTOPUS', 'octopus'],
  ['JELLYFISH', 'jellyfish'],
  ['OPENCODE', 'opencode'],
  ['CRAYFISH', 'crayfish'],
];

const ts = readFileSync(srcFile, 'utf8');

/** Extract `const NAME: Glyph = { ... };` and evaluate the object literal. */
function extractGlyph(name) {
  // Each glyph block ends at the first line that is exactly `};` — no inner content
  // contains that sequence, so the non-greedy match is unambiguous.
  const re = new RegExp(`const ${name}: Glyph = (\\{[\\s\\S]*?\\n\\});`, 'm');
  const m = ts.match(re);
  if (!m) throw new Error(`generate-micro-glyphs: could not find glyph const ${name} in micro-glyphs.ts`);
  // The literal is plain JS (unquoted keys, number-array colors) — eval our own source.
  // eslint-disable-next-line no-new-func
  const glyph = new Function(`return (${m[1]})`)();
  if (!Array.isArray(glyph.idle) || glyph.idle.length !== 11) {
    throw new Error(`generate-micro-glyphs: ${name}.idle must be 11 rows`);
  }
  return glyph;
}

function swiftRows(rows) {
  return rows.map((r) => `            ${JSON.stringify(r)},`).join('\n');
}

function swiftColors(colors) {
  const entries = Object.entries(colors).map(([k, [r, g, b]]) => `"${k}": (${r}, ${g}, ${b})`);
  return `[${entries.join(', ')}]`;
}

function swiftGlyph(key, glyph) {
  const work = glyph.work
    ? `\n        work: [\n${swiftRows(glyph.work)}\n        ]`
    : '\n        work: nil';
  return `    "${key}": Glyph(
        colors: ${swiftColors(glyph.colors)},
        idle: [
${swiftRows(glyph.idle)}
        ],${work}
    ),`;
}

const bodies = CONSTS.map(([constName, key]) => swiftGlyph(key, extractGlyph(constName))).join('\n');

const header = `#if os(macOS)
// MicroGlyphs.generated.swift — AUTO-GENERATED, DO NOT EDIT.
//
// Source of truth: bridge/src/pixoo/micro-glyphs.ts
// Regenerate with: pnpm generate-micro-glyphs
//
// The grid/color tables below are emitted byte-for-byte from the TS glyph literals so
// the App Store macOS daemon and the Node CLI render identical Timebox Mini frames.
// Edit micro-glyphs.ts and re-run the generator — never hand-edit this file.

import Foundation

extension MicroGlyphs {
    // Keyed by the TS MicroCreature names; MicroGlyphs.glyph(for:) maps the Swift enum
    // (note: Swift .codex == TS "jellyfish").
    static let generatedGlyphs: [String: Glyph] = [
${bodies}
    ]
}
#endif
`;

writeFileSync(outFile, header);
console.log(`generate-micro-glyphs: wrote ${outFile} (${CONSTS.length} glyphs)`);
