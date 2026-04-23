// AquariumSurface.swift — Shared look-and-feel wrapper for popup
// windows and sheets opened from the menu bar and Settings. Applies the
// canonical aquarium gradient + HUD text color + forced dark color scheme
// so SwiftUI's default light system surfaces never peek through around
// window edges or behind NavigationSplitView chrome.
//
// Scope: popup windows (Launch Session, Pair iPad, Device Preview,
// ESP32 provisioning, Pixoo setup). Settings (native macOS preferences)
// and the APME dashboard (WKWebView) are intentionally exempt — the
// former reads better as a standard prefs window, the latter is styled
// from bridge/src/apme/dashboard-html.ts.

import SwiftUI

// MARK: - Surface modifier

/// The canonical aquarium gradient used across all popup surfaces and
/// the menu-bar panel. Declared once so titlebar + content + sidebar
/// material all pick up the exact same fill.
let aquariumGradient = LinearGradient(
    colors: [TerrariumColors.deepSea, TerrariumColors.midWater],
    startPoint: .top,
    endPoint: .bottom
)

/// Applies the aquarium palette to a popup's root view. Three layers
/// working together so no system chrome can peek through:
///
///   1. `.containerBackground(…, for: .window)` paints the enclosing
///      window including the titlebar band. Without this the titlebar
///      falls back to default vibrancy over a light desktop → the jarring
///      "light titlebar / dark content" mismatch users complained about.
///      macOS 14+ only — matches our deployment target.
///   2. `.background(aquariumGradient.ignoresSafeArea())` fills the
///      content area. Redundant with #1 for the main canvas, but lets
///      NavigationSplitView detail panels keep their fill when the
///      container-background layer is clipped by a sub-scene.
///   3. `.preferredColorScheme(.dark)` keeps system controls (buttons,
///      textfields, pickers) rendered against a dark palette so they
///      don't read as glaring white on top of the aquarium.
struct AquariumSurfaceModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(aquariumGradient.ignoresSafeArea())
            .foregroundStyle(TerrariumHUD.text)
            .preferredColorScheme(.dark)
            .modifier(WindowTitlebarBackground())
    }
}

/// Optional macOS-only helper: extends the aquarium gradient into the
/// window titlebar band so the system vibrancy can't leak a light band
/// above dark content. `.containerBackground(for: .window)` is
/// macOS 15+, so on 14.x this is a no-op and the user sees the standard
/// titlebar vibrancy (still readable thanks to `preferredColorScheme(.dark)`).
private struct WindowTitlebarBackground: ViewModifier {
    func body(content: Content) -> some View {
        #if os(macOS)
        if #available(macOS 15.0, *) {
            content.containerBackground(aquariumGradient, for: .window)
        } else {
            content
        }
        #else
        content
        #endif
    }
}

extension View {
    /// Wrap a popup's root view in the shared aquarium surface. Apply
    /// once at the top level; nested calls are harmless but add layers.
    func aquariumSurface() -> some View {
        modifier(AquariumSurfaceModifier())
    }
}

// MARK: - Typography scale

/// Popup typography scale. Names mirror the sizes already in regular use
/// across `ControlTowerPanel`, `TopologyRail`, and `MenuBarTopologyList`
/// so adopting this enum in one file reads identically to the rails.
enum HUDFont {
    static let sectionHeader = Font.system(size: 10, weight: .bold, design: .monospaced)
    static let title         = Font.system(size: 15, weight: .bold)
    static let body          = Font.system(size: 12)
    static let caption       = Font.system(size: 11)
    static let mono          = Font.system(size: 11, design: .monospaced)
    static let monoSmall     = Font.system(size: 10, design: .monospaced)
}

/// Kerned uppercase section header used throughout the menu-bar rails
/// ("SESSIONS" / "TOPOLOGY" / "UPSTREAM"). Surfacing it as a typed view
/// so popups can adopt the same rhythm without re-deriving font +
/// kerning + color every time.
struct HUDSectionHeader: View {
    let title: String

    var body: some View {
        Text(title)
            .font(HUDFont.sectionHeader)
            .kerning(1.2)
            .foregroundStyle(TerrariumHUD.subtext)
    }
}
