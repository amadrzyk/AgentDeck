// MonitorHUD.swift — Semi-transparent HUD overlay on terrarium

import SwiftUI

struct MonitorHUD: View {
    @Environment(AgentStateHolder.self) private var stateHolder

    var body: some View {
        GeometryReader { geo in
            let isLandscape = geo.size.width > geo.size.height

            if isLandscape {
                // iPad landscape: 3-panel layout
                ZStack(alignment: .topLeading) {
                    // Top-left: Session list
                    SessionListPanel()
                        .frame(width: geo.size.width * 0.22, height: geo.size.height * 0.6)
                        .padding(8)

                    // Top-right: Tank status
                    HStack {
                        Spacer()
                        TankStatusPanel()
                            .frame(width: geo.size.width * 0.32)
                            .padding(8)
                    }

                    // Activity (processing or idle)
                    if stateHolder.state.state == .processing || stateHolder.state.state == .idle {
                        VStack {
                            Spacer()
                            ActivityPanel()
                                .frame(maxWidth: geo.size.width * 0.5)
                                .padding(.bottom, geo.size.height * 0.38)
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
            } else {
                // iPhone portrait: vertical stack
                VStack(spacing: 0) {
                    HStack(spacing: 8) {
                        SessionListPanel()
                            .frame(maxWidth: .infinity)
                        TankStatusPanel()
                            .frame(maxWidth: .infinity)
                    }
                    .padding(.horizontal, 8)
                    .padding(.top, 8)

                    if stateHolder.state.state == .processing || stateHolder.state.state == .idle {
                        ActivityPanel()
                            .padding(.horizontal, 8)
                            .padding(.top, 4)
                    }

                    Spacer()
                }
            }
        }
    }
}
