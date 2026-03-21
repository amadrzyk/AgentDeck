// CreatureLayout.swift — Multi-session creature positioning
// Ported from android CreatureLayout.kt

import Foundation

struct CreatureSlot {
    let x: Float
    let y: Float
    let scale: Float
}

enum CreatureLayout {
    /// Layout octopus positions for N agents
    static func layoutOctopuses(count: Int) -> [CreatureSlot] {
        switch count {
        case 0, 1:
            return [CreatureSlot(x: 0.4, y: 0.45, scale: 1.0)]
        case 2:
            return [
                CreatureSlot(x: 0.20, y: 0.40, scale: 0.85),
                CreatureSlot(x: 0.62, y: 0.50, scale: 0.85),
            ]
        case 3:
            return [
                CreatureSlot(x: 0.18, y: 0.36, scale: 0.75),
                CreatureSlot(x: 0.55, y: 0.42, scale: 0.75),
                CreatureSlot(x: 0.36, y: 0.56, scale: 0.75),
            ]
        default:
            return layoutGrid(count: count)
        }
    }

    private static func layoutGrid(count: Int) -> [CreatureSlot] {
        let cols = Int(ceil(sqrt(Double(count))))
        let rows = Int(ceil(Double(count) / Double(cols)))
        let scale = max(0.45, 0.75 - Float(count - 3) * 0.05)

        let xRange: Float = 0.55  // 0.15 to 0.70
        let yRange: Float = 0.32  // 0.28 to 0.60

        var slots: [CreatureSlot] = []
        for i in 0..<count {
            let col = i % cols
            let row = i / cols
            let x: Float = 0.15 + (cols > 1 ? Float(col) / Float(cols - 1) * xRange : xRange / 2)
            let y: Float = 0.28 + (rows > 1 ? Float(row) / Float(rows - 1) * yRange : yRange / 2)
            slots.append(CreatureSlot(x: x, y: y, scale: scale))
        }
        return slots
    }
}
