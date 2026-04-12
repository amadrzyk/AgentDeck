#if os(macOS)
// ApmeClassifier.swift — Task classification for APME runs.
// 1:1 port of bridge/src/apme/classifier.ts rule-based classifier.

import Foundation

// MARK: - Task signals (agent-agnostic feature vector)

struct TaskSignals: Codable {
    var toolCounts: [String: Int] = [:]
    var dominantTool: String?
    var totalToolCalls: Int = 0
    var turnCount: Int = 0
    var sessionDurationSec: Int = 0
    var promptLengthChars: Int = 0
    var planModeUsed: Bool = false
    var permissionRequests: Int = 0
    var diffReviews: Int = 0
    var filesCreated: Int = 0
    var filesModified: Int = 0
    var testCommandsRun: Int = 0
    var webSearches: Int = 0
    var agentDelegations: Int = 0
    var isAutomated: Bool?
    var ocToolNames: [String]?
}

// MARK: - Task categories

enum TaskCategory: String, Codable, CaseIterable {
    case planning, research, coding, debugging, refactoring
    case review, ops, conversation
    case multiAgent = "multi_agent"
    case unknown
}

// MARK: - Classifier

enum ApmeClassifier {
    private static let testPattern = try! NSRegularExpression(
        pattern: #"\b(test|vitest|jest|pytest|cargo\s+test|go\s+test|xcodebuild\s+test|gradlew\s+test|pnpm\s+test|npm\s+test)\b"#,
        options: .caseInsensitive
    )

    static func computeSignals(store: ApmeStore, runId: String) -> TaskSignals {
        let run = store.getRun(id: runId)
        let steps = store.listSteps(runId: runId)

        var signals = TaskSignals()
        var ocTools = Set<String>()

        for step in steps {
            if step.kind == "tool_start" || step.kind == "PreToolUse", let tool = step.toolName {
                signals.toolCounts[tool, default: 0] += 1
                if tool == "Write" { signals.filesCreated += 1 }
                if tool == "Edit" { signals.filesModified += 1 }
                if tool == "WebSearch" || tool == "WebFetch" { signals.webSearches += 1 }
                if tool == "Agent" { signals.agentDelegations += 1 }
                if tool == "Bash" {
                    if let data = step.payload.data(using: .utf8),
                       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                       let cmd = json["command"] as? String {
                        let range = NSRange(cmd.startIndex..., in: cmd)
                        if testPattern.firstMatch(in: cmd, range: range) != nil {
                            signals.testCommandsRun += 1
                        }
                    }
                }
            }
            if step.kind == "user_prompt_submit" || step.kind == "UserPromptSubmit" {
                signals.turnCount += 1
            }
            // Plan mode detection
            if let data = step.payload.data(using: .utf8),
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                if let mode = json["mode"] as? String, mode == "plan" {
                    signals.planModeUsed = true
                }
                if step.kind == "permission_prompt" { signals.permissionRequests += 1 }
                if step.kind == "diff_prompt" { signals.diffReviews += 1 }
                if let auto = json["chatIsAutomated"] as? Bool { signals.isAutomated = auto }
                if let tools = json["chatToolNames"] as? [String] {
                    ocTools.formUnion(tools)
                }
            }
        }

        signals.totalToolCalls = signals.toolCounts.values.reduce(0, +)
        signals.dominantTool = signals.toolCounts.max(by: { $0.value < $1.value })?.key
        if let run {
            signals.sessionDurationSec = run.endedAt != nil && run.startedAt > 0
                ? (run.endedAt! - run.startedAt) / 1000
                : 0
            signals.promptLengthChars = run.taskPrompt?.count ?? 0
        }
        if !ocTools.isEmpty { signals.ocToolNames = Array(ocTools) }

        return signals
    }

    static func classify(_ signals: TaskSignals) -> TaskCategory {
        func toolPct(_ tools: String...) -> Double {
            guard signals.totalToolCalls > 0 else { return 0 }
            let sum = tools.reduce(0) { $0 + (signals.toolCounts[$1] ?? 0) }
            return Double(sum) / Double(signals.totalToolCalls)
        }

        // Priority-ordered rules (matches bridge/src/apme/classifier.ts)
        if signals.agentDelegations >= 2 { return .multiAgent }
        if signals.planModeUsed { return .planning }
        if signals.totalToolCalls <= 2 && signals.sessionDurationSec < 120 { return .conversation }
        if signals.turnCount >= 1 && signals.turnCount <= 3 && signals.totalToolCalls <= 5
            && signals.filesModified == 0 && signals.filesCreated == 0 { return .planning }
        if signals.webSearches > 0 || (toolPct("Grep", "Glob") > 0.4
            && signals.filesModified == 0 && signals.filesCreated == 0) { return .research }
        if signals.testCommandsRun >= 1 && (signals.filesModified > 0 || signals.filesCreated > 0)
            && toolPct("Bash") > 0.2 { return .debugging }
        if toolPct("Edit") > 0.5 && signals.filesCreated == 0 && signals.filesModified >= 3 { return .refactoring }
        if toolPct("Edit", "Write") > 0.3 && (signals.filesModified >= 1 || signals.filesCreated >= 1) { return .coding }
        if toolPct("Read") > 0.5 && signals.totalToolCalls >= 5
            && signals.filesModified <= 1 && signals.filesCreated == 0 { return .review }
        if toolPct("Bash") > 0.5 && toolPct("Edit", "Write") < 0.2 { return .ops }

        return .unknown
    }

    static func classifyRun(store: ApmeStore, runId: String) -> (signals: TaskSignals, category: TaskCategory) {
        let signals = computeSignals(store: store, runId: runId)
        let category = classify(signals)
        return (signals, category)
    }
}
#endif
