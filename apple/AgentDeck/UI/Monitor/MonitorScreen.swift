// MonitorScreen.swift — Single screen: terrarium + HUD + timeline + settings gear

import SwiftUI

struct MonitorScreen: View {
    @Environment(AgentStateHolder.self) private var stateHolder

    @State private var terrariumState = TerrariumState()
    @State private var showSettingsSheet = false

    private let sandFraction: CGFloat = 0.35

    /// Content-based key for sibling state changes (triggers terrarium update)
    private var siblingStatesKey: String {
        stateHolder.state.siblingSessions
            .map { "\($0.id):\($0.state ?? "")" }
            .joined(separator: ",")
    }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                // Layer 1: Terrarium background (60fps animated aquarium)
                TerrariumView(terrariumState: terrariumState)
                    .ignoresSafeArea()

                // Layer 2: Connection overlay or HUD + Timeline
                if !stateHolder.state.bridgeConnected {
                    ConnectionOverlay()
                } else {
                    // HUD panels (session list + tank status)
                    MonitorHUD()

                    // Timeline in sand area
                    VStack {
                        Spacer()
                        TimelineStripView()
                            .frame(height: geo.size.height * sandFraction)
                    }

                    // Options overlay (when awaiting)
                    if stateHolder.state.state.isAwaiting {
                        optionsOverlay
                    }
                }

                // Layer 3: Settings gear + rotation toggle (always visible)
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        #if os(iOS)
                        Button {
                            guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene else { return }
                            let geometryPreferences: UIWindowScene.GeometryPreferences.iOS
                            if scene.interfaceOrientation.isLandscape {
                                geometryPreferences = UIWindowScene.GeometryPreferences.iOS(interfaceOrientations: .portrait)
                            } else {
                                geometryPreferences = UIWindowScene.GeometryPreferences.iOS(interfaceOrientations: .landscapeRight)
                            }
                            scene.requestGeometryUpdate(geometryPreferences)
                        } label: {
                            Image(systemName: "rectangle.portrait.rotate")
                                .font(.title3)
                                .foregroundStyle(.white.opacity(0.35))
                                .padding(.vertical, 16)
                                .padding(.trailing, 4)
                        }
                        .buttonStyle(.plain)
                        #endif
                        Button {
                            showSettingsSheet = true
                        } label: {
                            Image(systemName: "gearshape")
                                .font(.title2)
                                .foregroundStyle(.white.opacity(0.6))
                                .padding(.vertical, 16)
                                .padding(.trailing, 24)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .sheet(isPresented: $showSettingsSheet) {
            SettingsScreen()
        }
        .onChange(of: stateHolder.state.state) {
            updateTerrariumState()
        }
        .onChange(of: stateHolder.state.siblingSessions.count) {
            updateTerrariumState()
        }
        .onChange(of: siblingStatesKey) {
            updateTerrariumState()
        }
        .onChange(of: stateHolder.state.gatewayAvailable) {
            updateTerrariumState()
        }
        .onChange(of: stateHolder.state.gatewayHasError) {
            updateTerrariumState()
        }
        .onAppear {
            updateTerrariumState()
        }
    }

    private func updateTerrariumState() {
        terrariumState = stateHolder.state.toTerrariumState(previous: terrariumState)
    }

    // MARK: - Options Overlay

    private var optionsOverlay: some View {
        VStack {
            Spacer()

            VStack(spacing: 8) {
                if let question = stateHolder.state.question {
                    Text(question)
                        .font(.subheadline)
                        .foregroundStyle(.white)
                }

                ForEach(stateHolder.state.options) { option in
                    Button {
                        stateHolder.sendCommand(.selectOption(index: option.index))
                    } label: {
                        HStack {
                            Text(option.label)
                                .foregroundStyle(.white)
                            Spacer()
                            if option.recommended == true {
                                Image(systemName: "star.fill")
                                    .foregroundStyle(.yellow)
                                    .font(.caption)
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(
                            option.selected == true
                                ? Color.blue.opacity(0.3)
                                : Color.white.opacity(0.1),
                            in: RoundedRectangle(cornerRadius: 6)
                        )
                    }
                }
            }
            .padding()
            .background(.black.opacity(0.6), in: RoundedRectangle(cornerRadius: 12))
            .padding()

            Spacer()
                .frame(height: 60)
        }
    }
}
