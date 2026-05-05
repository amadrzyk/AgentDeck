// OpenClawTokenExtractTests.swift — covers SettingsScreen.extractGatewayToken,
// the helper that locates the Gateway token inside a freshly-picked
// openclaw.json. Real OpenClaw configs nest the token at gateway.auth.token;
// hand-rolled exports sometimes use the top-level auth.token; we also accept
// a flat gateway.token as a defensive third try.

#if os(macOS)
import XCTest
@testable import AgentDeck

final class OpenClawTokenExtractTests: XCTestCase {

    func testExtractsCanonicalGatewayAuthTokenPath() {
        let json: [String: Any] = [
            "gateway": [
                "auth": ["mode": "token", "token": "abc"]
            ]
        ]
        XCTAssertEqual(SettingsScreen.extractGatewayToken(from: json), "abc")
    }

    func testFallsBackToTopLevelAuthToken() {
        let json: [String: Any] = [
            "auth": ["token": "def"]
        ]
        XCTAssertEqual(SettingsScreen.extractGatewayToken(from: json), "def")
    }

    func testFallsBackToFlatGatewayToken() {
        let json: [String: Any] = [
            "gateway": ["token": "ghi"]
        ]
        XCTAssertEqual(SettingsScreen.extractGatewayToken(from: json), "ghi")
    }

    func testReturnsNilWhenAuthSectionLacksToken() {
        // Mirrors the user's actual openclaw.json shape: auth holds profiles,
        // not a token. Without the gateway block this should fail cleanly.
        let json: [String: Any] = [
            "auth": ["profiles": ["openai-codex:default": ["mode": "oauth"]]]
        ]
        XCTAssertNil(SettingsScreen.extractGatewayToken(from: json))
    }

    func testIgnoresWhitespaceOnlyToken() {
        let json: [String: Any] = [
            "gateway": ["auth": ["token": "   "]]
        ]
        XCTAssertNil(SettingsScreen.extractGatewayToken(from: json))
    }

    func testTrimsWhitespaceAroundFoundToken() {
        let json: [String: Any] = [
            "gateway": ["auth": ["token": "  xyz\n"]]
        ]
        XCTAssertEqual(SettingsScreen.extractGatewayToken(from: json), "xyz")
    }

    func testCanonicalPathWinsOverFallback() {
        // Both paths populated — gateway.auth.token must win.
        let json: [String: Any] = [
            "auth": ["token": "fallback"],
            "gateway": ["auth": ["token": "canonical"]]
        ]
        XCTAssertEqual(SettingsScreen.extractGatewayToken(from: json), "canonical")
    }

    func testReturnsNilOnEmptyJSON() {
        XCTAssertNil(SettingsScreen.extractGatewayToken(from: [:]))
    }

    func testRealUserShape() {
        // Subset of the actual ~/.openclaw/openclaw.json layout the user hit.
        let json: [String: Any] = [
            "agents": ["defaults": ["maxConcurrent": 2]],
            "auth": ["profiles": ["openai-codex:default": ["mode": "oauth"]]],
            "gateway": [
                "bind": "loopback",
                "port": 18789,
                "auth": [
                    "mode": "token",
                    "token": "e1e7197ce499205091d08097b06ab3339e8396f8aea94bfa"
                ]
            ]
        ]
        XCTAssertEqual(
            SettingsScreen.extractGatewayToken(from: json),
            "e1e7197ce499205091d08097b06ab3339e8396f8aea94bfa"
        )
    }
}
#endif
