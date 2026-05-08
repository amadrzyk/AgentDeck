package dev.agentdeck.ui.eink

import dev.agentdeck.net.AgentState
import dev.agentdeck.net.SessionInfo
import dev.agentdeck.state.DashboardState

/**
 * QA / preview fixtures for the e-ink redesign.
 *
 * Five canonical multi-session scenarios that the dashboard MUST render
 * correctly. Use these as @Preview parameters for [EinkMonitorScreen] and
 * as deterministic snapshot inputs for screenshot tests.
 *
 * Session counts intentionally vary 1..5+ across scenarios — the design
 * goal is that NO layout assumes a fixed agent topology.
 *
 *   1. typical          — 2× Claude + Codex + OpenClaw  (4 sessions)
 *   2. claudeHeavy      — 3× Claude + Codex + OpenCode  (5 sessions)
 *   3. claudeAwaiting   — one Claude blocked on permission while a peer
 *                          continues processing            (4 sessions)
 *   4. codexFocused     — Codex is the primary; Claude idle (4 sessions)
 *   5. soloOpenCode     — single OpenCode session         (1 session)
 */
object EinkScenarios {

    val typical: DashboardState = DashboardState(
        agentType = "claude-code",
        sessionId = "claude-a",
        projectName = "agentdeck",
        modelName = "Claude Opus 4.5",
        agentState = AgentState.PROCESSING,
        siblingSessions = listOf(
            sib("claude-b", "claude-code", "playground", "PROCESSING", "Sonnet 4.5"),
            sib("codex-a", "codex-cli", "browser-ext", "IDLE", "GPT-5.3 Codex"),
            sib("openclaw-a", "openclaw", "scratchpad", "IDLE", "GLM-5 Turbo"),
        ),
    )

    val claudeHeavy: DashboardState = DashboardState(
        agentType = "claude-code",
        sessionId = "claude-a",
        projectName = "agentdeck",
        modelName = "Claude Opus 4.5",
        agentState = AgentState.PROCESSING,
        siblingSessions = listOf(
            sib("claude-b", "claude-code", "infra", "PROCESSING", "Sonnet 4.5"),
            sib("claude-c", "claude-code", "docs", "IDLE", "Haiku 4.5"),
            sib("codex-a", "codex-cli", "kernel", "PROCESSING", "GPT-5.3 Codex"),
            sib("opencode-a", "opencode", "rust-port", "IDLE", "Qwen 3.5-35B"),
        ),
    )

    val claudeAwaiting: DashboardState = DashboardState(
        agentType = "claude-code",
        sessionId = "claude-a",
        projectName = "agentdeck",
        modelName = "Claude Opus 4.5",
        agentState = AgentState.AWAITING_PERMISSION,
        question = "Run `pnpm install` in /android?",
        currentTool = "Bash",
        siblingSessions = listOf(
            sib("claude-b", "claude-code", "scripts", "PROCESSING", "Sonnet 4.5"),
            sib("codex-a", "codex-cli", "wasm", "IDLE", "GPT-5.3 Codex"),
            sib("openclaw-a", "openclaw", "diag", "IDLE", "GLM-5 Turbo"),
        ),
    )

    val codexFocused: DashboardState = DashboardState(
        agentType = "codex-cli",
        sessionId = "codex-a",
        projectName = "compiler",
        modelName = "GPT-5.3 Codex",
        agentState = AgentState.PROCESSING,
        siblingSessions = listOf(
            sib("codex-b", "codex-cli", "linter", "PROCESSING", "GPT-5.2"),
            sib("opencode-a", "opencode", "rust-port", "PROCESSING", "Qwen 3.5-35B"),
            sib("claude-a", "claude-code", "agentdeck", "IDLE", "Sonnet 4.5"),
        ),
    )

    val soloOpenCode: DashboardState = DashboardState(
        agentType = "opencode",
        sessionId = "opencode-a",
        projectName = "rust-port",
        modelName = "Qwen 3.5-35B (Local MLX)",
        agentState = AgentState.PROCESSING,
        siblingSessions = emptyList(),
    )

    val all: List<Pair<String, DashboardState>> = listOf(
        "typical" to typical,
        "claudeHeavy" to claudeHeavy,
        "claudeAwaiting" to claudeAwaiting,
        "codexFocused" to codexFocused,
        "soloOpenCode" to soloOpenCode,
    )

    private fun sib(
        id: String,
        agentType: String,
        project: String,
        state: String,
        model: String,
    ): SessionInfo = SessionInfo(
        id = id,
        port = 0,
        projectName = project,
        agentType = agentType,
        alive = true,
        state = state,
        modelName = model,
        effortLevel = null,
    )
}
