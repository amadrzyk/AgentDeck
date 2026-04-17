// EinkEsp32Previews.swift — E-ink readers + ESP32 display boards.
//
// E-ink previews deliberately use a cream/paper-white canvas with near-black
// creature outlines — this mirrors the CremaS / Kobo rendering pipeline which
// forces the drawable into 2-bit or 4-bit greyscale. The color e-ink variant
// (Pantone6) tints the creature with the agent brand because the device
// actually supports ~6 colours.
//
// ESP32 previews are all framed device bodies with a creature + HUD. The real
// firmware is LVGL + custom draw routines that we don't try to port here.

import SwiftUI

// MARK: - E-ink Mono

struct EinkMonoPreview: View {
    let selection: DevicePreviewSelection

    var body: some View {
        VStack(spacing: 10) {
            DeviceBezel(
                cornerRadius: 14,
                bezelWidth: 16,
                bezelColor: Color(white: 0.85),
                screenColor: Color(red: 0.95, green: 0.94, blue: 0.90)
            ) {
                VStack(spacing: 10) {
                    HStack {
                        Text("AgentDeck").font(.system(size: 11, weight: .semibold, design: .serif))
                        Spacer()
                        Text("CREMAS")
                            .font(.system(size: 9, design: .monospaced))
                            .foregroundStyle(.black.opacity(0.5))
                    }
                    .foregroundStyle(.black.opacity(0.85))
                    Spacer()
                    // Mono creature — tinted black, state written below
                    Image(creatureAsset)
                        .resizable()
                        .renderingMode(.template)
                        .interpolation(.high)
                        .aspectRatio(contentMode: .fit)
                        .foregroundStyle(.black.opacity(0.8))
                        .frame(width: 140, height: 140)
                        .opacity(selection.state == .disconnected ? 0.25 : 1)
                    Text(selection.agent.displayName)
                        .font(.system(size: 13, weight: .bold, design: .serif))
                        .foregroundStyle(.black)
                    Text(stateLine)
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(.black.opacity(0.65))
                    Spacer()
                }
            }
            .frame(width: 240, height: 320)
            Text("E-ink mono • CremaS / Kobo")
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.secondary)
        }
    }

    private var creatureAsset: String {
        switch selection.agent {
        case .claudeCode: return "CreatureClaudeCode"
        case .codex:      return "CreatureCodex"
        case .opencode:   return "CreatureOpenCode"
        case .openclaw:   return "CreatureOpenClaw"
        }
    }

    private var stateLine: String {
        "STATE: \(selection.state.displayName.uppercased()) • \(selection.sessionCount)x"
    }
}

// MARK: - E-ink Color (Pantone6)

struct EinkColorPreview: View {
    let selection: DevicePreviewSelection

    var body: some View {
        VStack(spacing: 10) {
            DeviceBezel(
                cornerRadius: 14,
                bezelWidth: 16,
                bezelColor: Color(white: 0.88),
                screenColor: Color(red: 0.96, green: 0.95, blue: 0.88)
            ) {
                VStack(spacing: 10) {
                    HStack {
                        Text("AgentDeck").font(.system(size: 11, weight: .semibold, design: .serif))
                            .foregroundStyle(.black)
                        Spacer()
                        Text("PANTONE6")
                            .font(.system(size: 9, design: .monospaced))
                            .foregroundStyle(.black.opacity(0.5))
                    }
                    Spacer()
                    PreviewCreature(agent: selection.agent, state: selection.state, size: 150)
                    Text(selection.agent.displayName)
                        .font(.system(size: 13, weight: .bold, design: .serif))
                        .foregroundStyle(StateColors.brand(agent: selection.agent.rawValue))
                    Text(selection.state.displayName.uppercased())
                        .font(.system(size: 10, weight: .heavy, design: .monospaced))
                        .foregroundStyle(StateColors.color(for: selection.state.sessionStateStringForUI))
                    Spacer()
                }
            }
            .frame(width: 240, height: 320)
            Text("E-ink color • Pantone6")
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - ESP32 86Box (1.28" round)

struct Esp3286BoxPreview: View {
    let selection: DevicePreviewSelection

    var body: some View {
        VStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(Color(white: 0.08))
                    .frame(width: 240, height: 240)
                Circle()
                    .fill(Color.black)
                    .frame(width: 210, height: 210)
                VStack(spacing: 6) {
                    PreviewStateDot(state: selection.state, size: 10)
                    PreviewCreature(agent: selection.agent, state: selection.state, size: 110)
                    Text(selection.agent.displayName.uppercased())
                        .font(.system(size: 10, weight: .heavy, design: .monospaced))
                        .foregroundStyle(.white.opacity(0.8))
                    Text("\(selection.sessionCount)x • \(selection.state.displayName.uppercased())")
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
            }
            Text("ESP32 86Box • 1.28\" round")
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - ESP32 IPS 3.5" Landscape

struct Esp3235LandscapePreview: View {
    let selection: DevicePreviewSelection

    var body: some View {
        VStack(spacing: 10) {
            DeviceBezel(cornerRadius: 14, bezelWidth: 10) {
                HStack(spacing: 12) {
                    PreviewCreature(agent: selection.agent, state: selection.state, size: 150)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(selection.agent.displayName)
                            .font(.system(size: 16, weight: .heavy))
                            .foregroundStyle(StateColors.brand(agent: selection.agent.rawValue))
                        HStack(spacing: 6) {
                            PreviewStateDot(state: selection.state, size: 8)
                            Text(selection.state.displayName.uppercased())
                                .font(.system(size: 12, weight: .bold, design: .monospaced))
                                .foregroundStyle(StateColors.color(for: selection.state.sessionStateStringForUI))
                        }
                        Text("\(selection.sessionCount) session\(selection.sessionCount == 1 ? "" : "s")")
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundStyle(.white.opacity(0.7))
                        Spacer()
                        Text("3.5\" IPS 480×320")
                            .font(.system(size: 9, design: .monospaced))
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .frame(width: 400, height: 240)
            Text("ESP32 IPS 3.5\" landscape")
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - ESP32 IPS 3.5" Portrait

struct Esp3235PortraitPreview: View {
    let selection: DevicePreviewSelection

    var body: some View {
        VStack(spacing: 10) {
            DeviceBezel(cornerRadius: 14, bezelWidth: 10) {
                VStack(spacing: 10) {
                    HStack {
                        Text("AGENTDECK")
                            .font(.system(size: 10, weight: .heavy, design: .monospaced))
                            .foregroundStyle(.white.opacity(0.85))
                        Spacer()
                        PreviewStateDot(state: selection.state, size: 8)
                    }
                    PreviewCreature(agent: selection.agent, state: selection.state, size: 160)
                    Text(selection.agent.displayName)
                        .font(.system(size: 16, weight: .heavy))
                        .foregroundStyle(StateColors.brand(agent: selection.agent.rawValue))
                    Text(selection.state.displayName.uppercased())
                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                        .foregroundStyle(StateColors.color(for: selection.state.sessionStateStringForUI))
                    Spacer()
                    Text("\(selection.sessionCount)× sessions")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(.white.opacity(0.7))
                }
            }
            .frame(width: 240, height: 360)
            Text("ESP32 IPS 3.5\" portrait")
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - ESP32 Round AMOLED 1.6"

struct Esp32RoundPreview: View {
    let selection: DevicePreviewSelection

    var body: some View {
        VStack(spacing: 10) {
            ZStack {
                Circle().fill(Color(white: 0.06)).frame(width: 260, height: 260)
                Circle().fill(Color.black).frame(width: 230, height: 230)
                // Tick marks — dial feel
                ForEach(0..<12, id: \.self) { i in
                    Capsule()
                        .fill(Color.white.opacity(i % 3 == 0 ? 0.4 : 0.15))
                        .frame(width: 2, height: i % 3 == 0 ? 10 : 5)
                        .offset(y: -108)
                        .rotationEffect(.degrees(Double(i) * 30))
                }
                VStack(spacing: 4) {
                    PreviewCreature(agent: selection.agent, state: selection.state, size: 100)
                    Text(selection.state.displayName.uppercased())
                        .font(.system(size: 10, weight: .heavy, design: .monospaced))
                        .foregroundStyle(StateColors.color(for: selection.state.sessionStateStringForUI))
                    Text("\(selection.sessionCount)×")
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
            }
            Text("ESP32 round AMOLED 1.6\"")
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.secondary)
        }
    }
}
