/**
 * BridgeLogStream — no-op stub.
 *
 * Earlier versions spawned `openclaw logs --follow --json` and converted every
 * log line into a Timeline entry. The OpenClaw Gateway adapter
 * (bridge/src/adapters/openclaw.ts) already emits chat_start, chat_end,
 * tool_request, tool_resolved, and error timeline entries directly from
 * Gateway RPC events, so the log-tail path was producing duplicates plus a
 * lot of noise (benign log lines containing words like "command" or "memory"
 * were being misclassified as tool_exec / memory_recall via broad fallback
 * regexes in shared/src/timeline.ts).
 *
 * Apple's in-process daemon (apple/AgentDeck/Daemon/Timeline/BridgeLogStream.swift)
 * already converted to a no-op stub for the same reason. This Node.js side now
 * matches that shape — the class is retained so existing wireup in
 * bridge/src/index.ts and bridge/src/daemon-server.ts compiles unchanged.
 */
import { EventEmitter } from 'events';

export class BridgeLogStream extends EventEmitter {
  start(): void {
    /* no-op — Gateway adapter is the timeline source */
  }

  stop(): void {
    /* no-op */
  }

  isRunning(): boolean {
    return false;
  }

  trackToolRequest(_raw: string): void {
    /* no-op — dedup against log-stream tool_exec is no longer needed */
  }
}
