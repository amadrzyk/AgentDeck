// LocalSessionDiscovery.swift — macOS: read sessions.json from the AgentDeck
// data directory (App Store sandbox container on signed builds, ~/.agentdeck/
// fallback otherwise — see AgentDeckPaths).
// On macOS the bridge runs on the same machine, so we can discover sessions
// by reading the file system instead of relying on mDNS.

#if os(macOS)
import Foundation
import Darwin
import Combine

/// Session entry matching bridge/src/session-registry.ts SessionEntry
private struct SessionEntry: Decodable {
    let id: String
    let port: Int
    let pid: Int
    let projectName: String
    let agentType: String?
    let startedAt: String?
}

final class LocalSessionDiscovery: ObservableObject, @unchecked Sendable {
    @Published private(set) var sessions: [DiscoveredBridge] = []
    private var timer: DispatchSourceTimer?
    private let queue = DispatchQueue(label: "dev.agentdeck.local-discovery")

    private var sessionsFilePath: String {
        AgentDeckPaths.sessionsJson.path
    }

    func startPolling() {
        guard timer == nil else { return }

        // Initial scan
        scan()

        let t = DispatchSource.makeTimerSource(queue: queue)
        t.schedule(deadline: .now() + 3, repeating: 3)
        t.setEventHandler { [weak self] in
            self?.scan()
        }
        t.resume()
        timer = t
    }

    /// Read sessions.json and return bridges (thread-safe, no UI update).
    func readSessionsNow() -> [DiscoveredBridge] {
        return readSessions()
    }

    func stopPolling() {
        timer?.cancel()
        timer = nil
        DispatchQueue.main.async {
            self.sessions = []
        }
    }

    private func scan() {
        let bridges = readSessions()
        DispatchQueue.main.async {
            self.sessions = bridges
        }
    }

    private func readSessions() -> [DiscoveredBridge] {
        guard let data = FileManager.default.contents(atPath: sessionsFilePath) else {
            print("[LocalDiscovery] file not found: \(sessionsFilePath)")
            return []
        }

        guard let entries = try? JSONDecoder().decode([SessionEntry].self, from: data) else {
            print("[LocalDiscovery] decode error for \(sessionsFilePath)")
            return []
        }

        // Filter to alive processes only
        let alive = entries.filter { isProcessAlive($0.pid) }
        print("[LocalDiscovery] found \(alive.count) sessions (of \(entries.count) entries)")

        return alive.map { entry in
            DiscoveredBridge(
                name: entry.projectName,
                host: "127.0.0.1",
                port: entry.port,
                token: nil,  // localhost bypass — no token needed
                project: entry.projectName,
                agentType: entry.agentType
            )
        }
    }

    private func isProcessAlive(_ pid: Int) -> Bool {
        // kill(pid, 0) checks if process exists without sending a signal
        return Darwin.kill(Int32(pid), 0) == 0
    }
}
#endif
