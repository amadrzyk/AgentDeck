#!/usr/bin/env bash
# agentdeck wt — worktree compare: run several coding agents on one prompt in an
# isolated tmux grid, then review and merge the best (workmux + tmux + git).
# Invoke as `agentdeck wt <cmd>`. Short aliases shown in ().
#
#   wt start|b "<prompt>" [name]   Broadcast a prompt to every agent: a grid on top + command bar below
#   wt send|s "<text>"             Send a follow-up instruction to every agent in the grid
#   wt pick|p                      Focused pane = winner -> (auto-commit) merge to main + clean up the rest
#   wt fork|f "<prompt>"           Branch a new round from the focused pane's WIP (no merge to main)
#   wt drop|x                      Remove just the focused pane; the grid re-tiles (survivors grow)
#   wt abandon|a                   Discard the current grid without merging (review-only round)
#   wt score|r                     Overlay ★ APME score on each pane border (use workmux dashboard for diffs)
#   wt grid|g                      Jump to the active grid window
#   wt agents [names...]           (CLI) Show or set the agent set compared by `wt start`
#   wt list|ls | clean|clear       List worktrees / remove all compare worktrees + grid windows
#
# Agent set: managed via `agentdeck wt agents`; default claude codex opencode.
# Most operations are in-grid keybindings (prefix + S/P/F/X/G/R), so the only
# command you usually type is `agentdeck wt start "..."`.
set -euo pipefail

: "${COCKPIT_AGENTS:=claude codex opencode}"
: "${COCKPIT_SENDKEYS_AGENTS:=agy}"   # non-builtin agents workmux can't prompt-inject -> send via send-keys
: "${COCKPIT_SEND_DELAY:=0.4}"        # delay between paste and Enter (avoids codex submit race)
: "${COCKPIT_AGY_DELAY:=4}"           # wait before sending to send-keys agents (agy startup: auth + model load)
WIN_PREFIX="wt"
BAR_HEIGHT=6
APME_DB="$HOME/.agentdeck/apme.sqlite"
# Always-visible shortcut cheatsheet (shown on the command-bar pane border).
# Use Ctrl + the letter; the Ctrl variant passes through the Korean IME.
BAR_KEYS='wt  [prefix, then]   Ctrl-P pick   ·   Ctrl-X drop   ·   Ctrl-S send-all   ·   Ctrl-R score      (Ctrl + letter — works with Korean IME)'
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
# Path the keybindings call back through. When run via `agentdeck wt`, the CLI
# sets COCKPIT_INVOKE='agentdeck wt'; standalone falls back to this script path.
INVOKE="${COCKPIT_INVOKE:-$SELF}"

die(){ echo "wt: $*" >&2; exit 1; }
need_tmux(){ [ -n "${TMUX:-}" ] || die "run inside a tmux session"; }
need_repo(){ git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "run inside a git repository"; }
goto_root(){ local r; r=$(tmux show-options -wqv @cockpit_root 2>/dev/null || true); [ -n "$r" ] && cd "$r" || true; }
pane_wt(){ tmux show-options -pqv -t "$1" @worktree 2>/dev/null || true; }
# Type the prompt into a pane and submit it. codex leaves the text in the input
# box if Enter arrives right after the paste, so we delay between the two
# (harmless for claude/opencode).
_send_to_pane(){
  tmux send-keys -t "$1" -l -- "$2"
  sleep "$COCKPIT_SEND_DELAY"
  tmux send-keys -t "$1" Enter
}
# Absolute worktree path (workmux path -> fallback to <repo>__worktrees/<wt>). Used for APME score mapping.
_wt_path(){
  local p root; p=$(workmux path "$1" 2>/dev/null || true)
  if [ -z "$p" ] || [ ! -d "$p" ]; then
    root=$(tmux show-options -wqv @cockpit_root 2>/dev/null || true)
    [ -n "$root" ] && p="$(dirname "$root")/$(basename "$root")__worktrees/$1"
  fi
  # Must return 0 even when not found: callers use `path=$(_wt_path ...)` and a
  # non-zero status there aborts the whole script under `set -e` (was the cause
  # of `wt score` exiting 1 when a pane's worktree path couldn't be resolved).
  if [ -d "$p" ]; then printf '%s' "$p"; fi
  return 0
}
# Keep only [a-z0-9-] for a git-safe kebab name (stdin or $1). Capped at 28 chars.
_sanitize_slug(){
  local s="${1-$(cat)}"
  printf '%s' "$s" | tr 'A-Z' 'a-z' | tr -c 'a-z0-9-' '-' \
    | sed -E 's/-+/-/g; s/^-+//; s/-+$//' | cut -c1-28 | sed -E 's/-+$//'
}
# Prompt (any language) -> short english kebab branch name.
#   COCKPIT_NAMER: fm (Apple Intelligence, default, on-device) | mlx (local Qwen3.6) | off.
#   fm falls back to mlx, then to the prompt's ASCII letters.
: "${COCKPIT_NAMER:=fm}"
: "${COCKPIT_NAMER_URL:=http://localhost:8800/v1/chat/completions}"
# FM helper default: relative to this script (resolving symlinks), ../assets/fm-helper/...
# When run via `agentdeck`, the CLI injects COCKPIT_FM_HELPER, so this is only a standalone fallback.
_self_dir(){
  local s="$SELF"
  [ -L "$s" ] && s="$(readlink "$s")"
  case "$s" in /*) ;; *) s="$(cd "$(dirname "$SELF")" && pwd)/$s";; esac
  (cd "$(dirname "$s")" && pwd)
}
: "${COCKPIT_FM_HELPER:=$(_self_dir)/../assets/fm-helper/agentdeck-fm-helper}"
# Daemon URL: COCKPIT_DAEMON_PORT (injected) -> daemon.json httpPort -> 9120.
: "${COCKPIT_DAEMON_PORT:=}"
if [ -z "${COCKPIT_DAEMON_URL:-}" ]; then
  _p="${COCKPIT_DAEMON_PORT:-}"
  [ -n "$_p" ] || _p=$(jq -r '.httpPort // .port // empty' "$HOME/.agentdeck/daemon.json" 2>/dev/null || true)
  [ -n "$_p" ] || _p=9120
  COCKPIT_DAEMON_URL="http://127.0.0.1:$_p"
fi
_NAME_INSTR='Output ONLY a short lowercase kebab-case english git branch name, max 3 words, only a-z 0-9 and hyphens, no quotes, no explanation, no slashes, summarizing this task: '
_FM_SYS='You output only a short kebab-case git branch name and nothing else.'
_name_fm(){   # Apple Intelligence (FoundationModels)
  local out
  # 1) prefer the warm daemon helper — it's resident, so no ~7s cold start
  out=$(curl -s --max-time 12 "$COCKPIT_DAEMON_URL/generate" -H 'Content-Type: application/json' \
        -d "$(jq -nc --arg p "$_NAME_INSTR$1" --arg s "$_FM_SYS" '{prompt:$p,instructions:$s}')" \
        2>/dev/null | jq -r '.text // empty' 2>/dev/null || true)
  [ -n "$out" ] && { printf '%s' "$out"; return 0; }
  # 2) fallback: invoke the helper binary directly (cold start)
  [ -x "$COCKPIT_FM_HELPER" ] || return 0
  jq -nc --arg p "$_NAME_INSTR$1" --arg s "$_FM_SYS" '{id:1,prompt:$p,instructions:$s,temperature:0.2}' \
    | "$COCKPIT_FM_HELPER" 2>/dev/null | head -1 | jq -r '.text // empty' 2>/dev/null || true
}
_name_mlx(){
  curl -s --max-time 8 "$COCKPIT_NAMER_URL" -H 'Content-Type: application/json' \
    -d "$(jq -nc --arg p "$_NAME_INSTR$1" '{messages:[{role:"user",content:$p}],max_tokens:20,temperature:0.2}')" \
    2>/dev/null | jq -r '.choices[0].message.content // empty' 2>/dev/null || true
}
slugify(){
  local prompt="$1" out=""
  case "$COCKPIT_NAMER" in
    fm)  out=$(_sanitize_slug "$(_name_fm "$prompt")"); [ -n "$out" ] || out=$(_sanitize_slug "$(_name_mlx "$prompt")");;
    mlx) out=$(_sanitize_slug "$(_name_mlx "$prompt")");;
    *)   out="";;
  esac
  [ -n "$out" ] || out=$(printf '%s' "$prompt" | _sanitize_slug)   # fallback: ASCII letters of the prompt
  [ -n "$out" ] && printf '%s' "$out" || printf 'task-%s' "$(date +%H%M%S)"
}

# Ensure agy (Antigravity) is launchable by workmux: add `agy: "agy"` to the
# agents: map in the global config if it's not there yet (idempotent). agy isn't
# a workmux builtin, so without this it can't be spawned. Prompt delivery is
# handled by COCKPIT_SENDKEYS_AGENTS, so nothing else is needed.
_ensure_agy_config(){
  local CFG="$HOME/.config/workmux/config.yaml"
  mkdir -p "$(dirname "$CFG")"
  [ -f "$CFG" ] || printf 'nerdfont: true\n' > "$CFG"
  grep -qE '^[[:space:]]*agy:' "$CFG" && return 0
  if grep -qE '^agents:' "$CFG"; then
    awk '/^agents:/ && !d {print; print "  agy: \"agy\""; d=1; next} {print}' "$CFG" > "$CFG.tmp" && mv "$CFG.tmp" "$CFG"
  else
    printf '\nagents:\n  agy: "agy"\n' >> "$CFG"
  fi
}

# One round: branch N agents from base (empty base = current main) + broadcast prompt + assemble grid.
_run_round(){
  local prompt="$1" task="$2" base="${3:-}"
  # Auto-configure non-builtin agents (currently agy) so they "just work".
  case " $COCKPIT_AGENTS " in *" agy "*) _ensure_agy_config;; esac
  local root; root=$(git rev-parse --show-toplevel)
  local addargs=(); for a in $COCKPIT_AGENTS; do addargs+=(-a "$a"); done
  [ -n "$base" ] && addargs+=(--base "$base")

  local before after
  before=$(tmux list-windows -F '#{window_id}' | sort)
  echo "wt: '$task' -> [$COCKPIT_AGENTS]${base:+ (base: $base)} launching..."
  workmux add "$task" "${addargs[@]}" -p "$prompt" -b >/dev/null
  sleep 1
  after=$(tmux list-windows -F '#{window_id}' | sort)
  local neww; neww=$(comm -13 <(echo "$before") <(echo "$after") || true)
  [ -n "$neww" ] || die "no new worktree windows found (workmux add failed?)"

  # Grid window: pull each agent pane in with join-pane (pane_id is stable across the move).
  local cwin ph
  cwin=$(tmux new-window -d -P -F '#{window_id}' -n "${WIN_PREFIX}:${task}")
  ph=$(tmux list-panes -t "$cwin" -F '#{pane_id}' | head -1)
  tmux set-option -w -t "$cwin" @cockpit_root "$root"
  tmux set-option -w -t "$cwin" @cockpit_prompt "$prompt"   # used as the pick auto-commit message
  while IFS= read -r w; do
    [ -n "$w" ] || continue
    local wt src
    wt=$(tmux display-message -p -t "$w" '#{window_name}')
    src=$(tmux list-panes -t "$w" -F '#{pane_id}' | head -1)
    tmux join-pane -d -s "$src" -t "$cwin"
    tmux set-option -p -t "$src" @worktree "$wt"
    tmux set-option -p -t "$src" @pane_label "$wt"
  done <<< "$neww"
  tmux kill-pane -t "$ph" 2>/dev/null || true
  tmux select-layout -t "$cwin" tiled
  # Full-width bottom command bar (grid compresses above it; it survives drops).
  local bar
  bar=$(tmux split-window -d -f -v -l "$BAR_HEIGHT" -t "$cwin" -P -F '#{pane_id}' \
        "printf '%s\n' '-- agentdeck wt -- shortcut keys are on the pane borders above. Follow-up to all: agentdeck wt send \"...\"'; exec \${SHELL:-/bin/zsh}")
  tmux set-option -p -t "$bar" @cockpit_bar 1
  # Always-visible cheatsheet: pane-border line shows the keys on the bar and the
  # worktree name on each agent pane (score later augments these with ★ scores).
  tmux set-window-option -t "$cwin" pane-border-status top
  tmux set-window-option -t "$cwin" pane-border-format ' #{@pane_label} '
  tmux set-option -p -t "$bar" @pane_label "$BAR_KEYS"
  # Non-builtin agents (agy, etc.) aren't prompt-injected by workmux -p -> deliver via send-keys.
  local sa p wt
  for sa in $COCKPIT_SENDKEYS_AGENTS; do
    while IFS=' ' read -r p wt; do
      case "$wt" in *-"$sa") sleep "$COCKPIT_AGY_DELAY"; _send_to_pane "$p" "$prompt";; esac
    done < <(tmux list-panes -t "$cwin" -F '#{pane_id} #{@worktree}')
  done
  tmux select-pane -t "$bar"
  tmux select-window -t "$cwin"
  echo "wt: grid ready."
}

# True if any `<task>-<agent>` branch already exists (collision).
_task_collides(){
  local a
  for a in $COCKPIT_AGENTS; do
    git show-ref --verify --quiet "refs/heads/$1-$a" && return 0
  done
  return 1
}
# Next free name by appending -2, -3, ... until no collision.
_free_task(){
  local base="$1" t="$1" i=1
  while _task_collides "$t"; do i=$((i+1)); t="$base-$i"; done
  printf '%s' "$t"
}
# Remove the existing `<task>-<agent>` worktrees so the name can be reused.
_clean_task(){
  local a
  for a in $COCKPIT_AGENTS; do workmux remove "$1-$a" -f 2>/dev/null || true; done
}
# On collision, ask the user what to do. Sets global RESOLVED_TASK (or aborts).
# Defaults to auto-rename when there's no TTY (non-interactive).
_resolve_task(){
  RESOLVED_TASK="$1"
  _task_collides "$1" || return 0
  printf "wt: worktrees for '%s-*' already exist.\n  [n] new auto-named name  ·  [c] clean existing & reuse  ·  [a] abort? [n/c/a] " "$1" >&2
  local ans=""; read -r ans </dev/tty 2>/dev/null || ans=n
  case "$ans" in
    c|C) _clean_task "$1"; echo "wt: cleaned existing, reusing '$1'" >&2;;
    a|A) die "aborted";;
    *)   RESOLVED_TASK=$(_free_task "$1"); echo "wt: name in use -> using '$RESOLVED_TASK'" >&2;;
  esac
}

cmd_broadcast(){
  need_tmux; need_repo
  local prompt="${1:-}"; [ -n "$prompt" ] || die 'start "<prompt>" [name]'
  local task="${2:-}"; [ -n "$task" ] || task=$(slugify "$prompt"); [ -n "$task" ] || task="t$(date +%H%M%S)"
  _resolve_task "$task"; task="$RESOLVED_TASK"
  _run_round "$prompt" "$task" ""
}

# Branch a new round from the focused agent's (unmerged) WIP. No merge to main.
cmd_fork(){
  need_tmux; need_repo
  local prompt="${1:-}"; [ -n "$prompt" ] || die 'fork "<prompt>" [name]'
  local fp wt; fp=$(tmux display -p '#{pane_id}'); wt=$(pane_wt "$fp")
  [ -n "$wt" ] || die "put the cursor on the agent pane to fork from (not the bar/empty pane)"
  goto_root
  local wpath; wpath=$(workmux path "$wt" 2>/dev/null || true)
  if [ -n "$wpath" ] && [ -n "$(git -C "$wpath" status --porcelain 2>/dev/null)" ]; then
    echo "wt: committing [$wt] WIP (pinning the fork base)..."
    git -C "$wpath" add -A && git -C "$wpath" commit -q -m "wip: fork base from $wt" || true
  fi
  local task; task=$(slugify "$prompt"); [ -n "$task" ] || task="t$(date +%H%M%S)"
  _resolve_task "$task"; task="$RESOLVED_TASK"
  echo "wt: forking from [$wt] -> new round"
  _run_round "$prompt" "$task" "$wt"
}

# Discard the current grid (review-only round, no merge). Removes worktrees + closes window.
cmd_abandon(){
  need_tmux
  local cwin; cwin=$(tmux display -p '#{window_id}')
  goto_root
  local p wt
  while IFS= read -r p; do
    wt=$(pane_wt "$p"); [ -n "$wt" ] && (workmux remove "$wt" -f || true)
  done < <(tmux list-panes -t "$cwin" -F '#{pane_id}')
  tmux kill-window -t "$cwin" 2>/dev/null || true
  echo "wt: grid abandoned (nothing merged)."
}

# Overlay ★ APME score (if any) on each grid pane border.
cmd_score(){
  need_tmux; goto_root
  local cwin; cwin=$(tmux display -p '#{window_id}')
  tmux set-window-option -t "$cwin" pane-border-status top
  tmux set-window-option -t "$cwin" pane-border-format ' #{@pane_label} '
  local p wt path sc
  while IFS= read -r p; do
    wt=$(pane_wt "$p")
    if [ -z "$wt" ]; then tmux set-option -p -t "$p" @pane_label "$BAR_KEYS"; continue; fi
    path=$(_wt_path "$wt")
    sc=""
    # Most recent COMPLETED + scored run for this worktree. Open runs aren't yet
    # judged, so they'd show a meaningless 0.00 — exclude them.
    [ -f "$APME_DB" ] && sc=$(sqlite3 "$APME_DB" "SELECT printf('%.2f',composite_score) FROM runs WHERE (project_name='$wt' OR project_path='$path') AND ended_at IS NOT NULL AND composite_score IS NOT NULL ORDER BY started_at DESC LIMIT 1" 2>/dev/null || true)
    tmux set-option -p -t "$p" @pane_label "$wt${sc:+   ★ $sc}"
  done < <(tmux list-panes -t "$cwin" -F '#{pane_id}')
  # No stdout: run-shell would otherwise pop the message over the screen. The
  # border labels are the feedback.
}

# Add agy (Antigravity) to the compare set: bare interactive in the global config; prompt via send-keys.
cmd_setup_agy(){
  _ensure_agy_config
  echo "wt: agy (Antigravity) is configured in the workmux global config."
  echo "  Add it to the compare set:  agentdeck wt agents claude codex opencode agy"
  echo "  After that it launches automatically on 'wt start' (prompt via send-keys)."
}

cmd_send(){
  need_tmux
  local text="${1:-}"; [ -n "$text" ] || die 'send "<text>"'
  local cwin; cwin=$(tmux display -p '#{window_id}')
  local n=0 p wt
  while IFS= read -r p; do
    wt=$(pane_wt "$p"); [ -n "$wt" ] || continue          # skip the bar/empty pane
    _send_to_pane "$p" "$text"
    echo "-> $wt"; n=$((n+1))
  done < <(tmux list-panes -t "$cwin" -F '#{pane_id}')
  echo "wt: sent to $n agent(s)"
}

cmd_pick(){
  need_tmux
  local cwin fp winner; cwin=$(tmux display -p '#{window_id}'); fp=$(tmux display -p '#{pane_id}')
  winner=$(pane_wt "$fp"); [ -n "$winner" ] || die "put the cursor on the winning agent pane (not the bar/empty pane)"
  local losers=() p wt
  while IFS= read -r p; do
    [ "$p" = "$fp" ] && continue
    wt=$(pane_wt "$p"); [ -n "$wt" ] && losers+=("$wt")
  done < <(tmux list-panes -t "$cwin" -F '#{pane_id}')
  goto_root
  # Auto-commit the winner's uncommitted changes (workmux merge only takes commits -> else work is lost).
  local wpath; wpath=$(workmux path "$winner" 2>/dev/null || true)
  if [ -n "$wpath" ] && [ -n "$(git -C "$wpath" status --porcelain 2>/dev/null)" ]; then
    local msg; msg=$(tmux show-options -wqv @cockpit_prompt 2>/dev/null || true); [ -n "$msg" ] || msg="wt pick: $winner"
    echo "wt: auto-committing the winner's uncommitted changes..."
    git -C "$wpath" add -A && git -C "$wpath" commit -q -m "$msg" || true
  fi
  echo "wt: winner [$winner] -> merge to main / cleanup: ${losers[*]:-(none)}"
  workmux merge "$winner" || die "merge failed (resolve conflicts)"
  local l; for l in "${losers[@]:-}"; do [ -n "$l" ] && (workmux remove "$l" -f || true); done
  tmux kill-window -t "$cwin" 2>/dev/null || true
  echo "wt: done. merged to main — keep working or start another round."
}

cmd_drop(){
  need_tmux
  local fp wt; fp=$(tmux display -p '#{pane_id}'); wt=$(pane_wt "$fp")
  [ -n "$wt" ] || die "put the cursor on the agent pane to drop (not the bar/empty pane)"
  goto_root
  echo "wt: dropping [$wt] (remove worktree + close pane, grid re-tiles)"
  workmux remove "$wt" -f || true
  tmux kill-pane -t "$fp" 2>/dev/null || true     # only the top grid re-flows; the bottom bar stays
}

cmd_setup(){
  need_tmux
  # Bind each verb to BOTH the bare uppercase letter and Ctrl+lowercase. The
  # Ctrl+letter variant passes through the Korean IME (the bare letters get
  # composed into Hangul), so prefix -> C-p etc. work without switching input.
  # Core in-grid actions only. fork/grid stay available as `agentdeck wt fork|grid`
  # but aren't bound to keys (rarely used). Each is bound to BOTH bare uppercase
  # and Ctrl+lowercase; the Ctrl variant passes through the Korean IME.
  local k
  for k in P C-p; do tmux bind-key "$k" run-shell "$INVOKE pick"; done
  for k in X C-x; do tmux bind-key "$k" run-shell "$INVOKE drop"; done
  for k in R C-r; do tmux bind-key "$k" run-shell "$INVOKE score"; done
  for k in S C-s; do tmux bind-key "$k" command-prompt -p 'send-all:' "run-shell \"$INVOKE send '%%'\""; done
  echo "wt: keybindings -> prefix, then  Ctrl-P pick  ·  Ctrl-X drop  ·  Ctrl-S send-all  ·  Ctrl-R score"
  echo "  Use Ctrl + the letter (works with the Korean IME). For diffs: workmux dashboard 'd'."
}

# Jump to the active grid window (overlay-like "button"). Most recent one.
cmd_grid(){
  need_tmux
  local w; w=$(tmux list-windows -F '#{window_id} #{window_name}' | awk -v p="^${WIN_PREFIX}:" '$2 ~ p{print $1}' | tail -1)
  [ -n "$w" ] || die "no active grid (run 'wt start' first)"
  tmux select-window -t "$w"
}

cmd_list(){ workmux list; }

cmd_clean(){
  need_repo
  # 1) close grid windows (their panes were joined, so workmux can't track them -> kill directly)
  local w
  while IFS= read -r w; do [ -n "$w" ] && tmux kill-window -t "$w" 2>/dev/null || true; done \
    < <(tmux list-windows -F '#{window_id} #{window_name}' 2>/dev/null | awk -v p="^${WIN_PREFIX}:" '$2 ~ p{print $1}')
  # 2) remove all worktrees + their windows
  echo "wt: closing grid windows + removing all worktrees (except main)..."
  workmux remove --all -f
}

# Short aliases match the in-grid keybinding letters (b=start, s/p/f/x/a/g/r).
case "${1:-}" in
  start|broadcast|b) shift; cmd_broadcast "$@";;
  send|s)            shift; cmd_send "$@";;
  pick|p)            shift; cmd_pick "$@";;
  fork|f)            shift; cmd_fork "$@";;
  drop|x)            shift; cmd_drop "$@";;
  abandon|a)         shift; cmd_abandon "$@";;
  grid|g)            shift; cmd_grid "$@";;
  score|r)           shift; cmd_score "$@";;
  setup)             shift; cmd_setup "$@";;
  setup-agy)         shift; cmd_setup_agy "$@";;
  list|ls)           shift; cmd_list "$@";;
  clean|clear)       shift; cmd_clean "$@";;
  ""|-h|--help|help) awk 'NR==1{next} /^#/{sub(/^# ?/,"");print;next} {exit}' "$SELF";;
  *) die "unknown command: $1 (try: agentdeck wt help)";;
esac
