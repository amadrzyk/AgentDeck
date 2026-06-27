// OpenClawTokenImporter.swift — Shared OpenClaw gateway-token import flow.
//
// Extracted from SettingsScreen so both the Settings → Integrations repair
// row AND the dashboard SetupNeededCard can offer a one-click "Import token"
// affordance without duplicating the NSOpenPanel + parse + Keychain + bookmark
// + adapter-reconnect orchestration. The dashboard card is usually the user's
// first sight of a `gateway_token_missing` condition; routing them straight
// here (instead of a 3–4-click dig through Settings → Integrations → OpenClaw)
// is the whole point of surfacing the button there.
//
// App Store review notes (preserved verbatim from the original Settings flow):
// - The picker grants this app a one-shot user-selected file scope, which is
//   App Store sandbox-safe: the existing
//   `com.apple.security.files.user-selected.read-write` entitlement covers it,
//   no subprocess is spawned, and no path outside the user's explicit selection
//   is touched.
// - `panel.directoryURL` is only a Powerbox navigation hint. The app still
//   receives access solely to the JSON file the user explicitly selects.
// - `startAccessingSecurityScopedResource()` is paired with `defer` so the
//   scope is released even if JSON parsing throws.

import Foundation

#if os(macOS) && AGENTDECK_APP_STORE
import AppKit

@MainActor
enum OpenClawTokenImporter {
    /// Outcome of a token-import attempt so callers can render their own
    /// feedback (Settings drives its inline rows; the SetupNeededCard shows a
    /// short toast under the item).
    enum ImportOutcome: Equatable {
        case imported
        case cancelled
        case failed(String)
    }

    /// Let the user pick `openclaw.json` via NSOpenPanel, pull the gateway token
    /// out of it, persist it to Keychain + a security-scoped bookmark, and bounce
    /// the gateway adapter. The token can sit at any of three paths depending on
    /// how OpenClaw was set up — `OpenClawGatewayTokenParser` walks them in
    /// canonical-first order. The adapter reconnect is fired as a detached task
    /// (non-blocking) exactly as the original Settings flow did, so Claude Code /
    /// Codex sessions keep running.
    static func importFromConfigFile(daemonService: DaemonService) -> ImportOutcome {
        let panel = NSOpenPanel()
        panel.title = "Import OpenClaw Gateway Token"
        panel.message = "Choose your OpenClaw config file (typically `~/.openclaw/openclaw.json`). AgentDeck will save the gateway token from it to your Keychain."
        panel.prompt = "Import token"
        panel.allowedContentTypes = [.json]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.nameFieldStringValue = "openclaw.json"
        panel.showsHiddenFiles = true
        // Open the panel directly inside `~/.openclaw/` so the (non-hidden)
        // `openclaw.json` is visible immediately — relying on the user to toggle
        // hidden files and drill into the dotfolder themselves was the root cause
        // of "the file isn't there" reports (Powerbox doesn't reliably honour
        // `showsHiddenFiles` for the in-process panel object).
        //
        // Inside App Sandbox `NSHomeDirectory()` returns the app's container
        // path, which is *not* where OpenClaw lives. `getpwuid` returns the
        // user's real `/Users/<name>/`; we append `.openclaw` when it exists and
        // fall back to the real home otherwise. `directoryURL` is only a Powerbox
        // navigation hint — it grants no read access; only the file the user
        // explicitly selects becomes readable.
        if let pw = getpwuid(getuid()), let realHome = pw.pointee.pw_dir.flatMap({ String(cString: $0) }) {
            let home = URL(fileURLWithPath: realHome)
            let openclawDir = home.appendingPathComponent(".openclaw", isDirectory: true)
            panel.directoryURL = FileManager.default.fileExists(atPath: openclawDir.path) ? openclawDir : home
        }

        guard panel.runModal() == .OK, let url = panel.url else { return .cancelled }

        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }

        do {
            let data = try Data(contentsOf: url)
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                return .failed("That file isn't a JSON object. Pick `~/.openclaw/openclaw.json`, or paste the token manually in Settings → Integrations → OpenClaw.")
            }
            guard let token = OpenClawGatewayTokenParser.extractToken(from: json) else {
                return .failed("Couldn't find a gateway token in that file. Looked at `gateway.auth.token`, `auth.token`, `gateway.token`. Pick a different file or paste the token in Settings.")
            }
            try OpenClawGatewayTokenStore.saveToken(token)
            // Persist a security-scoped bookmark to the picked file so a later
            // rotated `gateway.auth.token` is re-read automatically on the next
            // gateway (re)connect — the user grants file access once.
            AppPreferences.shared.storeOpenClawConfigBookmark(for: url)
            Task { await daemonService.reconnectGatewayAdapter() }
            return .imported
        } catch {
            return .failed("Could not read the file: \(error.localizedDescription)")
        }
    }
}
#endif
