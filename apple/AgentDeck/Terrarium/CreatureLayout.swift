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
        case 0:
            return []
        case 1:
            return [CreatureSlot(x: 0.4, y: 0.45, scale: 1.0)]
        case 2:
            return [
                CreatureSlot(x: 0.28, y: 0.38, scale: 0.85),
                CreatureSlot(x: 0.55, y: 0.50, scale: 0.85),
            ]
        case 3:
            return [
                CreatureSlot(x: 0.22, y: 0.35, scale: 0.75),
                CreatureSlot(x: 0.52, y: 0.35, scale: 0.75),
                CreatureSlot(x: 0.36, y: 0.52, scale: 0.75),
            ]
        default:
            return layoutGrid(count: count)
        }
    }

    static func layoutCloudCreatures(count: Int) -> [CreatureSlot] {
        switch count {
        case 0:
            return []
        case 1:
            return [CreatureSlot(x: 0.55, y: 0.20, scale: 1.0)]
        case 2:
            return [
                CreatureSlot(x: 0.40, y: 0.18, scale: 0.85),
                CreatureSlot(x: 0.62, y: 0.22, scale: 0.85),
            ]
        case 3:
            return [
                CreatureSlot(x: 0.35, y: 0.16, scale: 0.75),
                CreatureSlot(x: 0.55, y: 0.20, scale: 0.75),
                CreatureSlot(x: 0.45, y: 0.28, scale: 0.75),
            ]
        default:
            let cols = count <= 4 ? 2 : 3
            let rows = Int(ceil(Double(count) / Double(cols)))
            let scale = max(0.50, 0.75 - Float(count - 3) * 0.05)
            let startX: Float = 0.30
            let endX: Float = 0.65
            let startY: Float = 0.12
            let endY: Float = 0.30

            var slots: [CreatureSlot] = []
            for i in 0..<count {
                let col = i % cols
                let row = i / cols
                let x = startX + (cols > 1 ? Float(col) / Float(cols - 1) * (endX - startX) : (endX - startX) / 2)
                let y = startY + (rows > 1 ? Float(row) / Float(rows - 1) * (endY - startY) : (endY - startY) / 2)
                slots.append(CreatureSlot(x: x, y: y, scale: scale))
            }
            return slots
        }
    }

    static func layoutOpenCodeCreatures(count: Int) -> [CreatureSlot] {
        switch count {
        case 0:
            return []
        case 1:
            return [CreatureSlot(x: 0.48, y: 0.40, scale: 1.0)]
        case 2:
            return [
                CreatureSlot(x: 0.38, y: 0.38, scale: 0.85),
                CreatureSlot(x: 0.58, y: 0.42, scale: 0.85),
            ]
        case 3:
            return [
                CreatureSlot(x: 0.33, y: 0.36, scale: 0.75),
                CreatureSlot(x: 0.53, y: 0.36, scale: 0.75),
                CreatureSlot(x: 0.43, y: 0.48, scale: 0.75),
            ]
        default:
            let cols = count <= 4 ? 2 : 3
            let rows = Int(ceil(Double(count) / Double(cols)))
            let scale = max(0.50, 0.75 - Float(count - 3) * 0.05)
            let startX: Float = 0.28
            let endX: Float = 0.62
            let startY: Float = 0.32
            let endY: Float = 0.50

            var slots: [CreatureSlot] = []
            for i in 0..<count {
                let col = i % cols
                let row = i / cols
                let x = startX + (cols > 1 ? Float(col) / Float(cols - 1) * (endX - startX) : (endX - startX) / 2)
                let y = startY + (rows > 1 ? Float(row) / Float(rows - 1) * (endY - startY) : (endY - startY) / 2)
                slots.append(CreatureSlot(x: x, y: y, scale: scale))
            }
            return slots
        }
    }

    private static func layoutGrid(count: Int) -> [CreatureSlot] {
        let cols = count <= 4 ? 2 : 3
        let rows = Int(ceil(Double(count) / Double(cols)))
        let scale = max(0.45, 0.75 - Float(count - 3) * 0.05)

        // Respect swim boundaries: 0.20~0.62 X, 0.32~0.55 Y
        let startX: Float = 0.20
        let endX: Float = 0.62
        let startY: Float = 0.32
        let endY: Float = 0.55

        var slots: [CreatureSlot] = []
        for i in 0..<count {
            let col = i % cols
            let row = i / cols
            let x = startX + (cols > 1 ? Float(col) / Float(cols - 1) * (endX - startX) : (endX - startX) / 2)
            let y = startY + (rows > 1 ? Float(row) / Float(rows - 1) * (endY - startY) : (endY - startY) / 2)
            slots.append(CreatureSlot(x: x, y: y, scale: scale))
        }
        return slots
    }
}
