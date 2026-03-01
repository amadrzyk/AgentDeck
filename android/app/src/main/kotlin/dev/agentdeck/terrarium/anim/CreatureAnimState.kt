package dev.agentdeck.terrarium.anim

import dev.agentdeck.terrarium.TerrariumTiming

/**
 * Per-creature animation state machine — manages transition timing
 * and easing between visual states.
 */
class CreatureAnimState<T : Enum<T>>(initialState: T) {

    var currentState: T = initialState
        private set
    var previousState: T = initialState
        private set
    var transitionProgress: Float = 1f
        private set

    /** Whether a transition is currently in progress. */
    val isTransitioning: Boolean get() = transitionProgress < 1f

    /** Request transition to a new state. */
    fun transitionTo(newState: T) {
        if (newState == currentState) return
        previousState = currentState
        currentState = newState
        transitionProgress = 0f
    }

    /** Advance the transition. Call each frame with delta time in seconds. */
    fun update(dt: Float) {
        if (transitionProgress < 1f) {
            val speed = 1000f / TerrariumTiming.STATE_TRANSITION_MS
            transitionProgress = (transitionProgress + dt * speed).coerceAtMost(1f)
        }
    }

    /**
     * Get eased transition progress (ease-in-out cubic).
     * Returns 0 at start, 1 at completion.
     */
    fun easedProgress(): Float {
        val t = transitionProgress
        return if (t < 0.5f) {
            4f * t * t * t
        } else {
            1f - (-2f * t + 2f).let { it * it * it } / 2f
        }
    }

    /** Interpolate a float value between previous and current state values. */
    fun lerp(fromValue: Float, toValue: Float): Float {
        val t = easedProgress()
        return fromValue + (toValue - fromValue) * t
    }
}
