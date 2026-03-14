// Creature.swift — Protocol for terrarium creatures

import SwiftUI

protocol Creature: AnyObject {
    func update(dt: Float, state: TerrariumState)
    func draw(context: inout GraphicsContext, size: CGSize)
}
