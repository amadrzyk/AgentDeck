import { CodexOutputParser } from '../codex-output-parser.js';
import { debug } from '../logger.js';
import type { AgentCapabilities, PluginCommand } from '../types.js';
import { CODEX_CLI_CAPABILITIES } from '../types.js';
import { PtyAdapter } from './pty-adapter.js';

/**
 * Codex CLI adapter — extends PtyAdapter with Codex-specific output parsing.
 *
 * Codex CLI uses Ink (React-based TUI) for rendering. Unlike Claude Code,
 * it has no HTTP hook system — all state tracking comes from PTY output parsing.
 */
export class CodexCliAdapter extends PtyAdapter {
  readonly capabilities: AgentCapabilities = CODEX_CLI_CAPABILITIES;

  private outputParser: CodexOutputParser;

  constructor() {
    super();
    this.outputParser = new CodexOutputParser();
  }

  protected getDefaultCommand(): string {
    return 'codex';
  }

  protected wireOutputParser(): void {
    // Parser events → AdapterEvents
    const parserEvents = [
      'spinner_start',
      'spinner_stop',
      'permission_prompt',
      'idle',
      'tool_action',
      'project_name',
      'model_info',
    ];
    for (const eventName of parserEvents) {
      this.outputParser.on(eventName, (data?: Record<string, unknown>) => {
        this.emitAdapterEvent({ source: 'parser', event: eventName, data });
      });
    }
  }

  protected feedParser(data: string): void {
    this.outputParser.feed(data);
  }

  protected handleAgentCommand(_cmd: PluginCommand): boolean {
    // No agent-specific commands in Phase 1
    // Phase 2: could handle mode switching via /permissions slash command
    return false;
  }

  override getProjectName(): string | null {
    return this.outputParser.getProjectName();
  }

  /** Exposed for SSE broadcasting from bridge index (alias for getHookServer) */
  getCodexHookServer() {
    return this.getHookServer();
  }
}
