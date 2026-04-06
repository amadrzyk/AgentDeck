#if os(macOS)
// DaemonService.swift — In-process daemon lifecycle manager
// Wraps DaemonServer for use within the macOS SwiftUI app
import Foundation
import ServiceManagement
import Combine

/// Manages the daemon lifecycle within the main app process.
/// On macOS, starts WS server, mDNS, hook server, etc. as part of the app.
@MainActor
final class DaemonService: ObservableObject {
    @Published private(set) var isRunning = false
    @Published private(set) var isUsingExternalDaemon = false
    @Published private(set) var port: UInt16 = 0
    @Published private(set) var connectedClients = 0
    @Published private(set) var errorMessage: String?

    /// Called when daemon starts — provides ws://localhost:PORT URL for dashboard connection
    var onReady: ((String) -> Void)? {
        didSet {
            if let readyUrl, let onReady {
                onReady(readyUrl)
            }
        }
    }

    private var server: DaemonServer?
    private var isStarting = false
    private var readyUrl: String?
    private var healthMonitorTask: Task<Void, Never>?
    private var externalFailureCount = 0
    private var localFailureCount = 0
    private var signalSource: DispatchSourceSignal?
    private var sigintSource: DispatchSourceSignal?
    private var listenerFailureRetries = 0
    private var squatterCleanupAttempted = false
    private var fallbackAttempted = false
    private var sessionOverridePort: Int?
    /// Ports that NWListener has observed to fail `.failed(EADDRINUSE)` this
    /// launch. These may still look bindable via raw BSD sockets (NECP is a
    /// higher-level check), so we exclude them explicitly from findAvailablePort.
    private var failedBindPorts: Set<Int> = []
    private static let maxListenerFailureRetries = 3

    /// Human-readable explanation for the last bind failure, shown in Settings.
    /// Set when bind retries are exhausted; cleared on successful start.
    @Published private(set) var bindFailureReason: String?

    /// True while the daemon is running on a fallback port (user's configured
    /// port was held by something we can't terminate). Surface this in the UI.
    @Published private(set) var isOnFallbackPort = false

    /// The port the daemon is attempting to bind. A session-scoped override
    /// (set by auto-fallback when the configured port is stuck) takes
    /// precedence; otherwise falls back to user's Settings value.
    private var effectivePort: Int {
        sessionOverridePort ?? AppPreferences.shared.daemonPort
    }

    init() {
        start()
        setupSignalHandler()
    }

    /// Start daemon in-process
    func start() {
        guard !isRunning, !isUsingExternalDaemon, !isStarting else { return }
        isStarting = true
        errorMessage = nil
        bindFailureReason = nil

        let port = effectivePort
        Task {
            defer { self.isStarting = false }
            do {
                // Pass nil only when we're binding the default and the user
                // didn't force an override; that preserves the singleton-guard
                // path (health probe + stale registry cleanup). Otherwise we
                // pass an explicit port and skip that path.
                let usingDefault = (port == AppPreferences.defaultDaemonPort && sessionOverridePort == nil)
                let portArg: Int? = usingDefault ? nil : port
                let daemon = try await DaemonServer(port: portArg, debug: false)
                self.server = daemon
                self.port = daemon.port
                self.isRunning = true
                self.isUsingExternalDaemon = false
                self.localFailureCount = 0
                self.externalFailureCount = 0
                self.errorMessage = nil

                // Wire listener-failed callback BEFORE starting — catches POST-bind
                // listener failures (network changes, system-sleep edge cases).
                // Pre-bind/EADDRINUSE now surfaces as a throw from startServices().
                await daemon.setListenerFailedHandler { [weak self] error in
                    Task { @MainActor [weak self] in
                        await self?.handleListenerFailure(error: error)
                    }
                }

                // Run daemon (awaits NWListener `.ready`; throws on bind failure).
                do {
                    try await daemon.startServices()
                } catch {
                    // Bind failed — tear down partial state and route to startup-failure handler.
                    await daemon.shutdown()
                    self.server = nil
                    self.isRunning = false
                    self.port = 0
                    self.readyUrl = nil
                    await self.handleStartupBindFailure(error: error, attemptedPort: Int(daemon.port))
                    return
                }
                self.startHealthMonitor()

                // Notify dashboard to connect to local daemon (listener is actually bound now).
                let wsUrl = "ws://127.0.0.1:\(daemon.port)"
                self.readyUrl = wsUrl
                self.listenerFailureRetries = 0  // reset backoff on success
                self.squatterCleanupAttempted = false
                self.isOnFallbackPort = (self.sessionOverridePort != nil)
                if self.isOnFallbackPort {
                    self.bindFailureReason = "Daemon moved to fallback port \(daemon.port) because \(AppPreferences.defaultDaemonPort) was held by another process. Clients will rediscover via mDNS."
                } else {
                    self.bindFailureReason = nil
                }
                DaemonLogger.shared.info("Daemon ready — dashboard can connect to \(wsUrl)")
                self.onReady?(wsUrl)
            } catch DaemonError.alreadyRunning(let port) {
                // Another daemon (e.g. Node.js) is running — connect as client instead
                await self.connectToExternalDaemon(port: port)
            } catch {
                self.server = nil
                self.isRunning = false
                self.isUsingExternalDaemon = false
                self.port = 0
                self.readyUrl = nil
                self.errorMessage = "Daemon failed: \(error.localizedDescription)"
                DaemonLogger.shared.error(self.errorMessage!)
            }
        }
    }

    /// Tear down the current daemon (local or external) and start fresh. Used
    /// after the user changes the daemon port in Settings. Clears any
    /// session-scoped fallback so the new user choice is honored exactly.
    func restart() async {
        await stop()
        listenerFailureRetries = 0
        squatterCleanupAttempted = false
        fallbackAttempted = false
        sessionOverridePort = nil
        failedBindPorts.removeAll()
        isOnFallbackPort = false
        bindFailureReason = nil
        errorMessage = nil
        start()
    }

    /// Stop daemon
    func stop() async {
        healthMonitorTask?.cancel()
        healthMonitorTask = nil
        await server?.shutdown()
        server = nil
        isRunning = false
        isUsingExternalDaemon = false
        port = 0
        readyUrl = nil
    }

    private func connectToExternalDaemon(port knownPort: Int? = nil) async {
        let registry = SessionRegistry.shared
        let resolvedPort = knownPort
            ?? registry.findDaemonPort()
            ?? registry.readDaemonInfo()?.port
            ?? registry.findExistingDaemon()?.port

        guard let resolvedPort else {
            self.server = nil
            self.isRunning = false
            self.isUsingExternalDaemon = false
            self.port = 0
            self.readyUrl = nil
            self.errorMessage = "External daemon detected, but port lookup failed"
            DaemonLogger.shared.error(self.errorMessage!)
            return
        }

        let maxAttempts = knownPort != nil ? 12 : 3
        var health: [String: Any]?
        for attempt in 0..<maxAttempts {
            health = await registry.probeDaemonHealth(port: resolvedPort)
            if health?["mode"] as? String == "daemon" {
                break
            }
            if attempt < maxAttempts - 1 {
                try? await Task.sleep(for: .milliseconds(knownPort != nil ? 300 : 200))
            }
        }

        guard let health, health["mode"] as? String == "daemon" else {
            // External daemon never responded — stale registry. Clean up and start our own.
            DaemonLogger.shared.info("External daemon on port \(resolvedPort) is stale — starting local daemon instead")
            self.server = nil
            self.isRunning = false
            self.isUsingExternalDaemon = false
            self.port = 0
            self.readyUrl = nil
            self.errorMessage = nil
            // Wait briefly for TIME_WAIT clearance then try starting local daemon
            try? await Task.sleep(for: .seconds(1))
            start()
            return
        }

        let wsUrl = "ws://127.0.0.1:\(resolvedPort)"
        self.server = nil
        self.port = UInt16(resolvedPort)
        self.isRunning = false
        self.isUsingExternalDaemon = true
        self.localFailureCount = 0
        self.externalFailureCount = 0
        self.errorMessage = nil
        self.readyUrl = wsUrl
        self.startHealthMonitor()
        DaemonLogger.shared.info("External daemon detected on port \(resolvedPort) — connecting as client")
        self.onReady?(wsUrl)
    }

    /// Called when a running daemon's NWListener enters `.failed` state post-bind
    /// (e.g. network loss after successful bind). Tears down and retries.
    private func handleListenerFailure(error: Error) async {
        guard isRunning else { return }
        DaemonLogger.shared.error("Listener failure detected — tearing down and retrying: \(error)")
        let attemptedPort = Int(port)
        await server?.shutdown()
        server = nil
        isRunning = false
        isUsingExternalDaemon = false
        port = 0
        readyUrl = nil
        await retryOrFallback(error: error, attemptedPort: attemptedPort)
    }

    /// Called when startup-time NWListener bind fails (e.g. EADDRINUSE). Before
    /// retrying we probe the contested port — if a healthy external daemon owns
    /// it, we transition to client mode instead of spin-retrying forever.
    private func handleStartupBindFailure(error: Error, attemptedPort: Int) async {
        DaemonLogger.shared.error("Daemon listener bind failed: \(error)")
        await retryOrFallback(error: error, attemptedPort: attemptedPort)
    }

    /// Shared failure path: probe for external daemon → connect as client, else
    /// exponential backoff retry (1s/2s/4s, max 3). On retry exhaustion, clear
    /// daemon.json so stale entries don't leak to plugin/TUI clients.
    private func retryOrFallback(error: Error, attemptedPort: Int) async {
        let registry = SessionRegistry.shared
        let probePort = attemptedPort > 0 ? attemptedPort : AppPreferences.shared.daemonPort
        if attemptedPort > 0 { failedBindPorts.insert(attemptedPort) }
        if let health = await registry.probeDaemonHealth(port: probePort),
           health["mode"] as? String == "daemon" {
            DaemonLogger.shared.info("Port \(probePort) held by healthy external daemon — switching to client mode")
            listenerFailureRetries = 0
            squatterCleanupAttempted = false
            await connectToExternalDaemon(port: probePort)
            return
        }

        // Before spending retry budget on the same failing bind, try the one
        // App-Store-safe cleanup we're allowed: forceTerminate same-bundle-ID
        // zombies (crashed/suspended prior instances of this app).
        var squatterCleanupFoundNothing = false
        if !squatterCleanupAttempted {
            squatterCleanupAttempted = true
            let killed = SquatterCleaner.forceTerminateOwnBundleSiblings()
            if killed > 0 {
                DaemonLogger.shared.info("Squatter cleanup terminated \(killed) sibling instance(s); retrying immediately")
                // Short settle so the kernel releases the sockets before rebinding.
                // Scheduling via Task lets the current start()'s Task complete
                // (defer → isStarting=false) before we re-enter.
                Task { @MainActor [weak self] in
                    try? await Task.sleep(for: .milliseconds(500))
                    self?.start()
                }
                return
            }
            squatterCleanupFoundNothing = true
        }

        let userExplicitPort = AppPreferences.shared.daemonPort
        let onDefault = (userExplicitPort == AppPreferences.defaultDaemonPort) && (sessionOverridePort == nil)
        let alt = await registry.findAvailablePort(excluding: failedBindPorts)
        DaemonLogger.shared.info("retryOrFallback diag: userExplicitPort=\(userExplicitPort) onDefault=\(onDefault) fallbackAttempted=\(fallbackAttempted) squatterNothing=\(squatterCleanupFoundNothing) findAvailable=\(alt.map(String.init) ?? "nil") attemptedPort=\(attemptedPort)")

        // If squatter cleanup found no owned siblings AND we're on the default
        // port, the squatter is an external process we can't touch. Retries
        // won't free the port, so jump straight to the fallback port now.
        if onDefault, !fallbackAttempted, squatterCleanupFoundNothing,
           let altPort = alt, altPort != userExplicitPort {
            fallbackAttempted = true
            sessionOverridePort = altPort
            listenerFailureRetries = 0
            squatterCleanupAttempted = false
            DaemonLogger.shared.info("Port \(userExplicitPort) held by external process — falling back to \(altPort) immediately")
            Task { @MainActor [weak self] in self?.start() }
            return
        }

        listenerFailureRetries += 1
        guard listenerFailureRetries <= Self.maxListenerFailureRetries else {
            // Retry budget exhausted. Try fallback port one more time (handles
            // the case where user-configured port or retry-loop scenarios
            // didn't match the fast-path above).
            if onDefault, !fallbackAttempted,
               let alt = await registry.findAvailablePort(excluding: failedBindPorts), alt != userExplicitPort {
                fallbackAttempted = true
                sessionOverridePort = alt
                listenerFailureRetries = 0
                squatterCleanupAttempted = false
                DaemonLogger.shared.info("Port \(userExplicitPort) stuck after retries — falling back to \(alt)")
                Task { @MainActor [weak self] in self?.start() }
                return
            }

            let stuckPort = probePort
            let reason: String
            if fallbackAttempted || !onDefault {
                reason = "Port \(stuckPort) is held by another process. " +
                    "Close any stale `agentdeck daemon` CLI processes (try " +
                    "`sudo lsof -nP -iTCP:\(stuckPort)` in Terminal), or " +
                    "change the daemon port in Settings."
            } else {
                reason = "All ports in range are busy. Close other agentdeck " +
                    "instances or change the port in Settings."
            }
            errorMessage = "Daemon failed to bind: \(error.localizedDescription)"
            bindFailureReason = reason
            DaemonLogger.shared.error("\(errorMessage!) — \(reason)")
            listenerFailureRetries = 0
            squatterCleanupAttempted = false
            // Don't leave a stale daemon.json pointing at a port we never actually owned.
            registry.removeDaemonInfo()
            return
        }

        // Exponential backoff: 1s, 2s, 4s — lets kernel release stale TCP sockets
        let backoffSec = UInt64(1 << (listenerFailureRetries - 1))
        DaemonLogger.shared.info("Retrying daemon start in \(backoffSec)s (attempt \(listenerFailureRetries)/\(Self.maxListenerFailureRetries))")
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(backoffSec))
            self?.start()
        }
    }

    private func startHealthMonitor() {
        healthMonitorTask?.cancel()
        healthMonitorTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(5))
                await self.checkDaemonHealth()
            }
        }
    }

    private func checkDaemonHealth() async {
        let currentPort = Int(port)
        guard currentPort > 0 else { return }

        let registry = SessionRegistry.shared
        let health = await registry.probeDaemonHealth(port: currentPort)
        let daemonAlive = (health?["mode"] as? String) == "daemon"

        if isUsingExternalDaemon {
            if daemonAlive {
                externalFailureCount = 0
                return
            }

            externalFailureCount += 1
            guard externalFailureCount >= 2, !isStarting else { return }
            DaemonLogger.shared.error("External daemon on port \(currentPort) disappeared — promoting this app to own the daemon")
            server = nil
            isRunning = false
            isUsingExternalDaemon = false
            port = 0
            readyUrl = nil
            errorMessage = nil
            externalFailureCount = 0
            start()
            return
        }

        guard isRunning else { return }

        if daemonAlive {
            localFailureCount = 0
            return
        }

        localFailureCount += 1
        guard localFailureCount >= 2, !isStarting else { return }
        DaemonLogger.shared.error("Local daemon on port \(currentPort) is no longer healthy — restarting in-process daemon")
        localFailureCount = 0
        await server?.shutdown()
        server = nil
        isRunning = false
        isUsingExternalDaemon = false
        port = 0
        readyUrl = nil
        errorMessage = nil
        start()
    }

    // MARK: - Signal Handling

    private func setupSignalHandler() {
        // Ignore default SIGTERM/SIGINT behavior so DispatchSource handles them
        signal(SIGTERM, SIG_IGN)
        signal(SIGINT, SIG_IGN)

        let termSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
        termSource.setEventHandler { [weak self] in
            Self.handleTerminationSignal(name: "SIGTERM", service: self)
        }
        termSource.resume()
        self.signalSource = termSource

        let intSource = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
        intSource.setEventHandler { [weak self] in
            Self.handleTerminationSignal(name: "SIGINT", service: self)
        }
        intSource.resume()
        self.sigintSource = intSource
    }

    private static func handleTerminationSignal(name: String, service: DaemonService?) {
        DaemonLogger.shared.info("\(name) received — initiating clean shutdown")
        // Remove daemon.json immediately so next launch isn't blocked by stale guard
        let home = FileManager.default.homeDirectoryForCurrentUser
        let daemonFile = home.appendingPathComponent(".agentdeck/daemon.json")
        try? FileManager.default.removeItem(at: daemonFile)
        let crashLog = home.appendingPathComponent(".agentdeck/daemon-crash.log")
        let entry = "[\(ISO8601DateFormatter().string(from: Date()))] \(name) — clean shutdown initiated\n"
        if let data = entry.data(using: .utf8) {
            if FileManager.default.fileExists(atPath: crashLog.path) {
                if let handle = try? FileHandle(forWritingTo: crashLog) {
                    handle.seekToEndOfFile()
                    handle.write(data)
                    handle.closeFile()
                }
            } else {
                try? data.write(to: crashLog)
            }
        }
        // Bounded shutdown: exit after 5s even if cleanup hangs
        DispatchQueue.global().asyncAfter(deadline: .now() + 5) {
            NSLog("[AgentDeck] Signal shutdown timeout — forcing exit")
            Darwin.exit(0)
        }
        Task { @MainActor in
            await service?.stop()
            Darwin.exit(0)
        }
    }

    // MARK: - Login Item (auto-start at login)

    func registerLoginItem() {
        if #available(macOS 13.0, *) {
            let service = SMAppService.mainApp
            do {
                try service.register()
                DaemonLogger.shared.info("Registered as login item")
            } catch {
                DaemonLogger.shared.error("Failed to register login item: \(error)")
            }
        }
    }

    func unregisterLoginItem() {
        if #available(macOS 13.0, *) {
            let service = SMAppService.mainApp
            do {
                try service.unregister()
            } catch {
                DaemonLogger.shared.error("Failed to unregister login item: \(error)")
            }
        }
    }

    var isLoginItemEnabled: Bool {
        if #available(macOS 13.0, *) {
            return SMAppService.mainApp.status == .enabled
        }
        return false
    }
}
#endif
