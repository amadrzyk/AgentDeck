import { EventEmitter } from 'events';
import {
  State,
  PermissionMode,
  STUCK_TIMEOUT_MS,
  AWAITING_STUCK_TIMEOUT_MS,
  type StateSnapshot,
  type PromptOption,
  type StateTransition,
  transitions,
} from './types.js';
import type { BillingType } from '@agentdeck/shared';
import { UsageTracker } from './usage-tracker.js';
import { isPermissionNotification } from './awaiting-overlay.js';
import { debug } from './logger.js';

/** Extract the most useful field from tool_input for display on E4 */
function formatToolInput(toolName: string | null, input: Record<string, unknown> | undefined): string | null {
  if (!input || !toolName) return null;

  // Tool-specific key extraction
  const keyMap: Record<string, string> = {
    Bash: 'command',
    Read: 'file_path',
    Write: 'file_path',
    Edit: 'file_path',
    Glob: 'pattern',
    Grep: 'pattern',
    WebFetch: 'url',
    WebSearch: 'query',
    Task: 'prompt',
  };

  const key = keyMap[toolName];
  if (key && typeof input[key] === 'string') {
    return truncateToolInput(input[key] as string);
  }

  // Fallback: first short string value
  for (const v of Object.values(input)) {
    if (typeof v === 'string' && v.length > 0 && v.length < 200) {
      return truncateToolInput(v);
    }
  }
  return null;
}

function truncateToolInput(s: string): string {
  // Take first line, max 120 chars
  const line = s.split('\n')[0];
  return line.length > 120 ? line.slice(0, 119) + '\u2026' : line;
}

export class StateMachine extends EventEmitter {
  private state: State = State.DISCONNECTED;
  private permissionMode: PermissionMode = PermissionMode.DEFAULT;
  private currentTool: string | null = null;
  private toolInput: string | null = null;
  private toolProgress: string | null = null;
  /** True between PreToolUse and PostToolUse. A running tool (e.g. a long Bash
   *  command) makes Claude stop animating its spinner glyphs, so the PTY parser
   *  would otherwise emit `idle_detected` after SPINNER_DEBOUNCE_MS and flip the
   *  session to IDLE mid-turn. While a tool is in flight we trust the hooks over
   *  the PTY and suppress those spurious IDLE transitions. */
  private toolInFlight = false;
  private options: PromptOption[] = [];
  private question: string | null = null;
  private navigable = false;
  private cursorIndex = 0;
  private cursorAuthority: 'pty' | 'optimistic' = 'pty';
  private optimisticCursorTime = 0;
  private projectName: string | null = null;
  private modelName: string | null = null;
  private effortLevel: string | null = null;
  private remoteUrl: string | null = null;
  private billingType: BillingType = 'unknown';
  private suggestedPrompt: string | null = null;
  private lastValidSuggestedPrompt: string | null = null;
  private usageTracker: UsageTracker;
  private stuckTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(usageTracker: UsageTracker) {
    super();
    this.usageTracker = usageTracker;
  }

  handleHookEvent(eventName: string, data: Record<string, unknown>): void {
    debug('SM', `hookEvent: ${eventName} (current: ${this.state})`);
    switch (eventName) {
      case 'SessionStart':
        this.usageTracker.start();
        this.transition(State.IDLE, 'session_start', 'hook');
        break;

      case 'UserPromptSubmit':
        this.suggestedPrompt = null;
        this.lastValidSuggestedPrompt = null;
        this.transition(State.PROCESSING, 'user_prompt_submit', 'hook');
        break;

      case 'PreToolUse': {
        const toolName = (data.tool_name as string) || null;
        const toolInputData = data.tool_input as Record<string, unknown> | undefined;
        this.currentTool = toolName;
        this.toolInput = formatToolInput(toolName, toolInputData);
        this.toolProgress = `Using ${toolName}`;
        this.toolInFlight = true;
        // A tool firing means the turn is active. If the PTY path already
        // (wrongly) dropped us to IDLE — common when the previous tool's
        // spinner went quiet — re-assert PROCESSING from the authoritative hook.
        if (this.state === State.IDLE) {
          this.transition(State.PROCESSING, 'tool_use', 'hook');
        } else {
          this.emitSnapshot();
        }
        break;
      }

      case 'PostToolUse': {
        this.usageTracker.addToolCall(data);
        this.currentTool = null;
        this.toolInput = null;
        this.toolProgress = null;
        this.toolInFlight = false;
        this.emitSnapshot();
        break;
      }

      case 'Stop':
        this.currentTool = null;
        this.toolInput = null;
        this.toolProgress = null;
        this.toolInFlight = false;
        this.options = [];
        this.question = null;
        this.navigable = false;
        this.cursorIndex = 0;
        this.transition(State.IDLE, 'stop', 'hook');
        break;

      case 'SessionEnd':
        this.modelName = null;
        this.effortLevel = null;
        this.billingType = 'unknown';
        this.transition(State.DISCONNECTED, 'session_end', 'hook');
        break;

      case 'Notification': {
        if (typeof data.input_tokens === 'number' && typeof data.output_tokens === 'number') {
          this.usageTracker.addTokens(
            data.input_tokens as number,
            data.output_tokens as number,
          );
        }
        // Authoritative permission backstop. Claude Code fires
        // notification_type:"permission_prompt" ("Claude needs your permission")
        // whenever it blocks on a tool approval. The PTY parser often can't
        // recover the options here — Bash approvals lay "1. Yes / 2. No" out via
        // absolute-column ANSI positioning split across chunks, so parseOptions
        // sees a partial buffer and emits an incomplete/empty list, leaving the
        // deck with no approve buttons. When the hook signals a permission prompt
        // and we aren't already showing a usable one, synthesize the standard
        // Yes/No so the deck always has actionable buttons. A later PTY
        // permission_prompt/option_prompt refines these in place if it parses.
        //
        // Classify via isPermissionNotification (not a bare === check): some
        // approvals — notably the Bash "untrusted directory / execute hooks"
        // trust prompt from `cd … && …` — omit the structured notification_type
        // or carry a different free-text shape, which the PTY misparses as a
        // plain option_prompt (AWAITING_OPTION, empty list → "choose option"
        // card with no buttons). The free-text fallback rescues those too.
        if (isPermissionNotification(
          data.notification_type as string | undefined,
          (data.message as string) || '',
        )) {
          const haveUsablePrompt =
            this.state === State.AWAITING_PERMISSION && this.looksLikePermissionPrompt();
          if (!haveUsablePrompt) {
            this.options = [
              { index: 0, label: 'Yes', shortcut: 'y' },
              { index: 1, label: 'No', shortcut: 'n' },
            ];
            this.question = this.question || 'Do you want to proceed?';
            this.navigable = false;
            this.cursorIndex = 0;
            if (this.state !== State.AWAITING_PERMISSION) {
              this.transition(State.AWAITING_PERMISSION, 'permission_prompt', 'hook');
            } else {
              this.emitSnapshot();
            }
          }
        }
        break;
      }

      // ── Codex CLI lifecycle hooks ──
      // Installed by hooks/src/codex-install.ts into ~/.codex/config.toml.
      // Mirrors Claude semantics so the same downstream display/eval logic
      // reacts to either. Schema source: Codex CLI hook payload (stdin JSON).
      case 'codex_session_start':
        // Reuse Claude trigger labels: the state-transition contract
        // (DISCONNECTED|IDLE → IDLE for session_start, IDLE → PROCESSING
        // for user_prompt_submit) is identical, so the transitions table
        // in shared/src/states.ts doesn't need codex_*-prefixed entries.
        this.usageTracker.start();
        this.transition(State.IDLE, 'session_start', 'hook');
        break;

      case 'codex_user_prompt_submit':
        this.suggestedPrompt = null;
        this.lastValidSuggestedPrompt = null;
        this.transition(State.PROCESSING, 'user_prompt_submit', 'hook');
        break;

      case 'codex_tool_start': {
        const toolName = (data.tool_name as string) || null;
        const toolInputData = data.tool_input as Record<string, unknown> | undefined;
        this.currentTool = toolName;
        this.toolInput = formatToolInput(toolName, toolInputData);
        this.toolProgress = toolName ? `Using ${toolName}` : null;
        this.emitSnapshot();
        break;
      }

      case 'codex_tool_end': {
        this.usageTracker.addToolCall(data);
        this.currentTool = null;
        this.toolInput = null;
        this.toolProgress = null;
        this.emitSnapshot();
        break;
      }

      case 'codex_stop':
        this.currentTool = null;
        this.toolInput = null;
        this.toolProgress = null;
        this.options = [];
        this.question = null;
        this.navigable = false;
        this.cursorIndex = 0;
        this.transition(State.IDLE, 'stop', 'hook');
        break;

      case 'codex_turn_complete':
        // Notify-fallback turn-completion ping. State already at IDLE via
        // codex_stop in the normal path; this is a best-effort signal for
        // metric counters when stop hook doesn't fire (rare).
        this.emitSnapshot();
        break;

      default:
        break;
    }
  }

  handleParserEvent(eventName: string, data?: Record<string, unknown>): void {
    debug('SM', `parserEvent: ${eventName} (current: ${this.state})`);
    switch (eventName) {
      case 'permission_prompt': {
        this.options = (data?.options as PromptOption[]) || [];
        this.question = (data?.question as string) || null;
        this.navigable = (data?.navigable as boolean) ?? false;
        this.cursorIndex = (data?.cursorIndex as number) ?? 0;
        this.transition(State.AWAITING_PERMISSION, 'permission_prompt', 'pty');
        break;
      }

      case 'option_prompt': {
        this.options = (data?.options as PromptOption[]) || [];
        this.question = (data?.question as string) || null;
        this.navigable = (data?.navigable as boolean) ?? false;
        this.cursorIndex = (data?.cursorIndex as number) ?? 0;
        if (this.state === State.AWAITING_OPTION) {
          // Already in AWAITING_OPTION — just update options and re-emit snapshot
          // (debounced chunks may re-parse with more complete data)
          debug('SM', `option_prompt update: ${this.options.length} options, nav=${this.navigable}, cursor=${this.cursorIndex}`);
          this.emitSnapshot();
        } else {
          this.transition(State.AWAITING_OPTION, 'option_ui_detected', 'pty');
        }
        break;
      }

      case 'diff_prompt': {
        this.options = (data?.options as PromptOption[]) || [];
        this.transition(State.AWAITING_DIFF, 'diff_ui_detected', 'pty');
        break;
      }

      case 'suggested_prompt': {
        this.suggestedPrompt = (data?.text as string) ?? null;
        if (this.suggestedPrompt) {
          this.lastValidSuggestedPrompt = this.suggestedPrompt;
        }
        this.emitSnapshot();
        break;
      }

      case 'spinner_start':
        this.suggestedPrompt = null;
        if (this.state !== State.PROCESSING) {
          // Clean up awaiting state data if recovering from a prompt
          if (
            this.state === State.AWAITING_OPTION ||
            this.state === State.AWAITING_PERMISSION ||
            this.state === State.AWAITING_DIFF
          ) {
            this.options = [];
            this.question = null;
            this.navigable = false;
            this.cursorIndex = 0;
            this.toolInput = null;
          }
          this.transition(State.PROCESSING, 'spinner_start', 'pty');
        }
        break;

      case 'spinner_stop':
        // A tool running between PreToolUse/PostToolUse silences the spinner;
        // don't mistake that for turn completion. Trust the hooks instead.
        // Scoped to PROCESSING: in AWAITING states this handler is what exits to
        // IDLE when the user responds via keyboard, so it must not be suppressed.
        if (this.toolInFlight && this.state === State.PROCESSING) {
          debug('SM', 'spinner_stop ignored — tool in flight (PreToolUse without PostToolUse)');
          break;
        }
        // Spinner stopped — if we're in an active state, go to IDLE
        if (
          this.state === State.PROCESSING ||
          this.state === State.AWAITING_PERMISSION ||
          this.state === State.AWAITING_OPTION ||
          this.state === State.AWAITING_DIFF
        ) {
          this.currentTool = null;
          this.toolInput = null;
          this.toolProgress = null;
          this.options = [];
          this.question = null;
          this.navigable = false;
          this.cursorIndex = 0;
          this.transition(State.IDLE, 'idle_detected', 'pty');
        }
        break;

      case 'idle':
        // See spinner_stop: a tool in flight silences the spinner/prompt; the
        // turn is not done until PostToolUse. Trust the hooks over the PTY.
        // Scoped to PROCESSING (see spinner_stop) so AWAITING can still settle.
        if (this.toolInFlight && this.state === State.PROCESSING) {
          debug('SM', 'idle ignored — tool in flight (PreToolUse without PostToolUse)');
          break;
        }
        if (
          this.state === State.PROCESSING ||
          this.state === State.AWAITING_PERMISSION ||
          this.state === State.AWAITING_OPTION ||
          this.state === State.AWAITING_DIFF
        ) {
          this.currentTool = null;
          this.toolInput = null;
          this.toolProgress = null;
          this.options = [];
          this.question = null;
          this.navigable = false;
          this.cursorIndex = 0;
          this.transition(State.IDLE, 'idle_detected', 'pty');
        }
        break;

      case 'mode_change': {
        const mode = data?.mode as string | undefined;
        if (mode === 'plan') {
          this.setPermissionMode(PermissionMode.PLAN);
        } else if (mode === 'acceptEdits') {
          this.setPermissionMode(PermissionMode.ACCEPT_EDITS);
        } else {
          this.setPermissionMode(PermissionMode.DEFAULT);
        }
        break;
      }

      // --- Metadata events (don't change state, update display data) ---
      case 'status_line': {
        // Token/duration from PTY status line: "1m 0s · ↓ 1.9k tokens"
        const durationSec = data?.durationSec as number | undefined;
        const tokens = data?.tokens as number | undefined;
        if (durationSec != null) {
          this.usageTracker.setDuration(durationSec);
        }
        if (tokens != null) {
          this.usageTracker.setOutputTokens(tokens);
        }
        this.emitSnapshot();
        break;
      }

      case 'tool_action': {
        const toolName = data?.toolName as string | undefined;
        const toolArgs = data?.toolArgs as string | undefined;
        if (toolName) {
          this.currentTool = toolName;
          this.toolProgress = `Using ${toolName}`;
          // PTY args as fallback when hook data hasn't provided toolInput
          if (toolArgs && !this.toolInput) {
            this.toolInput = toolArgs;
          }
          this.usageTracker.incrementToolCalls();
          this.emitSnapshot();
        }
        break;
      }

      case 'project_name': {
        const name = data?.name as string | undefined;
        if (name) {
          this.projectName = name;
          debug('SM', `project: ${name}`);
          this.emitSnapshot();
        }
        break;
      }

      case 'model_info': {
        const model = data?.model as string | undefined;
        const plan = data?.plan as string | undefined;
        if (model) {
          this.modelName = model;
          debug('SM', `model: ${model}`);
        }
        if (plan) {
          if (/max/i.test(plan)) {
            this.billingType = 'subscription';
          } else if (/api/i.test(plan)) {
            this.billingType = 'api';
          }
          debug('SM', `billingType: ${this.billingType} (plan="${plan}")`);
        }
        if (model || plan) {
          this.emitSnapshot();
        }
        break;
      }

      case 'effort_level': {
        const level = data?.level as string | undefined;
        if (level) {
          this.effortLevel = level;
          debug('SM', `effortLevel: ${level}`);
          this.emitSnapshot();
        }
        break;
      }

      case 'remote_url': {
        const url = data?.url as string | undefined;
        if (url) {
          this.remoteUrl = url;
          debug('SM', `remoteUrl: ${url}`);
          this.emitSnapshot();
        }
        break;
      }

      default:
        break;
    }
  }

  /** Update billing type from external source (e.g., OAuth API response) if still unknown */
  inferBillingType(inferred: 'subscription' | 'api'): void {
    if (this.billingType === 'unknown') {
      this.billingType = inferred;
      debug('SM', `billingType inferred from API: ${inferred}`);
      this.emitSnapshot();
    }
  }

  handleUserAction(action: string): void {
    switch (action) {
      case 'respond':
        if (
          this.state === State.AWAITING_PERMISSION ||
          this.state === State.AWAITING_DIFF
        ) {
          this.options = [];
          this.question = null;
          this.navigable = false;
          this.cursorIndex = 0;
          this.toolInput = null;
          this.transition(State.PROCESSING, 'user_response', 'user');
        }
        break;

      case 'select_option':
        if (
          this.state === State.AWAITING_OPTION ||
          this.state === State.AWAITING_PERMISSION ||
          this.state === State.AWAITING_DIFF
        ) {
          this.options = [];
          this.question = null;
          this.navigable = false;
          this.cursorIndex = 0;
          this.toolInput = null;
          this.transition(State.PROCESSING, 'user_selection', 'user');
        }
        break;

      case 'send_prompt':
        if (this.state === State.IDLE) {
          this.suggestedPrompt = null;
          this.transition(State.PROCESSING, 'user_prompt_submit', 'hook');
        }
        break;

      case 'interrupt':
        this.currentTool = null;
        this.toolInput = null;
        this.toolProgress = null;
        this.toolInFlight = false;
        this.options = [];
        this.question = null;
        this.navigable = false;
        this.cursorIndex = 0;
        this.transition(State.IDLE, 'interrupt', 'user');
        break;

      default:
        break;
    }
  }

  transition(to: State, trigger: string, source: string): void {
    const valid = transitions.some(
      (t: StateTransition) =>
        (t.from === this.state || t.from === '*') &&
        t.to === to &&
        t.trigger === trigger,
    );

    if (!valid) {
      debug('SM', `Invalid transition blocked: ${this.state} -> ${to} (trigger: ${trigger}, source: ${source})`);
      return;
    }

    const prev = this.state;
    this.state = to;

    // Reset cursor authority when leaving AWAITING states
    if (
      prev === State.AWAITING_OPTION ||
      prev === State.AWAITING_PERMISSION ||
      prev === State.AWAITING_DIFF
    ) {
      this.cursorAuthority = 'pty';
    }

    // Manage stuck-state timer. PROCESSING recovers after STUCK_TIMEOUT_MS
    // (Claude seems hung). AWAITING_* get a much longer backstop so a
    // legitimately-long user pause isn't reset, but a parser-missed recovery
    // still can't strand the session in awaiting forever.
    this.resetStuckTimer();
    if (to === State.PROCESSING) {
      this.armStuckTimer(STUCK_TIMEOUT_MS);
    } else if (
      to === State.AWAITING_PERMISSION ||
      to === State.AWAITING_OPTION ||
      to === State.AWAITING_DIFF
    ) {
      this.armStuckTimer(AWAITING_STUCK_TIMEOUT_MS);
    }

    if (prev !== to) {
      debug('SM', `${prev} -> ${to} (trigger: ${trigger}, source: ${source})`);
      this.emitSnapshot();
    }
  }

  /** Whether the current options already form a usable yes/no permission prompt.
   *  Used to decide if the Notification permission backstop needs to synthesize
   *  default options or can leave a richer PTY-parsed prompt untouched. */
  private looksLikePermissionPrompt(): boolean {
    const labels = this.options.map((o) => o.label.toLowerCase());
    return labels.some((l) => /^yes\b/.test(l)) && labels.some((l) => /^no\b/.test(l));
  }

  /** Reset the stuck timer on PTY activity. PROCESSING uses the short hang
   *  timeout; AWAITING_* use the long backstop. Re-arming on activity makes the
   *  backstop "N minutes of genuine silence" rather than a hard cap from entry,
   *  so a still-rendering prompt the user is actively reading isn't reset. */
  onPtyActivity(): void {
    if (!this.stuckTimer) return;
    if (this.state === State.PROCESSING) {
      debug('SM', 'PTY activity — resetting PROCESSING stuck timer');
      this.armStuckTimer(STUCK_TIMEOUT_MS);
    } else if (
      this.state === State.AWAITING_PERMISSION ||
      this.state === State.AWAITING_OPTION ||
      this.state === State.AWAITING_DIFF
    ) {
      debug('SM', 'PTY activity — resetting AWAITING stuck timer');
      this.armStuckTimer(AWAITING_STUCK_TIMEOUT_MS);
    }
  }

  /** (Re)arm the stuck-state backstop. On fire, clears tool/prompt metadata and
   *  recovers to IDLE — the safe terminal state for any hung/abandoned state. */
  private armStuckTimer(timeoutMs: number): void {
    this.resetStuckTimer();
    const fromState = this.state;
    this.stuckTimer = setTimeout(() => {
      debug('SM', `Stuck timeout: ${fromState} for >${timeoutMs / 1000}s, recovering to IDLE`);
      this.currentTool = null;
      this.toolInput = null;
      this.toolProgress = null;
      // Clear the in-flight guard so a missed PostToolUse can't wedge the next
      // turn — the stuck timer is the backstop for exactly that lost hook.
      this.toolInFlight = false;
      this.options = [];
      this.question = null;
      this.navigable = false;
      this.cursorIndex = 0;
      this.transition(State.IDLE, 'stuck_timeout', 'internal');
    }, timeoutMs);
  }

  private resetStuckTimer(): void {
    if (this.stuckTimer) {
      clearTimeout(this.stuckTimer);
      this.stuckTimer = null;
    }
  }

  private emitSnapshot(): void {
    this.emit('state_changed', this.getSnapshot());
  }

  /** Update cursor index with source discrimination to prevent race conditions.
   *  'optimistic' — from StreamDeck dial navigation (immediate, may be overridden by PTY)
   *  'pty' — from parser cursor_update (authoritative, but may be stale during rapid navigation)
   */
  updateCursorIndex(idx: number, source: 'pty' | 'optimistic' = 'pty'): void {
    if (source === 'optimistic') {
      this.cursorIndex = idx;
      this.cursorAuthority = 'optimistic';
      this.optimisticCursorTime = Date.now();
      this.emitSnapshot();
    } else {
      // PTY confirmation: always accept unless very recent optimistic update
      const elapsed = Date.now() - this.optimisticCursorTime;
      if (this.cursorAuthority === 'pty' || elapsed > 200) {
        this.cursorIndex = idx;
        this.cursorAuthority = 'pty';
        this.emitSnapshot();
      }
      // else: suppress stale PTY value (optimistic update is fresher)
    }
  }

  getCursorIndex(): number {
    return this.cursorIndex;
  }

  getOptionsCount(): number {
    return this.options.length;
  }

  getSnapshot(): StateSnapshot {
    const usage = this.usageTracker.getSnapshot();
    return {
      state: this.state,
      permissionMode: this.permissionMode,
      currentTool: this.currentTool,
      toolInput: this.toolInput,
      toolProgress: this.toolProgress,
      options: this.options,
      question: this.question,
      navigable: this.navigable,
      cursorIndex: this.cursorIndex,
      projectName: this.projectName,
      modelName: this.modelName,
      effortLevel: this.effortLevel,
      billingType: this.billingType,
      sessionDurationSec: usage.sessionDurationSec,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      toolCalls: usage.toolCalls,
      estimatedCostUsd: usage.estimatedCostUsd,
      sessionPercent: usage.sessionPercent,
      costSpent: usage.costSpent,
      costLimit: usage.costLimit,
      resetTime: usage.resetTime,
      resetDate: usage.resetDate,
      suggestedPrompt: this.suggestedPrompt,
      remoteUrl: this.remoteUrl,
    };
  }

  setPermissionMode(mode: PermissionMode): void {
    this.permissionMode = mode;
    this.emitSnapshot();
  }

  getState(): State {
    return this.state;
  }

  /** Get last valid suggested prompt (for reconnection recovery when suggestedPrompt is already null) */
  getLastValidSuggestedPrompt(): string | null {
    return this.lastValidSuggestedPrompt;
  }
}
