import { EventEmitter } from 'events';
import type { Server } from 'http';
import { HookServer } from '../hook-server.js';
import { debug } from '../logger.js';
import type {
  AgentAdapter,
  AgentCapabilities,
  AdapterStartOptions,
  AdapterEvent,
  PluginCommand,
} from '../types.js';
import { MONITOR_CAPABILITIES } from '../types.js';

/**
 * Monitor adapter — hook-only bridge with no PTY.
 *
 * Usage: `agentdeck monitor [--port 9120]`
 * User runs `AGENTDECK_PORT=<port> claude` separately.
 *
 * Capabilities: state transitions, tool tracking, prompt capture, usage, timeline.
 * Not available: option lists, diff review, mode detection, cursor navigation.
 */
export class MonitorAdapter extends EventEmitter implements AgentAdapter {
  readonly capabilities: AgentCapabilities = MONITOR_CAPABILITIES;

  private hookServer: HookServer;
  private port = 0;

  constructor() {
    super();
    this.hookServer = new HookServer();
  }

  async start(options: AdapterStartOptions): Promise<void> {
    this.port = options.port;

    // Start HTTP hook server to receive Claude Code hooks
    await this.hookServer.listen(this.port);

    // Wire HookServer events → AdapterEvents
    this.hookServer.on('hook', ({ event, data }: { event: string; data: Record<string, unknown> }) => {
      if (event === 'shutdown') {
        this.emitAdapterEvent({ source: 'hook', event: 'shutdown', data });
        return;
      }
      this.emitAdapterEvent({ source: 'hook', event, data });
    });

    // Monitor starts in "waiting for hooks" mode
    debug('adapter:monitor', `Hook server listening on port ${this.port}`);
    debug('adapter:monitor', `Run: AGENTDECK_PORT=${this.port} claude`);

    // Emit connected — monitor is always "alive" (it's the hook receiver)
    this.emitAdapterEvent({ source: 'connection', status: 'connected' });
  }

  handleCommand(cmd: PluginCommand): boolean {
    // Monitor has no PTY — cannot handle any transport commands
    switch (cmd.type) {
      case 'query_usage':
      case 'voice':
        return false; // Handled by bridge
      default:
        debug('adapter:monitor', `Command ${cmd.type} not supported in monitor mode`);
        return false;
    }
  }

  writeInput(_data: string): void {
    debug('adapter:monitor', 'writeInput() called but monitor has no PTY — dropped');
  }

  isAlive(): boolean {
    return true; // Monitor is always "alive"
  }

  attachTerminal(_stdin: NodeJS.ReadableStream, _stdout: NodeJS.WritableStream): void {
    // No-op: monitor has no PTY
  }

  getTtyPath(): string | undefined {
    return undefined;
  }

  getProjectName(): string | null {
    return null;
  }

  getHttpServer(): Server {
    return this.hookServer.getServer();
  }

  onDiag(handler: (tail?: number) => unknown): void {
    this.hookServer.onDiag(handler);
  }

  onRawData(_callback: (data: string) => void): void {
    // No raw data in monitor mode
  }

  async shutdown(): Promise<void> {
    await this.hookServer.close();
  }

  /** Get the hook server for external wiring (SSE, voice, etc.) */
  getHookServer(): HookServer {
    return this.hookServer;
  }

  private emitAdapterEvent(evt: AdapterEvent): void {
    this.emit('event', evt);
  }
}
