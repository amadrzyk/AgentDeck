import { EventEmitter } from 'events';
import type { Server } from 'http';
import { PtyManager } from '../pty-manager.js';
import { OutputParser } from '../output-parser.js';
import { HookServer } from '../hook-server.js';
import { debug } from '../logger.js';
import type {
  AgentAdapter,
  AgentCapabilities,
  AdapterStartOptions,
  AdapterEvent,
  PluginCommand,
} from '../types.js';
import { CLAUDE_CODE_CAPABILITIES } from '../types.js';

/**
 * Claude Code adapter — wraps PtyManager, OutputParser, HookServer.
 *
 * Emits unified AdapterEvents that the bridge wires to StateMachine/WsServer.
 * All Claude-specific logic (PTY keystroke injection, terminal regex parsing,
 * HTTP hook ingestion) is encapsulated here.
 */
export class ClaudeCodeAdapter extends EventEmitter implements AgentAdapter {
  readonly capabilities: AgentCapabilities = CLAUDE_CODE_CAPABILITIES;

  private ptyManager: PtyManager;
  private outputParser: OutputParser;
  private hookServer: HookServer;
  private port = 0;

  /** Mode switch debounce */
  private lastModeSwitchTime = 0;

  /** Callback for raw PTY data (before parsing) — used by bridge for diagnostics */
  private rawDataCallback: ((data: string) => void) | null = null;

  constructor() {
    super();
    this.ptyManager = new PtyManager();
    this.outputParser = new OutputParser();
    this.hookServer = new HookServer();
  }

  async start(options: AdapterStartOptions): Promise<void> {
    this.port = options.port;

    // 1. Start HTTP hook server
    await this.hookServer.listen(this.port);

    // 2. Wire HookServer events → AdapterEvents
    this.hookServer.on('hook', ({ event, data }: { event: string; data: Record<string, unknown> }) => {
      if (event === 'shutdown') {
        this.emitAdapterEvent({ source: 'hook', event: 'shutdown', data });
        return;
      }
      this.emitAdapterEvent({ source: 'hook', event, data });
    });

    // 3. Wire OutputParser events → AdapterEvents
    const parserEvents = [
      'spinner_start',
      'spinner_stop',
      'permission_prompt',
      'option_prompt',
      'diff_prompt',
      'idle',
      'status_line',
      'tool_action',
      'project_name',
      'model_info',
      'mode_change',
      'suggested_prompt',
      'remote_url',
    ];
    for (const eventName of parserEvents) {
      this.outputParser.on(eventName, (data?: Record<string, unknown>) => {
        this.emitAdapterEvent({ source: 'parser', event: eventName, data });
      });
    }

    // 3a. cursor_update → metadata event
    this.outputParser.on('cursor_update', (data?: Record<string, unknown>) => {
      this.emitAdapterEvent({ source: 'metadata', event: 'cursor_update', data: data ?? {} });
    });

    // 3b. usage_info → metadata event
    this.outputParser.on('usage_info', (data?: Record<string, unknown>) => {
      if (data) {
        this.emitAdapterEvent({ source: 'metadata', event: 'usage_info', data });
      }
    });

    // 3c. user_prompt → metadata event
    this.outputParser.on('user_prompt', (data?: Record<string, unknown>) => {
      const text = data?.text as string | undefined;
      if (text) {
        this.emitAdapterEvent({ source: 'metadata', event: 'user_prompt', data: { text } });
      }
    });

    // 4. Spawn Claude via PTY
    const command = options.command || 'claude';
    this.ptyManager.spawn(command, { AGENTDECK_PORT: String(this.port) });

    // 5. Feed PTY output to OutputParser + emit activity signals
    this.ptyManager.on('data', (data: string) => {
      if (this.rawDataCallback) {
        this.rawDataCallback(data);
      }
      this.outputParser.feed(data);
      this.emitAdapterEvent({ source: 'activity' });
    });

    // 6. Handle PTY exit → emit events
    this.ptyManager.on('exit', (code: number, signal: number) => {
      debug('adapter:claude', `PTY exited (code=${code}, signal=${signal})`);
      this.emitAdapterEvent({ source: 'hook', event: 'SessionEnd', data: {} });
      this.emitAdapterEvent({ source: 'connection', status: 'disconnected' });
      this.emit('exit', code, signal);
    });

    // 7. Emit initial session start + connected
    this.emitAdapterEvent({ source: 'hook', event: 'SessionStart', data: {} });
    this.emitAdapterEvent({ source: 'connection', status: 'connected' });
  }

  handleCommand(cmd: PluginCommand): boolean {
    switch (cmd.type) {
      case 'respond':
        debug('adapter:claude', `respond: "${cmd.value}"`);
        this.ptyManager.write(cmd.value + '\r');
        return true;

      case 'select_option':
        // Requires StateMachine context (navigable/cursorIndex).
        // Bridge handles the logic and calls writeInput() for PTY transport.
        return false;

      case 'navigate_option':
        // Bridge handles cursor clamping; we just handle the PTY write part.
        // But bridge also needs to update StateMachine, so return false.
        return false;

      case 'send_prompt':
        // Bridge handles template expansion, then calls writeInput().
        return false;

      case 'switch_mode': {
        const now = Date.now();
        if (now - this.lastModeSwitchTime < 100) {
          debug('adapter:claude', `switch_mode: debounced (${now - this.lastModeSwitchTime}ms < 100ms)`);
          return true;
        }
        this.lastModeSwitchTime = now;
        debug('adapter:claude', 'switch_mode: sending Shift+Tab');
        this.outputParser.notifyModeSwitchSent();
        this.ptyManager.write('\x1b[Z');
        return true;
      }

      case 'interrupt':
        this.ptyManager.interrupt();
        return true;

      case 'escape':
        debug('adapter:claude', 'escape: sending Esc');
        this.ptyManager.write('\x1b');
        return true;

      case 'voice':
      case 'query_usage':
        // Handled by bridge (VoiceManager, UsageTracker)
        return false;

      default:
        return false;
    }
  }

  writeInput(data: string): void {
    this.ptyManager.write(data);
  }

  isAlive(): boolean {
    return this.ptyManager.isAlive();
  }

  attachTerminal(stdin: NodeJS.ReadableStream, stdout: NodeJS.WritableStream): void {
    this.ptyManager.attachTerminal(stdin, stdout);
  }

  getTtyPath(): string | undefined {
    return this.ptyManager.getTtyPath();
  }

  getProjectName(): string | null {
    return this.outputParser.getProjectName();
  }

  prepareForNavigation(): void {
    this.outputParser.startInteractiveCooldown();
  }

  getHttpServer(): Server {
    return this.hookServer.getServer();
  }

  onDiag(handler: (tail?: number) => unknown): void {
    this.hookServer.onDiag(handler);
  }

  onRawData(callback: (data: string) => void): void {
    this.rawDataCallback = callback;
  }

  async shutdown(): Promise<void> {
    if (this.ptyManager.isAlive()) {
      this.ptyManager.kill();
    }
    await this.hookServer.close();
  }

  private emitAdapterEvent(evt: AdapterEvent): void {
    this.emit('event', evt);
  }
}
