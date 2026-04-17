#if os(macOS)
// OnboardingSheet.swift — First-launch 3-pane orientation for macOS.
//
// App Store review expects a clear first-run path for non-developer users.
// The dashboard starts empty by design (no session until the user launches
// one), so without onboarding a fresh user sees a blank terrarium and no
// affordance to proceed. This sheet bridges that gap with three screens:
//
//   1. Welcome — brand + value prop ("Stop Chatting. Start Steering.")
//   2. Pick an agent — Claude Code / Codex / OpenCode install links
//   3. Pair your iPad — Bonjour pitch + iOS companion download link
//
// Gated by `AppPreferences.hasSeenOnboarding` so returning users skip it.
// xctest environments bypass the gate so test runs don't deadlock on a
// modal sheet.

import SwiftUI
import AppKit

struct OnboardingSheet: View {
    @EnvironmentObject private var preferences: AppPreferences
    @Environment(\.dismiss) private var dismiss

    @State private var pane: Int = 0
    @State private var userHasAgent: Bool = false

    var body: some View {
        VStack(spacing: 0) {
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            Divider()

            footer
                .padding(.horizontal, 24)
                .padding(.vertical, 14)
        }
        .frame(width: 640, height: 540)
    }

    @ViewBuilder
    private var content: some View {
        switch pane {
        case 0: WelcomePane()
        case 1: AgentPickerPane(userHasAgent: $userHasAgent)
        default: PairIPadPane()
        }
    }

    private var footer: some View {
        HStack(spacing: 12) {
            // Progress dots.
            HStack(spacing: 6) {
                ForEach(0..<3, id: \.self) { idx in
                    Circle()
                        .fill(idx == pane ? Color.accentColor : Color.secondary.opacity(0.3))
                        .frame(width: 8, height: 8)
                }
            }

            Spacer()

            if pane > 0 {
                Button("Back") {
                    pane = max(0, pane - 1)
                }
                .buttonStyle(.bordered)
            }

            Button(pane == 2 ? "Get Started" : "Continue") {
                if pane < 2 {
                    pane += 1
                } else {
                    finish()
                }
            }
            .buttonStyle(.borderedProminent)
            .keyboardShortcut(.defaultAction)
        }
    }

    private func finish() {
        preferences.hasSeenOnboarding = true
        dismiss()
    }
}

// MARK: - Pane 1: Welcome

private struct WelcomePane: View {
    var body: some View {
        VStack(spacing: 22) {
            Spacer()

            // Terrarium creature — use the octopus app icon as a recognizable
            // brand anchor rather than a runtime-animated creature (Canvas
            // sizing inside a sheet has edge cases we'd rather avoid here).
            Image(systemName: "scribble.variable")
                .resizable()
                .scaledToFit()
                .frame(width: 120, height: 120)
                .foregroundStyle(Color.accentColor)
                .padding(.bottom, 6)

            Text("Stop Chatting.\nStart Steering.")
                .font(.system(size: 30, weight: .bold))
                .multilineTextAlignment(.center)

            Text("Real-time monitoring and evaluation for AI coding agents. Works with Claude Code, Codex, and OpenCode sessions across every device in your setup.")
                .font(.system(size: 14))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 40)

            Spacer()
        }
        .padding(24)
    }
}

// MARK: - Pane 2: Agent picker

private struct AgentPickerPane: View {
    @Binding var userHasAgent: Bool

    private struct AgentOption {
        let name: String
        let tagline: String
        let installCommand: String
        let docsURL: URL
    }

    private let options: [AgentOption] = [
        AgentOption(
            name: "Claude Code",
            tagline: "Anthropic's CLI agent with hooks + permissions.",
            installCommand: "npm install -g @anthropic-ai/claude-code",
            docsURL: URL(string: "https://docs.claude.com/en/docs/claude-code/quickstart")!
        ),
        AgentOption(
            name: "Codex",
            tagline: "OpenAI's coding agent CLI.",
            installCommand: "npm install -g @openai/codex",
            docsURL: URL(string: "https://github.com/openai/codex-cli")!
        ),
        AgentOption(
            name: "OpenCode",
            tagline: "Open-source multi-model coding agent.",
            installCommand: "npm install -g opencode",
            docsURL: URL(string: "https://opencode.ai/docs")!
        ),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Pick an AI coding agent")
                    .font(.system(size: 22, weight: .semibold))
                Text("AgentDeck works with any of these. Install at least one — the dashboard starts monitoring the moment you launch a session.")
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(spacing: 10) {
                ForEach(options, id: \.name) { option in
                    agentCard(option)
                }
            }

            Toggle("I already have one of these installed", isOn: $userHasAgent)
                .font(.system(size: 12))
                .toggleStyle(.checkbox)

            Spacer()
        }
        .padding(24)
    }

    @ViewBuilder
    private func agentCard(_ option: AgentOption) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(option.name)
                    .font(.system(size: 14, weight: .semibold))
                Text(option.tagline)
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                Text(option.installCommand)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(.tertiary)
                    .textSelection(.enabled)
            }
            Spacer()
            Button("Open Guide") {
                NSWorkspace.shared.open(option.docsURL)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(Color.secondary.opacity(0.08))
        )
    }
}

// MARK: - Pane 3: Pair iPad

private struct PairIPadPane: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Pair your iPad or iPhone")
                    .font(.system(size: 22, weight: .semibold))
                Text("AgentDeck has a free iOS companion app. It auto-discovers this Mac over Wi-Fi and mirrors your live sessions to a second screen — great as a bedside monitor or for pair programming.")
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(alignment: .top, spacing: 16) {
                Image(systemName: "ipad.landscape")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 120, height: 120)
                    .foregroundStyle(Color.accentColor.opacity(0.8))

                VStack(alignment: .leading, spacing: 10) {
                    bullet("Install **AgentDeck** from the iOS App Store")
                    bullet("Open it on the same Wi-Fi network as this Mac")
                    bullet("The iPad finds the Mac automatically via mDNS")
                    bullet("For different networks, use **Pair iPad** in the menu bar to show a QR code")
                }
                .font(.system(size: 13))
            }

            HStack(spacing: 10) {
                Button {
                    // Placeholder — actual ID set after App Store publish.
                    // Using a search URL so the button is never a dead end.
                    if let url = URL(string: "https://apps.apple.com/search?term=agentdeck") {
                        NSWorkspace.shared.open(url)
                    }
                } label: {
                    Label("Open iOS App Store", systemImage: "square.and.arrow.up")
                }
                .buttonStyle(.borderedProminent)

                Button("Do It Later") {
                    // Ignored — footer "Get Started" is the primary close path.
                }
                .buttonStyle(.bordered)
                .opacity(0.5)
                .disabled(true)
            }

            Spacer()
        }
        .padding(24)
    }

    private func bullet(_ markdown: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text("•")
                .foregroundStyle(Color.accentColor)
            Text((try? AttributedString(markdown: markdown)) ?? AttributedString(markdown))
                .foregroundStyle(.primary)
        }
    }
}
#endif
