#!/usr/bin/env bash
# cockpit — 병렬 에이전트 비교용 얇은 컨트롤러 (workmux + tmux + git).
# 실행: `cockpit <cmd>` (PATH 심링크) 또는 `agentdeck cockpit <cmd>`. 별칭은 () 안.
#
#   cockpit broadcast|b "<프롬프트>" [task]  N개 에이전트 동시 발사 + 상단 그리드 + 하단 커맨드 바
#   cockpit send|s "<텍스트>"               그리드 전체에 후속 지시 (tmux send-keys 직접 전송)
#   cockpit pick|p                          포커스 패널=승자 → (자동커밋) main 머지 + 나머지 정리
#   cockpit fork|f "<프롬프트>"             포커스 패널의 WIP 기준 새 비교 라운드 분기 (머지 없음)
#   cockpit drop|x                          포커스 패널 하나만 제거 → 그리드 재정렬(생존 패널 확대)
#   cockpit abandon|a                       현재 그리드 폐기 (eval 전용: 머지 없이 학습만)
#   cockpit score|r                         패널 보더에 ★APME점수 오버레이 (diff 리뷰는 workmux dashboard)
#   cockpit grid|g                          활성 그리드 창으로 점프 (overlay 대용)
#   cockpit setup                           tmux 키바인딩 설치 (prefix+S/P/F/X/G/R)
#   cockpit setup-agy                       agy(Antigravity) 를 비교군에 편입
#   cockpit list|ls | clean                 점검 / 그리드+전체 워크트리 정리
#
# 비교 대상: export COCKPIT_AGENTS="claude codex opencode"  (기본). agy 는 setup-agy 선행.
set -euo pipefail

: "${COCKPIT_AGENTS:=claude codex opencode}"
: "${COCKPIT_SENDKEYS_AGENTS:=agy}"   # workmux 가 프롬프트 못 넣는 비빌트인 → cockpit send-keys 로 직접
: "${COCKPIT_SEND_DELAY:=0.4}"        # paste 후 Enter 사이 딜레이 (codex 제출 race 방지)
WIN_PREFIX="cockpit"
BAR_HEIGHT=6
APME_DB="$HOME/.agentdeck/apme.sqlite"
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
# 키바인딩이 호출할 실행 경로. `agentdeck cockpit` 로 실행되면 그쪽이 COCKPIT_INVOKE 를 줌.
INVOKE="${COCKPIT_INVOKE:-$SELF}"

die(){ echo "cockpit: $*" >&2; exit 1; }
need_tmux(){ [ -n "${TMUX:-}" ] || die "tmux 세션 안에서 실행하세요"; }
need_repo(){ git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "git 저장소 안에서 실행하세요"; }
goto_root(){ local r; r=$(tmux show-options -wqv @cockpit_root 2>/dev/null || true); [ -n "$r" ] && cd "$r" || true; }
pane_wt(){ tmux show-options -pqv -t "$1" @worktree 2>/dev/null || true; }
# 패널에 프롬프트 입력 후 제출. codex 는 paste 직후 Enter 가 너무 빠르면 입력창에만 남고
# 제출이 안 되므로 사이에 딜레이를 둔다 (claude/opencode 도 무해).
_send_to_pane(){
  tmux send-keys -t "$1" -l -- "$2"
  sleep "$COCKPIT_SEND_DELAY"
  tmux send-keys -t "$1" Enter
}
# 워크트리 절대경로 (workmux path → 실패 시 <repo>__worktrees/<wt> 규칙으로 폴백). APME 점수 매핑용.
_wt_path(){
  local p root; p=$(workmux path "$1" 2>/dev/null || true)
  if [ -z "$p" ] || [ ! -d "$p" ]; then
    root=$(tmux show-options -wqv @cockpit_root 2>/dev/null || true)
    [ -n "$root" ] && p="$(dirname "$root")/$(basename "$root")__worktrees/$1"
  fi
  [ -d "$p" ] && printf '%s' "$p"
}
# [a-z0-9-] 만 남겨 git-safe kebab 으로 정리 (stdin 또는 $1). 짧게(28자) 자름.
_sanitize_slug(){
  local s="${1-$(cat)}"
  printf '%s' "$s" | tr 'A-Z' 'a-z' | tr -c 'a-z0-9-' '-' \
    | sed -E 's/-+/-/g; s/^-+//; s/-+$//' | cut -c1-28 | sed -E 's/-+$//'
}
# 프롬프트(한글/영문) → 짧은 영어 kebab 브랜치명.
#   COCKPIT_NAMER: fm(Apple Intelligence, 기본·온디바이스) | mlx(로컬 Qwen3.6, 빠름) | off.
#   fm 실패 시 mlx, 그래도 안 되면 프롬프트의 영문만(ASCII).
: "${COCKPIT_NAMER:=fm}"
: "${COCKPIT_NAMER_URL:=http://localhost:8800/v1/chat/completions}"
# FM helper 기본 경로: 이 스크립트(심링크면 타깃) 기준 ../assets/fm-helper/...
# `agentdeck` 로 실행되면 CLI 가 COCKPIT_FM_HELPER 를 직접 주입하므로 이 기본은 standalone 폴백용.
_self_dir(){
  local s="$SELF"
  [ -L "$s" ] && s="$(readlink "$s")"
  case "$s" in /*) ;; *) s="$(cd "$(dirname "$SELF")" && pwd)/$s";; esac
  (cd "$(dirname "$s")" && pwd)
}
: "${COCKPIT_FM_HELPER:=$(_self_dir)/../assets/fm-helper/agentdeck-fm-helper}"
# 데몬 URL: COCKPIT_DAEMON_PORT(주입) → daemon.json httpPort → 9120 순.
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
  # 1) warm daemon helper 우선 — 상주 프로세스라 콜드스타트(~7s) 없음
  out=$(curl -s --max-time 12 "$COCKPIT_DAEMON_URL/generate" -H 'Content-Type: application/json' \
        -d "$(jq -nc --arg p "$_NAME_INSTR$1" --arg s "$_FM_SYS" '{prompt:$p,instructions:$s}')" \
        2>/dev/null | jq -r '.text // empty' 2>/dev/null || true)
  [ -n "$out" ] && { printf '%s' "$out"; return 0; }
  # 2) 폴백: helper 바이너리 직접 (콜드스타트)
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
  [ -n "$out" ] || out=$(printf '%s' "$prompt" | _sanitize_slug)   # 폴백: 프롬프트의 영문만
  [ -n "$out" ] && printf '%s' "$out" || printf 'task-%s' "$(date +%H%M%S)"
}

# 한 라운드 실행: N 에이전트를 base 에서 분기(빈 base=현재 main) + 프롬프트 발사 + 그리드 조립.
_run_round(){
  local prompt="$1" task="$2" base="${3:-}"
  local root; root=$(git rev-parse --show-toplevel)
  local addargs=(); for a in $COCKPIT_AGENTS; do addargs+=(-a "$a"); done
  [ -n "$base" ] && addargs+=(--base "$base")

  local before after
  before=$(tmux list-windows -F '#{window_id}' | sort)
  echo "cockpit: '$task' → [$COCKPIT_AGENTS]${base:+ (base: $base)} 발사…"
  workmux add "$task" "${addargs[@]}" -p "$prompt" -b >/dev/null
  sleep 1
  after=$(tmux list-windows -F '#{window_id}' | sort)
  local neww; neww=$(comm -13 <(echo "$before") <(echo "$after") || true)
  [ -n "$neww" ] || die "새 워크트리 창을 못 찾음 (workmux add 실패?)"

  # 그리드 창: 각 에이전트 패널을 join-pane 으로 모음 (pane_id 는 이동해도 불변).
  local cwin ph
  cwin=$(tmux new-window -d -P -F '#{window_id}' -n "${WIN_PREFIX}:${task}")
  ph=$(tmux list-panes -t "$cwin" -F '#{pane_id}' | head -1)
  tmux set-option -w -t "$cwin" @cockpit_root "$root"
  tmux set-option -w -t "$cwin" @cockpit_prompt "$prompt"   # pick 자동커밋 메시지용
  while IFS= read -r w; do
    [ -n "$w" ] || continue
    local wt src
    wt=$(tmux display-message -p -t "$w" '#{window_name}')
    src=$(tmux list-panes -t "$w" -F '#{pane_id}' | head -1)
    tmux join-pane -d -s "$src" -t "$cwin"
    tmux set-option -p -t "$src" @worktree "$wt"
  done <<< "$neww"
  tmux kill-pane -t "$ph" 2>/dev/null || true
  tmux select-layout -t "$cwin" tiled
  # 하단 풀폭 커맨드 바 (그리드는 위로 압축, drop 해도 바는 유지됨)
  local bar
  bar=$(tmux split-window -d -f -v -l "$BAR_HEIGHT" -t "$cwin" -P -F '#{pane_id}' \
        "printf '%s\n' '── cockpit ──  바에서: cockpit send \"...\"  |  패널에 커서두고: P=승자머지  F=여기서분기  X=드롭  D=diff  S=전체전송 (모두 prefix 뒤)'; exec \${SHELL:-/bin/zsh}")
  tmux set-option -p -t "$bar" @cockpit_bar 1
  # 비빌트인 에이전트(agy 등)는 workmux -p 가 프롬프트를 못 넣음 → send-keys 로 직접 전달
  local sa p wt
  for sa in $COCKPIT_SENDKEYS_AGENTS; do
    while IFS=' ' read -r p wt; do
      case "$wt" in *-"$sa") sleep 1; _send_to_pane "$p" "$prompt";; esac
    done < <(tmux list-panes -t "$cwin" -F '#{pane_id} #{@worktree}')
  done
  tmux select-pane -t "$bar"
  tmux select-window -t "$cwin"
  echo "cockpit: 그리드 준비됨."
}

cmd_broadcast(){
  need_tmux; need_repo
  local prompt="${1:-}"; [ -n "$prompt" ] || die 'broadcast "<프롬프트>" [task]'
  local task="${2:-}"; [ -n "$task" ] || task=$(slugify "$prompt"); [ -n "$task" ] || task="t$(date +%H%M%S)"
  _run_round "$prompt" "$task" ""
}

# 포커스한 에이전트의 (미머지) WIP 를 기준으로 새 비교 라운드 분기. main 머지 없음.
cmd_fork(){
  need_tmux; need_repo
  local prompt="${1:-}"; [ -n "$prompt" ] || die 'fork "<프롬프트>" [task]'
  local fp wt; fp=$(tmux display -p '#{pane_id}'); wt=$(pane_wt "$fp")
  [ -n "$wt" ] || die "분기 기준 에이전트 패널에 커서를 두고 실행하세요 (바/빈 패널 불가)"
  goto_root
  local wpath; wpath=$(workmux path "$wt" 2>/dev/null || true)
  if [ -n "$wpath" ] && [ -n "$(git -C "$wpath" status --porcelain 2>/dev/null)" ]; then
    echo "cockpit: [$wt] WIP 커밋(분기 기준 고정)…"
    git -C "$wpath" add -A && git -C "$wpath" commit -q -m "wip: fork base from $wt" || true
  fi
  local task; task=$(slugify "$prompt"); [ -n "$task" ] || task="t$(date +%H%M%S)"
  echo "cockpit: [$wt] 에서 분기 → 새 라운드"
  _run_round "$prompt" "$task" "$wt"
}

# 현재 그리드 폐기 (eval 전용: 머지 없이 학습만 했을 때). 워크트리 제거 + 창 닫기.
cmd_abandon(){
  need_tmux
  local cwin; cwin=$(tmux display -p '#{window_id}')
  goto_root
  local p wt
  while IFS= read -r p; do
    wt=$(pane_wt "$p"); [ -n "$wt" ] && (workmux remove "$wt" -f || true)
  done < <(tmux list-panes -t "$cwin" -F '#{pane_id}')
  tmux kill-window -t "$cwin" 2>/dev/null || true
  echo "cockpit: 그리드 폐기됨 (머지 없음)."
}

# 각 그리드 패널 보더에 ★APME점수(있으면) + main대비 diff 통계 오버레이.
cmd_score(){
  need_tmux; goto_root
  local cwin; cwin=$(tmux display -p '#{window_id}')
  tmux set-window-option -t "$cwin" pane-border-status top
  tmux set-window-option -t "$cwin" pane-border-format ' #{@pane_label} '
  local p wt path sc
  while IFS= read -r p; do
    wt=$(pane_wt "$p")
    if [ -z "$wt" ]; then tmux set-option -p -t "$p" @pane_label "[ cmd ]"; continue; fi
    path=$(_wt_path "$wt")
    sc=""
    [ -f "$APME_DB" ] && sc=$(sqlite3 "$APME_DB" "SELECT printf('%.2f',composite_score) FROM runs WHERE (project_name='$wt' OR project_path='$path') AND composite_score IS NOT NULL ORDER BY started_at DESC LIMIT 1" 2>/dev/null || true)
    tmux set-option -p -t "$p" @pane_label "$wt${sc:+   ★ $sc}"
  done < <(tmux list-panes -t "$cwin" -F '#{pane_id}')
  echo "cockpit: ★APME점수 오버레이 갱신 (diff 리뷰는 workmux dashboard 의 d 사용)"
}

# agy(Antigravity) 를 비교군에 편입: global config 에서 bare interactive 로, 프롬프트는 send-keys.
cmd_setup_agy(){
  local CFG="$HOME/.config/workmux/config.yaml"
  [ -f "$CFG" ] || die "global config 없음: $CFG"
  if grep -qE '^[[:space:]]*agy:' "$CFG"; then
    sed -i '' -E 's/^([[:space:]]*agy:).*/\1 "agy"/' "$CFG"
    echo "cockpit: global config 의 agy → \"agy\" (bare interactive)"
  else
    echo "  ⚠️ $CFG 의 agents: 맵에 'agy: \"agy\"' 를 직접 추가하세요"
  fi
  echo "  사용: export COCKPIT_AGENTS=\"claude codex opencode agy\" 후 broadcast"
  echo "  (agy 프롬프트는 cockpit 이 send-keys 로 전달 — COCKPIT_SENDKEYS_AGENTS=agy)"
}

cmd_send(){
  need_tmux
  local text="${1:-}"; [ -n "$text" ] || die 'send "<텍스트>"'
  local cwin; cwin=$(tmux display -p '#{window_id}')
  local n=0 p wt
  while IFS= read -r p; do
    wt=$(pane_wt "$p"); [ -n "$wt" ] || continue          # 바/빈 패널 자동 제외
    _send_to_pane "$p" "$text"
    echo "→ $wt"; n=$((n+1))
  done < <(tmux list-panes -t "$cwin" -F '#{pane_id}')
  echo "cockpit: $n 개 에이전트에 전송"
}

cmd_pick(){
  need_tmux
  local cwin fp winner; cwin=$(tmux display -p '#{window_id}'); fp=$(tmux display -p '#{pane_id}')
  winner=$(pane_wt "$fp"); [ -n "$winner" ] || die "승자 에이전트 패널에 커서를 두고 실행하세요 (바/빈 패널 불가)"
  local losers=() p wt
  while IFS= read -r p; do
    [ "$p" = "$fp" ] && continue
    wt=$(pane_wt "$p"); [ -n "$wt" ] && losers+=("$wt")
  done < <(tmux list-panes -t "$cwin" -F '#{pane_id}')
  goto_root
  # 승자에 미커밋 변경이 있으면 자동 커밋 (workmux merge 는 커밋된 것만 가져감 → 안 하면 작업 유실)
  local wpath; wpath=$(workmux path "$winner" 2>/dev/null || true)
  if [ -n "$wpath" ] && [ -n "$(git -C "$wpath" status --porcelain 2>/dev/null)" ]; then
    local msg; msg=$(tmux show-options -wqv @cockpit_prompt 2>/dev/null || true); [ -n "$msg" ] || msg="cockpit pick: $winner"
    echo "cockpit: 승자 미커밋 변경 자동 커밋…"
    git -C "$wpath" add -A && git -C "$wpath" commit -q -m "$msg" || true
  fi
  echo "cockpit: 승자 [$winner] → main 머지 / 정리: ${losers[*]:-(없음)}"
  workmux merge "$winner" || die "머지 실패 (충돌 확인)"
  local l; for l in "${losers[@]:-}"; do [ -n "$l" ] && (workmux remove "$l" -f || true); done
  tmux kill-window -t "$cwin" 2>/dev/null || true
  echo "cockpit: 완료. main 에 머지됨 — 이어서 작업하거나 다시 broadcast."
}

cmd_drop(){
  need_tmux
  local fp wt; fp=$(tmux display -p '#{pane_id}'); wt=$(pane_wt "$fp")
  [ -n "$wt" ] || die "드롭할 에이전트 패널에 커서를 두고 실행하세요 (바/빈 패널 불가)"
  goto_root
  echo "cockpit: 드롭 [$wt] (워크트리 제거 + 패널 닫기, 그리드 재정렬)"
  workmux remove "$wt" -f || true
  tmux kill-pane -t "$fp" 2>/dev/null || true     # 상단 그리드만 reflow, 하단 바 유지
}

cmd_setup(){
  need_tmux
  tmux bind-key S command-prompt -p 'send-all:' "run-shell \"$INVOKE send '%%'\""
  tmux bind-key P run-shell "$INVOKE pick"
  tmux bind-key X run-shell "$INVOKE drop"
  tmux bind-key G run-shell "$INVOKE grid"
  tmux bind-key F command-prompt -p 'fork-from-focused:' "run-shell \"$INVOKE fork '%%'\""
  tmux bind-key R run-shell "$INVOKE score"
  echo "cockpit: 키바인딩 → prefix+S=전체전송, P=승자머지, F=여기서분기, X=드롭, G=그리드점프, R=★점수"
  echo "  (diff/patch 리뷰는 workmux dashboard 의 d/a 사용 — cockpit 이 재구현 안 함)"
}

# 활성 cockpit 그리드 창으로 점프 (overlay 대용 "버튼"). 가장 최근 것.
cmd_grid(){
  need_tmux
  local w; w=$(tmux list-windows -F '#{window_id} #{window_name}' | awk '$2 ~ /^cockpit:/{print $1}' | tail -1)
  [ -n "$w" ] || die "활성 cockpit 그리드 없음 (broadcast 먼저)"
  tmux select-window -t "$w"
}

cmd_list(){ workmux list; }

cmd_clean(){
  need_repo
  # 1) cockpit 그리드 창 닫기 (join 된 패널이라 workmux 가 추적 못 함 → 직접 kill)
  local w
  while IFS= read -r w; do [ -n "$w" ] && tmux kill-window -t "$w" 2>/dev/null || true; done \
    < <(tmux list-windows -F '#{window_id} #{window_name}' 2>/dev/null | awk '$2 ~ /^cockpit:/{print $1}')
  # 2) 모든 워크트리 + 그 창 제거
  echo "cockpit: 그리드 창 + 모든 워크트리 정리(main 제외)…"
  workmux remove --all -f
}

# 짧은 별칭은 그리드 키바인딩 글자와 일치 (b=broadcast, s/p/f/x/a/g/r).
case "${1:-}" in
  broadcast|b) shift; cmd_broadcast "$@";;
  send|s)      shift; cmd_send "$@";;
  pick|p)      shift; cmd_pick "$@";;
  fork|f)      shift; cmd_fork "$@";;
  drop|x)      shift; cmd_drop "$@";;
  abandon|a)   shift; cmd_abandon "$@";;
  grid|g)      shift; cmd_grid "$@";;
  score|r)     shift; cmd_score "$@";;
  setup)       shift; cmd_setup "$@";;
  setup-agy)   shift; cmd_setup_agy "$@";;
  list|ls)     shift; cmd_list "$@";;
  clean)       shift; cmd_clean "$@";;
  ""|-h|--help|help) awk 'NR==1{next} /^#/{sub(/^# ?/,"");print;next} {exit}' "$SELF";;
  *) die "알 수 없는 명령: $1 (cockpit help)";;
esac
