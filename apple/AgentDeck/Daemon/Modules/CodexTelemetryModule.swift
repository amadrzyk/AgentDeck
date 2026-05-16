#if os(macOS)
// CodexTelemetryModule.swift — Translate OTLP/HTTP JSON spans emitted by
// Codex into a small ordered set of session-state events the daemon can
// drive its sessions list with.
//
// We cannot pin to an exact span schema yet — Codex's OTel keys are not
// formally documented as a stable API. We accept a few naming variants
// (dotted vs underscored, `codex.thread_id` vs `thread.id`, etc.) and
// silently drop anything we don't recognise. The four events we care
// about cover turn boundaries and per-tool progress, which is enough to
// drive Dashboard creature state without trying to render every internal
// model call.

import Foundation

/// Distilled span events. Equatable for cheap unit-test assertions and
/// Sendable so the parser can be called from non-isolated contexts.
///
/// `cwd` rides on `turnStart`, `toolCall`, and `activity` — every event
/// type that `DaemonServer.handleCodexTrace` uses to insert/upgrade a
/// session row. Codex Desktop emits cwd on the turn-boundary span only,
/// so the parser also surfaces any cwd seen elsewhere in the same batch
/// as a trace-level fallback (see `parse`) — without that, a toolCall
/// span landing before turnStart inserts a blank-projectName placeholder
/// that the upgrade path can never refill.
enum CodexSpanEvent: Sendable, Equatable {
    case turnStart(threadId: String, turnId: String, cwd: String?)
    case toolCall(threadId: String, turnId: String, tool: String, cwd: String?)
    case toolResult(threadId: String, turnId: String)
    case turnEnd(threadId: String, turnId: String)
    case activity(threadId: String, turnId: String, name: String, cwd: String?)
}

enum CodexTelemetryModule {
    private static let anonymousOtelThreadId = "otel-active"

    /// Parse an OTLP/HTTP `ExportTraceServiceRequest` into the ordered
    /// events. Spans are visited in the order they appear in the body; we
    /// don't sort by timestamp because OTel exporters batch consecutive
    /// spans and Codex emits them in roughly chronological order anyway.
    static func parse(_ json: [String: Any]) -> [CodexSpanEvent] {
        var out: [CodexSpanEvent] = []
        let resourceSpans = (json["resourceSpans"] as? [[String: Any]]) ?? []

        // First pass: build a per-thread cwd map. Codex Desktop emits cwd
        // on the turn-boundary span only, so a same-batch toolCall/activity
        // span for the SAME thread needs to inherit that cwd — otherwise the
        // empty-projectName placeholder inserted by ensureCodexSession can
        // never be upgraded (resolvedProjectName == "" fails the empty→
        // non-empty guard). Scoping to threadId, not batch-wide, prevents
        // session A's cwd from leaking into session B when both are active
        // under one exporter.
        //
        // Resource-level cwd is replicated for every thread that has a span
        // under that resourceSpans entry: it represents the shared workspace
        // for the whole resource, so cross-thread "propagation" is intended
        // (and matches `testResourceLevelCwdAliasFallsThrough`).
        var cwdByThreadId: [String: String] = [:]
        for r in resourceSpans {
            let resourceAttrs = flattenAttrs(((r["resource"] as? [String: Any])?["attributes"] as? [[String: Any]]) ?? [])
            let scopeSpans = (r["scopeSpans"] as? [[String: Any]]) ?? []
            for ss in scopeSpans {
                let spans = (ss["spans"] as? [[String: Any]]) ?? []
                for span in spans {
                    let merged = resourceAttrs.merging(
                        flattenAttrs(span["attributes"] as? [[String: Any]] ?? []),
                        uniquingKeysWith: { _, new in new }
                    )
                    guard let cwd = cwdFromAttributes(merged) else { continue }
                    let threadId = threadIdAttr(merged) ?? anonymousThreadIdIfTraceBacked(span)
                    if let tid = threadId, !tid.isEmpty, cwdByThreadId[tid] == nil {
                        cwdByThreadId[tid] = cwd
                    }
                }
            }
        }

        for r in resourceSpans {
            // Resource-level attrs (set once for the whole batch — typically
            // service.name + identifying ids) can carry thread id when a
            // span itself doesn't repeat it. Span attrs win on collision.
            let resourceAttrs = flattenAttrs(((r["resource"] as? [String: Any])?["attributes"] as? [[String: Any]]) ?? [])
            let scopeSpans = (r["scopeSpans"] as? [[String: Any]]) ?? []
            for ss in scopeSpans {
                let spans = (ss["spans"] as? [[String: Any]]) ?? []
                for span in spans {
                    if let event = classify(span: span, resourceAttrs: resourceAttrs, cwdByThreadId: cwdByThreadId) {
                        out.append(event)
                    }
                }
            }
        }
        return out
    }

    /// Lightweight diagnostic for unknown future schemas. Keeps live logs
    /// useful without dumping entire OTLP payloads.
    static func spanNameSummary(_ json: [String: Any], limit: Int = 12) -> String {
        var names: [String] = []
        let resourceSpans = (json["resourceSpans"] as? [[String: Any]]) ?? []
        for r in resourceSpans {
            let scopeSpans = (r["scopeSpans"] as? [[String: Any]]) ?? []
            for ss in scopeSpans {
                let spans = (ss["spans"] as? [[String: Any]]) ?? []
                for span in spans {
                    if let name = span["name"] as? String, !name.isEmpty {
                        names.append(name)
                    }
                }
            }
        }
        return Array(names.prefix(limit)).joined(separator: ",")
    }

    // MARK: - Internals

    private static func classify(span: [String: Any], resourceAttrs: [String: Any], cwdByThreadId: [String: String]) -> CodexSpanEvent? {
        guard let rawName = span["name"] as? String else { return nil }
        let attrs = resourceAttrs.merging(
            flattenAttrs(span["attributes"] as? [[String: Any]] ?? []),
            uniquingKeysWith: { _, new in new }
        )

        guard let threadId = threadIdAttr(attrs) ?? anonymousThreadIdIfTraceBacked(span),
              !threadId.isEmpty else {
            return nil
        }
        let turnId = stringAttr(attrs, keys: ["codex.turn_id", "turn.id", "turn_id"])
            ?? traceIdAttr(span)
            ?? ""

        // Per-span cwd wins over the per-thread fallback so a turnStart with
        // an explicit cwd attr always reflects exactly what Codex reported.
        // The fallback only fires for SAME-thread events that omit cwd (the
        // toolCall/activity case Codex Desktop produces in practice) —
        // cross-thread leakage is impossible because the map key is the
        // resolved threadId itself.
        let cwd = cwdFromAttributes(attrs) ?? cwdByThreadId[threadId]

        // Normalize underscore/slash variants (`codex.tool_call`,
        // `turn/start`) into dotted form so current Codex builds and older
        // logs share one dispatch table.
        let normalized = rawName
            .replacingOccurrences(of: "_", with: ".")
            .replacingOccurrences(of: "/", with: ".")

        switch normalized {
        case "codex.turn", "codex.turn.start", "turn.start", "op.dispatch.user.turn", "op.dispatch.user.input.with.turn.context":
            return .turnStart(threadId: threadId, turnId: turnId, cwd: cwd)
        case "codex.tool.call", "tool.call", "turn.tool.call", "build.tool.call", "handle.tool.call", "handle.tool.call.with.source", "exec.command", "mcp.tools.call":
            let tool = stringAttr(attrs, keys: ["tool.name", "tool", "codex.tool", "mcp.tool.name", "mcp.tool"]) ?? inferredToolName(from: normalized)
            return .toolCall(threadId: threadId, turnId: turnId, tool: tool, cwd: cwd)
        case "codex.tool.result", "tool.result", "tool.call.duration.ms", "dispatch.tool.call.with.code.mode.result", "handle.output.item.done":
            return .toolResult(threadId: threadId, turnId: turnId)
        case "codex.turn.end", "turn.end", "session.task.turn":
            return .turnEnd(threadId: threadId, turnId: turnId)
        case "receiving", "handle.responses", "responses.websocket.stream.request", "model.client.stream.responses.websocket", "stream.request":
            return .activity(threadId: threadId, turnId: turnId, name: rawName, cwd: cwd)
        default:
            return nil
        }
    }

    /// 16 attribute aliases under which Codex builds (and the Codex Desktop
    /// app's OTel exporter) have been observed publishing the workspace
    /// directory. Centralised so resource-level scan, span-level scan, and
    /// future ingestion paths read the same list.
    private static let cwdAttributeKeys: [String] = [
        "cwd",
        "codex.cwd",
        "working.directory",
        "working_directory",
        "working.dir",
        "workdir",
        "workspace.path",
        "workspace.root",
        "workspace_root",
        "project.path",
        "project.root",
        "project_root",
        "repo.path",
        "repository.path",
        "terminal.cwd",
        "process.cwd",
    ]

    private static func cwdFromAttributes(_ attrs: [String: Any]) -> String? {
        stringAttr(attrs, keys: cwdAttributeKeys)
    }

    private static func threadIdAttr(_ attrs: [String: Any]) -> String? {
        // Apply `isDurableSessionId` to BOTH the thread-id and session_id
        // candidates. Without the thread-id guard a span carrying
        // `thread.id: "11"` (or any short numeric companion-task id) would
        // still synthesize `codex:11` rows on `handleCodexTrace.turnStart`,
        // bypassing the matching guard on the hook path
        // (`CodexHookIdentity.threadIdSessionKey`) and producing the same
        // ghost cloud creature the dashboard surfaced on 2026-05-03.
        //
        // Crucially, scan every alias and return the first DURABLE match —
        // not the first non-empty one. Some Codex builds emit both a
        // turn-scoped short id (`codex.thread_id: "11"`) AND the real
        // thread UUID (`thread.id: "019dee40-…"`) on the same span; the
        // earlier alias wins lexically but only the later one is the
        // durable id we want. A naïve `firstNonEmpty + isDurable` reads
        // the short id, fails the guard, falls through to `session_id`,
        // and silently drops the perfectly-good UUID that was sitting in
        // the next alias.
        if let threadId = firstDurableAttr(attrs, keys: [
            "codex.thread_id", "codex.thread.id", "thread.id", "thread_id", "threadId",
        ]) {
            return stripCodexPrefix(threadId)
        }

        if let sessionId = firstDurableAttr(attrs, keys: ["session_id", "session.id"]) {
            return stripCodexPrefix(sessionId)
        }
        return nil
    }

    /// Some current Codex App / app-server OTLP batches include useful
    /// progress spans (`turn/start`, `receiving`, `build_tool_call`) but omit
    /// durable `thread.id` attributes from those individual spans. Dropping
    /// them makes the dashboard lose the Codex creature while Codex is clearly
    /// active. Use one anonymous, trace-backed session key as a fallback; real
    /// thread ids still win above, and a singleton fallback avoids one sprite
    /// per internal trace.
    private static func anonymousThreadIdIfTraceBacked(_ span: [String: Any]) -> String? {
        traceIdAttr(span) == nil ? nil : anonymousOtelThreadId
    }

    private static func traceIdAttr(_ span: [String: Any]) -> String? {
        for key in ["traceId", "traceID", "trace_id"] {
            if let s = span[key] as? String, !s.isEmpty {
                return s
            }
        }
        return nil
    }

    /// First attribute among `keys` whose stringified value passes
    /// `isDurableSessionId`. Mirrors `stringAttr`'s String-or-Int handling
    /// but skips short / non-durable matches instead of returning the
    /// first hit. Used by `threadIdAttr` to make the alias list a
    /// preference order rather than a winner-take-all early-exit.
    private static func firstDurableAttr(_ attrs: [String: Any], keys: [String]) -> String? {
        for key in keys {
            if let s = attrs[key] as? String, !s.isEmpty, isDurableSessionId(s) {
                return s
            }
            if let n = attrs[key] as? Int {
                let s = String(n)
                if isDurableSessionId(s) { return s }
            }
        }
        return nil
    }

    private static func inferredToolName(from normalizedSpanName: String) -> String {
        switch normalizedSpanName {
        case "exec.command": return "exec"
        default: return "tool"
        }
    }

    private static func isDurableSessionId(_ raw: String) -> Bool {
        let normalized = stripCodexPrefix(raw)
        let trimmed = normalized.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 12 else { return false }
        return trimmed.rangeOfCharacter(from: CharacterSet.decimalDigits.inverted) != nil
    }

    private static func stripCodexPrefix(_ raw: String) -> String {
        raw.hasPrefix("codex:") ? String(raw.dropFirst("codex:".count)) : raw
    }

    /// First non-empty string attribute among `keys`, or nil.
    private static func stringAttr(_ attrs: [String: Any], keys: [String]) -> String? {
        for key in keys {
            if let s = attrs[key] as? String, !s.isEmpty {
                return s
            }
            if let n = attrs[key] as? Int {
                return String(n)
            }
        }
        return nil
    }

    /// OTLP attributes are arrays of `{ key, value: { <typeKey>Value } }`
    /// where `<typeKey>` is one of string / int / bool / double / bytes.
    /// We stash whichever scalar variant is present so callers can dot-key
    /// into `[String: Any]` without re-parsing the OTLP envelope.
    private static func flattenAttrs(_ raw: [[String: Any]]) -> [String: Any] {
        var out: [String: Any] = [:]
        for kv in raw {
            guard let key = kv["key"] as? String,
                  let valueWrap = kv["value"] as? [String: Any] else { continue }
            if let s = valueWrap["stringValue"] as? String {
                out[key] = s
                continue
            }
            // OTLP encodes int64 as either a number or a stringified number
            // depending on the SDK version — accept both so a future Codex
            // build switching encoders doesn't silently lose attributes.
            if let raw = valueWrap["intValue"] {
                if let n = raw as? Int { out[key] = n }
                else if let s = raw as? String, let n = Int(s) { out[key] = n }
                continue
            }
            if let b = valueWrap["boolValue"] as? Bool { out[key] = b; continue }
            if let d = valueWrap["doubleValue"] as? Double { out[key] = d; continue }
        }
        return out
    }
}
#endif
