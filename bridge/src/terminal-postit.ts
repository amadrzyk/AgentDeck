/**
 * Terminal Post-it — updates tab title, iTerm2 badge, and user variables
 * to reflect the current agent session state.
 *
 * Layer 1: Tab title (OSC 1) — works in all terminals
 * Layer 2: iTerm2 badge (OSC 1337 SetBadgeFormat) — post-it style
 * Layer 3: iTerm2 user variables (OSC 1337 SetUserVar) — for StatusBar
 *
 * Badge sizing: iTerm2 has NO escape sequence to control badge size/color.
 * We use Dynamic Profiles to create a child profile with fixed badge
 * dimensions, then switch to it via SetProfile escape sequence.
 */

import { State } from './types.js';
import type { StateSnapshot } from './types.js';
import { summarizeSessionContext } from './timeline-summarizer.js';
import { debug } from './logger.js';
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// State → icon mapping
const STATE_ICON: Record<string, string> = {
  [State.PROCESSING]: '●',
  [State.IDLE]: '◇',
  [State.AWAITING_PERMISSION]: '⚠',
  [State.AWAITING_OPTION]: '?',
  [State.AWAITING_DIFF]: '△',
  [State.DISCONNECTED]: '✗',
};

// Tool → short verb for story
const TOOL_VERB: Record<string, string> = {
  Read: '읽기',
  Edit: '수정',
  Write: '생성',
  Bash: '실행',
  Grep: '검색',
  Glob: '탐색',
  Agent: '에이전트',
  WebSearch: '웹검색',
  WebFetch: '웹조회',
};

interface ToolCallRecord {
  tool: string;
  input: string | null;
  time: number;
}

interface StoryEntry {
  time: number;
  text: string;
}

const MAX_STORY = 6;          // max lines in badge story
const MAX_TOOL_HISTORY = 20;  // max tool calls for LLM context
const DEDUP_MS = 2000;        // suppress duplicate tool within 2s
const SUMMARIZE_DEBOUNCE_MS = 5000; // debounce LLM summarization
const TOOL_COUNT_TRIGGER = 5; // summarize every N tool calls

// Dynamic Profile constants
const DYNAMIC_PROFILE_NAME = 'AgentDeck Postit';
const DYNAMIC_PROFILE_DIR = join(
  homedir(),
  'Library', 'Application Support', 'iTerm2', 'DynamicProfiles',
);
const DYNAMIC_PROFILE_PATH = join(DYNAMIC_PROFILE_DIR, 'agentdeck.json');

// Badge sizing — fractions of terminal (0~1).
// Small fractions = small badge = text doesn't grow with terminal.
const BADGE_MAX_WIDTH_FRACTION = 0.5;
const BADGE_MAX_HEIGHT_FRACTION = 0.05;

export class TerminalPostit {
  private stdout: NodeJS.WritableStream;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private inTmux: boolean;
  private story: StoryEntry[] = [];
  private lastTool: string | null = null;
  private lastToolTime = 0;
  private lastState: State | null = null;
  private lastSnapshot: StateSnapshot | null = null;
  private originalProfile: string | null = null;
  private profileInstalled = false;

  // LLM summarization state
  private toolHistory: ToolCallRecord[] = [];
  private toolCountSinceLastSummary = 0;
  private llmSummary: string | null = null;
  private summarizeTimer: ReturnType<typeof setTimeout> | null = null;
  private summarizing = false;
  private lastProjectName: string | null = null;

  constructor(stdout: NodeJS.WritableStream) {
    this.stdout = stdout;
    this.inTmux = !!process.env.TMUX;
    this.installDynamicProfile();
  }

  update(snapshot: StateSnapshot): void {
    this.recordStory(snapshot);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.render(snapshot), 200);
  }

  cleanup(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.summarizeTimer) {
      clearTimeout(this.summarizeTimer);
      this.summarizeTimer = null;
    }
    // Clear badge + user vars
    this.writeOsc('\x1b]1;\x07');
    this.writeIterm('\x1b]1337;SetBadgeFormat=\x07');
    this.writeIterm(`\x1b]1337;SetUserVar=agentdeck_state=${b64('')}\x07`);
    this.writeIterm(`\x1b]1337;SetUserVar=agentdeck_project=${b64('')}\x07`);
    this.writeIterm(`\x1b]1337;SetUserVar=agentdeck_tool=${b64('')}\x07`);
    // Restore original profile and remove dynamic profile
    this.uninstallDynamicProfile();
  }

  // ===== Dynamic Profile (badge size/color control) =====

  /**
   * Create a Dynamic Profile that inherits from the user's current profile
   * but overrides badge dimensions and color. Then switch to it.
   *
   * iTerm2 watches ~/Library/Application Support/iTerm2/DynamicProfiles/
   * and hot-reloads JSON files. SetProfile escape sequence switches the session.
   */
  private installDynamicProfile(): void {
    this.originalProfile = process.env.ITERM_PROFILE || null;
    const parentName = this.originalProfile || 'Default';

    const profile: Record<string, unknown> = {
      Name: DYNAMIC_PROFILE_NAME,
      Guid: 'agentdeck-postit-dynamic-profile',
      'Dynamic Profile Parent Name': parentName,
      // Badge sizing — small fractions keep badge compact
      'Badge Max Width': BADGE_MAX_WIDTH_FRACTION,
      'Badge Max Height': BADGE_MAX_HEIGHT_FRACTION,
      'Badge Top Margin': 10,
      'Badge Right Margin': 10,
      // Warm amber post-it color
      'Badge Color': {
        'Red Component': 1.0,
        'Green Component': 0.757,
        'Blue Component': 0.027,
        'Alpha Component': 0.5,
        'Color Space': 'sRGB',
      },
    };

    try {
      mkdirSync(DYNAMIC_PROFILE_DIR, { recursive: true });
      writeFileSync(
        DYNAMIC_PROFILE_PATH,
        JSON.stringify({ Profiles: [profile] }, null, 2),
      );
      // Give iTerm2 a moment to detect the new profile, then switch
      setTimeout(() => {
        this.writeIterm(`\x1b]1337;SetProfile=${DYNAMIC_PROFILE_NAME}\x07`);
      }, 300);
      this.profileInstalled = true;
      debug('postit', `Dynamic profile installed, parent="${parentName}"`);
    } catch (err) {
      debug('postit', `Failed to install dynamic profile: ${err}`);
      // Non-fatal — badge will just use default sizing
    }
  }

  private uninstallDynamicProfile(): void {
    // Switch back to original profile first
    if (this.originalProfile) {
      this.writeIterm(`\x1b]1337;SetProfile=${this.originalProfile}\x07`);
    }
    // Remove dynamic profile file
    if (this.profileInstalled) {
      try {
        unlinkSync(DYNAMIC_PROFILE_PATH);
        debug('postit', 'Dynamic profile removed');
      } catch {
        // File may already be gone
      }
      this.profileInstalled = false;
    }
  }

  // ===== Story accumulator =====

  private recordStory(snapshot: StateSnapshot): void {
    const now = Date.now();
    this.lastProjectName = snapshot.projectName ?? 'AgentDeck';

    // Tool call → story entry + tool history (dedup same tool within 2s)
    if (snapshot.state === State.PROCESSING && snapshot.currentTool) {
      const toolKey = `${snapshot.currentTool}:${snapshot.toolInput ?? ''}`;
      if (toolKey !== this.lastTool || now - this.lastToolTime > DEDUP_MS) {
        const verb = TOOL_VERB[snapshot.currentTool] ?? snapshot.currentTool;
        const target = extractTarget(snapshot.currentTool, snapshot.toolInput);
        const text = target ? `${verb} ${target}` : verb;
        this.pushStory(now, text);
        this.lastTool = toolKey;
        this.lastToolTime = now;

        // Accumulate for LLM summarization
        const inputForLLM = extractLLMInput(snapshot.currentTool, snapshot.toolInput);
        this.toolHistory.push({ tool: snapshot.currentTool, input: inputForLLM, time: now });
        if (this.toolHistory.length > MAX_TOOL_HISTORY) {
          this.toolHistory = this.toolHistory.slice(-MAX_TOOL_HISTORY);
        }
        this.toolCountSinceLastSummary++;

        if (this.toolCountSinceLastSummary >= TOOL_COUNT_TRIGGER) {
          this.scheduleSummarize();
        }
      }
    }

    // State transitions → story markers + summarization trigger
    if (snapshot.state !== this.lastState) {
      const prev = this.lastState;
      this.lastState = snapshot.state;

      if (snapshot.state === State.AWAITING_PERMISSION) {
        const q = truncate(snapshot.question, 30);
        this.pushStory(now, q ? `⚠ 권한 요청: ${q}` : '⚠ 권한 요청');
      } else if (snapshot.state === State.IDLE && prev === State.PROCESSING) {
        // Don't push a generic "완료" entry — the summary or last tool is more useful.
        // Just trigger LLM summarization so the badge gets a real description.
        if (this.toolHistory.length > 0) {
          this.scheduleSummarize();
        }
      }
    }
  }

  private pushStory(time: number, text: string): void {
    this.story.push({ time, text });
    if (this.story.length > MAX_STORY) {
      this.story = this.story.slice(-MAX_STORY);
    }
  }

  // ===== LLM Summarization =====

  private scheduleSummarize(): void {
    if (this.summarizeTimer) clearTimeout(this.summarizeTimer);
    this.summarizeTimer = setTimeout(() => {
      this.summarizeTimer = null;
      void this.runSummarize();
    }, SUMMARIZE_DEBOUNCE_MS);
  }

  private async runSummarize(): Promise<void> {
    if (this.summarizing || this.toolHistory.length === 0) return;
    this.summarizing = true;
    this.toolCountSinceLastSummary = 0;

    try {
      const result = await summarizeSessionContext(
        this.toolHistory.map(tc => ({ tool: tc.tool, input: tc.input })),
        this.lastProjectName ?? 'AgentDeck',
      );
      if (result) {
        this.llmSummary = result;
        debug('postit', `LLM summary: ${result}`);
        if (this.lastState) {
          this.render({
            state: this.lastState,
            projectName: this.lastProjectName,
          } as StateSnapshot);
        }
      }
    } catch {
      // Non-blocking — heuristic fallback continues
    } finally {
      this.summarizing = false;
    }
  }

  /** Heuristic fallback: summarize from most-edited files */
  private getHeuristicSummary(): string | null {
    if (this.toolHistory.length === 0) return null;

    const fileCounts = new Map<string, number>();
    for (const tc of this.toolHistory) {
      if (['Edit', 'Write', 'Read'].includes(tc.tool) && tc.input) {
        const fname = tc.input.split('/').pop() ?? tc.input;
        fileCounts.set(fname, (fileCounts.get(fname) ?? 0) + 1);
      }
    }

    if (fileCounts.size === 0) {
      const last = this.toolHistory[this.toolHistory.length - 1];
      const verb = TOOL_VERB[last.tool] ?? last.tool;
      return `${verb} 작업 중`;
    }

    const sorted = [...fileCounts.entries()].sort((a, b) => b[1] - a[1]);
    const topFiles = sorted.slice(0, 2).map(([f]) => f).join(', ');
    return `${topFiles} 수정 중`;
  }

  // ===== Render =====

  private render(snapshot: StateSnapshot): void {
    this.lastSnapshot = snapshot;
    const icon = STATE_ICON[snapshot.state] ?? '◇';
    const project = snapshot.projectName ?? 'AgentDeck';
    const detail = this.getDetail(snapshot);

    // Layer 1: Tab title
    const title = detail
      ? `${icon} ${project} | ${detail}`
      : `${icon} ${project}`;
    this.writeOsc(`\x1b]1;${title}\x07`);

    // Layer 2: iTerm2 badge — clean post-it text
    const badge = this.buildBadge(snapshot, project);
    this.writeIterm(`\x1b]1337;SetBadgeFormat=${b64(badge)}\x07`);

    // Layer 3: iTerm2 user variables
    this.writeIterm(`\x1b]1337;SetUserVar=agentdeck_state=${b64(snapshot.state)}\x07`);
    this.writeIterm(`\x1b]1337;SetUserVar=agentdeck_project=${b64(project)}\x07`);
    this.writeIterm(`\x1b]1337;SetUserVar=agentdeck_tool=${b64(snapshot.currentTool ?? '')}\x07`);
  }

  private buildBadge(snapshot: StateSnapshot, project: string): string {
    const lines: string[] = [];

    // Header: folder + project name
    lines.push(`📂 ${project}`);

    // Summary line — always prefer actual description over generic status
    const summary = this.llmSummary ?? this.getHeuristicSummary();
    if (summary) {
      lines.push(summary);
    } else if (snapshot.state === State.AWAITING_PERMISSION) {
      lines.push(`⚠ ${truncate(snapshot.question, 28) ?? '권한 대기'}`);
    } else if (snapshot.state === State.PROCESSING) {
      lines.push('처리 중...');
    }
    // IDLE with no summary = no status line (header alone is enough)

    // Activity log — absolute time (HH:MM)
    if (this.story.length > 0) {
      lines.push('');
      const recent = this.story.slice(-3);
      for (const entry of recent) {
        lines.push(`${formatTime(entry.time)}  ${entry.text}`);
      }
    }

    return lines.join('\n');
  }

  private getDetail(snapshot: StateSnapshot): string | null {
    switch (snapshot.state) {
      case State.PROCESSING: {
        if (snapshot.currentTool) {
          const input = truncate(snapshot.toolInput, 40);
          return input ? `${snapshot.currentTool} ${input}` : snapshot.currentTool;
        }
        return null;
      }
      case State.IDLE:
        return snapshot.modelName ?? null;
      case State.AWAITING_PERMISSION:
      case State.AWAITING_OPTION:
      case State.AWAITING_DIFF:
        return truncate(snapshot.question, 50) ?? snapshot.state;
      default:
        return null;
    }
  }

  private writeOsc(seq: string): void {
    this.stdout.write(seq);
  }

  private writeIterm(seq: string): void {
    if (this.inTmux) {
      this.stdout.write(`\x1bPtmux;\x1b${seq}\x1b\\`);
    } else {
      this.stdout.write(seq);
    }
  }
}

function b64(s: string): string {
  return Buffer.from(s, 'utf-8').toString('base64');
}

function truncate(s: string | null, max: number): string | null {
  if (!s) return null;
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** Extract meaningful target from tool input */
function extractTarget(tool: string, input: string | null): string | null {
  if (!input) return null;
  if (['Read', 'Edit', 'Write'].includes(tool)) {
    const parts = input.split('/');
    return parts[parts.length - 1] ?? input;
  }
  if (tool === 'Bash') return truncate(input, 30);
  if (tool === 'Grep' || tool === 'Glob') return truncate(input, 25);
  return truncate(input, 25);
}

/** Extract concise input for LLM context */
function extractLLMInput(tool: string, input: string | null): string | null {
  if (!input) return null;
  if (['Read', 'Edit', 'Write'].includes(tool)) {
    const parts = input.split('/');
    return parts.slice(-3).join('/');
  }
  if (tool === 'Bash') return input.length > 60 ? input.slice(0, 57) + '...' : input;
  if (tool === 'Grep' || tool === 'Glob') return input.length > 40 ? input.slice(0, 37) + '...' : input;
  return input.length > 40 ? input.slice(0, 37) + '...' : input;
}

/** Format timestamp as HH:MM */
function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
