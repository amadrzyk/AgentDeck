// MatrixTerminalPreviews.swift — Ulanzi TC001/TC100 8×32 LED matrix + TUI terrarium.
//
// The matrix preview draws the Pixoo-style 64×64 frame from PixooPreview,
// then crops the top 8 rows and the middle 32 columns so the result has the
// correct 8×32 aspect. This reuses the real renderer pipeline for visual
// parity with the actual WS2812B hardware. Note: the production matrix code
// path lives in the bridge/ESP32 firmware — this is a *visual approximation*
// sufficient for the "what does it look like" preview, not a driver test.
//
// The terminal preview uses TUITerrariumRenderer directly.

import SwiftUI

// MARK: - Pixoo 64

struct Pixoo64Preview: View {
    let selection: DevicePreviewSelection

    var body: some View {
        VStack(spacing: 12) {
            DeviceBezel(cornerRadius: 16, bezelWidth: 12, bezelColor: Color(white: 0.12)) {
                let config = PixooPreviewConfig(
                    agent: selection.agent,
                    state: selection.state,
                    sessionCount: selection.sessionCount,
                    fiveHourPercent: nil,
                    gatewayAvailable: false
                )
                PixooPreview.previewImage(config)
                    .resizable()
                    .interpolation(.none)
                    .aspectRatio(1, contentMode: .fill)
                    .frame(width: 320, height: 320)
                    .cornerRadius(4)
                    .overlay(
                        // Faint pixel grid to evoke the LED look
                        GeometryReader { geo in
                            Path { p in
                                let stepXY = geo.size.width / 64
                                for i in 0...64 {
                                    let pos = CGFloat(i) * stepXY
                                    p.move(to: CGPoint(x: pos, y: 0))
                                    p.addLine(to: CGPoint(x: pos, y: geo.size.height))
                                    p.move(to: CGPoint(x: 0, y: pos))
                                    p.addLine(to: CGPoint(x: geo.size.width, y: pos))
                                }
                            }
                            .stroke(Color.black.opacity(0.35), lineWidth: 0.3)
                        }
                    )
            }
            .frame(width: 380, height: 380)
            
            Text("Pixoo 64 • 64×64 LED Matrix")
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.secondary)
            Text("Renderer uses exact pixel-art coordinate generation.")
                .font(.system(size: 9))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
    }
}

// MARK: - Ulanzi TC001 matrix
//
// Real firmware (esp32/src/ui/matrix/matrix_pages.cpp) rotates through
// pages: AGENTS (creature sprites + state LEDs), USAGE (horizontal
// battery gauges), and a disconnect breathing pulse. The preview
// reproduces the AGENTS page look — 5×6 creature sprite on the left,
// agent label + session count digits in 3×5 micro-font, plus a state
// dot per alive session pinned to the right edge. It's a cropped
// approximation (no scrolling/page cycling), but it matches what the
// user will see at a glance on the real device.

struct UlanziMatrixPreview: View {
    let selection: DevicePreviewSelection

    // 8x32 WS2812B LED grid rendered as a CSS-style dot matrix. Pixel
    // size controls how big each LED appears in the preview; keep it
    // generous so the shape of the creature is legible.
    private let ledPixel: CGFloat = 10
    private let matrixW = 32
    private let matrixH = 8

    var body: some View {
        VStack(spacing: 10) {
            DeviceBezel(cornerRadius: 10, bezelWidth: 8, bezelColor: Color(white: 0.12)) {
                GeometryReader { _ in
                    ZStack {
                        Color.black
                        Canvas { ctx, size in
                            drawMatrix(ctx: &ctx, size: size)
                        }
                        .padding(2)
                    }
                }
            }
            .frame(width: CGFloat(matrixW) * ledPixel + 28,
                   height: CGFloat(matrixH) * ledPixel + 28)
            Text("Ulanzi TC001 • 8×32 WS2812B")
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.secondary)
            Text("AGENTS page — sprite + state LEDs per alive session. Firmware also rotates a USAGE page with 5h/7d bar gauges.")
                .font(.system(size: 9))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 380)
        }
    }

    // Draw the AGENTS page directly into a Canvas using one filled rect
    // per "lit" LED. Mirrors matrix_pages.cpp's spriteForAgent + state
    // LED column but skips the text scroller (static preview).
    private func drawMatrix(ctx: inout GraphicsContext, size: CGSize) {
        let cellW = size.width / CGFloat(matrixW)
        let cellH = size.height / CGFloat(matrixH)

        // Off-LED fill — very dim grey so the grid is visible without
        // drawing a separate overlay.
        let offColor = Color(red: 0.06, green: 0.06, blue: 0.08)
        for y in 0..<matrixH {
            for x in 0..<matrixW {
                let rect = CGRect(
                    x: CGFloat(x) * cellW + 1,
                    y: CGFloat(y) * cellH + 1,
                    width: cellW - 2,
                    height: cellH - 2
                )
                ctx.fill(Path(roundedRect: rect, cornerRadius: 1.5), with: .color(offColor))
            }
        }

        // Sprite (5×6) in the left-most column slot, rows 1–6
        let sprite = spriteForAgent(selection.agent)
        let brand = StateColors.brand(agent: selection.agent.rawValue)
        for row in 0..<6 {
            let bits = sprite[row]
            for col in 0..<5 {
                if (bits >> (4 - col)) & 1 == 1 {
                    drawLED(ctx: &ctx, x: col + 1, y: row + 1,
                            color: brand, cellW: cellW, cellH: cellH)
                }
            }
        }

        // Micro agent label in rows 1–5, cols 8–20 using a simple 3×5
        // font (digits + uppercase). The real firmware scrolls text in
        // a 5-row zone; we just render "Nx" + short agent tag statically.
        let labelText = "\(selection.sessionCount)X"
        var cursorX = 9
        for ch in labelText {
            let glyph = microGlyph(for: ch)
            for row in 0..<5 {
                let bits = glyph[row]
                for col in 0..<3 {
                    if (bits >> (2 - col)) & 1 == 1 {
                        drawLED(ctx: &ctx, x: cursorX + col, y: row + 1,
                                color: TerrariumHUD.text, cellW: cellW, cellH: cellH)
                    }
                }
            }
            cursorX += 4
        }

        // State dot column on the right edge — one LED per alive
        // session (up to 4), pulsing color from StateColors.
        let stateColor = StateColors.color(for: selection.state.sessionStateStringForUI)
        let sessions = min(max(selection.sessionCount, 0), 4)
        for i in 0..<sessions {
            drawLED(ctx: &ctx, x: matrixW - 1, y: i + 2,
                    color: stateColor, cellW: cellW, cellH: cellH)
        }
    }

    private func drawLED(
        ctx: inout GraphicsContext,
        x: Int, y: Int,
        color: Color,
        cellW: CGFloat, cellH: CGFloat
    ) {
        guard x >= 0, x < matrixW, y >= 0, y < matrixH else { return }
        let rect = CGRect(
            x: CGFloat(x) * cellW + 1,
            y: CGFloat(y) * cellH + 1,
            width: cellW - 2,
            height: cellH - 2
        )
        // Slight glow to suggest an LED lens on top of an LED die.
        ctx.fill(Path(roundedRect: rect, cornerRadius: 1.5), with: .color(color.opacity(0.92)))
        ctx.fill(
            Path(ellipseIn: rect.insetBy(dx: rect.width * 0.18, dy: rect.height * 0.18)),
            with: .color(color)
        )
    }

    /// 5×6 sprite masks matching matrix_pages.cpp (SPR_OCTOPUS /
    /// SPR_OPENCODE / SPR_JELLYFISH). Each row is 5 bits in the low
    /// nibble + bit4.
    private func spriteForAgent(_ agent: PixooPreviewAgent) -> [UInt8] {
        switch agent {
        case .claudeCode:
            return [0b01110, 0b11111, 0b10101, 0b11111, 0b01010, 0b10101]
        case .opencode:
            return [0b11111, 0b10001, 0b10101, 0b10001, 0b10001, 0b11111]
        case .openclaw:
            return [0b01110, 0b11111, 0b11011, 0b01110, 0b01010, 0b10001]
        case .codex:
            // Approximation — real firmware ships separate CODEX sprite.
            return [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010]
        }
    }

    /// Minimal 3×5 font for digits + 'X'. Each row is 3 low bits.
    private func microGlyph(for ch: Character) -> [UInt8] {
        switch ch {
        case "0": return [0b111, 0b101, 0b101, 0b101, 0b111]
        case "1": return [0b010, 0b110, 0b010, 0b010, 0b111]
        case "2": return [0b111, 0b001, 0b111, 0b100, 0b111]
        case "3": return [0b111, 0b001, 0b011, 0b001, 0b111]
        case "4": return [0b101, 0b101, 0b111, 0b001, 0b001]
        case "X": return [0b101, 0b101, 0b010, 0b101, 0b101]
        default:  return [0b000, 0b000, 0b000, 0b000, 0b000]
        }
    }
}

// MARK: - Terminal Terrarium

struct TerminalTerrariumPreview: View {
    let selection: DevicePreviewSelection

    private var agentsAndStates: (agents: [String], states: [String]) {
        let count = max(selection.sessionCount, 1)
        let palette: [PixooPreviewAgent] = [selection.agent, .codex, .opencode, .openclaw]
        var agents: [String] = []
        var states: [String] = []
        for i in 0..<min(count, 4) {
            agents.append(palette[i % palette.count].rawValue)
            states.append(i == 0 ? selection.state.sessionStateStringForUI : "idle")
        }
        return (agents, states)
    }

    var body: some View {
        VStack(spacing: 10) {
            let (agents, states) = agentsAndStates
            let config = TerrariumPreviewConfig(
                agents: agents,
                states: states,
                animationFrame: selection.animationFrame,
                width: 60,
                height: 20
            )
            DeviceBezel(cornerRadius: 10, bezelWidth: 10, bezelColor: Color(white: 0.18), screenColor: .black) {
                TUITerrariumRenderer(config: config, cellWidth: 8, cellHeight: 16)
            }
            .frame(width: 540, height: 360)
            Text("Terminal • agentdeck dashboard")
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.secondary)
        }
    }
}
