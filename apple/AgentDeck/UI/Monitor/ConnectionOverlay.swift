// ConnectionOverlay.swift — Discovery + manual connect UI

import SwiftUI

struct ConnectionOverlay: View {
    @Environment(AgentStateHolder.self) private var stateHolder
    @State private var manualUrl = ""
    @State private var showManualEntry = false
    @State private var searchingElapsed: TimeInterval = 0
    @State private var elapsedTimer: Timer?

    var body: some View {
        VStack(spacing: 24) {
            // Logo area
            VStack(spacing: 8) {
                Image(systemName: "antenna.radiowaves.left.and.right")
                    .font(.system(size: 48))
                    .foregroundStyle(.cyan)
                Text("AgentDeck")
                    .font(.title.bold())
                    .foregroundStyle(.white)

                if stateHolder.isAutoConnecting {
                    Text("Connecting...")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    Text("Searching for bridges...")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }

            // macOS: Local sessions from sessions.json
            #if os(macOS)
            if !stateHolder.localDiscovery.sessions.isEmpty {
                VStack(spacing: 8) {
                    Text("Local Sessions")
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                    ForEach(stateHolder.localDiscovery.sessions) { bridge in
                        bridgeRow(bridge, isLocal: true)
                    }
                }
            }
            #endif

            // Discovered bridges via mDNS
            if !stateHolder.discovery.bridges.isEmpty {
                VStack(spacing: 8) {
                    #if os(macOS)
                    if !stateHolder.localDiscovery.sessions.isEmpty {
                        Text("Network Bridges")
                            .font(.caption.bold())
                            .foregroundStyle(.secondary)
                    }
                    #endif
                    ForEach(stateHolder.discovery.bridges) { bridge in
                        bridgeRow(bridge, isLocal: false)
                    }
                }
            }

            // Show spinner only when no bridges found at all
            if allBridges.isEmpty && stateHolder.discovery.isSearching {
                ProgressView()
                    .tint(.cyan)
            }

            // Hint after 10 seconds of no results
            if allBridges.isEmpty && searchingElapsed >= 10 {
                VStack(spacing: 4) {
                    Text("No bridges found via mDNS.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("Enter bridge URL manually, or check local network permission.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
            }

            // Reconnect status
            if stateHolder.connection.isReconnecting {
                HStack(spacing: 6) {
                    ProgressView()
                        .controlSize(.small)
                        .tint(.orange)
                    Text("Reconnecting (attempt \(stateHolder.connection.reconnectAttempt))...")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }

            // Manual entry
            if showManualEntry {
                HStack {
                    TextField("ws://192.168.1.x:9120", text: $manualUrl)
                        .textFieldStyle(.roundedBorder)
                        #if os(iOS)
                        .autocapitalization(.none)
                        .keyboardType(.URL)
                        #endif

                    Button("Connect") {
                        guard !manualUrl.isEmpty else { return }
                        stateHolder.connectTo(url: manualUrl)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.cyan)
                }
                .padding(.horizontal)
            }

            Button(showManualEntry ? "Hide Manual Entry" : "Enter URL Manually") {
                showManualEntry.toggle()
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            // Error message
            if let error = stateHolder.connection.lastError {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 0.059, green: 0.086, blue: 0.157).opacity(0.8))
        .onAppear {
            searchingElapsed = 0
            elapsedTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
                searchingElapsed += 1
            }
        }
        .onDisappear {
            elapsedTimer?.invalidate()
            elapsedTimer = nil
        }
    }

    // MARK: - Helpers

    private var allBridges: [DiscoveredBridge] {
        var result: [DiscoveredBridge] = []
        #if os(macOS)
        result.append(contentsOf: stateHolder.localDiscovery.sessions)
        #endif
        result.append(contentsOf: stateHolder.discovery.bridges)
        return result
    }

    private func bridgeRow(_ bridge: DiscoveredBridge, isLocal: Bool) -> some View {
        Button {
            stateHolder.connectTo(bridge)
        } label: {
            HStack {
                VStack(alignment: .leading) {
                    Text(bridge.project ?? bridge.name)
                        .font(.headline)
                    Text(verbatim: "\(bridge.host):\(bridge.port)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if isLocal {
                    Text("local")
                        .font(.caption2)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(.green.opacity(0.2), in: Capsule())
                }
                if let agent = bridge.agentType {
                    Text(agent)
                        .font(.caption2)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(.blue.opacity(0.2), in: Capsule())
                }
                Image(systemName: "arrow.right.circle.fill")
                    .foregroundStyle(.cyan)
            }
            .padding()
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
    }
}
