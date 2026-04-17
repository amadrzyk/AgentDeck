#if os(macOS)
// DisplayMonitor.swift — macOS display + presence state aggregator
//
// Signals fused into a single `displayOn` boolean for downstream consumers
// (Pixoo, D200H, ESP32, Android, WS clients):
//   1. Display hardware asleep (CGDisplayIsAsleep polling, 2s)
//   2. Screen locked (com.apple.screenIsLocked DistributedNotification)
//   3. Screensaver running (com.apple.screensaver.didstart DistributedNotification)
//   4. Fast User Switching — session resigned active (NSWorkspace)
//
// "displayOn = true" means the user is actively present AND the monitor is on.
// Any of the four going negative flips displayOn false. All APIs are public /
// App Store safe — no CGSSessionScreenIsLocked or other private APIs.

import Foundation
import AppKit
import CoreGraphics

actor DisplayMonitor {
    private var isDisplayAsleep = false
    private var isScreenLocked = false
    private var isScreensaverActive = false
    private var isSessionInactive = false

    private var lastBroadcastOn = true
    private var pollTask: Task<Void, Never>?
    private var _onStateChanged: (@Sendable (Bool) -> Void)?

    private var observerHandles: [NSObjectProtocol] = []

    func setOnStateChanged(_ handler: @escaping @Sendable (Bool) -> Void) {
        _onStateChanged = handler
    }

    func start() {
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(2))
                await self?.checkDisplayState()
            }
        }
        installPresenceObservers()
        DaemonLogger.shared.debug("Display", "Monitor started (display+lock+screensaver+session)")
    }

    func stop() {
        pollTask?.cancel()
        removePresenceObservers()
    }

    var displayOn: Bool { computeDisplayOn() }

    // MARK: - Composite

    private func computeDisplayOn() -> Bool {
        !isDisplayAsleep && !isScreenLocked && !isScreensaverActive && !isSessionInactive
    }

    private func emitIfChanged(reason: String) {
        let newOn = computeDisplayOn()
        if newOn != lastBroadcastOn {
            lastBroadcastOn = newOn
            DaemonLogger.shared.debug(
                "Display",
                "State changed: \(newOn ? "ON" : "OFF") (cause=\(reason)) "
                + "[displayAsleep=\(isDisplayAsleep) locked=\(isScreenLocked) "
                + "screensaver=\(isScreensaverActive) sessionInactive=\(isSessionInactive)]"
            )
            _onStateChanged?(newOn)
        }
    }

    // MARK: - Poll (hardware display)

    private func checkDisplayState() {
        let mainDisplay = CGMainDisplayID()
        let isAsleep = CGDisplayIsAsleep(mainDisplay) != 0
        if isAsleep != isDisplayAsleep {
            isDisplayAsleep = isAsleep
            emitIfChanged(reason: "display\(isAsleep ? "Sleep" : "Wake")")
        }
    }

    // MARK: - Presence observers (lock / screensaver / session)

    private func installPresenceObservers() {
        let dnc = DistributedNotificationCenter.default()
        let wsc = NSWorkspace.shared.notificationCenter

        let lockObs = dnc.addObserver(
            forName: Notification.Name("com.apple.screenIsLocked"),
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { await self?.setLocked(true) }
        }
        let unlockObs = dnc.addObserver(
            forName: Notification.Name("com.apple.screenIsUnlocked"),
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { await self?.setLocked(false) }
        }
        let ssStartObs = dnc.addObserver(
            forName: Notification.Name("com.apple.screensaver.didstart"),
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { await self?.setScreensaver(true) }
        }
        let ssStopObs = dnc.addObserver(
            forName: Notification.Name("com.apple.screensaver.didstop"),
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { await self?.setScreensaver(false) }
        }
        let sessionOut = wsc.addObserver(
            forName: NSWorkspace.sessionDidResignActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { await self?.setSessionInactive(true) }
        }
        let sessionIn = wsc.addObserver(
            forName: NSWorkspace.sessionDidBecomeActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { await self?.setSessionInactive(false) }
        }

        observerHandles = [lockObs, unlockObs, ssStartObs, ssStopObs, sessionOut, sessionIn]
    }

    private func removePresenceObservers() {
        let dnc = DistributedNotificationCenter.default()
        let wsc = NSWorkspace.shared.notificationCenter
        for handle in observerHandles {
            dnc.removeObserver(handle)
            wsc.removeObserver(handle)
        }
        observerHandles.removeAll()
    }

    private func setLocked(_ locked: Bool) {
        guard locked != isScreenLocked else { return }
        isScreenLocked = locked
        emitIfChanged(reason: locked ? "screenLock" : "screenUnlock")
    }

    private func setScreensaver(_ active: Bool) {
        guard active != isScreensaverActive else { return }
        isScreensaverActive = active
        emitIfChanged(reason: active ? "screensaverStart" : "screensaverStop")
    }

    private func setSessionInactive(_ inactive: Bool) {
        guard inactive != isSessionInactive else { return }
        isSessionInactive = inactive
        emitIfChanged(reason: inactive ? "sessionResign" : "sessionResume")
    }
}
#endif
