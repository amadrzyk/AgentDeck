package dev.agentdeck.ui.eink

/**
 * Refresh policy matrix derived from the e-ink redesign.
 *
 * Each [Zone] declares its REFRESH MODE and DEBOUNCE up front so that
 * adjacent zones never share a waveform — fast-zone updates do not
 * smear into slow zones, and slow zones do not flash unnecessarily.
 *
 * The matrix is the single source of truth: [EinkMonitorScreen] reads
 * mode + debounce from here instead of hardcoding them at each call site.
 *
 *   ┌──────────────┬──────────┬──────────────┬───────────────────────────┐
 *   │ Zone         │ Mode     │ Debounce     │ Trigger semantics         │
 *   ├──────────────┼──────────┼──────────────┼───────────────────────────┤
 *   │ CHROME       │ A2       │ 200 ms       │ session list / states     │
 *   │ TERRARIUM    │ animated │ per-frame    │ creature animation loop   │
 *   │ ATTENTION    │ FULL_ONCE│ 80 ms        │ awaiting state appears    │
 *   │ CONTEXT_FAST │ A2       │ 200 ms       │ tool / option changes     │
 *   │ STATUS_SLOW  │ DU       │ 2000 ms      │ usage / model / health    │
 *   │ TIMELINE     │ A2       │ 300 ms       │ append-only entry count   │
 *   └──────────────┴──────────┴──────────────┴───────────────────────────┘
 *
 * ATTENTION uses [RefreshMode.FULL_ONCE] (one-shot GC16 flash on appearance)
 * because permission/option prompts demand a clean, ghost-free panel — they
 * are user blockers and must not inherit residual A2 noise from neighbors.
 *
 * TERRARIUM is intentionally absent: it ticks per-frame on
 * [EinkAnimatedRefreshZone], not per-state-change.
 */
enum class Zone(
    val mode: RefreshMode,
    val debounceMs: Long,
) {
    CHROME(RefreshMode.A2, 200L),
    ATTENTION(RefreshMode.FULL_ONCE, 80L),
    CONTEXT_FAST(RefreshMode.A2, 200L),
    STATUS_SLOW(RefreshMode.DU, 2000L),
    TIMELINE(RefreshMode.A2, 300L),
}
