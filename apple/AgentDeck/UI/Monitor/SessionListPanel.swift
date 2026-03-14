// SessionListPanel.swift — Agent session list panel

import SwiftUI

struct SessionListPanel: View {
    @Environment(AgentStateHolder.self) private var stateHolder

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Branded logo with neon cyan underline
            VStack(spacing: 2) {
                Text("AgentDeck")
                    .font(.system(size: 24, weight: .bold, design: .monospaced))
                    .foregroundStyle(.white)

                // Neon cyan underline bar (glow + crisp)
                Canvas { context, size in
                    let barWidth = size.width * 0.8
                    let x = (size.width - barWidth) / 2

                    // Glow layer
                    let glowRect = CGRect(x: x, y: 0, width: barWidth, height: 3)
                    context.fill(Path(roundedRect: glowRect, cornerRadius: 1.5),
                                 with: .color(.cyan.opacity(0.3)))
                    context.addFilter(.blur(radius: 3))

                    // Crisp bar
                    let barRect = CGRect(x: x, y: 0.5, width: barWidth, height: 2)
                    context.fill(Path(roundedRect: barRect, cornerRadius: 1),
                                 with: .color(.cyan))
                }
                .frame(height: 4)
            }
            .padding(.bottom, 4)

            // Primary session
            sessionRow(
                icon: agentIcon(for: stateHolder.state.agentType),
                project: displayProject(
                    stateHolder.state.projectName ?? "—",
                    agentType: stateHolder.state.agentType,
                    sessionIndex: primarySessionIndex
                ),
                model: stateHolder.state.modelName,
                effortLevel: stateHolder.state.effortLevel,
                permissionMode: stateHolder.state.permissionMode,
                state: stateHolder.state.state,
                workerCount: stateHolder.state.workerSessionCount
            )

            // Sibling sessions
            let siblings = stateHolder.state.siblingSessions.filter { $0.agentType != "daemon" }
            ForEach(siblings) { sibling in
                sessionRow(
                    icon: agentIcon(for: sibling.agentType),
                    project: displayProject(
                        sibling.projectName ?? sibling.id,
                        agentType: sibling.agentType,
                        sessionIndex: siblingIndex(sibling, in: siblings)
                    ),
                    model: nil,
                    effortLevel: nil,
                    permissionMode: nil,
                    state: AgentConnectionState(rawValue: sibling.state ?? "") ?? .disconnected,
                    workerCount: nil
                )
            }
        }
        .padding(10)
        .background(.black.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - Session Row

    private func sessionRow(icon: String, project: String, model: String?,
                            effortLevel: String?, permissionMode: PermissionMode?,
                            state: AgentConnectionState, workerCount: Int?) -> some View {
        HStack(spacing: 6) {
            Text(icon)
                .font(.system(size: 14))

            VStack(alignment: .leading, spacing: 1) {
                Text(project)
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundStyle(.white)
                    .lineLimit(1)

                if let model {
                    HStack(spacing: 4) {
                        Text(model)
                            .font(.system(size: 9, design: .monospaced))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)

                        // Effort level (skip "medium" default)
                        if let effort = effortLevel,
                           effort != "medium" {
                            Text(effort)
                                .font(.system(size: 8, weight: .bold, design: .monospaced))
                                .foregroundStyle(.orange)
                        }
                    }
                }

                // Permission mode badge
                if let mode = permissionMode, mode != .default {
                    Text("mode:\(mode.rawValue)")
                        .font(.system(size: 8, weight: .medium, design: .monospaced))
                        .foregroundStyle(.white.opacity(0.7))
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1)
                        .background(.white.opacity(0.1), in: Capsule())
                }

                // Worker count
                if let count = workerCount, count > 0 {
                    Text("Workers: \(count)")
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            StatusBadge(state: state)
                .scaleEffect(0.8)
        }
    }

    // MARK: - Helpers

    private func agentIcon(for agentType: String?) -> String {
        switch agentType {
        case "openclaw": "🦞"
        case "claude-code", .none: "🐙"
        default: "●"
        }
    }

    /// Compute #N suffix for primary session when duplicates exist
    private var primarySessionIndex: Int? {
        let siblings = stateHolder.state.siblingSessions.filter { $0.agentType != "daemon" }
        let sameType = siblings.filter {
            $0.agentType == stateHolder.state.agentType &&
            $0.projectName == stateHolder.state.projectName
        }
        return sameType.count > 0 ? 1 : nil
    }

    /// Compute #N suffix for sibling in list
    private func siblingIndex(_ sibling: SessionInfo, in siblings: [SessionInfo]) -> Int? {
        let matching = siblings.filter {
            $0.agentType == sibling.agentType && $0.projectName == sibling.projectName
        }
        guard matching.count > 1,
              let idx = matching.firstIndex(where: { $0.id == sibling.id }) else { return nil }
        // Offset by 2 since primary is #1
        let hasPrimaryDup = sibling.agentType == stateHolder.state.agentType &&
                            sibling.projectName == stateHolder.state.projectName
        return hasPrimaryDup ? idx + 2 : idx + 1
    }

    private func displayProject(_ name: String, agentType: String?, sessionIndex: Int?) -> String {
        if let idx = sessionIndex {
            return "\(name) #\(idx)"
        }
        return name
    }
}
