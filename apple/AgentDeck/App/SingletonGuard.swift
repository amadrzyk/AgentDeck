#if os(macOS)
// SingletonGuard.swift — Ensures only one AgentDeck.app instance runs at a time.
//
// Checks for other running instances with the same bundle identifier via
// NSRunningApplication at app launch. If another instance is found, activates
// that instance and terminates self before any UI/daemon startup.

import AppKit
import Foundation

enum SingletonGuard {
    /// Check for existing instances. If one is running, activate it and exit.
    /// Call this BEFORE @main or as the very first thing in app startup.
    /// - Returns: true if this is the only instance (safe to continue), false if terminating.
    @MainActor
    static func enforce() -> Bool {
        let myPid = getpid()
        let myBundleId = Bundle.main.bundleIdentifier ?? "bound.serendipity.agentdeck.dashboard"

        // Find other instances with the same bundle id (excluding self)
        let others = NSRunningApplication.runningApplications(withBundleIdentifier: myBundleId)
            .filter { $0.processIdentifier != myPid && !$0.isTerminated }

        guard !others.isEmpty else { return true }

        // Another instance is running — try to activate it
        let other = others[0]
        NSLog("[AgentDeck] Another instance detected (PID \(other.processIdentifier)) — activating it and exiting")

        // Activate the existing instance so user sees a window come to front
        other.activate(options: [.activateAllWindows])

        // Give activation a moment to complete, then exit
        Thread.sleep(forTimeInterval: 0.2)
        exit(0)
    }

    /// Atomic cleanup: remove daemon.json. Safe to call from signal handlers or atexit.
    /// Uses direct POSIX unlink to avoid any Swift runtime/Task complications.
    static func removeDaemonInfoFile() {
        guard let home = getpwuid(getuid())?.pointee.pw_dir else { return }
        let path = String(cString: home) + "/.agentdeck/daemon.json"
        _ = unlink(path)
    }

    /// Install atexit + signal handlers that remove daemon.json on any exit path.
    /// This is the last line of defense if normal shutdown hangs or panics.
    static func installCleanupHandlers() {
        // atexit fires on normal exit(), _exit() does NOT call it so we need signals too
        atexit {
            SingletonGuard.removeDaemonInfoFile()
        }

        // POSIX signal handlers — MUST be async-signal-safe, so only do file unlink.
        // Do not call Swift runtime / log / print from here.
        let handler: @convention(c) (Int32) -> Void = { sig in
            SingletonGuard.removeDaemonInfoFile()
            // Re-raise with default handler so the process actually terminates
            signal(sig, SIG_DFL)
            raise(sig)
        }
        signal(SIGHUP, handler)
        signal(SIGQUIT, handler)
        signal(SIGABRT, handler)
        signal(SIGBUS, handler)
        signal(SIGSEGV, handler)
        signal(SIGPIPE, SIG_IGN)  // Prevent EPIPE from killing the app
        // SIGTERM and SIGINT are handled by DaemonService with clean async shutdown
    }
}
#endif
