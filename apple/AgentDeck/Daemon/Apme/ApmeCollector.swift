#if os(macOS)
// ApmeCollector.swift — Ingests hook events into the APME SQLite store.
// Mirror of bridge/src/apme/collector.ts for the Swift daemon.

import Foundation

@MainActor
final class ApmeCollector {
    private let store: ApmeStore
    private var sessionToRun: [String: String] = [:]  // sessionId → runId

    init(store: ApmeStore) {
        self.store = store
    }

    // MARK: - Run lifecycle

    func openRun(sessionId: String, agentType: String, projectName: String?, modelId: String?) -> String {
        guard store.isOpen else { return "" }
        let runId = UUID().uuidString
        let gitBefore = readGitHead(cwd: projectPath(for: projectName))
        let run = ApmeRun(
            id: runId,
            sessionId: sessionId,
            agentType: agentType,
            modelId: modelId,
            projectName: projectName,
            projectPath: projectPath(for: projectName),
            startedAt: nowMs(),
            gitBefore: gitBefore
        )
        store.insertRun(run)
        sessionToRun[sessionId] = runId
        DaemonLogger.shared.debug("APME", "openRun \(runId) session=\(sessionId) agent=\(agentType)")
        return runId
    }

    func closeRun(sessionId: String, exitCode: Int? = nil) -> String? {
        guard store.isOpen else { return nil }
        guard let runId = sessionToRun.removeValue(forKey: sessionId) else { return nil }
        let run = store.getRun(id: runId)
        let gitAfter = readGitHead(cwd: run?.projectPath)

        store.updateRun(id: runId, fields: [
            "endedAt": nowMs(),
            "exitCode": exitCode as Any,
            "gitAfter": gitAfter as Any,
        ])

        // Classify
        let result = ApmeClassifier.classifyRun(store: store, runId: runId)
        if let signals = try? JSONEncoder().encode(result.signals),
           let json = String(data: signals, encoding: .utf8) {
            store.updateRun(id: runId, fields: [
                "taskSignals": json,
                "taskCategory": result.category.rawValue,
                "taskCategorySource": "auto",
            ])
        }

        DaemonLogger.shared.debug("APME", "closeRun \(runId) exit=\(exitCode ?? -1) category=\(result.category.rawValue)")
        return runId
    }

    // MARK: - Hook ingestion

    func ingestHook(sessionId: String, event: String, data: [String: Any]) {
        guard store.isOpen else { return }
        guard let runId = sessionToRun[sessionId] else { return }

        let toolName = data["tool_name"] as? String
        let payload = jsonString(data)

        // Capture task_prompt lazily from first user_prompt_submit
        if event == "user_prompt_submit", let prompt = data["prompt"] as? String {
            let run = store.getRun(id: runId)
            if run?.taskPrompt == nil {
                store.updateRun(id: runId, fields: ["taskPrompt": String(prompt.prefix(8000))])
            }
        }

        store.insertStep(
            runId: runId,
            ts: nowMs(),
            kind: event,
            toolName: toolName,
            payload: payload
        )
    }

    // MARK: - Usage / model updates

    func updateModel(sessionId: String, modelId: String?) {
        guard store.isOpen, let modelId, let runId = sessionToRun[sessionId] else { return }
        store.updateRun(id: runId, fields: ["modelId": modelId])
    }

    func updateUsage(sessionId: String, inputTokens: Int, outputTokens: Int, costUsd: Double?) {
        guard store.isOpen, let runId = sessionToRun[sessionId] else { return }
        var fields: [String: Any?] = [
            "inputTokens": inputTokens,
            "outputTokens": outputTokens,
        ]
        if let c = costUsd { fields["costUsd"] = c }
        store.updateRun(id: runId, fields: fields)
    }

    // MARK: - Helpers

    private func nowMs() -> Int { Int(Date().timeIntervalSince1970 * 1000) }

    private func projectPath(for projectName: String?) -> String? {
        // Best-effort: cwd at daemon startup is typically the user's home.
        // The actual project path comes from the session's health probe; for
        // hook-only sessions without a bridge, we fall back to nil.
        return nil
    }

    private func readGitHead(cwd: String?) -> String? {
        guard let cwd else { return nil }
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/usr/bin/git")
        proc.arguments = ["rev-parse", "HEAD"]
        proc.currentDirectoryURL = URL(fileURLWithPath: cwd)
        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = FileHandle.nullDevice
        do {
            try proc.run(); proc.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            return String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
        } catch { return nil }
    }

    private func jsonString(_ dict: [String: Any]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: dict),
              let str = String(data: data, encoding: .utf8) else { return "{}" }
        return str
    }
}
#endif
