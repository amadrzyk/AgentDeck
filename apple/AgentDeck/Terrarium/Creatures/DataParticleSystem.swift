// DataParticleSystem.swift — 14 neon tetra fish (2 schools of 7) + food crumbs
// Ported from android DataParticleSystem.kt

import SwiftUI

final class DataParticleSystem: Creature {
    // MARK: - Fish

    private struct Fish {
        var x: Float
        var y: Float
        var vx: Float = 0
        var vy: Float = 0
        var facingRight: Bool = true
        var heading: Float = 0
        var targetHeading: Float = 0
        var turnRate: Float = 0
        var bank: Float = 0
        var zDepth: Float = 0
        var speed: Float = 0
        var tailPhase: Float = 0
        var bodyPhase: Float = 0
        var wanderSeed: Float = 0
        var wanderSpeed: Float = 0
        var minSpeedFactor: Float = 1.0
        let schoolId: Int
        let zLayer: Int  // 0=back, 1=front
    }

    // MARK: - Food Crumb

    private struct FoodCrumb {
        var x: Float
        var y: Float
        var alpha: Float
        var alive: Bool
        var age: Float
        var color: Color
        var driftX: Float
        var driftY: Float
        var pulsePhase: Float
    }

    // MARK: - State

    private var fish: [Fish] = []
    private var food: [FoodCrumb]
    private var time: Float = 0
    private var tetraState: TetraVisualState = .circling
    private var foodSpawnTimer: Float = 0

    // External creature positions
    var octopusPositions: [(x: Float, y: Float)] = []
    var liveAgentPositions: [(x: Float, y: Float)] = []
    var crayfishPosition: (x: Float, y: Float)?
    var crayfishRouting = false

    private static let schoolSize = 14
    private static let maxFood = 30
    private static let foodLifetime: Float = 5.0
    private static let foodColors: [Color] = [
        Color(red: 0, green: 0.898, blue: 1.0),     // cyan
        Color(red: 0.984, green: 0.749, blue: 0.141), // amber
        Color(red: 0.133, green: 0.773, blue: 0.369),  // green
    ]

    // Pre-computed squared radii
    private static let sepRadiusSq = TerrariumTiming.separationRadius * TerrariumTiming.separationRadius
    private static let aliRadiusSq = TerrariumTiming.alignmentRadius * TerrariumTiming.alignmentRadius
    private static let cohRadiusSq = TerrariumTiming.cohesionRadius * TerrariumTiming.cohesionRadius

    // MARK: - Init

    init() {
        food = (0..<Self.maxFood).map { _ in
            FoodCrumb(x: 0, y: 0, alpha: 0, alive: false, age: 0, color: Self.foodColors[0],
                      driftX: 0, driftY: 0, pulsePhase: 0)
        }

        for i in 0..<Self.schoolSize {
            let schoolId = i % 2
            let cx: Float = schoolId == 0 ? 0.35 : 0.55
            let cy: Float = schoolId == 0 ? 0.35 : 0.40
            fish.append(Fish(
                x: cx + Float.random(in: -0.06...0.06),
                y: cy + Float.random(in: -0.04...0.04),
                vx: Float.random(in: -0.01...0.01),
                vy: Float.random(in: -0.01...0.01),
                facingRight: Bool.random(),
                heading: 0,
                tailPhase: Float.random(in: 0...Float.pi * 2),
                bodyPhase: Float.random(in: 0...Float.pi * 2),
                wanderSeed: Float.random(in: 0...Float.pi * 2),
                wanderSpeed: Float.random(in: 0.6...1.4),
                minSpeedFactor: Float.random(in: 0.9...1.2),
                schoolId: schoolId,
                zLayer: i % 2
            ))
        }
    }

    // MARK: - Update

    func update(dt: Float, state: TerrariumState) {
        time += dt
        tetraState = state.tetraState

        // Food spawning from working agents or routing crayfish
        let hasFoodSource = !octopusPositions.isEmpty || crayfishRouting
        if hasFoodSource {
            foodSpawnTimer += dt
            let spawnRate: Float = tetraState == .streaming ? 0.06 : 0.2
            if foodSpawnTimer >= spawnRate {
                foodSpawnTimer = 0
                spawnFoodCrumb()
            }
        }

        // Update food crumbs
        updateFood(dt: dt)

        // School centers (Lissajous)
        var sc0x: Float = 0.35 + 0.18 * sin(time * 0.15)
        var sc0y: Float = 0.35 + 0.12 * sin(time * 0.21)
        var sc1x: Float = 0.55 + 0.18 * cos(time * 0.13)
        var sc1y: Float = 0.40 + 0.12 * cos(time * 0.18)

        // Crayfish routing pulls school centers 30%
        if crayfishRouting, let cp = crayfishPosition {
            let pull: Float = 0.30
            sc0x += (cp.x - sc0x) * pull
            sc0y += (cp.y - sc0y) * pull
            sc1x += (cp.x - sc1x) * pull
            sc1y += (cp.y - sc1y) * pull
        }

        // Boids update
        for i in 0..<fish.count {
            let scx = fish[i].schoolId == 0 ? sc0x : sc1x
            let scy = fish[i].schoolId == 0 ? sc0y : sc1y
            updateFish(index: i, dt: dt, schoolCenterX: scx, schoolCenterY: scy)
        }
    }

    private func updateFish(index i: Int, dt: Float, schoolCenterX scX: Float, schoolCenterY scY: Float) {
        var f = fish[i]

        // Boids forces
        var sepX: Float = 0, sepY: Float = 0
        var aliX: Float = 0, aliY: Float = 0
        var cohX: Float = 0, cohY: Float = 0
        var sepCount = 0, aliCount = 0, cohCount = 0

        for j in 0..<fish.count where j != i {
            let other = fish[j]
            let dx = other.x - f.x
            let dy = other.y - f.y
            let distSq = dx * dx + dy * dy

            // Separation (all fish)
            if distSq < Self.sepRadiusSq {
                let invDist = 1.0 / (distSq + 0.0001)
                sepX -= dx * invDist
                sepY -= dy * invDist
                sepCount += 1
            }
            // Alignment + Cohesion (same school only)
            guard other.schoolId == f.schoolId else { continue }
            if distSq < Self.aliRadiusSq {
                aliX += other.vx; aliY += other.vy; aliCount += 1
            }
            if distSq < Self.cohRadiusSq {
                cohX += other.x; cohY += other.y; cohCount += 1
            }
        }

        if sepCount > 0 { sepX /= Float(sepCount); sepY /= Float(sepCount) }
        if aliCount > 0 { aliX /= Float(aliCount); aliY /= Float(aliCount) }
        if cohCount > 0 { cohX = cohX / Float(cohCount) - f.x; cohY = cohY / Float(cohCount) - f.y }

        // School attractor
        var schX = (scX - f.x) * TerrariumTiming.schoolAttractorWeight
        var schY = (scY - f.y) * TerrariumTiming.schoolAttractorWeight

        // Food chase
        var attX: Float = 0, attY: Float = 0
        var hasFood = false
        if let nearestFood = findNearestFood(to: f) {
            hasFood = true
            let dx = nearestFood.x - f.x
            let dy = nearestFood.y - f.y
            let dist = max(0.001, sqrt(dx * dx + dy * dy))
            let strength: Float = tetraState == .streaming ? 1.0 : 0.5
            attX = dx / dist * strength
            attY = dy / dist * strength * 0.4

            if dist < TerrariumTiming.foodEatRadius {
                eatFood(near: f)
            }
        } else {
            // Orbit around agents
            let positions = liveAgentPositions.isEmpty ? [(x: Float(0.4), y: Float(0.45))] :
                liveAgentPositions.map { (x: $0.x, y: $0.y) }
            let cx = positions.map(\.x).reduce(0, +) / Float(positions.count)
            let cy = positions.map(\.y).reduce(0, +) / Float(positions.count)
            let dx = f.x - cx, dy = f.y - cy
            let dist = max(0.001, sqrt(dx * dx + dy * dy))
            attX = -dy / dist * 0.3
            attY = dx / dist * 0.3
            let radialForce = (0.10 - dist) * 1.5
            attX += dx / dist * radialForce
            attY += dy / dist * radialForce
        }

        if hasFood { schX = 0; schY = 0 }

        // Wander
        let wander = f.wanderSeed + time * f.wanderSpeed
        let wanderX = sin(wander) * 0.08
        let wanderY = cos(wander * 1.1) * 0.04

        let fx = sepX * 1.5 + aliX * 1.5 + cohX * 1.5 + attX * 0.6 + schX + wanderX
        let fy = sepY * 1.5 + aliY * 1.5 + cohY * 1.5 + attY * 0.6 + schY + wanderY

        f.vx += fx * dt
        f.vy += fy * dt

        // Forward thrust during turns
        let turnThrust = abs(f.turnRate) * 0.15
        let forwardSign: Float = f.facingRight ? 1 : -1
        f.vx += forwardSign * cos(f.heading) * turnThrust * dt
        f.vy += sin(f.heading) * turnThrust * 0.4 * dt

        f.vy *= 0.92  // dampen vertical

        // Soft wall repulsion
        let wallForce: Float = 0.08
        if f.x < TerrariumLayout.tetraMinX + 0.03 { f.vx += wallForce * dt }
        if f.x > TerrariumLayout.tetraMaxX - 0.03 { f.vx -= wallForce * dt }
        if f.y < TerrariumLayout.tetraMinY + 0.03 { f.vy += wallForce * dt }
        if f.y > TerrariumLayout.tetraMaxY - 0.03 { f.vy -= wallForce * dt }

        // Speed limit
        let maxSpeed: Float = tetraState == .streaming ? 0.30 : 0.06
        f.speed = sqrt(f.vx * f.vx + f.vy * f.vy)
        if f.speed > maxSpeed {
            f.vx = f.vx / f.speed * maxSpeed
            f.vy = f.vy / f.speed * maxSpeed
            f.speed = maxSpeed
        }

        f.x += f.vx * dt
        f.y += f.vy * dt
        f.x = min(TerrariumLayout.tetraMaxX, max(TerrariumLayout.tetraMinX, f.x))
        f.y = min(TerrariumLayout.tetraMaxY, max(TerrariumLayout.tetraMinY, f.y))

        // Minimum forward speed
        let minSpeed = maxSpeed * 0.2 * f.minSpeedFactor
        if f.speed < minSpeed {
            f.vx += forwardSign * cos(f.heading) * minSpeed * 0.8 * dt
        }

        // Facing direction with hysteresis
        if f.vx > 0.002 { f.facingRight = true }
        else if f.vx < -0.002 { f.facingRight = false }

        // Smooth pitch
        if f.speed > 0.002 {
            let forwardVx = f.facingRight ? f.vx : -f.vx
            let rawPitch = atan2(f.vy, max(0.0001, abs(forwardVx)))
            let maxPitch: Float = 0.35
            f.targetHeading = min(maxPitch, max(-maxPitch, rawPitch))
        }
        let headingDiff = f.targetHeading - f.heading
        let turnAccel = headingDiff * 2.0
        f.turnRate += (turnAccel - f.turnRate) * 3 * dt
        let turnScale = min(1, max(0.35, 0.35 + 0.65 * (f.speed / (maxSpeed + 1e-4))))
        f.turnRate *= turnScale
        f.heading += f.turnRate * dt

        // Bank
        f.bank += (f.turnRate - f.bank) * 6 * dt
        let targetZ = min(0.45, max(-0.45, f.zDepth + f.bank * 0.35))
        f.zDepth += (targetZ - f.zDepth) * 4 * dt
        f.zDepth *= 0.999

        // Tail + body animation
        let tailSpeed = TerrariumTiming.tetraTailSpeed * (0.5 + f.speed * 8)
        f.tailPhase += tailSpeed * dt
        f.bodyPhase += tailSpeed * 0.7 * dt

        fish[i] = f
    }

    // MARK: - Food

    private func findNearestFood(to f: Fish) -> FoodCrumb? {
        var nearest: FoodCrumb?
        var minDist: Float = Float.greatestFiniteMagnitude
        for crumb in food where crumb.alive && crumb.alpha > 0.05 {
            let dx = crumb.x - f.x
            let dy = crumb.y - f.y
            let dist = dx * dx + dy * dy
            if dist < minDist {
                minDist = dist
                nearest = crumb
            }
        }
        return nearest
    }

    private func eatFood(near f: Fish) {
        let eatR = TerrariumTiming.foodEatRadius
        for i in food.indices where food[i].alive {
            let dx = food[i].x - f.x
            let dy = food[i].y - f.y
            if dx * dx + dy * dy < eatR * eatR {
                food[i].alpha *= 0.6
                food[i].age += 0.016 * 4 // accelerate death
            }
        }
    }

    private func spawnFoodCrumb() {
        guard let slot = food.firstIndex(where: { !$0.alive }) ?? food.indices.min(by: { food[$0].alpha < food[$1].alpha }) else { return }

        var allSources = octopusPositions
        if crayfishRouting, let cp = crayfishPosition {
            allSources.append(cp)
        }
        guard let source = allSources.randomElement() else { return }

        food[slot] = FoodCrumb(
            x: min(TerrariumLayout.tetraMaxX, max(TerrariumLayout.tetraMinX,
                source.x + Float.random(in: -0.04...0.04))),
            y: min(TerrariumLayout.tetraMaxY, max(TerrariumLayout.tetraMinY,
                source.y + Float.random(in: -0.03...0.03))),
            alpha: Float.random(in: 0.9...1.0),
            alive: true,
            age: 0,
            color: Self.foodColors.randomElement()!,
            driftX: Float.random(in: -0.006...0.006),
            driftY: -Float.random(in: 0.001...0.005),
            pulsePhase: Float.random(in: 0...Float.pi * 2)
        )
    }

    private func updateFood(dt: Float) {
        for i in food.indices where food[i].alive {
            food[i].age += dt
            food[i].x += food[i].driftX * dt
            food[i].y += food[i].driftY * dt
            food[i].pulsePhase += dt * 3
            food[i].alpha = max(0, min(1, (Self.foodLifetime - food[i].age) / Self.foodLifetime))
            if food[i].age >= Self.foodLifetime { food[i].alive = false }
        }
    }

    // MARK: - Draw

    func draw(context: inout GraphicsContext, size: CGSize) {
        drawBackLayer(context: &context, size: size)
        drawFrontLayer(context: &context, size: size)
    }

    /// Draw back-layer fish + food (behind creatures)
    func drawBackLayer(context: inout GraphicsContext, size: CGSize) {
        let w = Float(size.width)
        let h = Float(size.height)
        drawFoodCrumbs(context: &context, w: w, h: h)
        drawFishByLayer(context: &context, w: w, h: h, zLayer: 0)
    }

    /// Draw front-layer fish (in front of creatures)
    func drawFrontLayer(context: inout GraphicsContext, size: CGSize) {
        let w = Float(size.width)
        let h = Float(size.height)
        drawFishByLayer(context: &context, w: w, h: h, zLayer: 1)
    }

    // MARK: - Food Crumb Drawing

    private func drawFoodCrumbs(context: inout GraphicsContext, w: Float, h: Float) {
        for f in food where f.alive && f.alpha > 0.01 {
            let pulse = sin(f.pulsePhase) * 0.15 + 0.85
            let radius = w * 0.009 * pulse
            let cx = CGFloat(f.x * w)
            let cy = CGFloat(f.y * h)
            let r = CGFloat(radius)

            // Wide outer glow
            let outerRect = CGRect(x: cx - r * 4.5, y: cy - r * 4.5, width: r * 9, height: r * 9)
            context.fill(Path(ellipseIn: outerRect),
                         with: .color(f.color.opacity(Double(f.alpha) * 0.15)))

            // Inner glow
            let innerRect = CGRect(x: cx - r * 2.2, y: cy - r * 2.2, width: r * 4.4, height: r * 4.4)
            context.fill(Path(ellipseIn: innerRect),
                         with: .color(f.color.opacity(Double(f.alpha) * 0.35)))

            // Core
            let coreRect = CGRect(x: cx - r, y: cy - r, width: r * 2, height: r * 2)
            context.fill(Path(ellipseIn: coreRect),
                         with: .color(f.color.opacity(Double(f.alpha))))

            // Bright center
            let centerR = r * 0.35
            let centerRect = CGRect(x: cx - centerR, y: cy - centerR, width: centerR * 2, height: centerR * 2)
            context.fill(Path(ellipseIn: centerRect),
                         with: .color(.white.opacity(Double(f.alpha) * 0.7)))
        }
    }

    // MARK: - Fish Drawing

    private func drawFishByLayer(context: inout GraphicsContext, w: Float, h: Float, zLayer: Int) {
        let fishSize = w * TerrariumTiming.tetraSize
        for f in fish where f.zLayer == zLayer {
            drawNeonTetra(context: &context, fish: f, w: w, h: h, size: fishSize)
        }
    }

    private func drawNeonTetra(context: inout GraphicsContext, fish f: Fish, w: Float, h: Float, size: Float) {
        let sx = f.x * w
        let sy = f.y * h
        let tailWag = sin(f.tailPhase) * 0.35
        let bodyWave = sin(f.bodyPhase) * 0.12
        let bank = min(0.8, max(-0.8, f.bank))

        // Body bend from turn rate
        let bendAmount = min(0.4, max(-0.4, f.turnRate * 0.15))

        // Pseudo-3D parallax
        let depthScale = 1.0 - 0.08 * abs(bank) - 0.05 * f.zDepth
        let depthOffset = sin(bank) * size * 0.9 + f.zDepth * size * 2.0
        let bankAlpha = 1.0 - 0.15 * abs(bank) - 0.12 * abs(f.zDepth)
        let facingScaleX = f.facingRight ? depthScale : -depthScale

        context.drawLayer { ctx in
            // Transform: translate + scale + rotate at nose
            ctx.translateBy(x: CGFloat(sx + depthOffset * 0.6), y: CGFloat(sy + depthOffset * 0.25))
            ctx.scaleBy(x: CGFloat(facingScaleX), y: CGFloat(depthScale))
            ctx.rotate(by: .radians(Double(f.heading)))

            let bodyLen = size * 2.0
            let bodyH = size * 0.45
            let noseX = bodyLen * 0.5
            let tailBaseX = -bodyLen * 0.5

            let midBendY = bendAmount * bodyH * 2
            let tailBendY = bendAmount * bodyH * 4
            let midWaveY = bodyWave * bodyH + midBendY * 0.3

            // Body — curved bezier fish shape
            var bodyPath = Path()
            bodyPath.move(to: CGPoint(x: CGFloat(noseX), y: 0))
            bodyPath.addCurve(
                to: CGPoint(x: CGFloat(tailBaseX), y: CGFloat(-bodyH * 0.25 + tailBendY)),
                control1: CGPoint(x: CGFloat(noseX * 0.5), y: CGFloat(-bodyH * 0.5)),
                control2: CGPoint(x: CGFloat(bodyLen * 0.0 + midWaveY), y: CGFloat(-bodyH + midBendY * 0.5))
            )
            bodyPath.addCurve(
                to: CGPoint(x: CGFloat(noseX), y: 0),
                control1: CGPoint(x: CGFloat(bodyLen * 0.0 - midWaveY), y: CGFloat(bodyH + midBendY * 0.5)),
                control2: CGPoint(x: CGFloat(noseX * 0.5), y: CGFloat(bodyH * 0.5))
            )
            bodyPath.closeSubpath()
            ctx.fill(bodyPath, with: .color(TerrariumColors.tetraBody.opacity(Double(bankAlpha))))

            // Neon stripe — follows body curve
            var stripePath = Path()
            stripePath.move(to: CGPoint(x: CGFloat(noseX * 0.65), y: 0))
            stripePath.addCurve(
                to: CGPoint(x: CGFloat(tailBaseX * 0.5), y: CGFloat(tailBendY * 0.5)),
                control1: CGPoint(x: CGFloat(bodyLen * 0.1), y: CGFloat(midBendY * 0.3 + midWaveY * 0.3)),
                control2: CGPoint(x: CGFloat(-bodyLen * 0.1), y: CGFloat(midBendY * 0.6 + midWaveY * 0.2))
            )
            ctx.stroke(stripePath,
                       with: .color(TerrariumColors.tetraNeon.opacity(Double(0.95 * bankAlpha))),
                       lineWidth: CGFloat(size * 0.18))

            // Tail fin — forked
            let tailFinLen = bodyLen * 0.3
            let forkSpread = bodyH * 1.0
            let wagY = tailWag * bodyH + tailBendY

            var tailPath = Path()
            tailPath.move(to: CGPoint(x: CGFloat(tailBaseX), y: CGFloat(tailBendY)))
            tailPath.addCurve(
                to: CGPoint(x: CGFloat(tailBaseX - tailFinLen), y: CGFloat(tailBendY - forkSpread + wagY * 0.6)),
                control1: CGPoint(x: CGFloat(tailBaseX - tailFinLen * 0.4), y: CGFloat(tailBendY - forkSpread * 0.4 + wagY * 0.3)),
                control2: CGPoint(x: CGFloat(tailBaseX - tailFinLen * 0.8), y: CGFloat(tailBendY - forkSpread * 0.8 + wagY * 0.5))
            )
            tailPath.addLine(to: CGPoint(x: CGFloat(tailBaseX - tailFinLen * 0.2), y: CGFloat(tailBendY + wagY * 0.2)))
            tailPath.addCurve(
                to: CGPoint(x: CGFloat(tailBaseX - tailFinLen), y: CGFloat(tailBendY + forkSpread + wagY * 0.6)),
                control1: CGPoint(x: CGFloat(tailBaseX - tailFinLen * 0.8), y: CGFloat(tailBendY + forkSpread * 0.8 + wagY * 0.5)),
                control2: CGPoint(x: CGFloat(tailBaseX - tailFinLen * 0.4), y: CGFloat(tailBendY + forkSpread * 0.4 + wagY * 0.3))
            )
            tailPath.addLine(to: CGPoint(x: CGFloat(tailBaseX), y: CGFloat(tailBendY)))
            tailPath.closeSubpath()
            ctx.fill(tailPath, with: .color(TerrariumColors.tetraFin.opacity(Double(0.85 * bankAlpha))))

            // Dorsal fin
            let dmx = bodyLen * 0.05
            let dmy = -bodyH * 0.85 + midBendY * 0.4 + midWaveY
            var dorsalPath = Path()
            dorsalPath.move(to: CGPoint(x: CGFloat(dmx), y: CGFloat(dmy)))
            dorsalPath.addLine(to: CGPoint(x: CGFloat(dmx + bodyLen * 0.1), y: CGFloat(dmy - bodyH * 0.45)))
            dorsalPath.addLine(to: CGPoint(x: CGFloat(dmx - bodyLen * 0.15), y: CGFloat(dmy + bodyH * 0.05)))
            dorsalPath.closeSubpath()
            ctx.fill(dorsalPath, with: .color(TerrariumColors.tetraBody.opacity(Double(0.7 * bankAlpha))))

            // Eye
            let eyeR = CGFloat(size * 0.08)
            let eyeRect = CGRect(x: CGFloat(noseX * 0.5) - eyeR, y: CGFloat(-bodyH * 0.15) - eyeR,
                                 width: eyeR * 2, height: eyeR * 2)
            ctx.fill(Path(ellipseIn: eyeRect),
                     with: .color(TerrariumColors.tetraNeon.opacity(Double(0.8 * bankAlpha))))
        }
    }
}
