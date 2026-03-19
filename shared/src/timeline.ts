/**
 * Shared timeline types and log parser for OpenClaw mode.
 * Used by both bridge (BridgeLogStream) and plugin (LogStream).
 */

export type TimelineEntryType =
  | 'tool_request' | 'tool_resolved' | 'chat_start' | 'chat_end'
  | 'chat_response' | 'error' | 'scheduled' | 'user_action'
  | 'model_call' | 'model_response' | 'memory_recall' | 'tool_exec';

export interface TimelineEntry {
  ts: number;
  type: TimelineEntryType;
  raw: string;
  detail?: string;
  approvalId?: string;
  status?: 'pending' | 'approved' | 'denied';
  agentType?: string;
}

/**
 * Extract a human-readable summary from a raw OpenClaw log message.
 * Strips JSON prefixes, key=value noise, and extracts error descriptions.
 */
function extractReadableMessage(message: string): string {
  let cleaned = message;

  // If entire message is a JSON object, extract error field
  if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed.error) cleaned = String(parsed.error);
      else cleaned = JSON.stringify(parsed).slice(0, 200);
    } catch { /* not valid JSON, continue with regex strip */ }
  }

  // Strip leading JSON object fragments: {"subsystem":"diagnostic"} ...
  cleaned = cleaned.replace(/^\{[^}]*\}\s*/, '');

  // Strip [subsystem] prefix: "[tools] read failed..." → "read failed..."
  const bracketMatch = cleaned.match(/^\[(\w+)\]\s*(.*)/);
  const contextTag = bracketMatch ? bracketMatch[1] : null;
  if (bracketMatch) cleaned = bracketMatch[2];

  // Extract error= quoted value if present: error="FailoverError: LLM request timed out."
  const errorMatch = cleaned.match(/error="([^"]+)"/);
  if (errorMatch) {
    // Also extract lane/context if available
    const laneMatch = cleaned.match(/lane=(\S+)/);
    const lane = laneMatch ? `[${laneMatch[1]}] ` : (contextTag ? `[${contextTag}] ` : '');
    cleaned = `${lane}${errorMatch[1]}`;
  } else {
    // For ENOENT/file errors: extract the file path and simplify
    const enoentMatch = cleaned.match(/ENOENT:.*?['"]([^'"]+)['"]/);
    if (enoentMatch) {
      const filePath = enoentMatch[1];
      // Show just filename or last 2 path components
      const shortPath = filePath.split('/').slice(-2).join('/');
      cleaned = `파일 없음: ${shortPath}`;
    } else {
      // Strip key=value pairs that are noise (conn=..., durationMs=...)
      cleaned = cleaned
        .replace(/\b(conn|durationMs|stateVersion|seq)=\S+/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }
  }

  // Truncate
  if (cleaned.length > 500) cleaned = cleaned.slice(0, 497) + '...';
  return cleaned || message.slice(0, 500);
}

/**
 * Clean detail text — strip markdown artifacts, JSON blobs, and system noise.
 * Applied to timeline entry `detail` fields before storage.
 */
export function cleanDetailText(text: string): string {
  if (!text) return text;

  // If entire text is a JSON object, extract readable message
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      // System JSON blobs (connectionId, status codes, etc.) → filter
      if (parsed.connectionId || parsed.stateVersion || parsed.seq) return '';
      if (parsed.error) return String(parsed.error);
      // Other JSON → compact readable form
      return JSON.stringify(parsed).slice(0, 200);
    } catch { /* not valid JSON, continue */ }
  }

  let cleaned = text;

  // Strip code fences: ```lang\n...\n``` → contents
  cleaned = cleaned.replace(/```[\w]*\n?([\s\S]*?)```/g, '$1');

  // Strip bold: **text** → text
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
  // Strip italic: *text* or _text_ (but not __dunder__)
  cleaned = cleaned.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1');

  // Strip headings: ## heading → heading
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');

  // Strip blockquotes: > text → text
  cleaned = cleaned.replace(/^>\s+/gm, '');

  // Strip markdown links: [text](url) → text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Strip list markers: - item or * item → item (only at line start)
  cleaned = cleaned.replace(/^[-*]\s+/gm, '');

  // Strip inline code backticks: `code` → code
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

  // Collapse multiple blank lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

/** Parse a single JSON log line into a TimelineEntry, or null if unrecognized. */
export function parseLogLine(json: unknown): TimelineEntry | null {
  if (!json || typeof json !== 'object') return null;
  const obj = json as Record<string, unknown>;

  // ===== OpenClaw logs --json format =====
  // { type: "log", time: "ISO", level: "info|debug", message: "...", subsystem?: "...", module?: "...", raw: "..." }
  const message = (obj.message as string | undefined) || (obj.msg as string | undefined) || '';
  const subsystem = obj.subsystem as string | undefined;
  const module_ = obj.module as string | undefined;

  // Parse timestamp: ISO string (OpenClaw) or numeric
  let ts: number;
  const timeStr = obj.time as string | undefined;
  if (timeStr && typeof timeStr === 'string') {
    const parsed = new Date(timeStr).getTime();
    ts = isNaN(parsed) ? Date.now() : parsed;
  } else {
    ts = (obj.ts as number) || (obj.timestamp as number) || Date.now();
  }

  // ===== Legacy structured format (backward compat) =====
  const action = obj.action as string | undefined;
  const model = obj.model as string | undefined;
  const tool = obj.tool as string | undefined;
  const component = obj.component as string | undefined;
  const tokens = obj.tokens as number | undefined;

  // Model inference start/complete (legacy structured) — suppressed
  // Adapter generates richer chat_start/chat_end with prompt, duration, tool summary
  if (model && (action === 'start' || action === 'request' || action === 'complete' || action === 'done' || action === 'response')) {
    return null;
  }

  // Memory / recall (legacy structured)
  if (component === 'memory' || action === 'recall' || action === 'search') {
    const query = (obj.query as string) || message || 'memory search';
    return {
      ts, type: 'memory_recall',
      raw: `Memory: ${query}`,
      detail: query.length > 50 ? query : undefined,
    };
  }

  // Tool execution (legacy structured)
  if (tool || (component === 'tool' && action)) {
    const toolName = tool || action || 'tool';
    const toolDetail = (obj.detail as string) || (obj.command as string) || '';
    const toolRaw = toolDetail ? `${toolName}: ${toolDetail}` : toolName;
    return {
      ts, type: 'tool_exec',
      raw: toolRaw.length > 500 ? toolRaw.slice(0, 497) + '...' : toolRaw,
      detail: toolDetail.length > 100 ? (toolDetail.length > 1000 ? toolDetail.slice(0, 997) + '...' : toolDetail) : undefined,
    };
  }

  // ===== OpenClaw message-text based matching =====
  if (!message) return null;

  // Gateway WS subsystem: all RPC events are redundant with adapter-generated timeline
  // (chat.send → chat_start, chat.abort → chat_end, exec.approval.resolve → tool_resolved)
  if (subsystem === 'gateway/ws') return null;

  // Skip noisy infrastructure messages
  if (message.startsWith('- agent:main:') && message.includes(' ago)')) return null;
  if (message.startsWith('Agents:') || message.startsWith('Session store')) return null;
  if (message.startsWith('Heartbeat interval:') || message.startsWith('WhatsApp:') || message.startsWith('LINE:')) return null;
  if (message.startsWith('Web Channel:') || message.startsWith('Run "openclaw')) return null;
  if (message.includes('web gateway heartbeat') || module_ === 'web-heartbeat') return null;
  if (module_ === 'cron' || message.includes('cron:')) return null;
  // Skip hook registration and session setup noise
  if (/\bRegistered hook\b/i.test(message)) return null;
  if (/\bSession (store|restored|loaded)\b/i.test(message)) return null;
  // Skip diagnostic noise, but keep errors
  if (subsystem === 'diagnostic' && !/\b(error|fail|timed?\s*out)\b/i.test(message)) return null;

  // Skip transient/retriable errors that agents handle internally
  if (/\b(web_fetch|http_request|fetch)\b/i.test(message) &&
      /\b(timed?\s*out|ECONNREFUSED|ECONNRESET|ETIMEDOUT|retry|retrying)\b/i.test(message)) {
    return null;
  }

  // Skip web_fetch/browser tool failures (404, generic fetch, tab errors) — agents handle internally
  if (/\bweb_fetch failed\b/i.test(message) && /\b(404|403)\b/.test(message)) {
    return null;
  }
  if (/\bweb_fetch failed:\s*fetch failed\b/i.test(message)) {
    return null;
  }
  if (/\bbrowser failed:\s*tab not found\b/i.test(message)) {
    return null;
  }
  // Skip browser sandbox configuration messages (setting issue, not runtime error)
  if (/\bSandbox browser is unavailable\b/i.test(message)) {
    return null;
  }

  // Skip tool errors that agents retry internally (edit mismatch, EISDIR, ENOENT on memory)
  if (/\bedit failed:\s*Could not find the exact text\b/i.test(message)) {
    return null;
  }
  if (/\bread failed\b/i.test(message) && /\bEISDIR\b/.test(message)) {
    return null;
  }
  if (/\bread failed\b/i.test(message) && /\bENOENT\b/.test(message) &&
      /workspace\/memory\//i.test(message)) {
    return null;
  }

  // Skip failover cascade noise — the initial timeout/error is already shown
  if (/\bProfile\s+\S+\s+timed out\b/i.test(message) ||
      /\bFailoverError:\s+LLM request timed out\b/i.test(message)) {
    return null;
  }

  // Messaging channel infrastructure detection — only filter when from known infra subsystems/modules
  // (avoid filtering user-facing messages that mention "whatsapp" etc.)
  const isChannelInfra = subsystem === 'channel' || module_ === 'whatsapp' || module_ === 'line'
    || module_ === 'web-channel' || subsystem === 'messaging';

  // Skip transient network_error — only from known infra subsystems (not user-facing tool errors)
  if (/\bnetwork_error\b/i.test(message) &&
      (subsystem === 'gateway/ws' || subsystem === 'diagnostic' || module_ === 'web-heartbeat' || isChannelInfra)) {
    return null;
  }
  if (/\bembedded run agent end\b/i.test(message) && /\berror=500\b/.test(message)) {
    return null;
  }

  if (isChannelInfra) {
    // Auto-reconnect, retry, connection status — all infra noise
    if (/\b(Web connection closed|Retry \d+\/\d+|reconnect|heartbeat)\b/i.test(message)) {
      return null;
    }
    if (/\bWebSocket error\b/i.test(message)) {
      return null;
    }
  }
  // Skip raw JSON connection status blobs (always infra, regardless of subsystem)
  if (/^\{"connectionId":/i.test(message)) {
    return null;
  }

  // Skip delivery retry noise (infrastructure auto-recovery)
  if (/\bDelivery\b.*\bexceeded max retries\b/i.test(message)) {
    return null;
  }
  if (/\bDelivery recovery complete\b/i.test(message)) {
    return null;
  }

  // Skip model_fallback_decision JSON blobs (internal routing noise)
  if (/model_fallback_decision/i.test(message)) {
    return null;
  }

  // --- Error patterns FIRST (before model/tool matching to avoid misclassification) ---
  if (obj.level === 'error' || /\b(error|fail(?:ed|ure)?|exception|timed?\s*out|ENOENT|EACCES)\b/i.test(message)) {
    // Extract meaningful error description from structured messages
    const errorRaw = extractReadableMessage(message);
    return { ts, type: 'error', raw: errorRaw };
  }

  // Model/inference patterns: suppressed — adapter generates richer chat_start/chat_end
  // (these broad patterns match too many internal logs: "inference completed", "thinking process", etc.)
  if (/\b(inference|model|llm)\b.*\b(start|request|call|complet|done|response|finish)\b/i.test(message)) {
    return null;
  }

  // Memory patterns in message text
  if (/\b(memory|recall|search)\b/i.test(message)) {
    return { ts, type: 'memory_recall', raw: extractReadableMessage(message) };
  }

  // Tool/exec patterns in message text
  if (/\b(tool|exec|execute|command)\b/i.test(message)) {
    return { ts, type: 'tool_exec', raw: extractReadableMessage(message) };
  }

  // Unrecognized — skip
  return null;
}
