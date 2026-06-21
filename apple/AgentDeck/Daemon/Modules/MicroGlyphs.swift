#if os(macOS)
// MicroGlyphs.swift — Native 11×11 creature glyphs for the Timebox Mini micro layout.
//
// Swift mirror of bridge/src/pixoo/micro-glyphs.ts. The Timebox Mini has only 121
// LEDs; downscaling the 32×32 terrarium creature bottoms out at a fuzzy silhouette,
// so each creature is hand-authored directly at 11×11 as a bold, high-contrast
// bitmap. The glyph grids and brand colors here are kept byte-identical to the TS
// module so the App Store macOS build and the Node CLI render the same frames.
//
// Grid characters: '.' transparent (shows status bg), 'B' body, 'A' arm/leg/antenna,
// 'C' claw, 'E' eye, 'M' prompt marking, 'F' logo frame.

import Foundation

enum MicroCreature { case octopus, codex, opencode, crayfish }
enum MicroGlyphState { case idle, working, asking }
enum MicroAggregate { case idle, processing, awaiting, error }

enum MicroGlyphs {
    typealias RGB = (UInt8, UInt8, UInt8)
    static let size = 11

    private struct Glyph {
        let colors: [Character: RGB]
        let idle: [String]
        let work: [String]?
    }

    // Claude Code — terracotta octopus (#C07058): full-width body, two 2×2 near-black
    // negative-space eyes, side arm nubs, four dangling leg pairs.
    private static let octopus = Glyph(
        colors: ["B": (235, 130, 90), "A": (200, 100, 72), "E": (16, 9, 9)],
        idle: [
            "..BBBBBBB..",
            ".BBBBBBBBB.",
            "BBBBBBBBBBB",
            "BBEEBBBEEBB",
            "BBEEBBBEEBB",
            "ABBBBBBBBBA",
            "ABBBBBBBBBA",
            ".BBBBBBBBB.",
            ".BBBBBBBBB.",
            "BB.BB.BB.BB",
            "B..B...B..B",
        ],
        work: [
            "..BBBBBBB..",
            ".BBBBBBBBB.",
            "BBBBBBBBBBB",
            "BBEEBBBEEBB",
            "BBEEBBBEEBB",
            "ABBBBBBBBBA",
            "ABBBBBBBBBA",
            ".BBBBBBBBB.",
            ".BBBBBBBBB.",
            "BB.BB.BB.BB",
            "..B.B.B.B..",
        ]
    )

    // Codex — indigo cloud (#6166E0): cloud body with top bumps + bottom tentacle
    // lobes, carrying a white `>` chevron + `_` terminal prompt.
    private static let codex = Glyph(
        colors: ["B": (120, 126, 236), "M": (238, 240, 255)],
        idle: [
            "..BB.BB....",
            ".BBBBBBBB..",
            "BBBBBBBBBBB",
            "BBBBBBBBBBB",
            "BMMBBBBBBBB",
            "BBMMBBBBBBB",
            "BMMBBBBBBBB",
            "BBBBMMMMBBB",
            "BBBBBBBBBBB",
            ".BB.BB.BB..",
            ".B...B...B.",
        ],
        work: nil
    )

    // OpenCode — two overlapping HOLLOW squares (canonical opencode.svg ring logo;
    // no filled core — a solid center reads as a shadow).
    private static let opencode = Glyph(
        colors: ["F": (232, 232, 232)],
        idle: [
            "FFFFFF.....",
            "F....F.....",
            "F....F.....",
            "F..FFFFFF..",
            "F..F...F...",
            "FFFF...F...",
            "...F...F...",
            "...F...F...",
            "...FFFFFF..",
            "...........",
            "...........",
        ],
        work: nil
    )

    // OpenClaw — red crayfish (#FF4D4D): round body, antennae curving to the top
    // corners, two side-claw blobs, two teal eyes (#00E5CC), two leg stubs.
    private static let crayfish = Glyph(
        colors: ["B": (255, 92, 92), "C": (210, 52, 52), "A": (225, 180, 170), "E": (0, 229, 204)],
        idle: [
            "A.........A",
            ".A.......A.",
            "..A.....A..",
            "...BBBBB...",
            "..BBBBBBB..",
            "CCBBEBEBBCC",
            "CCBBBBBBBCC",
            "..BBBBBBB..",
            "..BBBBBBB..",
            "...BB.BB...",
            "...B...B...",
        ],
        work: [
            "A.........A",
            ".A.......A.",
            "..A.....A..",
            "...BBBBB...",
            "..BBBBBBB..",
            ".CBBEBEBBC.",
            ".CBBBBBBBC.",
            "..BBBBBBB..",
            "..BBBBBBB..",
            "...B.B.B...",
            "..B..B..B..",
        ]
    )

    private static func glyph(for creature: MicroCreature) -> Glyph {
        switch creature {
        case .octopus: return octopus
        case .codex: return codex
        case .opencode: return opencode
        case .crayfish: return crayfish
        }
    }

    /// Dark status-color field so the bright creature pops. Amber awaiting pulses.
    static func statusBg(_ state: MicroAggregate, animFrame: Int) -> RGB {
        switch state {
        case .error: return (64, 18, 18)
        case .awaiting:
            let p = 0.78 + 0.22 * ((sin(Double(animFrame) * 0.25) + 1) / 2)
            return (UInt8(74 * p), UInt8(50 * p), UInt8(10 * p))
        case .processing: return (10, 28, 64)
        case .idle: return (16, 56, 28)
        }
    }

    /// Paint a creature glyph onto an 11×11 RGB buffer (only non-transparent pixels).
    /// `working` alternates two leg frames; `asking` reuses the idle pose.
    static func paint(_ buf: inout [UInt8], creature: MicroCreature, state: MicroGlyphState, animFrame: Int) {
        let g = glyph(for: creature)
        let grid: [String]
        if state == .working, let work = g.work, ((animFrame >> 2) & 1) == 1 {
            grid = work
        } else {
            grid = g.idle
        }
        for y in 0..<size {
            let row = Array(grid[y])
            for x in 0..<size {
                guard let col = g.colors[row[x]] else { continue }
                let i = (y * size + x) * 3
                buf[i] = col.0; buf[i + 1] = col.1; buf[i + 2] = col.2
            }
        }
    }
}
#endif
