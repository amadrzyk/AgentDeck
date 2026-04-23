// ProviderRailEvaluatorTests.swift — regression guard against the
// Claude/OpenClaw rail-status drift that showed "Not connected" in the
// menu-bar popup while the Dashboard and Settings both correctly read the
// session as live. See IntegrationsView.swift `ProviderRailEvaluator`.

#if os(macOS)
import XCTest
@testable import AgentDeck

final class ProviderRailEvaluatorTests: XCTestCase {

    // MARK: - Claude

    func testClaudeBothOn() {
        var s = DashboardState()
        s.oauthConnected = true
        let row = ProviderRailEvaluator.claude(state: s, hooksInstalled: true)
        XCTAssertEqual(row.status, .ok)
        // Both paths live — no subtitle needed; model catalog (if any) is
        // layered on by the dashboard rail, not the evaluator.
        XCTAssertNil(row.subtitle)
    }

    func testClaudeOauthOnlyOn() {
        var s = DashboardState()
        s.oauthConnected = true
        let row = ProviderRailEvaluator.claude(state: s, hooksInstalled: false)
        XCTAssertEqual(row.status, .ok)
        XCTAssertNil(row.subtitle)
    }

    func testClaudeHooksOnlyOn() {
        var s = DashboardState()
        s.oauthConnected = false  // Sandbox blocks OAuth read → known-down
        let row = ProviderRailEvaluator.claude(state: s, hooksInstalled: true)
        XCTAssertEqual(row.status, .ok, "hooks-only must read as green — regression guard for App Store build")
        XCTAssertEqual(row.subtitle, "Hooks on")
    }

    func testClaudeHooksOnlyWithUnknownOauth() {
        var s = DashboardState()
        s.oauthConnected = nil  // Early boot, haven't polled yet
        let row = ProviderRailEvaluator.claude(state: s, hooksInstalled: true)
        XCTAssertEqual(row.status, .ok)
        XCTAssertEqual(row.subtitle, "Hooks on")
    }

    func testClaudeNeitherKnownDown() {
        var s = DashboardState()
        s.oauthConnected = false
        let row = ProviderRailEvaluator.claude(state: s, hooksInstalled: false)
        XCTAssertEqual(row.status, .warn)
        XCTAssertEqual(row.subtitle, "Not connected")
    }

    func testClaudeNeitherUnknown() {
        var s = DashboardState()
        s.oauthConnected = nil
        let row = ProviderRailEvaluator.claude(state: s, hooksInstalled: false)
        XCTAssertEqual(row.status, .dim)
        XCTAssertNil(row.subtitle)
    }

    // MARK: - OpenClaw

    func testOpenClawHiddenWhenUnavailable() {
        let s = DashboardState()
        XCTAssertNil(ProviderRailEvaluator.openClaw(state: s),
                     "rail must suppress the row entirely until gateway is discovered")
    }

    func testOpenClawConnected() {
        var s = DashboardState()
        s.gatewayAvailable = true
        s.gatewayConnected = true
        s.gatewayAuthStatus = "connected"
        let row = ProviderRailEvaluator.openClaw(state: s)
        XCTAssertEqual(row?.status, .ok)
        XCTAssertNil(row?.subtitle)
    }

    func testOpenClawReconnecting() {
        var s = DashboardState()
        s.gatewayAvailable = true
        s.gatewayConnected = false
        s.gatewayAuthStatus = "reconnecting"
        let row = ProviderRailEvaluator.openClaw(state: s)
        XCTAssertEqual(row?.status, .warn)
        XCTAssertEqual(row?.subtitle, "Reconnecting…")
    }

    func testOpenClawPairingRequired() {
        var s = DashboardState()
        s.gatewayAvailable = true
        s.gatewayAuthStatus = "pairing_required"
        let row = ProviderRailEvaluator.openClaw(state: s)
        XCTAssertEqual(row?.status, .warn)
        XCTAssertEqual(row?.subtitle, "Pairing required")
    }

    func testOpenClawDeviceAuthInvalidMapsToPairing() {
        // `device_auth_invalid` is expected on first launch + after identity
        // reset — treat it as pairing-required so users don't read it as a
        // hard failure.
        var s = DashboardState()
        s.gatewayAvailable = true
        s.gatewayAuthStatus = "device_auth_invalid"
        let row = ProviderRailEvaluator.openClaw(state: s)
        XCTAssertEqual(row?.status, .warn)
        XCTAssertEqual(row?.subtitle, "Pairing required")
    }

    func testOpenClawApprovalPending() {
        var s = DashboardState()
        s.gatewayAvailable = true
        s.gatewayAuthStatus = "approval_pending"
        let row = ProviderRailEvaluator.openClaw(state: s)
        XCTAssertEqual(row?.status, .warn)
        XCTAssertEqual(row?.subtitle, "Approve in OpenClaw")
    }

    func testOpenClawAuthFailed() {
        var s = DashboardState()
        s.gatewayAvailable = true
        s.gatewayHasError = true
        s.gatewayAuthStatus = "auth_failed"
        let row = ProviderRailEvaluator.openClaw(state: s)
        XCTAssertEqual(row?.status, .error)
        XCTAssertEqual(row?.subtitle, "Auth failed — re-approve")
    }

    func testOpenClawUnsupportedProtocol() {
        var s = DashboardState()
        s.gatewayAvailable = true
        s.gatewayHasError = true
        s.gatewayAuthStatus = "unsupported_protocol"
        let row = ProviderRailEvaluator.openClaw(state: s)
        XCTAssertEqual(row?.status, .error)
        XCTAssertEqual(row?.subtitle, "Unsupported — update OpenClaw")
    }

    func testOpenClawGatewayTokenMissing() {
        var s = DashboardState()
        s.gatewayAvailable = true
        s.gatewayAuthStatus = "gateway_token_missing"
        let row = ProviderRailEvaluator.openClaw(state: s)
        XCTAssertEqual(row?.status, .warn)
        XCTAssertEqual(row?.subtitle, "Gateway token required")
    }

    func testOpenClawErrorWithoutAuthStatusFallsBackToGenericError() {
        var s = DashboardState()
        s.gatewayHasError = true
        s.gatewayAuthStatus = nil
        let row = ProviderRailEvaluator.openClaw(state: s)
        XCTAssertEqual(row?.status, .error)
        XCTAssertEqual(row?.subtitle, "Gateway error")
    }

    // MARK: - LEDStatus.isFilled

    func testLEDStatusFilledVsDim() {
        XCTAssertTrue(LEDStatus.ok.isFilled)
        XCTAssertTrue(LEDStatus.warn.isFilled)
        XCTAssertTrue(LEDStatus.error.isFilled)
        XCTAssertFalse(LEDStatus.dim.isFilled)
    }
}
#endif
