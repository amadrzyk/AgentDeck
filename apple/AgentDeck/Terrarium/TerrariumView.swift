// TerrariumView.swift — 60fps animated aquarium using TimelineView + Canvas

import SwiftUI

struct TerrariumView: View {
    let terrariumState: TerrariumState

    @State private var renderer = TerrariumRenderer()
    @State private var lastDate: Date?

    var body: some View {
        TimelineView(.animation) { timeline in
            Canvas { context, size in
                let now = timeline.date
                let dt: Float
                if let last = lastDate {
                    dt = min(Float(now.timeIntervalSince(last)), 0.05) // Cap at 50ms
                } else {
                    dt = 0.016
                }

                renderer.update(dt: dt, state: terrariumState)
                renderer.draw(context: &context, size: size)

                // Store last date — use DispatchQueue to avoid mutating @State during render
                DispatchQueue.main.async {
                    lastDate = now
                }
            }
        }
    }
}
