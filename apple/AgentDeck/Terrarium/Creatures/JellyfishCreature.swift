// JellyfishCreature.swift — 12×10 pixel grid jellyfish for Codex CLI
// Bell dome + trailing tentacles, bioluminescent glow when processing

import SwiftUI

// MARK: - Jellyfish Visual State

enum JellyfishVisualState {
    case dormant    // Hidden, no animation
    case drifting   // Idle — slow bell pulse, gentle drift
    case pulsing    // Processing — fast pulse, bioluminescent glow
    case waiting    // Awaiting input — mid-water, "?" bubble
}

final class JellyfishCreature: Creature {
    // MARK: - Pixel Grid

    // Cell types: 0=transparent, 1=bell body, 2=marking(>_), 3=bell edge(pulse),
    //             4=left tentacle, 5=right tentacle, 6=center tentacle
    private static let grid: [[Int]] = [
        [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0],  // bell top
        [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],  // bell wide
        [0, 1, 1, 2, 2, 1, 1, 2, 1, 1, 1, 0],  // bell with >_ marking
        [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],  // bell mid
        [0, 0, 0, 3, 3, 3, 3, 3, 3, 0, 0, 0],  // bell rim (contracts)
        [0, 0, 4, 0, 6, 0, 0, 6, 0, 5, 0, 0],  // tentacles upper
        [0, 4, 0, 0, 0, 6, 6, 0, 0, 0, 5, 0],  // tentacles mid
        [4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5],  // tentacles lower
        [0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0],  // tentacles trailing
        [0, 0, 4, 0, 0, 0, 0, 0, 0, 5, 0, 0],  // tentacles end
    ]

    private static let gridCols = 12
    private static let gridRows = 10
    private static let pixelAspect: Float = 1.8  // slightly less than octopus for rounder bell
    private static let pixelGap: Float = 0.5

    // MARK: - Properties

    let sessionId: String
    var displayName: String?
    var visualState: JellyfishVisualState = .drifting
    var homeX: Float
    var homeY: Float
    var scale: Float

    // Animation state
    private var time: Float = 0
    private(set) var currentX: Float
    private(set) var currentY: Float
    private var phaseOffset: Float
    private var driftPhase: Float

    // Transition
    private var previousState: JellyfishVisualState?
    private var transitionProgress: Float = 1.0

    // ASKING exit callback
    var onWaitingExit: (() -> Void)?

    // MARK: - Init

    init(sessionId: String, homeX: Float, homeY: Float, scale: Float) {
        self.sessionId = sessionId
        self.homeX = homeX
        self.homeY = homeY
        self.scale = scale
        self.currentX = homeX
        self.currentY = 0.45  // jellyfish start mid-water
        self.phaseOffset = Float.random(in: 0...Float.pi * 2)
        self.driftPhase = Float.random(in: 0...Float.pi * 2)
    }

    // MARK: - Update

    func update(dt: Float, state: TerrariumState) {
        time += dt

        // Find matching creature state
        if let creature = state.jellyfishCreatures.first(where: { $0.id == sessionId }) {
            let newState = creature.state
            if newState != visualState {
                if visualState == .waiting {
                    onWaitingExit?()
                }
                previousState = visualState
                transitionProgress = 0
                visualState = newState
            }
        }

        // Advance transition
        if transitionProgress < 1.0 {
            transitionProgress = min(1.0, transitionProgress + dt * 2.5)
        }

        // Position
        updatePosition(dt: dt)
    }

    private func updatePosition(dt: Float) {
        // Jellyfish float higher than octopi and drift more
        let targetY: Float
        switch visualState {
        case .dormant:
            targetY = 0.70  // sink low
        case .drifting:
            targetY = 0.45  // mid-water idle (jellyfish don't rest on floor)
        case .pulsing:
            targetY = 0.20  // float high when processing
        case .waiting:
            targetY = 0.35  // slightly higher than idle for awaiting
        }

        let lerpRate: Float = visualState == .pulsing ? 2.0 : 1.5  // slower, more graceful

        // Vertical movement with pulse bob
        let pulseSpeed: Float = visualState == .pulsing ? 0.25 : 0.08
        let pulseAmp: Float = visualState == .pulsing ? 0.025 : 0.012
        let pulseBob = sin((time + phaseOffset) * pulseSpeed * Float.pi * 2) * pulseAmp
        currentY += (targetY + pulseBob - currentY) * dt * lerpRate

        // Horizontal drift — jellyfish passively drift
        let driftAmp: Float = visualState == .pulsing ? 0.015 : 0.008
        let driftX = sin((time + driftPhase) * 0.3) * driftAmp
        currentX += (homeX + driftX - currentX) * dt * lerpRate

        // Clamp to swim bounds (slightly wider than octopus)
        currentX = min(0.70, max(0.12, currentX))
        currentY = min(0.65, max(0.08, currentY))
    }

    func currentPosition() -> (x: Float, y: Float) {
        (currentX, currentY)
    }

    func isPulsing() -> Bool {
        visualState == .pulsing
    }

    // MARK: - Draw

    func draw(context: inout GraphicsContext, size: CGSize) {
        guard visualState != .dormant else { return }

        let w = Float(size.width)
        let h = Float(size.height)
        let bodyRadius = w * 0.050 * scale  // slightly smaller than octopus

        let centerX = currentX * w
        let bobOffset: Float = visualState == .pulsing ?
            sin(time * 2 * Float.pi / 3.0) * h * 0.012 : 0
        let centerY = currentY * h + bobOffset

        let bodyAlpha: Float = visualState == .dormant ? 0.3 : 0.85  // jellyfish are translucent

        drawPixelBody(context: &context, cx: centerX, cy: centerY,
                      bodyRadius: bodyRadius, alpha: bodyAlpha)

        // Bioluminescent glow when processing
        if visualState == .pulsing {
            drawGlow(context: &context, cx: centerX, cy: centerY, radius: bodyRadius)
        }

        // "?" bubble when waiting
        if visualState == .waiting {
            drawSpeechBubble(context: &context, cx: CGFloat(centerX), cy: CGFloat(centerY),
                             bodyRadius: CGFloat(bodyRadius))
        }

        // Name tag
        if let name = displayName {
            drawNameTag(context: &context, name: name, cx: CGFloat(centerX),
                        cy: CGFloat(centerY), bodyRadius: CGFloat(bodyRadius))
        }
    }

    // MARK: - Pixel Body Drawing

    private func drawPixelBody(context: inout GraphicsContext, cx: Float, cy: Float,
                                bodyRadius: Float, alpha: Float) {
        let pixelW = bodyRadius * 2 / Float(Self.gridCols)
        let pixelH = pixelW * Self.pixelAspect
        let gridW = Float(Self.gridCols) * pixelW
        let gridH = Float(Self.gridRows) * pixelH
        let startX = cx - gridW / 2
        let startY = cy - gridH / 2

        let bellColor = bellColorForState()
        let tentacleColor = tentacleColorForState()
        let gap = Self.pixelGap

        // Bell pulse: contracts/expands
        let pulseSpeed: Float = visualState == .pulsing ? 0.25 : 0.06
        let pulsePhase = sin((time + phaseOffset) * pulseSpeed * Float.pi * 2)
        let contracting = pulsePhase < 0

        for row in 0..<Self.gridRows {
            for col in 0..<Self.gridCols {
                let cell = Self.grid[row][col]
                guard cell != 0 else { continue }

                let px = startX + Float(col) * pixelW
                var py = startY + Float(row) * pixelH

                switch cell {
                case 1: // Bell body
                    let rect = CGRect(x: CGFloat(px + gap), y: CGFloat(py + gap),
                                      width: CGFloat(pixelW - gap * 2), height: CGFloat(pixelH - gap * 2))
                    context.fill(Path(rect), with: .color(bellColor.opacity(Double(alpha))))

                case 2: // >_ marking
                    let markAlpha = ((Int(time * 10) % 60) > 5) ? alpha : alpha * 0.3
                    let rect = CGRect(x: CGFloat(px + gap), y: CGFloat(py + gap),
                                      width: CGFloat(pixelW - gap * 2), height: CGFloat(pixelH - gap * 2))
                    context.fill(Path(rect), with: .color(TerrariumColors.jellyfishMarking.opacity(Double(markAlpha))))

                case 3: // Bell edge — contracts during pulse
                    if !contracting {
                        let rect = CGRect(x: CGFloat(px + gap), y: CGFloat(py + gap),
                                          width: CGFloat(pixelW - gap * 2), height: CGFloat(pixelH - gap * 2))
                        context.fill(Path(rect), with: .color(bellColor.opacity(Double(alpha) * 0.7)))
                    }

                case 4, 5: // Outer tentacles — wave motion
                    let tentPhase: Float = cell == 4 ? 0 : Float.pi
                    let wave = sin(time * 0.8 + tentPhase + Float(row) * 0.5)
                    if wave > -0.4 {
                        let waveOffset = wave * pixelW * 0.3
                        let rect = CGRect(x: CGFloat(px + gap + waveOffset), y: CGFloat(py + gap),
                                          width: CGFloat(pixelW - gap * 2), height: CGFloat(pixelH - gap * 2))
                        context.fill(Path(rect), with: .color(tentacleColor.opacity(Double(alpha) * 0.6)))
                    }

                case 6: // Center tentacles
                    let wave = sin(time * 0.6 + Float(col) * 0.3)
                    if wave > -0.3 {
                        let rect = CGRect(x: CGFloat(px + gap), y: CGFloat(py + gap),
                                          width: CGFloat(pixelW - gap * 2), height: CGFloat(pixelH - gap * 2))
                        context.fill(Path(rect), with: .color(tentacleColor.opacity(Double(alpha) * 0.5)))
                    }

                default:
                    break
                }
            }
        }
    }

    private func bellColorForState() -> Color {
        if visualState == .pulsing {
            let t = sin(time * 2.0) * 0.5 + 0.5
            return TerrariumColors.lerpColor(TerrariumColors.jellyfishBell, TerrariumColors.jellyfishGlow, t)
        }
        return TerrariumColors.jellyfishBell
    }

    private func tentacleColorForState() -> Color {
        if visualState == .pulsing {
            let t = sin(time * 1.5 + 1.0) * 0.5 + 0.5
            return TerrariumColors.lerpColor(TerrariumColors.jellyfishTentacle, TerrariumColors.jellyfishGlow, t)
        }
        return TerrariumColors.jellyfishTentacle
    }

    // MARK: - Bioluminescent Glow

    private func drawGlow(context: inout GraphicsContext, cx: Float, cy: Float, radius: Float) {
        let glowPulse = sin(time * 2.5) * 0.3 + 0.7
        let glowRadius = radius * 2.5 * glowPulse

        // Soft radial glow
        let glowRect = CGRect(x: CGFloat(cx - glowRadius), y: CGFloat(cy - glowRadius),
                              width: CGFloat(glowRadius * 2), height: CGFloat(glowRadius * 2))
        context.fill(
            Path(ellipseIn: glowRect),
            with: .color(TerrariumColors.jellyfishGlow.opacity(0.08 * Double(glowPulse)))
        )

        // 4 orbiting glow particles
        for i in 0..<4 {
            let angle = Float(i) / 4 * Float.pi * 2 + time * 0.5
            let orbitR = radius * 1.5
            let px = cx + cos(angle) * orbitR
            let py = cy + sin(angle) * orbitR * 0.6
            let particleSize = radius * 0.15
            let rect = CGRect(x: CGFloat(px - particleSize / 2), y: CGFloat(py - particleSize / 2),
                              width: CGFloat(particleSize), height: CGFloat(particleSize))
            context.fill(Path(ellipseIn: rect),
                         with: .color(TerrariumColors.jellyfishGlow.opacity(0.4 * Double(glowPulse))))
        }
    }

    // MARK: - Speech Bubble

    private func drawSpeechBubble(context: inout GraphicsContext, cx: CGFloat, cy: CGFloat, bodyRadius: CGFloat) {
        let bubbleX = cx + bodyRadius * 1.2
        let bubbleY = cy
        let bubbleR = bodyRadius * 0.6
        let pulse = CGFloat(sin(time * 2.5)) * 0.08 + 1
        let r = bubbleR * pulse

        let bubbleRect = CGRect(x: bubbleX - r, y: bubbleY - r, width: r * 2, height: r * 2)
        context.fill(Path(ellipseIn: bubbleRect), with: .color(.white.opacity(0.25)))
        context.stroke(Path(ellipseIn: bubbleRect),
                       with: .color(TerrariumColors.hudText.opacity(0.5)),
                       lineWidth: bodyRadius * 0.04)

        var tail = Path()
        tail.move(to: CGPoint(x: bubbleX - r * 0.3, y: bubbleY + r * 0.3))
        tail.addLine(to: CGPoint(x: cx + bodyRadius * 0.5, y: cy))
        tail.addLine(to: CGPoint(x: bubbleX - r * 0.05, y: bubbleY + r * 0.5))
        tail.closeSubpath()
        context.fill(tail, with: .color(.white.opacity(0.25)))

        context.draw(
            Text("?").font(.system(size: r * 1.2, weight: .bold)).foregroundColor(TerrariumColors.hudText.opacity(0.7)),
            at: CGPoint(x: bubbleX, y: bubbleY)
        )
    }

    // MARK: - Name Tag

    private func drawNameTag(context: inout GraphicsContext, name: String,
                             cx: CGFloat, cy: CGFloat, bodyRadius: CGFloat) {
        let pixelW = bodyRadius * 2 / CGFloat(Self.gridCols)
        let gridH = CGFloat(Self.gridRows) * pixelW * CGFloat(Self.pixelAspect)
        let hatY = cy - gridH / 2 - bodyRadius * 0.15
        let hatWidth = bodyRadius * 1.8
        let hatHeight = bodyRadius * 0.5
        let fontSize = bodyRadius * 0.3

        let bgRect = CGRect(x: cx - hatWidth / 2, y: hatY - hatHeight,
                            width: hatWidth, height: hatHeight)
        context.fill(Path(roundedRect: bgRect, cornerRadius: 4),
                     with: .color(TerrariumColors.jellyfishNameBg))

        let text = Text(name)
            .font(.system(size: fontSize, weight: .medium, design: .default))
            .foregroundColor(TerrariumColors.hudText.opacity(0.86))
        context.draw(text, at: CGPoint(x: cx, y: hatY - hatHeight / 2))
    }
}
