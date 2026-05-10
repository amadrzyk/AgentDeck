// Timeline.swift — Event timeline types
// Ported from shared/src/timeline.ts

import Foundation

// MARK: - Timeline Entry Type

/// Lenient enum: unknown raw values decode to `.unknown(rawValue)` instead of
/// throwing. Lets older clients survive future protocol additions; lets newer
/// clients display unrecognised type rows in degraded mode.
enum TimelineEntryType: Codable, Sendable, Equatable, Hashable {
    case toolRequest
    case toolResolved
    case chatStart
    case chatEnd
    case chatResponse
    case error
    case scheduled
    case userAction
    case modelCall
    case modelResponse
    case memoryRecall
    case toolExec
    case evalResult
    case taskStart
    case taskEnd
    case unknown(String)

    var rawValue: String {
        switch self {
        case .toolRequest: return "tool_request"
        case .toolResolved: return "tool_resolved"
        case .chatStart: return "chat_start"
        case .chatEnd: return "chat_end"
        case .chatResponse: return "chat_response"
        case .error: return "error"
        case .scheduled: return "scheduled"
        case .userAction: return "user_action"
        case .modelCall: return "model_call"
        case .modelResponse: return "model_response"
        case .memoryRecall: return "memory_recall"
        case .toolExec: return "tool_exec"
        case .evalResult: return "eval_result"
        case .taskStart: return "task_start"
        case .taskEnd: return "task_end"
        case .unknown(let raw): return raw
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        self = TimelineEntryType(rawValue: raw)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }

    init(rawValue raw: String) {
        switch raw {
        case "tool_request": self = .toolRequest
        case "tool_resolved": self = .toolResolved
        case "chat_start": self = .chatStart
        case "chat_end": self = .chatEnd
        case "chat_response": self = .chatResponse
        case "error": self = .error
        case "scheduled": self = .scheduled
        case "user_action": self = .userAction
        case "model_call": self = .modelCall
        case "model_response": self = .modelResponse
        case "memory_recall": self = .memoryRecall
        case "tool_exec": self = .toolExec
        case "eval_result": self = .evalResult
        case "task_start": self = .taskStart
        case "task_end": self = .taskEnd
        default: self = .unknown(raw)
        }
    }
}

// MARK: - Task Boundary Signal

enum TaskBoundarySignal: String, Codable, Sendable, Equatable {
    case todoComplete = "todo_complete"
    case clear
    case sessionEnd = "session_end"
    case manual
}

// MARK: - Timeline Entry

struct TimelineEntry: Codable, Sendable, Identifiable {
    let ts: Double  // milliseconds
    let type: TimelineEntryType
    let raw: String
    var detail: String?
    var approvalId: String?
    var status: String?  // pending | approved | denied
    var agentType: String?
    /// Project folder name of the session that produced this entry. Used as
    /// the row prefix so multi-session dashboards can tell "ViewTrans" apart
    /// from "AgentDeck" even when both are the same `agentType`. Nil for
    /// entries predating the multi-session attribution work.
    var projectName: String?
    /// Session id the entry belongs to. Populated from state_update events
    /// that carry the hook-attributing sessionId.
    var sessionId: String?
    /// Agent run id, when the upstream adapter exposes one. OpenClaw Gateway
    /// uses this to group tool/model rows belonging to the same generation.
    var runId: String?
    /// Lifecycle bounds for task/turn entries. `ts` remains the display/event
    /// timestamp; these fields let the detail pane show elapsed work clearly.
    var startedAt: Double?
    var endedAt: Double?
    /// APME task id. Set on task_start/task_end and on every turn entry inside
    /// the task scope. Lets the timeline group turns under a task header.
    var taskId: String?
    /// Only on task_end. Why the task closed.
    var boundarySignal: TaskBoundarySignal?
    /// How the row's `raw` summary was produced. Lets clients decide whether
    /// the detail pane is worth showing.
    ///   - "llm"       : LLM-summarized (clean, distinct from detail)
    ///   - "heuristic" : topic-hint extracted from response or prompt
    ///   - "none"      : last-resort fallback (literal "Completed", bare tool name, etc.)
    /// nil for legacy entries — clients should treat as "heuristic" (don't aggressively suppress).
    var summaryKind: String?

    var id: Double { ts }

    var date: Date {
        Date(timeIntervalSince1970: ts / 1000)
    }

    enum CodingKeys: String, CodingKey {
        case ts, type, raw, detail, approvalId, status, agentType, projectName
        case sessionId, runId, startedAt, endedAt, taskId, boundarySignal, summaryKind
    }

    init(
        ts: Double,
        type: TimelineEntryType,
        raw: String,
        detail: String? = nil,
        approvalId: String? = nil,
        status: String? = nil,
        agentType: String? = nil,
        projectName: String? = nil,
        sessionId: String? = nil,
        runId: String? = nil,
        startedAt: Double? = nil,
        endedAt: Double? = nil,
        taskId: String? = nil,
        boundarySignal: TaskBoundarySignal? = nil,
        summaryKind: String? = nil
    ) {
        self.ts = ts
        self.type = type
        self.raw = raw
        self.detail = detail
        self.approvalId = approvalId
        self.status = status
        self.agentType = agentType
        self.projectName = projectName
        self.sessionId = sessionId
        self.runId = runId
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.taskId = taskId
        self.boundarySignal = boundarySignal
        self.summaryKind = summaryKind
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.ts = try c.decode(Double.self, forKey: .ts)
        self.type = try c.decode(TimelineEntryType.self, forKey: .type)
        self.raw = try c.decode(String.self, forKey: .raw)
        self.detail = try c.decodeIfPresent(String.self, forKey: .detail)
        self.approvalId = try c.decodeIfPresent(String.self, forKey: .approvalId)
        self.status = try c.decodeIfPresent(String.self, forKey: .status)
        self.agentType = try c.decodeIfPresent(String.self, forKey: .agentType)
        self.projectName = try c.decodeIfPresent(String.self, forKey: .projectName)
        self.sessionId = try c.decodeIfPresent(String.self, forKey: .sessionId)
        self.runId = try c.decodeIfPresent(String.self, forKey: .runId)
        self.startedAt = try c.decodeIfPresent(Double.self, forKey: .startedAt)
        self.endedAt = try c.decodeIfPresent(Double.self, forKey: .endedAt)
        self.taskId = try c.decodeIfPresent(String.self, forKey: .taskId)
        // boundarySignal: tolerate unknown future signals by silently dropping
        if let raw = try c.decodeIfPresent(String.self, forKey: .boundarySignal) {
            self.boundarySignal = TaskBoundarySignal(rawValue: raw)
        } else {
            self.boundarySignal = nil
        }
        self.summaryKind = try c.decodeIfPresent(String.self, forKey: .summaryKind)
    }
}

// MARK: - Grouped Entry (for UI display)

struct GroupedEntry: Identifiable, Sendable {
    let entry: TimelineEntry
    var count: Int = 1
    /// Unique ID combining timestamp + type + count to avoid ForEach duplicate ID warnings
    var id: String { "\(entry.ts)-\(entry.type.rawValue)-\(count)" }
}

// MARK: - Timeline Grouping

func groupConsecutive(_ entries: [TimelineEntry], windowSeconds: Double = 60) -> [GroupedEntry] {
    guard !entries.isEmpty else { return [] }

    var result: [GroupedEntry] = []
    var current = GroupedEntry(entry: entries[0])

    for i in 1..<entries.count {
        let entry = entries[i]
        let timeDiff = abs(entry.ts - current.entry.ts)

        // Task hierarchy entries never group — they're unique markers.
        if entry.type == .taskStart || entry.type == .taskEnd ||
           current.entry.type == .taskStart || current.entry.type == .taskEnd {
            result.append(current)
            current = GroupedEntry(entry: entry)
            continue
        }

        if entry.type == current.entry.type &&
           entry.raw == current.entry.raw &&
           timeDiff <= windowSeconds * 1000 {
            current.count += 1
        } else {
            result.append(current)
            current = GroupedEntry(entry: entry)
        }
    }
    result.append(current)
    return result
}

// Type display functions moved to TimelineStripView.swift (timelineTypeIcon, timelineTypeColor)
