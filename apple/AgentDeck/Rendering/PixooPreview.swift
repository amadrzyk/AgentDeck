// PixooPreview.swift — Cross-platform, static preview wrapper around PixooRenderer.
//
// Purpose: expose the existing macOS `PixooRenderer` (which ports bridge/src/pixoo)
// as a reusable preview API for Device Preview and SwiftUI previews — WITHOUT
// duplicating any rendering logic. The renderer itself stays macOS-only (it lives
// in the in-process daemon); on iOS we return a stub image so the Device Preview
// UI can compile and run without a second Swift port.
//
// Key points:
//   - `PixooRenderer` has internal mutable state (bubbles, particles, animation
//     clocks). For deterministic preview output we instantiate a fresh renderer
//     on every call and discard it — its no-arg init is pure Swift with no I/O.
//   - The synthesized `DashboardState` mirrors what `syncCreatures` and the
//     gateway/HUD code in PixooRenderer actually read: `state`, `agentType`,
//     `siblingSessions[]` (with `alive` / `state` / `agentType`),
//     `fiveHourPercent`, `gatewayAvailable`.
//   - Agent rawValues match PixooRenderer's creature sets exactly:
//     codingAgents=["claude-code"], cloudAgents=["codex-cli"],
//     opencodeAgents=["opencode"]. "openclaw" is rendered as a crayfish via
//     the gateway path (`$0.agentType == "openclaw"` in siblings).

import Foundation
import SwiftUI
import CoreGraphics

// MARK: - Public API

/// Agent identity for preview. The raw values are the exact strings that
/// PixooRenderer's creature classifier checks against.
enum PixooPreviewAgent: String, CaseIterable, Identifiable, Sendable {
    case claudeCode = "claude-code"
    case codex      = "codex-cli"
    case opencode   = "opencode"
    case openclaw   = "openclaw"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .claudeCode: return "Claude"
        case .codex:      return "Codex"
        case .opencode:   return "OpenCode"
        case .openclaw:   return "OpenClaw"
        }
    }
}

/// High-level preview state buckets. These map onto `AgentConnectionState`
/// and the string values PixooRenderer's `mapSessionState` recognizes.
enum PixooPreviewState: String, CaseIterable, Identifiable, Sendable {
    case idle
    case processing
    case awaitingPrompt
    case disconnected

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .idle:            return "Idle"
        case .processing:      return "Processing"
        case .awaitingPrompt:  return "Awaiting"
        case .disconnected:    return "Disconnected"
        }
    }

    /// Dashboard-level AgentConnectionState.
    fileprivate var dashboardState: AgentConnectionState {
        switch self {
        case .idle:           return .idle
        case .processing:     return .processing
        case .awaitingPrompt: return .awaitingPermission
        case .disconnected:   return .disconnected
        }
    }

    /// Session-level state string, matching `PixooRenderer.mapSessionState`.
    /// Note: use snake_case forms (`awaiting_permission`) — these are the
    /// exact strings bridges emit on `SessionInfo.state`.
    fileprivate var sessionStateString: String {
        switch self {
        case .idle:           return "idle"
        case .processing:     return "processing"
        case .awaitingPrompt: return "awaiting_permission"
        case .disconnected:   return "disconnected"
        }
    }
}

/// Input for a single preview frame.
struct PixooPreviewConfig: Sendable {
    var agent: PixooPreviewAgent
    var state: PixooPreviewState
    /// How many creatures to populate in `siblingSessions`. `0` on
    /// `.disconnected` yields an empty aquarium.
    var sessionCount: Int = 1
    var fiveHourPercent: Double? = nil
    var gatewayAvailable: Bool = false

    init(
        agent: PixooPreviewAgent,
        state: PixooPreviewState,
        sessionCount: Int = 1,
        fiveHourPercent: Double? = nil,
        gatewayAvailable: Bool = false
    ) {
        self.agent = agent
        self.state = state
        self.sessionCount = sessionCount
        self.fiveHourPercent = fiveHourPercent
        self.gatewayAvailable = gatewayAvailable
    }
}

enum PixooPreview {

    // MARK: Raw bytes

    /// 64×64 raw RGB24 bytes (length = 12288). Cross-platform:
    /// - On macOS: runs a fresh `PixooRenderer` instance.
    /// - On iOS: returns a uniform dark-slate fill as a stub (see note at file top).
    static func previewRGB(_ config: PixooPreviewConfig) -> Data {
        #if os(macOS)
        let state = Self.synthesizeDashboardState(config)
        // Fresh instance per call — PixooRenderer carries mutable animation
        // state (bubbles, particles, creature positions) across frames, so
        // sharing one would leak non-determinism into previews.
        let renderer = PixooRenderer()
        return renderer.render(dashboardState: state)
        #else
        return Self.iOSStubRGB()
        #endif
    }

    // MARK: CGImage

    /// 64×64 CGImage. Callers who need to draw at a specific size should scale
    /// this themselves. RGB24, no alpha.
    static func previewCGImage(_ config: PixooPreviewConfig) -> CGImage? {
        let rgb = previewRGB(config)
        return Self.makeCGImage(rgb: rgb, width: 64, height: 64)
    }

    // MARK: SwiftUI Image

    /// SwiftUI `Image` wrapping the CGImage. No interpolation smoothing —
    /// callers that need nearest-neighbor should apply
    /// `.interpolation(.none)` on the returned Image.
    static func previewImage(_ config: PixooPreviewConfig) -> Image {
        if let cg = previewCGImage(config) {
            return Image(decorative: cg, scale: 1.0, orientation: .up)
                .interpolation(.none)
                .antialiased(false)
        }
        // Fallback placeholder — should be unreachable.
        return Image(systemName: "square.fill")
    }

    // MARK: - Helpers

    private static func synthesizeDashboardState(_ config: PixooPreviewConfig) -> DashboardState {
        var ds = DashboardState()
        ds.bridgeConnected = true
        ds.fiveHourPercent = config.fiveHourPercent
        ds.gatewayAvailable = config.gatewayAvailable
        ds.gatewayHasError = false

        let empty = config.sessionCount == 0 || config.state == .disconnected
        if empty {
            ds.state = .disconnected
            ds.agentType = nil
            ds.siblingSessions = []
            return ds
        }

        ds.state = config.state.dashboardState
        ds.agentType = config.agent.rawValue

        let stateStr = config.state.sessionStateString
        let count = max(1, config.sessionCount)
        ds.siblingSessions = (0..<count).map { i in
            SessionInfo(
                id: "preview-\(i)",
                port: 9120 + i,
                projectName: "preview",
                agentType: config.agent.rawValue,
                alive: true,
                state: stateStr,
                modelName: nil,
                startedAt: nil
            )
        }
        return ds
    }

    /// Build a CGImage from 64×64 RGB24 data. Returns nil on any CG failure.
    private static func makeCGImage(rgb: Data, width: Int, height: Int) -> CGImage? {
        let expected = width * height * 3
        guard rgb.count >= expected else { return nil }
        let trimmed = rgb.count == expected ? rgb : rgb.prefix(expected)

        guard let provider = CGDataProvider(data: Data(trimmed) as CFData) else { return nil }
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let bitmapInfo = CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue)
        return CGImage(
            width: width,
            height: height,
            bitsPerComponent: 8,
            bitsPerPixel: 24,
            bytesPerRow: width * 3,
            space: colorSpace,
            bitmapInfo: bitmapInfo,
            provider: provider,
            decode: nil,
            shouldInterpolate: false,
            intent: .defaultIntent
        )
    }

    #if !os(macOS)
    /// iOS fallback: we deliberately do NOT re-port 1500 LOC of renderer to iOS
    /// just for previews. Instead we return a uniform dark-slate fill so
    /// `previewImage()` still has something visible. Consumers wanting rich
    /// previews on iOS should run the preview on macOS, or add a SwiftUI
    /// shim that layers a text overlay over this fill.
    private static func iOSStubRGB() -> Data {
        // Dark slate (#20293A-ish): R=0x20, G=0x29, B=0x3A
        var buf = Data(count: 64 * 64 * 3)
        buf.withUnsafeMutableBytes { raw in
            guard let base = raw.baseAddress else { return }
            for i in stride(from: 0, to: 64 * 64 * 3, by: 3) {
                base.storeBytes(of: 0x20, toByteOffset: i,     as: UInt8.self)
                base.storeBytes(of: 0x29, toByteOffset: i + 1, as: UInt8.self)
                base.storeBytes(of: 0x3A, toByteOffset: i + 2, as: UInt8.self)
            }
        }
        return buf
    }
    #endif
}
