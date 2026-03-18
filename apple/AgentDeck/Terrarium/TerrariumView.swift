// TerrariumView.swift — 60fps animated aquarium using TimelineView + Canvas

import SwiftUI

struct TerrariumView: View {
    let terrariumState: TerrariumState

    @State private var renderer = TerrariumRenderer()

    var body: some View {
        // Cap at 60fps — 120Hz is excessive for a monitoring aquarium and wastes memory/battery
        TimelineView(.animation(minimumInterval: 1.0 / 60)) { timeline in
            Canvas { context, size in
                // deltaTime stored in renderer (plain class) to avoid @State mutation
                // which would trigger double SwiftUI re-renders at 120Hz → OOM
                let dt = renderer.deltaTime(now: timeline.date)

                renderer.update(dt: dt, state: terrariumState)
                renderer.draw(context: &context, size: size)
            }
        }
    }
}
