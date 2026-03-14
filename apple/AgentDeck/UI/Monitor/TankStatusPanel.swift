// TankStatusPanel.swift — Rate limits + models panel (Android EnginePanel style)

import SwiftUI

struct TankStatusPanel: View {
    @Environment(AgentStateHolder.self) private var stateHolder

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header
            Text("∿ TANK STATUS")
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .foregroundStyle(.secondary)

            // Water Gauges
            if stateHolder.state.fiveHourPercent != nil || stateHolder.state.sevenDayPercent != nil {
                HStack(spacing: 8) {
                    if let pct = stateHolder.state.fiveHourPercent {
                        WaterGauge(label: "5h", percent: pct,
                                   resetTime: formatResetTime(stateHolder.state.fiveHourResetsAt))
                    }
                    if let pct = stateHolder.state.sevenDayPercent {
                        WaterGauge(label: "7d", percent: pct,
                                   resetTime: formatResetTime(stateHolder.state.sevenDayResetsAt))
                    }
                }
            }

            Divider().opacity(0.3)

            // MODEL section
            VStack(alignment: .leading, spacing: 3) {
                Text("MODEL")
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundStyle(.secondary)

                // Current model
                if let model = stateHolder.state.modelName {
                    Text(model)
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                }

                // Other models from catalog
                let otherModels = stateHolder.state.modelCatalog
                    .filter { $0.name != stateHolder.state.modelName }
                    .map(\.name)
                if !otherModels.isEmpty {
                    Text(otherModels.joined(separator: " · "))
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundStyle(.white.opacity(0.5))
                        .lineLimit(1)
                }
            }

            // OLLAMA section
            if let ollama = stateHolder.state.ollamaStatus, ollama.available {
                Divider().opacity(0.3)

                VStack(alignment: .leading, spacing: 3) {
                    Text("OLLAMA")
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundStyle(.secondary)

                    ForEach(ollama.models, id: \.name) { model in
                        HStack(spacing: 4) {
                            Circle()
                                .fill(.green)
                                .frame(width: 5, height: 5)
                            Text(model.name)
                                .font(.system(size: 9, design: .monospaced))
                                .foregroundStyle(.white.opacity(0.8))
                            Text(formatBytes(model.sizeVram > 0 ? model.sizeVram : model.size))
                                .font(.system(size: 8, design: .monospaced))
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }

            // Connection dots
            HStack(spacing: 12) {
                // OAuth
                HStack(spacing: 4) {
                    Circle()
                        .fill(stateHolder.state.oauthConnected == true ? .green : .red.opacity(0.4))
                        .frame(width: 6, height: 6)
                    Text("OAuth")
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundStyle(.secondary)
                }

                // Ollama
                HStack(spacing: 4) {
                    Circle()
                        .fill(stateHolder.state.ollamaStatus?.available == true
                              ? .green : .gray.opacity(0.4))
                        .frame(width: 6, height: 6)
                    Text("Ollama")
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(10)
        .background(.black.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }
}

// MARK: - Water Gauge

struct WaterGauge: View {
    let label: String
    let percent: Double
    var resetTime: String? = nil

    private var fillColor: Color {
        if percent >= 90 { return .red }
        if percent >= 70 { return .orange }
        return .green
    }

    var body: some View {
        VStack(spacing: 3) {
            // Glass container
            ZStack {
                // Container bg
                RoundedRectangle(cornerRadius: 6)
                    .fill(.white.opacity(0.12))
                    .frame(width: 64, height: 64)

                // Water fill (bottom-up)
                GeometryReader { _ in
                    VStack(spacing: 0) {
                        Spacer()
                        RoundedRectangle(cornerRadius: 4)
                            .fill(fillColor.opacity(0.5))
                            .frame(height: 56 * min(percent / 100, 1))
                    }
                }
                .frame(width: 56, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: 4))

                // Percent text
                VStack(spacing: 0) {
                    Text("\(Int(percent))")
                        .font(.system(size: 18, weight: .bold, design: .monospaced))
                        .foregroundStyle(.white)
                    Text("%")
                        .font(.system(size: 10, weight: .medium, design: .monospaced))
                        .foregroundStyle(.white.opacity(0.7))
                }
            }
            .frame(width: 64, height: 64)

            // Label
            Text(label)
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundStyle(.secondary)

            // Reset time
            if let reset = resetTime {
                Text("↻ \(reset)")
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundStyle(.secondary.opacity(0.7))
            }
        }
    }
}
