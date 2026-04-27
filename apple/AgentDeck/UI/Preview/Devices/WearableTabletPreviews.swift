// WearableTabletPreviews.swift — Apple Watch, iPad, Android tablet mockups.
//
// All three are framed device schematics with the creature + HUD. Tablets show
// a secondary "sidebar" strip so the mockup reads as dashboard-style.

import SwiftUI

// MARK: - Apple Watch

struct AppleWatchPreview: View {
    let selection: DevicePreviewSelection

    var body: some View {
        VStack(spacing: 10) {
            ZStack {
                // Case (capsule, approximating Series 11 46mm)
                RoundedRectangle(cornerRadius: 50, style: .continuous)
                    .fill(Color(white: 0.08))
                    .frame(width: 180, height: 220)
                    .overlay(
                        // Digital Crown hint
                        Capsule()
                            .fill(Color(white: 0.22))
                            .frame(width: 4, height: 28)
                            .offset(x: 92, y: -32)
                    )
                // Screen
                ZStack {
                    RoundedRectangle(cornerRadius: 42, style: .continuous)
                        .fill(LinearGradient(
                            colors: [TerrariumColors.deepSea, TerrariumColors.midWater, TerrariumColors.shallowWater],
                            startPoint: .top, endPoint: .bottom))

                    GeometryReader { geo in
                        PreviewCreatureGlyph(
                            agent: selection.agent,
                            state: selection.state,
                            size: min(geo.size.width, geo.size.height) * 0.30
                        )
                        .position(x: geo.size.width * 0.52, y: geo.size.height * 0.34)
                        ForEach(0..<min(max(selection.sessionCount, 0), 4), id: \.self) { i in
                            PreviewStateDot(
                                state: i == 0 ? selection.state : .idle,
                                size: 5
                            )
                            .position(x: geo.size.width * (0.38 + CGFloat(i) * 0.08), y: geo.size.height * 0.62)
                        }
                    }

                    VStack(spacing: 4) {
                        Spacer()
                        Text(stateLabel)
                            .font(.system(size: 12, weight: .heavy, design: .rounded))
                            .foregroundStyle(StateColors.color(for: selection.state.sessionStateStringForUI))
                        Text("\(selection.sessionCount) session\(selection.sessionCount == 1 ? "" : "s")")
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundStyle(.white.opacity(0.7))
                    }
                    .padding(.bottom, 20)
                }
                .frame(width: 160, height: 200)
                .clipShape(RoundedRectangle(cornerRadius: 42, style: .continuous))
            }
            Text("Apple Watch Series 11 46mm")
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.secondary)
        }
    }

    private var stateLabel: String {
        switch selection.state {
        case .idle:           return "IDLE"
        case .processing:     return "RUNNING"
        case .awaitingPrompt: return "PERMIT?"
        case .disconnected:   return "OFFLINE"
        }
    }
}

// MARK: - iPad (Landscape)

struct IPadLandscapePreview: View {
    let selection: DevicePreviewSelection

    var body: some View {
        VStack(spacing: 12) {
            DeviceBezel(cornerRadius: 24, bezelWidth: 12) {
                HStack(spacing: 8) {
                    PreviewMiniSessionList(selection: selection)
                        .frame(width: 108)
                    PreviewAquariumScene(selection: selection)
                    PreviewTopologyMini(selection: selection)
                        .frame(width: 116)
                }
            }
            .frame(width: 540, height: 330)
            Text("iPad landscape • dashboard")
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - Android Tablet (Lenovo-style)

struct AndroidTabletPreview: View {
    let selection: DevicePreviewSelection

    var body: some View {
        VStack(spacing: 12) {
            DeviceBezel(cornerRadius: 20, bezelWidth: 10, bezelColor: Color(white: 0.12)) {
                VStack(spacing: 6) {
                    HStack(spacing: 6) {
                        AgentDeckLogo(size: 12, color: TerrariumColors.tetraNeon)
                        Text("AgentDeck")
                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                            .foregroundStyle(.white.opacity(0.84))
                        Spacer()
                        Text("\(selection.sessionCount) sessions")
                            .font(.system(size: 9, design: .monospaced))
                            .foregroundStyle(.white.opacity(0.56))
                    }
                    HStack(spacing: 7) {
                        PreviewMiniSessionList(selection: selection, compact: true)
                            .frame(width: 96)
                        PreviewAquariumScene(selection: selection)
                        PreviewTopologyMini(selection: selection)
                            .frame(width: 122)
                    }
                }
            }
            .frame(width: 540, height: 320)
            Text("Android tablet • Lenovo / generic")
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.secondary)
        }
    }
}
