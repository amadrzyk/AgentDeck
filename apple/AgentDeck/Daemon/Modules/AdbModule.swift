#if os(macOS)
// AdbModule.swift — Android device ADB reverse tunnel management
// Sets up `adb reverse` for Android dashboard clients (Crema, Lenovo, Pantone).
// D200H Deck Dock is now handled by D200hHidModule via HID protocol.

import Foundation

final class AdbModule: DeviceModule, @unchecked Sendable {
    let name = "adb"

    private let daemonPort: Int
    private var pollTask: Task<Void, Never>?

    nonisolated(unsafe) var commandHandler: (([String: Any]) -> Void)?

    init(daemonPort: Int) {
        self.daemonPort = daemonPort
    }

    func start() async {
        guard adbAvailable() else {
            DaemonLogger.shared.debug("ADB", "adb not found in PATH, skipping")
            return
        }

        setupAdbReverse()

        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(30))
                guard let self else { break }
                self.pollAdbReverse()
            }
        }

        DaemonLogger.shared.info("ADB module started (port \(daemonPort))")
    }

    func stop() async {
        pollTask?.cancel()
        cleanupAdbReverse()
    }

    func handleBroadcast(_ event: [String: Any]) {
        // No-op — ADB reverse tunnel doesn't need state broadcasts
    }

    // MARK: - ADB Reverse

    private func setupAdbReverse() {
        let devices = getConnectedDevices()
        for serial in devices {
            _ = shell(timeout: 5, "adb", "-s", serial, "reverse", "tcp:\(daemonPort)", "tcp:\(daemonPort)")
            DaemonLogger.shared.debug("ADB", "Reverse tunnel set: \(serial)")
        }
    }

    private func pollAdbReverse() {
        let devices = getConnectedDevices()
        for serial in devices {
            if let existing = shell(timeout: 5, "adb", "-s", serial, "reverse", "--list"),
               !existing.contains("tcp:\(daemonPort)") {
                _ = shell(timeout: 5, "adb", "-s", serial, "reverse", "tcp:\(daemonPort)", "tcp:\(daemonPort)")
                DaemonLogger.shared.debug("ADB", "Reverse re-established: \(serial)")
            }
        }
    }

    private func cleanupAdbReverse() {
        let devices = getConnectedDevices()
        for serial in devices {
            _ = shell(timeout: 3, "adb", "-s", serial, "reverse", "--remove", "tcp:\(daemonPort)")
        }
    }

    // MARK: - Helpers

    private func getConnectedDevices() -> [String] {
        guard let output = shell(timeout: 5, "adb", "devices") else { return [] }
        return output.components(separatedBy: "\n")
            .dropFirst()
            .filter { $0.contains("\tdevice") }
            .compactMap { $0.split(separator: "\t").first.map(String.init) }
    }

    /// Resolved adb binary path (searched once at startup)
    private lazy var adbPath: String? = Self.findAdb()

    private func adbAvailable() -> Bool {
        adbPath != nil
    }

    /// Search common locations for adb binary (GUI apps have restricted PATH)
    private static func findAdb() -> String? {
        let candidates = [
            "\(NSHomeDirectory())/Library/Android/sdk/platform-tools/adb",
            "/usr/local/bin/adb",
            "/opt/homebrew/bin/adb",
            "/usr/bin/adb",
        ]
        for path in candidates {
            if FileManager.default.isExecutableFile(atPath: path) {
                DaemonLogger.shared.debug("ADB", "Found adb at \(path)")
                return path
            }
        }
        // Fallback: try which via shell (works from terminal, not GUI)
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["which", "adb"]
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice
        try? process.run()
        process.waitUntilExit()
        if process.terminationStatus == 0,
           let out = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !out.isEmpty {
            DaemonLogger.shared.debug("ADB", "Found adb via which: \(out)")
            return out
        }
        return nil
    }

    @discardableResult
    private func shell(timeout: TimeInterval, _ args: String...) -> String? {
        let result = runProcess(timeout: timeout, args)
        guard result.status == 0 else { return nil }
        return String(data: result.stdout, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func runProcess(timeout: TimeInterval, _ args: [String]) -> (status: Int32?, stdout: Data) {
        let process = Process()
        // Use resolved adb path for adb commands, /usr/bin/env for others
        if let adb = adbPath, args.first == "adb" {
            process.executableURL = URL(fileURLWithPath: adb)
            process.arguments = Array(args.dropFirst())
        } else {
            process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
            process.arguments = args
        }

        let stdoutPipe = Pipe()
        process.standardOutput = stdoutPipe
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
        } catch {
            return (nil, Data())
        }

        let group = DispatchGroup()
        group.enter()
        process.terminationHandler = { _ in group.leave() }

        let waitResult = group.wait(timeout: .now() + timeout)
        if waitResult == .timedOut {
            process.terminate()
            _ = group.wait(timeout: .now() + 1)
        }

        let data = stdoutPipe.fileHandleForReading.readDataToEndOfFile()
        return (waitResult == .timedOut ? nil : process.terminationStatus, data)
    }
}
#endif
