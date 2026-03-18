// TerrariumRenderer.swift — Assembles all creature + environment subsystems
// 17-layer rendering order matching Android ColorRenderer.kt

import SwiftUI

final class TerrariumRenderer {
    // MARK: - Creatures

    private var octopuses: [String: OctopusCreature] = [:]
    private let crayfish = CrayfishCreature()
    private let tetra = DataParticleSystem()
    private let bubbles = BubbleSystem()

    // MARK: - Environment

    private let waterEffect = WaterEffect()
    private let waterSurface = WaterSurface()
    private let lightRays = LightRaySystem()
    private let kelp = KelpField()
    private let rocks = RockFormation()
    private let plankton = PlanktonSystem()
    private let sand = SandDisturbance()

    // MARK: - State

    private var lastState: TerrariumState?
    private var envState: EnvironmentVisualState = .calm

    // Delta-time tracking (stored here instead of @State to avoid triggering SwiftUI re-renders)
    private var lastDate: Date?

    // Creature bubble exhale timers
    private var octoBubbleTimer: Float = 0
    private var crayfishBubbleTimer: Float = 0

    // MARK: - Delta Time

    /// Compute dt from wall-clock, storing lastDate internally to avoid @State mutation.
    func deltaTime(now: Date) -> Float {
        let dt: Float
        if let last = lastDate {
            dt = min(Float(now.timeIntervalSince(last)), 0.05)
        } else {
            dt = 0.016
        }
        lastDate = now
        return dt
    }

    // MARK: - Update

    func update(dt: Float, state: TerrariumState) {
        // Environment state propagation
        envState = state.environment
        waterEffect.setState(envState)
        waterSurface.setState(envState)
        lightRays.setState(envState)
        plankton.setState(envState)
        sand.setState(envState)
        bubbles.setState(envState)

        // Sync octopus lifecycle
        syncOctopuses(state: state)

        // Update all subsystems
        waterEffect.update(dt: dt)
        waterSurface.update(dt: dt)
        lightRays.update(dt: dt)
        kelp.update(dt: dt)
        plankton.update(dt: dt)
        rocks.update(dt: dt)

        // Creature positions for environment coupling
        let octPositions = octopuses.values.map { oct -> (x: Float, y: Float) in
            (oct.currentX, oct.currentY)
        }

        // Sand disturbance
        sand.creaturePositions = octPositions
        if crayfish.visible {
            sand.creaturePositions.append(crayfish.currentPosition())
        }
        sand.update(dt: dt)

        // Bubbles
        bubbles.update(dt: dt)

        // Handle pop burst triggers
        for pos in state.popBurstPositions {
            bubbles.emitPopBurst(x: pos.x, y: pos.y)
        }

        // Creature bubble exhales
        octoBubbleTimer += dt
        crayfishBubbleTimer += dt
        if octoBubbleTimer >= TerrariumTiming.octoBubbleInterval {
            octoBubbleTimer = 0
            for oct in octopuses.values where oct.visualState != .sleeping {
                bubbles.emitCreatureBubbles(x: oct.currentX, y: oct.currentY - 0.02, count: 1)
            }
        }
        if crayfishBubbleTimer >= TerrariumTiming.crayfishBubbleInterval && crayfish.visible {
            crayfishBubbleTimer = 0
            let pos = crayfish.currentPosition()
            bubbles.emitCreatureBubbles(x: pos.x, y: pos.y - 0.02, count: 1)
        }

        // Tetra coupling
        let workingPositions = state.creatures
            .filter { $0.state == .working }
            .map { ($0.homeX, $0.homeY) }
        tetra.octopusPositions = workingPositions
        tetra.crayfishPosition = crayfish.visible ? crayfish.currentPosition() : nil
        tetra.crayfishRouting = crayfish.isRouting()
        tetra.update(dt: dt, state: state)

        // Creatures
        for oct in octopuses.values {
            oct.update(dt: dt, state: state)
        }
        crayfish.update(dt: dt, state: state)

        lastState = state
    }

    // MARK: - Draw (layer order matching Android ColorRenderer)

    func draw(context: inout GraphicsContext, size: CGSize) {
        // Layer 1: Deep-sea 3-color gradient background
        drawBackground(context: &context, size: size)

        // Layer 2: Caustics overlay
        waterEffect.draw(context: &context, size: size)

        // Layer 2.5: God rays (light shafts)
        lightRays.draw(context: &context, size: size)

        // Layer 2.7: Back-layer plankton
        plankton.drawBackLayer(context: &context, size: size)

        // Layer 4: Rocks + sand
        rocks.draw(context: &context, size: size)

        // Layer 4.5: Sand disturbance particles
        sand.draw(context: &context, size: size)

        // Layer 5: Kelp + grass
        kelp.draw(context: &context, size: size)

        // Layer 6: LED cables on rocks
        rocks.drawLEDs(context: &context, size: size, envState: envState)

        // Layer 6.5: Back-layer fish (behind creatures for 3D depth)
        tetra.drawBackLayer(context: &context, size: size)

        // Layer 7: Crayfish
        crayfish.draw(context: &context, size: size)

        // Layer 9: Octopuses
        for oct in octopuses.values {
            oct.draw(context: &context, size: size)
        }

        // Layer 9.5: Front-layer fish
        tetra.drawFrontLayer(context: &context, size: size)

        // Layer 9.7: Front-layer plankton
        plankton.drawFrontLayer(context: &context, size: size)

        // Layer 10: Bubbles
        bubbles.draw(context: &context, size: size)

        // Layer 10.5: Water surface line
        waterSurface.draw(context: &context, size: size)

        // Layer 11: Error tint overlay
        if lastState?.hasError == true {
            let rect = CGRect(origin: .zero, size: size)
            context.fill(Path(rect), with: .color(TerrariumColors.errorTint))
        }
    }

    // MARK: - Background (3-color gradient, environment-adaptive)

    private func drawBackground(context: inout GraphicsContext, size: CGSize) {
        let topColor: Color
        switch envState {
        case .dark:
            topColor = TerrariumColors.deepSea.opacity(0.5)
        case .calm:
            topColor = TerrariumColors.shallowWater
        case .active:
            topColor = TerrariumColors.shallowWater.opacity(0.9)
        case .alert:
            topColor = Color(red: 0.102, green: 0.239, blue: 0.361) // #1A3D5C
        }

        let rect = CGRect(origin: .zero, size: size)
        context.fill(
            Path(rect),
            with: .linearGradient(
                Gradient(colors: [topColor, TerrariumColors.midWater, TerrariumColors.deepSea]),
                startPoint: .zero,
                endPoint: CGPoint(x: 0, y: size.height)
            )
        )
    }

    // MARK: - Octopus Lifecycle

    private func syncOctopuses(state: TerrariumState) {
        let currentIds = Set(state.creatures.map(\.id))
        let existingIds = Set(octopuses.keys)

        // Remove departed
        for id in existingIds.subtracting(currentIds) {
            octopuses.removeValue(forKey: id)
        }

        // Add new or update existing
        for creature in state.creatures {
            if octopuses[creature.id] == nil {
                let oct = OctopusCreature(
                    sessionId: creature.id,
                    homeX: creature.homeX,
                    homeY: creature.homeY,
                    scale: creature.scale
                )
                oct.displayName = creature.projectName
                oct.onAskingExit = { [weak self] in
                    self?.bubbles.emitPopBurst(x: creature.homeX, y: creature.homeY)
                }
                octopuses[creature.id] = oct
            } else {
                let oct = octopuses[creature.id]!
                oct.homeX = creature.homeX
                oct.homeY = creature.homeY
                oct.scale = creature.scale
                oct.displayName = creature.projectName
            }
        }
    }
}
