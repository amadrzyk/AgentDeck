#if os(macOS)
// LocalCodexAppObserver.swift — passive Codex Desktop detection.
//
// Codex Desktop does not always emit lifecycle hooks or OTel before the
// first turn. The App Store daemon still needs to show that a distinct
// Codex App session exists, without spawning `ps` or any helper process.
// This uses macOS process metadata directly and only creates observed,
// read-only session rows.

import Darwin
import AppKit
import Foundation

enum LocalCodexAppObserver {
    private static let codexAppBundleIdentifier = "com.openai.codex"
    private static let fallbackProjectName = "Codex App"

    static func collect() -> [DaemonSessionEntry] {
        let kernels = processSnapshots().compactMap(observedKernelSession)
        if !kernels.isEmpty { return kernels }

        return NSRunningApplication
            .runningApplications(withBundleIdentifier: codexAppBundleIdentifier)
            .filter { !$0.isTerminated }
            .map { app in
                var entry = DaemonSessionEntry(
                    id: "observed:codex-app:\(app.processIdentifier)",
                    port: 0,
                    pid: Int(app.processIdentifier),
                    projectName: fallbackProjectName,
                    agentType: "codex-app",
                    tmuxSession: nil,
                    tty: nil,
                    parentTty: nil,
                    startedAt: app.launchDate.map { ISO8601DateFormatter().string(from: $0) }
                )
                entry.state = "idle"
                return entry
            }
    }

    private static func observedKernelSession(_ snapshot: ProcessSnapshot) -> DaemonSessionEntry? {
        let args = snapshot.arguments
        guard args.contains(where: { $0.hasSuffix("/kernel.js") || $0 == "kernel.js" }) else { return nil }
        guard args.contains(where: { $0.contains("Codex.app/Contents/Resources") }) else { return nil }

        let sessionId = value(after: "--session-id", in: args) ?? String(snapshot.pid)
        let cwd = value(after: "--working-dir", in: args)
        let projectName = cwd
            .flatMap { ProjectNameResolver.resolve(cwd: $0).nilIfBlank }
            ?? fallbackProjectName

        var entry = DaemonSessionEntry(
            id: "observed:codex-app:\(sessionId)",
            port: 0,
            pid: Int(snapshot.pid),
            projectName: projectName,
            agentType: "codex-app",
            tmuxSession: nil,
            tty: nil,
            parentTty: nil,
            startedAt: ISO8601DateFormatter().string(from: snapshot.startedAt)
        )
        entry.state = "idle"
        return entry
    }

    private static func value(after flag: String, in args: [String]) -> String? {
        guard let idx = args.firstIndex(of: flag), idx + 1 < args.count else { return nil }
        return args[idx + 1].nilIfBlank
    }

    private struct ProcessSnapshot {
        let pid: pid_t
        let startedAt: Date
        let arguments: [String]
    }

    private static func processSnapshots() -> [ProcessSnapshot] {
        var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_ALL, 0]
        var size = 0
        guard sysctl(&mib, u_int(mib.count), nil, &size, nil, 0) == 0, size > 0 else {
            return []
        }

        let count = size / MemoryLayout<kinfo_proc>.stride
        var processes = [kinfo_proc](repeating: kinfo_proc(), count: count)
        let ok = processes.withUnsafeMutableBytes { ptr in
            sysctl(&mib, u_int(mib.count), ptr.baseAddress, &size, nil, 0)
        }
        guard ok == 0 else { return [] }

        return processes.compactMap { info in
            let pid = info.kp_proc.p_pid
            guard pid > 0 else { return nil }
            let args = processArguments(pid: pid)
            guard !args.isEmpty else { return nil }
            let startedAt = Date(
                timeIntervalSince1970: TimeInterval(info.kp_proc.p_starttime.tv_sec)
                    + TimeInterval(info.kp_proc.p_starttime.tv_usec) / 1_000_000
            )
            return ProcessSnapshot(pid: pid, startedAt: startedAt, arguments: args)
        }
    }

    private static func processArguments(pid: pid_t) -> [String] {
        var mib: [Int32] = [CTL_KERN, KERN_PROCARGS2, pid]
        var size = 0
        guard sysctl(&mib, u_int(mib.count), nil, &size, nil, 0) == 0, size > 0 else {
            return []
        }

        var buffer = [UInt8](repeating: 0, count: size)
        let ok = buffer.withUnsafeMutableBytes { ptr in
            sysctl(&mib, u_int(mib.count), ptr.baseAddress, &size, nil, 0)
        }
        guard ok == 0, size >= MemoryLayout<Int32>.size else { return [] }

        let argc = buffer.withUnsafeBytes { raw -> Int in
            Int(raw.load(as: Int32.self))
        }
        guard argc > 0 else { return [] }

        var idx = MemoryLayout<Int32>.size
        while idx < size && buffer[idx] != 0 { idx += 1 }
        while idx < size && buffer[idx] == 0 { idx += 1 }

        var args: [String] = []
        while idx < size && args.count < argc {
            let start = idx
            while idx < size && buffer[idx] != 0 { idx += 1 }
            if idx > start,
               let value = String(bytes: buffer[start..<idx], encoding: .utf8),
               !value.isEmpty {
                args.append(value)
            }
            while idx < size && buffer[idx] == 0 { idx += 1 }
        }
        return args
    }
}

private extension String {
    var nilIfBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
#endif
