// ContentView.swift — Single-screen layout: terrarium + HUD + gear icon

import SwiftUI

struct ContentView: View {
    @Environment(AgentStateHolder.self) private var stateHolder

    var body: some View {
        MonitorScreen()
            .onAppear {
                stateHolder.startConnectionWaterfall()
            }
    }
}
