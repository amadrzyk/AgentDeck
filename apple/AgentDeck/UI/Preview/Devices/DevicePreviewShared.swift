// DevicePreviewShared.swift — Small helpers reused across Device Preview mockups.
//
// Most non-Pixoo / non-Terrarium devices in the catalog are framed by a simple
// rounded-rectangle "bezel" with placeholder content (creature + state dot + a
// short HUD line). Rather than porting LVGL / Compose / Kobo epd code to Swift
// just for previews, we keep each mockup pragmatic: the *shape* of the device
// is accurate, but the interior is a schematic.
//
// These helpers centralise the bezel, the creature-in-a-circle, the state dot,
// and a tiny HUD row so each per-device View stays under ~60 LOC.

import SwiftUI

// MARK: - Bezel

/// A rounded "device body" outline. Callers supply an aspect ratio and place
/// content in the closure. Thickness is the bezel wall; content fills the inner
/// rounded rect.
struct DeviceBezel<Content: View>: View {
    let cornerRadius: CGFloat
    let bezelWidth: CGFloat
    let bezelColor: Color
    let screenColor: Color
    @ViewBuilder var content: () -> Content

    init(
        cornerRadius: CGFloat = 18,
        bezelWidth: CGFloat = 14,
        bezelColor: Color = Color(white: 0.08),
        screenColor: Color = Color(white: 0.05),
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.cornerRadius = cornerRadius
        self.bezelWidth = bezelWidth
        self.bezelColor = bezelColor
        self.screenColor = screenColor
        self.content = content
    }

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(bezelColor)
            RoundedRectangle(cornerRadius: max(2, cornerRadius - bezelWidth * 0.5), style: .continuous)
                .fill(screenColor)
                .padding(bezelWidth)
            content()
                .padding(bezelWidth + 4)
        }
    }
}

// MARK: - Creature placeholder

/// Agent creature rendered in the agent brand colour inside a soft disc. When
/// the asset catalog ships a "CreatureXxx" image we use it; otherwise we
/// fall back to the agent's initial in a circle. Matches the SessionListPanel /
/// ControlTowerPanel pattern.
struct PreviewCreature: View {
    let agent: PixooPreviewAgent
    let state: PixooPreviewState
    var size: CGFloat = 64

    private var tint: Color { StateColors.brand(agent: agent.rawValue) }
    private var assetName: String? {
        switch agent {
        case .claudeCode: return "CreatureClaudeCode"
        case .codex:      return "CreatureCodex"
        case .opencode:   return "CreatureOpenCode"
        case .openclaw:   return "CreatureOpenClaw"
        }
    }

    var body: some View {
        ZStack {
            Circle()
                .fill(tint.opacity(0.15))
            if let name = assetName {
                Image(name)
                    .resizable()
                    .renderingMode(.template)
                    .interpolation(.high)
                    .aspectRatio(contentMode: .fit)
                    .foregroundStyle(tint)
                    .padding(size * 0.12)
            } else {
                Text(agent.displayName.prefix(1))
                    .font(.system(size: size * 0.45, weight: .bold))
                    .foregroundStyle(tint)
            }
        }
        .frame(width: size, height: size)
        .opacity(state == .disconnected ? 0.35 : 1.0)
        .accessibilityLabel("\(agent.displayName) \(state.displayName)")
    }
}

// Internal bridge: map PixooPreviewState to the canonical lowercase state key
// used by StateColors.color(for:). Keeps the mapping in one place.
extension PixooPreviewState {
    var sessionStateStringForUI: String {
        switch self {
        case .idle:           return "idle"
        case .processing:     return "processing"
        case .awaitingPrompt: return "awaiting_permission"
        case .disconnected:   return "disconnected"
        }
    }
}

// MARK: - Status dot + HUD row

struct PreviewStateDot: View {
    let state: PixooPreviewState
    var size: CGFloat = 10

    var body: some View {
        Circle()
            .fill(StateColors.color(for: state.sessionStateStringForUI))
            .frame(width: size, height: size)
            .overlay(
                Circle()
                    .strokeBorder(Color.white.opacity(0.35), lineWidth: 0.5)
            )
    }
}

struct PreviewHUD: View {
    let agent: PixooPreviewAgent
    let state: PixooPreviewState
    let sessionCount: Int
    var compact: Bool = false

    private var primary: String {
        switch state {
        case .idle:           return "IDLE"
        case .processing:     return "RUNNING"
        case .awaitingPrompt: return "PERMIT?"
        case .disconnected:   return "OFFLINE"
        }
    }

    var body: some View {
        HStack(spacing: 6) {
            PreviewStateDot(state: state, size: compact ? 6 : 9)
            Text(primary)
                .font(.system(size: compact ? 9 : 11, weight: .heavy, design: .monospaced))
                .foregroundStyle(StateColors.color(for: state.sessionStateStringForUI))
            Spacer(minLength: 4)
            Text("\(sessionCount)·\(agent.displayName.prefix(3).uppercased())")
                .font(.system(size: compact ? 9 : 10, design: .monospaced))
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - Tiny creature grid (for deck/tablet schematics)

/// A compact 4-cell session grid used by the schematic deck and tablet
/// previews. Each cell is a small brand-coloured square with a state dot.
struct PreviewSessionTile: View {
    let agent: PixooPreviewAgent
    let state: PixooPreviewState
    var size: CGFloat = 48

    var body: some View {
        let tint = StateColors.brand(agent: agent.rawValue)
        return ZStack(alignment: .topTrailing) {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(tint.opacity(0.18))
                .overlay(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .strokeBorder(tint.opacity(0.5), lineWidth: 1)
                )
            PreviewCreature(agent: agent, state: state, size: size * 0.55)
                .padding(4)
            PreviewStateDot(state: state, size: 5)
                .padding(4)
        }
        .frame(width: size, height: size)
    }
}
