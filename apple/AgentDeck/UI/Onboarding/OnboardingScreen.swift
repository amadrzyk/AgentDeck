#if os(iOS)
// OnboardingScreen.swift — First-launch 3-pane orientation for iOS/iPadOS.
//
// Parallels `OnboardingSheet` on macOS but tuned for touch + a companion-
// app mental model: the iOS user's value is "my Mac's sessions on my
// iPad", so the third pane is about finding the Mac via mDNS rather than
// "install an agent" (which the user does on their Mac, not their iPad).

import SwiftUI
import UIKit

struct OnboardingScreen: View {
    @EnvironmentObject private var stateHolder: AgentStateHolder
    @EnvironmentObject private var preferences: AppPreferences

    @State private var pane: Int = 0

    var body: some View {
        VStack(spacing: 0) {
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            Divider()

            footer
                .padding(.horizontal, 20)
                .padding(.vertical, 14)
        }
        .background(Color(.systemBackground))
    }

    @ViewBuilder
    private var content: some View {
        switch pane {
        case 0: WelcomePaneiOS()
        case 1: AgentInfoPaneiOS()
        default: FindMacPaneiOS()
        }
    }

    private var footer: some View {
        HStack(spacing: 12) {
            HStack(spacing: 6) {
                ForEach(0..<3, id: \.self) { idx in
                    Circle()
                        .fill(idx == pane ? Color.accentColor : Color.secondary.opacity(0.3))
                        .frame(width: 8, height: 8)
                }
            }

            Spacer()

            if pane > 0 {
                Button("Back") { pane = max(0, pane - 1) }
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
        }
    }

    private func finish() {
        preferences.hasSeenOnboarding = true
    }
}

// MARK: - Panes

private struct WelcomePaneiOS: View {
    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: "scribble.variable")
                .resizable()
                .scaledToFit()
                .frame(width: 120, height: 120)
                .foregroundStyle(Color.accentColor)

            Text("Stop Chatting.\nStart Steering.")
                .font(.system(size: 28, weight: .bold))
                .multilineTextAlignment(.center)

            Text("Real-time monitoring and evaluation for AI coding agents running on your Mac — Claude Code, Codex, OpenCode.")
                .font(.system(size: 15))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 30)

            Spacer()
        }
        .padding(.horizontal, 24)
    }
}

private struct AgentInfoPaneiOS: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Install an agent on your Mac")
                    .font(.system(size: 22, weight: .semibold))
                Text("AgentDeck watches AI coding agents on your Mac and shows their state here. Install at least one on your Mac — you don't install anything on iPad/iPhone.")
                    .font(.system(size: 14))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(spacing: 10) {
                agentRow("Claude Code", detail: "Anthropic's CLI agent with hooks and permissions.")
                agentRow("Codex", detail: "OpenAI's coding agent CLI.")
                agentRow("OpenCode", detail: "Open-source multi-model coding agent.")
            }

            Text("On your Mac, install AgentDeck from the App Store and follow its onboarding to finish the setup.")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .padding(.top, 6)

            Spacer()
        }
        .padding(24)
    }

    private func agentRow(_ name: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(name)
                .font(.system(size: 15, weight: .semibold))
            Text(detail)
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(Color.secondary.opacity(0.08))
        )
    }
}

private struct FindMacPaneiOS: View {
    @EnvironmentObject private var stateHolder: AgentStateHolder

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Find your Mac")
                    .font(.system(size: 22, weight: .semibold))
                Text("When your Mac is on the same Wi-Fi network, AgentDeck discovers it automatically. Just tap **Get Started** — the dashboard pairs as soon as a Mac comes online.")
                    .font(.system(size: 14))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack {
                Spacer()
                Image(systemName: "dot.radiowaves.left.and.right")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 80, height: 80)
                    .foregroundStyle(Color.accentColor.opacity(0.8))
                Spacer()
            }
            .padding(.vertical, 8)

            VStack(alignment: .leading, spacing: 8) {
                bullet("AgentDeck uses Bonjour to find Macs on your Wi-Fi")
                bullet("iOS will ask for **Local Network** permission — tap Allow")
                bullet("For different networks, use **Scan QR** in Settings")
            }
            .font(.system(size: 13))

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
