// MonitorHUD.swift — Semi-transparent HUD overlay (matches Android MonitorHUD)

import SwiftUI

struct MonitorHUD: View {
    @Environment(AgentStateHolder.self) private var stateHolder

    var body: some View {
        GeometryReader { geo in
            let isLandscape = geo.size.width > geo.size.height

            if isLandscape {
                // iPad landscape: matches Android Box layout
                ZStack(alignment: .topLeading) {
                    // Top-left: Session list (max 220dp)
                    SessionListPanel()
                        .frame(maxWidth: min(geo.size.width * 0.22, 220))
                        .padding(.leading, 12)
                        .padding(.top, 12)

                    // Top-right: Tank status (max 280dp)
                    HStack {
                        Spacer()
                        TankStatusPanel()
                            .frame(maxWidth: min(geo.size.width * 0.32, 280))
                            .padding(.trailing, 12)
                            .padding(.top, 12)
                    }
                }
            } else {
                // iPhone portrait: vertical stack
                VStack(spacing: 0) {
                    HStack(alignment: .top, spacing: 8) {
                        SessionListPanel()
                            .frame(maxWidth: .infinity)
                        TankStatusPanel()
                            .frame(maxWidth: .infinity)
                    }
                    .padding(.horizontal, 8)
                    .padding(.top, 8)

                    Spacer()
                }
            }
        }
    }
}
