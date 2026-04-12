#if os(macOS)
// PortDiagnostics.swift — Diagnose port conflicts for the daemon startup UI.
//
// When NWListener bind fails, this collects information about what's blocking
// the port from sessions.json (AgentDeck sessions) and sysctl (process status).
// External processes can't be killed from App Sandbox — we provide PID + a
// copyable Terminal command instead.

import AppKit
import Foundation

struct BlockingProcess: Identifiable {
    let id: Int32  // PID
    let port: Int
    let name: String    // "agentdeck daemon", "claude-code session", etc.
    let project: String?
    let startedAt: String?
    let isOwnBundle: Bool   // true = can forceTerminate; false = external
    let isAlive: Bool
    let isZombie: Bool

    var statusLabel: String {
        if isZombie { return "zombie" }
        if !isAlive { return "dead (stale entry)" }
        return "running"
    }

    var killCommand: String { "kill \(id)" }
}

enum PortDiagnostics {
    /// Collect blocking process information from sessions.json + daemon.json.
    /// Does NOT use lsof (unavailable in sandbox). Returns whatever we can
    /// infer from our own registry files + sysctl PID probes.
    static func collectBlockers(port: Int) -> [BlockingProcess] {
        var result: [BlockingProcess] = []
        let myPid = getpid()
        let myBundle = Bundle.main.bundleIdentifier ?? ""

        // 1. daemon.json — the daemon PID that last claimed this port
        if let info = readDaemonJson(), let pid = info["pid"] as? Int, pid != Int(myPid) {
            let daemonPort = info["port"] as? Int ?? port
            let alive = isProcessAlive(Int32(pid))
            let zombie = alive && isZombie(Int32(pid))
            let ownBundle = isOwnBundle(Int32(pid), myBundle: myBundle)
            result.append(BlockingProcess(
                id: Int32(pid), port: daemonPort,
                name: ownBundle ? "AgentDeck (previous)" : "agentdeck daemon (CLI)",
                project: "daemon",
                startedAt: info["startedAt"] as? String,
                isOwnBundle: ownBundle,
                isAlive: alive, isZombie: zombie
            ))
        }

        // 2. sessions.json — all registered sessions
        let sessions = readSessionsJson()
        for s in sessions {
            guard let pid = s["pid"] as? Int, pid != Int(myPid) else { continue }
            let sPort = s["port"] as? Int ?? 0
            let alive = isProcessAlive(Int32(pid))
            let zombie = alive && isZombie(Int32(pid))
            let ownBundle = isOwnBundle(Int32(pid), myBundle: myBundle)
            let agentType = s["agentType"] as? String ?? "unknown"
            result.append(BlockingProcess(
                id: Int32(pid), port: sPort,
                name: ownBundle ? "AgentDeck (\(agentType))" : "agentdeck \(agentType) (CLI)",
                project: s["projectName"] as? String,
                startedAt: s["startedAt"] as? String,
                isOwnBundle: ownBundle,
                isAlive: alive, isZombie: zombie
            ))
        }

        // Deduplicate by PID
        var seen = Set<Int32>()
        result = result.filter { seen.insert($0.id).inserted }

        // Sort: alive first, then by port
        result.sort { ($0.isAlive ? 0 : 1, $0.port) < ($1.isAlive ? 0 : 1, $1.port) }
        return result
    }

    /// Kill what we can (own-bundle siblings), prune sessions.json, return counts.
    @MainActor
    static func cleanup() -> (killed: Int, pruned: Int) {
        let killed = SquatterCleaner.forceTerminateOwnBundleSiblings()
        let before = readSessionsJson().count
        // listActive() internally prunes dead sessions and rewrites the file.
        _ = SessionRegistry.shared.listActive()
        let after = readSessionsJson().count
        // Also remove stale daemon.json
        if let info = readDaemonJson(), let pid = info["pid"] as? Int, !isProcessAlive(Int32(pid)) {
            SessionRegistry.shared.removeDaemonInfo()
        }
        return (killed, before - after)
    }

    /// Build a single terminal command that kills all blocking external PIDs.
    static func terminalCommand(for blockers: [BlockingProcess]) -> String {
        let externalAlive = blockers.filter { !$0.isOwnBundle && $0.isAlive && !$0.isZombie }
        if externalAlive.isEmpty { return "" }
        let pids = externalAlive.map { String($0.id) }.joined(separator: " ")
        return "kill \(pids)"
    }

    // MARK: - Helpers

    private static func isProcessAlive(_ pid: Int32) -> Bool {
        kill(pid, 0) == 0
    }

    private static func isZombie(_ pid: Int32) -> Bool {
        var info = kinfo_proc()
        var size = MemoryLayout<kinfo_proc>.stride
        var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, pid]
        guard sysctl(&mib, 4, &info, &size, nil, 0) == 0, size > 0 else { return false }
        return info.kp_proc.p_stat == 5 || (Int32(info.kp_proc.p_flag) & 0x2000) != 0
    }

    private static func isOwnBundle(_ pid: Int32, myBundle: String) -> Bool {
        guard !myBundle.isEmpty else { return false }
        return NSRunningApplication.runningApplications(withBundleIdentifier: myBundle)
            .contains { $0.processIdentifier == pid }
    }

    private static var dataDir: URL { AuthManager.agentDeckDir }

    private static func readDaemonJson() -> [String: Any]? {
        let path = dataDir.appendingPathComponent("daemon.json")
        guard let data = try? Data(contentsOf: path),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return json
    }

    private static func readSessionsJson() -> [[String: Any]] {
        let path = dataDir.appendingPathComponent("sessions.json")
        guard let data = try? Data(contentsOf: path),
              let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }
        return arr
    }
}
#endif
