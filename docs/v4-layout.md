# v4 Layout (0.4.0) — Session-Per-Button

**Manifest actions** (5 total): `session-slot` (Keypad; device-grid aware) + 4 encoders (`option-dial`, `voice-dial`, `utility-dial`, `usage-dial`) on Stream Deck+. v3 keypad actions (mode/session/usage/response/stop) removed. Usage dial UUID kept as `iterm-dial` for profile backward compat.

## Keypad

All keypad buttons are `session-slot`; the plugin reads the physical device grid from Stream Deck and maps `slot = row * columns + column`.

| Device | List View | Detail View |
|--------|-----------|-------------|
| Stream Deck+ (4×2) | 8 sessions, or 7 + NEXT | 0 BACK, 1 INFO, 2/3/4/5 content, 6 MORE, 7 ESC/STOP |
| Stream Deck (5×3) | 15 sessions, or 14 + NEXT | 0 BACK, 1 INFO, 2-12 content, 13 MORE, 14 ESC/STOP |
| Other key grids | `keyCount` sessions, or `keyCount - 1` + NEXT | 0 BACK, 1 INFO, last ESC/STOP, penultimate MORE, remaining content |

No daemon: slot 0 = **▶ START** (launches AgentDeck Dashboard app), rest dark.

**OpenClaw presets** (detail view, IDLE/PROCESSING): STATUS, MODEL (dynamic model name + switch), GATEWAY (browser).

## Agent Session UX Scenarios

목표는 모든 하드웨어에서 같은 mental model 을 유지하는 것이다: **세션 버튼은 들어가기, 상세 화면은 상태 기반 명령, BACK 은 빠져나가기**. 다만 화면/입력 장치 특성에 따라 정보 밀도와 조작 깊이를 다르게 둔다.

### Stream Deck / Keypad-only

- **List**: 각 키는 하나의 세션이다. AgentDeck terrarium creature mark + 상태 링으로 빠르게 훑는다.
- **Press session**: 먼저 선택 세션의 list-state 로 상세 화면을 즉시 표시하고, daemon focus relay 가 도착하면 tool/options/current model 을 갱신한다. 사용자는 빈 화면이나 다른 세션 옵션을 보지 않는다.
- **Detail idle**: GO ON / REVIEW / COMMIT / CLEAR 를 1-tap 명령으로 둔다.
- **Detail awaiting**: 실제 parser options 만 노출한다. overflow 는 NEXT 로 페이지 전환한다.
- **Detail processing**: STOP 을 항상 기기의 마지막 버튼에 둔다. 진행 상태는 dashed/stitch 가 아니라 고정 위치의 solid/pulse ring + RUN/STOP 문맥으로 보인다.

### Stream Deck+

- Keypad UX 는 Stream Deck 과 동일하지만, encoder 가 상세 화면의 보조 조작면이다.
- E2 는 긴 옵션 목록 스크롤/확정, E3 는 usage page, E4 는 voice/send/cancel 이다.
- Session detail 에 들어가면 keypad 는 "결정 버튼", encoder LCD 는 "읽기/스크롤" 역할로 분리한다. 긴 approval 문구를 키 타일에 억지로 넣지 않고 wide canvas 에서 읽게 한다.

### Ulanzi D200H

- 14키/5×3 구조를 살려 **overview 우선**으로 둔다. List mode 는 최대 13세션 + merged usage monitor 이고, 세션을 누르면 optionSelect 로 들어간다.
- D200H 는 실질적으로 정지 이미지 파이프라인이므로 상태 표현은 애니메이션 의존도를 낮춘다. PROCESSING 은 고정 amber ring + STOP, AWAITING 은 밝은 solid/pulse peak ring + 실제 option 버튼으로 읽힌다. D200H 세션 타일은 provider logo path 가 아니라 terrarium creature 축약형(Claude robot, Codex cloud prompt, OpenClaw crayfish, OpenCode nested square)을 그린다.
- Detail mode 는 BACK(0/13), INFO(1), options/quick actions(2-9), STOP/ESC(10), MORE(11) 의 고정 좌표를 유지한다. 손이 기억해야 하는 위험 명령은 STOP/ESC 하나뿐이다.
- 버튼 명령은 선택된 sessionId 를 기준으로 전달한다. 포커스 전환 지연 때문에 다른 세션으로 STOP/option 이 가는 일을 막는다.

## Encoders (4 slots)

| E# | Action | Rotate | Push | Touch |
|----|--------|--------|------|-------|
| E1 | Utility | Adjust value | Toggle/Action | Switch mode |
| E2 | Action | Scroll options / cycle prompts | Send prompt / Confirm | Same as push |
| E3 | Usage | Cycle pages (overview/5h/7d/session/extra) | Refresh usage data | Next page |
| E4 | Voice | Scroll text | Hold=record, tap(<500ms)=cancel, VT push=send/paste | — |

## v4 Changes from v3

- **Session-per-button**: All 8 keypad slots use `session-slot` action (v3 individual actions removed)
- **v3 actions removed**: mode-button, session-button, usage-button, response-button, stop-button, expanded-actions
- **Detail view**: Press session → BACK + INFO + options/presets + ESC/STOP layout
- **OpenClaw presets**: STATUS, MODEL (dynamic name + switch animation), GATEWAY (browser launch)
- **Agent mark**: terrarium creature miniatures; provider logos are reserved for brand/settings contexts
- **State-aware ESC/STOP**: Active=bright, idle=dimmed, always accessible on the last physical key
- **No-daemon START**: ▶ START button launches macOS app (replaces "agentdeck daemon start" text)
- **Plugin icon**: Monochrome terrarium+octopus SVG (transparent bg, white — SD convention)
