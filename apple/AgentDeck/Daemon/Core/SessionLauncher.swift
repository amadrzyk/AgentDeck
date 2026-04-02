#if os(macOS)
// SessionLauncher.swift — Launch agentdeck claude session from app
// Bundles Node.js + bridge JS in app Resources, opens Terminal.app

import Foundation
import AppKit

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

    /// Launch a Claude Code session in Terminal.app using bundled or installed bridge
    static func launchSession(project: String? = nil, daemonPort: UInt16? = nil) {
        guard let plan = resolveLaunchPlan(
            project: project,
            daemonPort: daemonPort.flatMap { Int($0) } ?? SessionRegistry.shared.findDaemonPort(),
            installedBridgePath: findInstalledBridge(),
            bundledBridgePath: findBundledBridge(),
            bundledNodePath: findBundledNode(),
            claudePath: findClaude()
        ) else {
            DaemonLogger.shared.info("Claude Code CLI not found, showing install prompt")
            showClaudeInstallPrompt()
            return
        }

        openInTerminal(plan.command)
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
        daemonPort: Int?,
        installedBridgePath: String?,
        bundledBridgePath: String?,
        bundledNodePath: String?,
        claudePath: String?
    ) -> LaunchPlan? {
        let projectPrefix = project.map { "cd \(shellEscape($0)) && " } ?? ""
        let daemonPrefix = daemonPort.map { "AGENTDECK_PORT=\($0) " } ?? ""

        if let installedBridgePath {
            let command = "\(projectPrefix)\(daemonPrefix)\(shellEscape(installedBridgePath)) claude"
            return LaunchPlan(mode: .agentdeckCli, command: command)
        }

        if let bundledBridgePath {
            let nodePath = bundledNodePath ?? "node"
            let command = "\(projectPrefix)\(daemonPrefix)\(shellEscape(nodePath)) \(shellEscape(bundledBridgePath)) claude"
            return LaunchPlan(mode: .bundledBridge, command: command)
        }

        if let claudePath {
            let command = "\(projectPrefix)\(daemonPrefix)\(shellEscape(claudePath))"
            return LaunchPlan(mode: .plainClaude, command: command)
        }

        return nil
    }

    // MARK: - Bridge Discovery

    private static func findInstalledBridge() -> String? {
        // Check common locations
        let candidates = [
            "/usr/local/bin/agentdeck",
            "/opt/homebrew/bin/agentdeck",
        ]
        for path in candidates {
            if FileManager.default.isExecutableFile(atPath: path) { return path }
        }
        // Try which
        return shell("which", "agentdeck")
    }

    private static func findClaude() -> String? {
        shell("which", "claude")
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

    private static func openInTerminal(_ command: String) {
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
                DaemonLogger.shared.error("Failed to launch Terminal: \(error)")
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

    private static func shell(_ args: String...) -> String? {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = args
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
            process.waitUntilExit()
            guard process.terminationStatus == 0 else { return nil }
            return String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
        } catch { return nil }
    }

    private static func shellEscape(_ value: String) -> String {
        let escaped = value.replacingOccurrences(of: "'", with: "'\\''")
        return "'\(escaped)'"
    }
}
#endif
