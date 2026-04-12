#if os(macOS)
// ApmeHttpRoutes.swift — HTTP API routes for APME data.
// Mounted into DaemonServer's HTTPServer alongside existing routes.

import Foundation

enum ApmeHttpRoutes {
    /// Register all /apme/* routes on the given HTTP server.
    static func register(on httpServer: HTTPServer, store: ApmeStore) async {
        await httpServer.get("/apme/runs") { request in
            let url = URLComponents(string: "http://localhost\(request.path)")
            let limit = Int(url?.queryItems?.first(where: { $0.name == "limit" })?.value ?? "") ?? 50
            let agent = url?.queryItems?.first(where: { $0.name == "agent" })?.value

            let runs = store.listRuns(limit: limit, agentType: agent)
            let result = runs.map { run -> [String: Any] in
                let evals = store.listEvalsForRun(run.id)
                let overall = evals.first(where: { $0.layer == "llm_judge" && $0.metric == "overall" })
                var dict: [String: Any] = [
                    "id": run.id,
                    "sessionId": run.sessionId,
                    "agentType": run.agentType,
                    "startedAt": run.startedAt,
                ]
                if let v = run.modelId { dict["modelId"] = v }
                if let v = run.projectName { dict["projectName"] = v }
                if let v = run.taskPrompt { dict["taskPrompt"] = v }
                if let v = run.endedAt { dict["endedAt"] = v }
                if let v = run.inputTokens { dict["inputTokens"] = v }
                if let v = run.outputTokens { dict["outputTokens"] = v }
                if let v = run.costUsd { dict["costUsd"] = v }
                if let v = run.exitCode { dict["exitCode"] = v }
                if let v = run.taskCategory { dict["taskCategory"] = v }
                dict["overallScore"] = overall?.score as Any
                dict["evals"] = evals.map { e -> [String: Any] in
                    var ed: [String: Any] = ["layer": e.layer, "metric": e.metric, "score": e.score, "createdAt": e.createdAt]
                    if let v = e.judgeModel { ed["judgeModel"] = v }
                    return ed
                }
                return dict
            }
            return .json(["runs": result])
        }

        await httpServer.get("/apme/scorecard") { _ in
            return .json(["scorecards": store.scorecard()])
        }

        await httpServer.get("/apme/categories") { _ in
            return .json(["categories": store.categoryScorecard()])
        }

        await httpServer.get("/apme/rubric/current") { _ in
            guard let rubric = store.getCurrentRubric() else {
                return .json(["error": "no rubric"], status: 404)
            }
            return .json(["rubric": rubric])
        }

        await httpServer.post("/apme/vibe") { request in
            guard let body = request.body,
                  let json = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
                  let runId = json["runId"] as? String,
                  let verdict = json["verdict"] as? String,
                  ["approve", "reject", "neutral"].contains(verdict) else {
                return .json(["error": "expected { runId, verdict, note? }"], status: 400)
            }
            guard store.getRun(id: runId) != nil else {
                return .json(["error": "run not found"], status: 404)
            }
            store.insertVibe(runId: runId, verdict: verdict, note: json["note"] as? String)
            return .json(["ok": true])
        }
    }
}
#endif
