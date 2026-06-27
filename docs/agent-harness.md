# Agent Harness — developing AgentDeck with any coding agent

This repo is built by switching between **Claude Code, Codex, OpenCode, and occasionally Antigravity**. This doc is the canonical map of the *developer-facing harness*: the instruction files, skills, workflows, and discovery surfaces that steer whichever agent is currently editing the code, so an agent can be swapped in without re-learning the project or following stale procedures.

> This is about the **meta-layer that steers the agent doing the work**, not AgentDeck's product features (which *observe* agent sessions). For the product's per-agent session-observation matrix, see [appstore-feature-matrix.md](appstore-feature-matrix.md) and [architecture.md](architecture.md).

## Tier model (read in this order)

1. **`AGENTS.md`** — the entry file every agent reads first (Codex/OpenCode/Antigravity discover it by convention; Claude Code reads `CLAUDE.md` directly). It requires `CLAUDE.md` and points back here.
2. **`CLAUDE.md`** — **SSOT** for architecture, protocol, ports, conventions, design system, and App Store invariants.
3. **`DEVELOPMENT_LOG.md`** — searchable history. Never read in full (11k+ lines); check the top, then `rg` for keywords/filenames.

## Supported-agents matrix

| Agent | Enters repo via | Instruction files it reads | Skill/workflow auto-discovery | Known limits in the harness |
|---|---|---|---|---|
| **Claude Code** | native, or `agentdeck claude` | `CLAUDE.md`; `.claude/skills/` | `.claude/skills/*.md` (pointers → `.agents/skills/`) | `.claude/skills/` files must stay **pointers**, not procedure copies |
| **Codex** | `agentdeck codex` | `AGENTS.md` → `CLAUDE.md` | `.agents/skills/` (repo-scoped) + `.agents/workflows/` | — |
| **OpenCode** | `agentdeck opencode`, or native `opencode` | `AGENTS.md` → `CLAUDE.md` | OpenCode skills/plugins; AgentDeck also supports PTY + SSE bridge | AgentDeck workflows are still human procedures: point it at `.agents/workflows/<name>.md` explicitly when needed |
| **Antigravity** | manual editing, or native Antigravity CLI/app | `AGENTS.md` → `CLAUDE.md` | Antigravity hooks/plugins/skills when the user configures them | AgentDeck does not auto-install Antigravity hooks. Current product session visibility is CLI daemon passive discovery only; App Store app shows usage/credit status, not coding-session observation |

Notes:
- **Claude Code & Codex** are the two first-class authoring agents: both get hooks (`~/.claude/settings.json`, `~/.codex/config.toml`) and discover skills.
- **OpenCode** is a fully supported *product session type* through `agentdeck opencode` (PTY + SSE overlay). Native OpenCode also has plugin/event and skill surfaces, but AgentDeck does not rely on auto-installing them; explicit workflow paths remain the portable handoff.
- **Antigravity** now has official hook/plugin/skill surfaces, but AgentDeck still treats them as user-managed. The App Store app only reads the user-approved Antigravity usage/credit database; coding-session creatures come from the optional CLI daemon passive discovery path unless/until a user installs a dedicated hook/plugin bridge.

## SSOT rules (where each kind of knowledge lives)

| Knowledge | Canonical home | Do **not** |
|---|---|---|
| Architecture, protocol, ports, conventions, App Store invariants | `CLAUDE.md` | re-state rules in `AGENTS.md` beyond a pointer |
| Executable **skills** (deploy, diagnose, session-end, workflows index) | `.agents/skills/<name>/SKILL.md` | put procedure content in `.claude/skills/` — those are pointers |
| Human-readable **procedures** (build, start-dev, xcode-debug, …) | `.agents/workflows/*.md` | hand-roll command sequences when a workflow exists |
| Decisions, bugfixes, hardware findings, pitfalls | `DEVELOPMENT_LOG.md` | dump everything into `CLAUDE.md` |

### Skills are single-source

Canonical skills live under **`.agents/skills/<name>/SKILL.md`** (modern, agent-agnostic, Codex-discovered and Claude-discoverable) and are **committed to git**. The files under `.claude/skills/` are **thin pointers** that preserve Claude Code's `/deploy` and `/sdc-diagnose` slash invocation and forward to the canonical file — note `.claude/` is **gitignored** (per-developer), so those pointers are machine-local while the procedure they reference is the shared, version-controlled source. When a procedure changes, edit only the `.agents/skills/` copy. Current skills:

- `agentdeck-deploy` — build/install/launch across Android, Apple, ESP32, Stream Deck, daemon
- `sdc-diagnose` — Stream Deck/PTY sync, cursor, hook-ingestion, and state-machine diagnostics
- `session-end` — cross-agent handoff (below)
- `agentdeck-workflows` — index/router into `.agents/workflows/`

## Handoff between agents

Before `/clear`, `/new`, switching tasks, or handing work to a different agent, run the **`session-end`** skill (`.agents/skills/session-end/SKILL.md`). It writes a concise handoff (goal, current outcome, changed files, verification, blockers, next action) and updates durable docs only when warranted — separating temporary handoff notes from `CLAUDE.md` / `DEVELOPMENT_LOG.md` / `AGENTS.md`.

## Before you commit (any agent)

```bash
pnpm build && pnpm typecheck && pnpm test
pnpm generate-protocol            # must be a no-op (CI fails on drift)
bash design/lint.sh               # design-rule baseline
python3 design/verify-tokens-sync.py   # token mirror drift
```
CI (`.github/workflows/`) re-runs these regardless of which agent authored the change.
