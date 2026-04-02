// AgentDeckApp.swift — Universal app entry point (iOS + macOS)

import SwiftUI
#if os(macOS)
import ServiceManagement
#endif

@main
struct AgentDeckApp: App {
    @StateObject private var stateHolder = AgentStateHolder()
    @StateObject private var preferences = AppPreferences.shared
    #if os(macOS)
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var daemonService = DaemonService()
    @Environment(\.openWindow) private var openWindow
    #endif

    var body: some Scene {
        #if os(macOS)
        Window("AgentDeck Dashboard", id: "dashboard") {
            ContentView()
                .environmentObject(stateHolder)
                .environmentObject(preferences)
                .task { configureDaemonConnection() }
        }
        .defaultPosition(.center)
        .defaultSize(width: 1280, height: 840)
        #else
        WindowGroup("AgentDeck Dashboard", id: "dashboard") {
            ContentView()
                .environmentObject(stateHolder)
                .environmentObject(preferences)
        }
        #endif
        #if os(macOS)
        Settings {
            SettingsScreen()
                .environmentObject(stateHolder)
                .environmentObject(preferences)
        }
        MenuBarExtra("AgentDeck", systemImage: menuBarSystemImage) {
            Button(isDashboardVisible ? "Hide Dashboard" : "Show Dashboard") {
                toggleDashboardVisibility()
            }.keyboardShortcut("d")

            if daemonService.isRunning {
                Text(verbatim: "Daemon on port \(daemonService.port)")
                    .font(.caption).foregroundStyle(.secondary)
            } else if daemonService.isUsingExternalDaemon {
                Text(verbatim: "Using external daemon on port \(daemonService.port)")
                    .font(.caption).foregroundStyle(.secondary)
            } else if let error = daemonService.errorMessage {
                Text(error).font(.caption).foregroundStyle(.red)
            } else {
                Text("Connecting...").font(.caption).foregroundStyle(.secondary)
            }

            Divider()

            Toggle("Start at Login", isOn: Binding(
                get: { daemonService.isLoginItemEnabled },
                set: { enabled in
                    if enabled { daemonService.registerLoginItem() }
                    else { daemonService.unregisterLoginItem() }
                }
            ))

            Button("Launch Claude Session") {
                SessionLauncher.launchSession(daemonPort: daemonService.port)
            }

            Divider()

            Button("Quit AgentDeck") {
                Task {
                    await daemonService.stop()
                    NSApplication.shared.terminate(nil)
                }
            }.keyboardShortcut("q")
        }
        #endif
    }

    #if os(macOS)
    private func configureDaemonConnection() {
        // Wire AppDelegate to daemon service for clean shutdown
        appDelegate.daemonService = daemonService

        daemonService.onReady = { [stateHolder] wsUrl in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                stateHolder.connectTo(url: wsUrl)
            }
        }

        if preferences.openDashboardOnLaunch {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                openWindow(id: "dashboard")
            }
        }
    }

    private var isDashboardVisible: Bool {
        NSApplication.shared.windows.contains {
            $0.isVisible && $0.title.contains("AgentDeck Dashboard")
        }
    }

    private var menuBarSystemImage: String {
        switch preferences.menuBarIconStyle {
        case .status:
            return daemonService.isRunning
                ? "antenna.radiowaves.left.and.right"
                : "antenna.radiowaves.left.and.right.slash"
        case .app:
            return "dial.medium"
        case .minimal:
            return "circle.grid.2x2.fill"
        }
    }

    private func toggleDashboardVisibility() {
        if let window = NSApplication.shared.windows.first(where: { $0.title.contains("AgentDeck Dashboard") }) {
            if window.isVisible {
                window.orderOut(nil)
            } else {
                window.makeKeyAndOrderFront(nil)
                NSApplication.shared.activate(ignoringOtherApps: true)
            }
            return
        }
        openWindow(id: "dashboard")
        NSApplication.shared.activate(ignoringOtherApps: true)
    }
    #endif
}

#if os(macOS)
/// AppDelegate handles app lifecycle events that SwiftUI doesn't cover,
/// particularly applicationWillTerminate for clean daemon shutdown.
class AppDelegate: NSObject, NSApplicationDelegate {
    var daemonService: DaemonService?

    func applicationWillTerminate(_ notification: Notification) {
        // Synchronous shutdown — block briefly to release port and clean up daemon.json
        let semaphore = DispatchSemaphore(value: 0)
        Task {
            await daemonService?.stop()
            semaphore.signal()
        }
        // Wait up to 3 seconds for shutdown to complete
        _ = semaphore.wait(timeout: .now() + 3)
    }
}
#endif
