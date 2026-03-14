// TimelineStripView.swift — Event timeline with color coding + density bar

import SwiftUI

struct TimelineStripView: View {
    @Environment(AgentStateHolder.self) private var stateHolder

    @State private var selectedEntry: GroupedEntry?

    var body: some View {
        HStack(spacing: 0) {
            // Compact log (65%)
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 2) {
                            ForEach(stateHolder.timelineStore.grouped) { group in
                                timelineRow(group)
                                    .id(group.id)
                                    .onTapGesture {
                                        selectedEntry = group
                                    }
                            }
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                    }
                    .onChange(of: stateHolder.timelineStore.grouped.count) {
                        if let last = stateHolder.timelineStore.grouped.last {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }

                // Activity density bar
                densityBar
            }
            .frame(maxWidth: .infinity)

            // Detail panel (35%)
            if let selected = selectedEntry {
                detailPanel(selected)
                    .frame(maxWidth: .infinity)
            } else {
                Color.clear
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, 8)
        .padding(.bottom, 8)
    }

    // MARK: - Timeline Row

    private func timelineRow(_ group: GroupedEntry) -> some View {
        HStack(spacing: 4) {
            Text(typeIcon(for: group.entry.type, status: group.entry.status))
                .font(.system(size: 10))
                .foregroundStyle(typeColor(for: group.entry.type))

            Text(formatTime(group.entry.date))
                .font(.system(size: 9, design: .monospaced))
                .foregroundStyle(.secondary)

            Text(group.entry.raw)
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(.white.opacity(0.8))
                .lineLimit(1)

            if group.count > 1 {
                Text("×\(group.count)")
                    .font(.system(size: 8, weight: .bold, design: .monospaced))
                    .foregroundStyle(.secondary)
            }

            Spacer()
        }
        .padding(.vertical, 1)
        .background(
            selectedEntry?.id == group.id
                ? typeColor(for: group.entry.type).opacity(0.1)
                : Color.clear
        )
    }

    // MARK: - Detail Panel

    private func detailPanel(_ group: GroupedEntry) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(typeIcon(for: group.entry.type))
                Text(group.entry.type.rawValue)
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(typeColor(for: group.entry.type))
            }

            Text(group.entry.raw)
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(.white)

            if let detail = group.entry.detail {
                Text(detail)
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundStyle(.white.opacity(0.6))
                    .lineLimit(6)
            }

            if let status = group.entry.status {
                HStack(spacing: 4) {
                    Circle()
                        .fill(status == "approved" ? .green : status == "denied" ? .red : .orange)
                        .frame(width: 6, height: 6)
                    Text(status)
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(8)
    }

    // MARK: - Density Bar

    private var densityBar: some View {
        Canvas { context, size in
            let entries = stateHolder.timelineStore.entries
            let now = Date().timeIntervalSince1970 * 1000
            let window: Double = 30000  // 30 seconds

            // Count events in small bins
            let bins = 30
            let binWidth = size.width / CGFloat(bins)

            for i in 0..<bins {
                let binStart = now - window + Double(i) / Double(bins) * window
                let binEnd = binStart + window / Double(bins)
                let count = entries.filter { $0.ts >= binStart && $0.ts < binEnd }.count

                if count > 0 {
                    let alpha = min(1.0, Double(count) / 3.0) * 0.6
                    let rect = CGRect(x: CGFloat(i) * binWidth, y: 0,
                                      width: binWidth, height: size.height)
                    context.fill(Path(rect), with: .color(.cyan.opacity(alpha)))
                }
            }
        }
        .frame(height: 3)
    }

    // MARK: - Helpers

    private func formatTime(_ date: Date) -> String {
        let fmt = DateFormatter()
        fmt.dateFormat = "HH:mm"
        return fmt.string(from: date)
    }
}

// MARK: - Type Color

func typeColor(for type: TimelineEntryType) -> Color {
    switch type {
    case .chatStart, .chatEnd, .chatResponse: .green
    case .toolRequest, .toolResolved, .toolExec: .cyan
    case .modelCall, .modelResponse: .orange
    case .error: .red
    case .scheduled: .purple
    case .userAction: .blue
    case .memoryRecall: .teal
    }
}
