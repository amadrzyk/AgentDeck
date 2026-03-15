// ContentView.swift — Single-screen layout: terrarium + HUD + gear icon

import SwiftUI

struct ContentView: View {
    @Environment(AgentStateHolder.self) private var stateHolder
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        MonitorScreen()
            .onAppear {
                stateHolder.startConnectionWaterfall()
            }
            .onChange(of: scenePhase) { _, newPhase in
                switch newPhase {
                case .active:
                    stateHolder.handleForegroundReturn()
                case .background:
                    stateHolder.handleBackgroundEntry()
                default:
                    break
                }
            }
    }
}
