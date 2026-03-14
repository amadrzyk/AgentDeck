// BubbleSystem.swift — Rising bubbles + pop burst effects
// Ported from android BubbleSystem.kt

import SwiftUI

final class BubbleSystem {
    // MARK: - Bubble

    private struct Bubble {
        var x: Float = 0
        var y: Float = 0
        var radius: Float = 0
        var speed: Float = 0
        var wobblePhase: Float = 0
        var wobbleAmp: Float = 0
        var alpha: Float = 0
        var alive: Bool = false
        // Pop burst fields
        var popping: Bool = false
        var popProgress: Float = 0
        var popOriginX: Float = 0
        var popOriginY: Float = 0
        var popAngle: Float = 0
        var popDistance: Float = 0
    }

    // MARK: - State

    private static let maxBubbles = 70
    private static let popSpeed: Float = 2.5

    private var bubbles: [Bubble]
    private var nextSlot = 0
    private var timeSinceSpawn: Float = 0
    private var time: Float = 0
    private var envState: EnvironmentVisualState = .calm

    init() {
        bubbles = Array(repeating: Bubble(), count: Self.maxBubbles)
    }

    func setState(_ state: EnvironmentVisualState) {
        envState = state
    }

    // MARK: - Pop Burst

    /// Emit a radial burst of small bubbles — triggered when leaving ASKING state.
    func emitPopBurst(x: Float, y: Float, count: Int = 10) {
        let angleStep = Float.pi * 2 / Float(count)
        for i in 0..<count {
            let angle = angleStep * Float(i) + Float.random(in: 0..<angleStep * 0.5)
            bubbles[nextSlot] = Bubble(
                x: x, y: y,
                radius: Float.random(in: 0.002...0.006),
                speed: 0,
                wobblePhase: Float.random(in: 0...Float.pi * 2),
                wobbleAmp: Float.random(in: 0.003...0.013),
                alpha: 0.9,
                alive: true,
                popping: true,
                popProgress: 0,
                popOriginX: x,
                popOriginY: y,
                popAngle: angle,
                popDistance: 0.03 + Float.random(in: 0...0.04)
            )
            nextSlot = (nextSlot + 1) % Self.maxBubbles
        }
    }

    /// Emit small bubbles from a creature's position (50% smaller, 70% speed).
    func emitCreatureBubbles(x: Float, y: Float, count: Int) {
        for _ in 0..<count {
            bubbles[nextSlot] = Bubble(
                x: x + Float.random(in: -0.01...0.01),
                y: y - 0.01,
                radius: Float.random(in: 0.001...0.004),
                speed: TerrariumTiming.bubbleRiseSpeed * (0.7 + Float.random(in: 0...0.6)) * 0.7,
                wobblePhase: Float.random(in: 0...Float.pi * 2),
                wobbleAmp: Float.random(in: 0.003...0.018),
                alpha: 0.8,
                alive: true
            )
            nextSlot = (nextSlot + 1) % Self.maxBubbles
        }
    }

    // MARK: - Update

    func update(dt: Float) {
        time += dt
        timeSinceSpawn += dt * 1000

        let spawnInterval: Float = switch envState {
        case .dark: Float.greatestFiniteMagnitude
        case .calm: 2000  // CALM_SPAWN_INTERVAL_MS
        case .active: 300  // ACTIVE_SPAWN_INTERVAL_MS
        case .alert: 450   // ACTIVE * 1.5
        }

        // Spawn new bubbles from bottom
        while timeSinceSpawn >= spawnInterval {
            timeSinceSpawn -= spawnInterval
            spawnBubble()
        }

        // Update existing bubbles
        for i in bubbles.indices {
            guard bubbles[i].alive else { continue }

            if bubbles[i].popping {
                bubbles[i].popProgress += dt * Self.popSpeed
                if bubbles[i].popProgress >= 1.0 {
                    // Transition to normal rising bubble
                    bubbles[i].popping = false
                    bubbles[i].speed = TerrariumTiming.bubbleRiseSpeed * (0.5 + Float.random(in: 0...0.4))
                } else {
                    // Radial expansion with ease-out
                    let ease = 1 - pow(1 - bubbles[i].popProgress, 2)
                    bubbles[i].x = bubbles[i].popOriginX + cos(bubbles[i].popAngle) * bubbles[i].popDistance * ease
                    bubbles[i].y = bubbles[i].popOriginY + sin(bubbles[i].popAngle) * bubbles[i].popDistance * ease
                    bubbles[i].radius = max(0.001, bubbles[i].radius * (1 - bubbles[i].popProgress * 0.3))
                    bubbles[i].alpha = max(0.3, 1 - bubbles[i].popProgress * 0.4)
                }
                continue
            }

            bubbles[i].y -= bubbles[i].speed * dt
            bubbles[i].x += sin(time * TerrariumTiming.bubbleWobbleSpeed + bubbles[i].wobblePhase) *
                bubbles[i].wobbleAmp * dt

            // Fade out near top
            if bubbles[i].y < 0.1 {
                bubbles[i].alpha = min(1, max(0, bubbles[i].y / 0.1))
            }

            // Kill if off screen
            if bubbles[i].y < -0.02 {
                bubbles[i].alive = false
            }
        }
    }

    private func spawnBubble() {
        let isError = envState == .alert
        bubbles[nextSlot] = Bubble(
            x: Float.random(in: 0.1...0.9),
            y: 0.95 + Float.random(in: 0...0.05),
            radius: isError ? Float.random(in: 0.005...0.013) : Float.random(in: 0.002...0.007),
            speed: TerrariumTiming.bubbleRiseSpeed * (0.7 + Float.random(in: 0...0.6)),
            wobblePhase: Float.random(in: 0...Float.pi * 2),
            wobbleAmp: Float.random(in: 0.005...0.025),
            alpha: 1.0,
            alive: true
        )
        nextSlot = (nextSlot + 1) % Self.maxBubbles
    }

    // MARK: - Draw

    func draw(context: inout GraphicsContext, size: CGSize) {
        let w = Float(size.width)
        let h = Float(size.height)

        for bubble in bubbles where bubble.alive {
            let screenX = CGFloat(bubble.x * w)
            let screenY = CGFloat(bubble.y * h)
            let screenR = CGFloat(bubble.radius * w)

            // Bubble body
            let bodyRect = CGRect(x: screenX - screenR, y: screenY - screenR,
                                  width: screenR * 2, height: screenR * 2)
            context.fill(Path(ellipseIn: bodyRect),
                         with: .color(Color.white.opacity(Double(bubble.alpha) * 0.3)))

            // Highlight (upper-left)
            let hlR = screenR * 0.3
            let hlRect = CGRect(x: screenX - hlR - screenR * 0.25,
                                y: screenY - hlR - screenR * 0.25,
                                width: hlR * 2, height: hlR * 2)
            context.fill(Path(ellipseIn: hlRect),
                         with: .color(Color.white.opacity(Double(bubble.alpha) * 0.5)))
        }
    }
}
