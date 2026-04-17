#if os(macOS)
// SessionLauncher.swift — Launch agentdeck claude session from app
// Bundles Node.js + bridge JS in app Resources, opens Terminal.app

import Foundation
import AppKit

// MARK: - Agent Type

enum LaunchAgentType: String, CaseIterable {
    case claudeCode = "claude-code"   // agentdeck claude (with bridge)
    case codex                         // agentdeck codex
    case opencode                      // agentdeck opencode
    case claudePlain = "claude"        // plain claude, no bridge

    var displayName: String {
        switch self {
        case .claudeCode: return "Claude"
        case .codex: return "Codex"
        case .opencode: return "OpenCode"
        case .claudePlain: return "Plain"
        }
    }

    var usesBridge: Bool { self != .claudePlain }

    var bridgeSubcommand: String? {
        switch self {
        case .claudeCode: return "claude"
        case .codex: return "codex"
        case .opencode: return "opencode"
        case .claudePlain: return nil
        }
    }
}

// MARK: - Terminal App

enum TerminalApp: String, CaseIterable {
    case system
    case terminal
    case iterm
    case alacritty
    case wezterm
    case ghostty
    case warp

    var displayName: String {
        switch self {
        case .system: return "System Default"
        case .terminal: return "Terminal"
        case .iterm: return "iTerm2"
        case .alacritty: return "Alacritty"
        case .wezterm: return "WezTerm"
        case .ghostty: return "Ghostty"
        case .warp: return "Warp"
        }
    }

    var bundleIds: [String] {
        switch self {
        case .system: return []
        case .terminal: return ["com.apple.Terminal"]
        case .iterm: return ["com.googlecode.iterm2"]
        case .alacritty: return ["org.alacritty"]
        case .wezterm: return ["com.github.wez.wezterm"]
        case .ghostty: return ["com.mitchellh.ghostty"]
        case .warp: return ["dev.warp.Warp-Stable", "dev.warp.Warp"]
        }
    }

    func appURL() -> URL? {
        for bid in bundleIds {
            if let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bid) { return url }
        }
        return nil
    }

    func isInstalled() -> Bool {
        self == .system || appURL() != nil
    }

    static func installed() -> [TerminalApp] {
        TerminalApp.allCases.filter { $0.isInstalled() }
    }
}

enum SessionLauncher {
    enum LaunchMode: Equatable {
        case agentdeckCli
        case bundledBridge
        case plainClaude
    }

    struct LaunchPlan: Equatable {
        let mode: LaunchMode
        let command: String
    }

    /// Back-compat entry point: launches Claude Code session with system default terminal
    static func launchSession(project: String? = nil, daemonPort: UInt16? = nil) {
        launchSession(project: project, agent: .claudeCode, terminalApp: .system, daemonPort: daemonPort)
    }

    /// Launch a session with full control over agent type and terminal app
    static func launchSession(
        project: String?,
        agent: LaunchAgentType,
        terminalApp: TerminalApp,
        daemonPort: UInt16?
    ) {
        guard let plan = resolveLaunchPlan(
            project: project,
            agent: agent,
            daemonPort: daemonPort.flatMap { Int($0) } ?? SessionRegistry.shared.findDaemonPort(),
            installedBridgePath: findInstalledBridge(),
            bundledBridgePath: findBundledBridge(),
            bundledNodePath: findBundledNode(),
            claudePath: findClaude()
        ) else {
            DaemonLogger.shared.info("Agent CLI not found, showing install prompt")
            showClaudeInstallPrompt()
            return
        }

        openInTerminal(plan.command, terminal: terminalApp)
    }

    /// Check if Claude Code CLI is installed
    static func isClaudeInstalled() -> Bool {
        findClaude() != nil
    }

    /// Check if agentdeck bridge CLI is installed
    static func isBridgeInstalled() -> Bool {
        findInstalledBridge() != nil
    }

    static func resolveLaunchPlan(
        project: String?,
        agent: LaunchAgentType = .claudeCode,
        daemonPort: Int?,
        installedBridgePath: String?,
        bundledBridgePath: String?,
        bundledNodePath: String?,
        claudePath: String?
    ) -> LaunchPlan? {
        let projectPrefix = project.map { "cd \(shellEscape($0)) && " } ?? ""
        let daemonPrefix = daemonPort.map { "AGENTDECK_PORT=\($0) " } ?? ""

        // Plain claude (no bridge) path
        if agent == .claudePlain {
            guard let claudePath else { return nil }
            let command = "\(projectPrefix)\(shellEscape(claudePath))"
            return LaunchPlan(mode: .plainClaude, command: command)
        }

        guard let sub = agent.bridgeSubcommand else { return nil }

        if let installedBridgePath {
            let command = "\(projectPrefix)\(daemonPrefix)\(shellEscape(installedBridgePath)) \(sub)"
            return LaunchPlan(mode: .agentdeckCli, command: command)
        }

        if let bundledBridgePath {
            let nodePath = bundledNodePath ?? "node"
            let command = "\(projectPrefix)\(daemonPrefix)\(shellEscape(nodePath)) \(shellEscape(bundledBridgePath)) \(sub)"
            return LaunchPlan(mode: .bundledBridge, command: command)
        }

        // Last-resort fallback for claude-code: plain claude without bridge.
        // Still pass AGENTDECK_PORT so the Claude Code hooks (installed
        // separately by HookInstaller) can find our daemon even when the
        // bridge binary isn't available. Claude itself ignores the var.
        if agent == .claudeCode, let claudePath {
            let command = "\(projectPrefix)\(daemonPrefix)\(shellEscape(claudePath))"
            return LaunchPlan(mode: .plainClaude, command: command)
        }

        return nil
    }

    // MARK: - Bridge Discovery

    private static func findInstalledBridge() -> String? {
        // App Sandbox has a restricted PATH — check common locations first
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let candidates = [
            "\(home)/Library/pnpm/agentdeck",
            "\(home)/.local/bin/agentdeck",
            "/usr/local/bin/agentdeck",
            "/opt/homebrew/bin/agentdeck",
            "\(home)/.npm-global/bin/agentdeck",
            "\(home)/.nvm/current/bin/agentdeck",
        ]
        for path in candidates {
            if FileManager.default.isExecutableFile(atPath: path) { return path }
        }
        return nil
    }

    private static func findClaude() -> String? {
        // App Sandbox has a restricted PATH — check common locations first
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let candidates = [
            "\(home)/.local/bin/claude",
            "/usr/local/bin/claude",
            "/opt/homebrew/bin/claude",
            "\(home)/.npm-global/bin/claude",
            "\(home)/.nvm/current/bin/claude",
        ]
        for path in candidates {
            if FileManager.default.isExecutableFile(atPath: path) { return path }
        }
        return nil
    }

    private static func findBundledBridge() -> String? {
        // Check app bundle Resources
        guard let resourcePath = Bundle.main.resourcePath else { return nil }
        let bridgePath = (resourcePath as NSString).appendingPathComponent("bridge/cli.js")
        return FileManager.default.fileExists(atPath: bridgePath) ? bridgePath : nil
    }

    private static func findBundledNode() -> String? {
        guard let resourcePath = Bundle.main.resourcePath else { return nil }
        let nodePath = (resourcePath as NSString).appendingPathComponent("node")
        return FileManager.default.isExecutableFile(atPath: nodePath) ? nodePath : nil
    }

    // MARK: - Terminal Launch

    private static func openInTerminal(_ command: String, terminal: TerminalApp = .system) {
        // iTerm2: use AppleScript (better tab/window control, native UX)
        if terminal == .iterm {
            openInITerm(command)
            return
        }

        // Everyone else: write .command script, open with chosen app or system default
        let tmpDir = FileManager.default.temporaryDirectory
        let scriptFile = tmpDir.appendingPathComponent("agentdeck-launch-\(UUID().uuidString.prefix(8)).command")
        let scriptContent = """
        #!/bin/bash
        # Auto-generated by AgentDeck — this file self-deletes
        rm -f "\(scriptFile.path)"
        \(command)
        """
        do {
            try scriptContent.write(to: scriptFile, atomically: true, encoding: .utf8)
            try FileManager.default.setAttributes(
                [.posixPermissions: 0o755], ofItemAtPath: scriptFile.path
            )

            if terminal == .system {
                NSWorkspace.shared.open(scriptFile)
                DaemonLogger.shared.info("Launched session via .command (system default)")
            } else if let appURL = terminal.appURL() {
                let cfg = NSWorkspace.OpenConfiguration()
                NSWorkspace.shared.open([scriptFile], withApplicationAt: appURL, configuration: cfg) { _, err in
                    if let err {
                        DaemonLogger.shared.error("Failed to open in \(terminal.displayName): \(err)")
                    } else {
                        DaemonLogger.shared.info("Launched session in \(terminal.displayName)")
                    }
                }
            } else {
                // App no longer installed — fallback to system default
                NSWorkspace.shared.open(scriptFile)
                DaemonLogger.shared.info("\(terminal.displayName) not found, fell back to system default")
            }
        } catch {
            DaemonLogger.shared.error("Failed to create launch script: \(error)")
            openInTerminalViaAppleScript(command)
        }
    }

    private static func openInITerm(_ command: String) {
        let escaped = command
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
        let script = """
        tell application "iTerm"
            activate
            if (count of windows) = 0 then
                create window with default profile
            else
                tell current window to create tab with default profile
            end if
            tell current session of current window
                write text "\(escaped)"
            end tell
        end tell
        """
        if let appleScript = NSAppleScript(source: script) {
            var error: NSDictionary?
            appleScript.executeAndReturnError(&error)
            if let error {
                DaemonLogger.shared.error("iTerm AppleScript failed: \(error)")
            } else {
                DaemonLogger.shared.info("Launched session in iTerm2")
            }
        }
    }

    private static func openInTerminalViaAppleScript(_ command: String) {
        let script = """
        tell application "Terminal"
            activate
            do script "\(command.replacingOccurrences(of: "\"", with: "\\\""))"
        end tell
        """
        if let appleScript = NSAppleScript(source: script) {
            var error: NSDictionary?
            appleScript.executeAndReturnError(&error)
            if let error {
                DaemonLogger.shared.error("Failed to launch Terminal via AppleScript: \(error)")
            }
        }
    }

    // MARK: - Install Prompt

    private static func showClaudeInstallPrompt() {
        let alert = NSAlert()
        alert.messageText = "Claude Code CLI Not Found"
        alert.informativeText = """
        To launch Claude Code sessions from AgentDeck, install the Claude Code CLI:

        npm install -g @anthropic-ai/claude-code

        The AgentDeck bridge is optional. Monitoring and permissions still work through hooks when Claude runs directly.
        """
        alert.alertStyle = .informational
        alert.addButton(withTitle: "Copy Install Command")
        alert.addButton(withTitle: "OK")

        if alert.runModal() == .alertFirstButtonReturn {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString("npm install -g @anthropic-ai/claude-code", forType: .string)
        }
    }

    // MARK: - Helpers

    private static func shellEscape(_ value: String) -> String {
        let escaped = value.replacingOccurrences(of: "'", with: "'\\''")
        return "'\(escaped)'"
    }
}
#endif
