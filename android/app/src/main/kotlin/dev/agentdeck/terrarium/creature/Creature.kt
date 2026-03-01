package dev.agentdeck.terrarium.creature

import androidx.compose.ui.graphics.drawscope.DrawScope

/**
 * Base interface for all terrarium creatures.
 * Each creature manages its own animation state and renders itself.
 */
interface Creature {
    /** Advance animation by [dt] seconds. */
    fun update(dt: Float)

    /** Draw the creature onto the canvas. */
    fun draw(scope: DrawScope)
}
