// ActivityPanel.swift — Current tool activity / suggested prompt

import SwiftUI

struct ActivityPanel: View {
    @Environment(AgentStateHolder.self) private var stateHolder

    var body: some View {
        HStack(spacing: 8) {
            if stateHolder.state.state == .processing {
                // Pulsing dot
                Circle()
                    .fill(.cyan)
                    .frame(width: 8, height: 8)
                    .opacity(0.6)

                VStack(alignment: .leading, spacing: 2) {
                    if let tool = stateHolder.state.currentTool {
                        Text(tool)
                            .font(.system(size: 11, weight: .semibold, design: .monospaced))
                            .foregroundStyle(.cyan)
                    }
                    if let input = stateHolder.state.toolInput {
                        Text(input)
                            .font(.system(size: 9, design: .monospaced))
                            .foregroundStyle(.white.opacity(0.6))
                            .lineLimit(2)
                    }
                }
            } else if stateHolder.state.state == .idle {
                if let prompt = stateHolder.state.suggestedPrompt {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Suggested:")
                            .font(.system(size: 9, weight: .bold, design: .monospaced))
                            .foregroundStyle(.secondary)
                        Text(prompt)
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundStyle(.white.opacity(0.7))
                            .lineLimit(2)
                    }
                } else {
                    Text("Waiting for prompt...")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()
        }
        .padding(8)
        .background(.black.opacity(0.5), in: RoundedRectangle(cornerRadius: 8))
    }
}
