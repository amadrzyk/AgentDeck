#if canImport(Foundation)
import Foundation

/// Model pricing for APME cost tracking — Swift mirror of shared/src/pricing.ts.
///
/// Each ModelEvent is priced at ingestion so cost is a first-class per-unit
/// signal. Local models (MLX, on-device Foundation Models) are $0. Rates are
/// best-effort public list prices and overridable at runtime via
/// `ApmePricing.setOverrides`. Confirm absolute figures against
/// https://anthropic.com/pricing before relying on them.
enum ApmePricing {
    struct Price { let inPerMtok: Double; let outPerMtok: Double; let provider: String }

    static let unknown = Price(inPerMtok: 0, outPerMtok: 0, provider: "unknown")
    private static let zeroLocal = Price(inPerMtok: 0, outPerMtok: 0, provider: "local")

    /// Default rates ($/million tokens). Keep in sync with shared/src/pricing.ts.
    private static let defaults: [String: Price] = [
        "claude-fable-5":   Price(inPerMtok: 20, outPerMtok: 100, provider: "anthropic"),
        "claude-mythos-5":  Price(inPerMtok: 20, outPerMtok: 100, provider: "anthropic"),
        "claude-opus-4-8":  Price(inPerMtok: 15, outPerMtok: 75,  provider: "anthropic"),
        "claude-opus-4-7":  Price(inPerMtok: 15, outPerMtok: 75,  provider: "anthropic"),
        "claude-opus-4-6":  Price(inPerMtok: 15, outPerMtok: 75,  provider: "anthropic"),
        "claude-sonnet-4-6": Price(inPerMtok: 3, outPerMtok: 15,  provider: "anthropic"),
        "claude-sonnet-4-5": Price(inPerMtok: 3, outPerMtok: 15,  provider: "anthropic"),
        "claude-haiku-4-5": Price(inPerMtok: 1, outPerMtok: 5,    provider: "anthropic"),
        "gpt-5-codex":      Price(inPerMtok: 1.25, outPerMtok: 10, provider: "openai"),
        "gpt-5":            Price(inPerMtok: 1.25, outPerMtok: 10, provider: "openai"),
    ]

    // Written once at config load, read on the daemon's serial APME queue.
    nonisolated(unsafe) private static var overrides: [String: Price] = [:]

    static func setOverrides(_ table: [String: Price]) { overrides = table }

    static func isLocal(_ model: String) -> Bool {
        let m = model.trimmingCharacters(in: .whitespaces).lowercased()
        return m.hasPrefix("mlx:") || m.hasPrefix("local:") || m.hasPrefix("ollama:")
            || m == "foundationmodels" || m == "foundation-models" || m == "apple-fm"
    }

    static func normalize(_ model: String) -> String {
        var m = model.trimmingCharacters(in: .whitespaces).lowercased()
        if !m.hasPrefix("mlx:") && !m.hasPrefix("local:"), let slash = m.lastIndex(of: "/") {
            m = String(m[m.index(after: slash)...])
        }
        // Strip date suffix: -YYYYMMDD or -YYYY-MM-DD
        if let r = m.range(of: "-[0-9]{8}$", options: .regularExpression) { m.removeSubrange(r) }
        if let r = m.range(of: "-[0-9]{4}-[0-9]{2}-[0-9]{2}$", options: .regularExpression) { m.removeSubrange(r) }
        return m
    }

    static func price(for model: String?) -> Price {
        guard let model, !model.isEmpty else { return unknown }
        if isLocal(model) { return zeroLocal }
        let key = normalize(model)
        return overrides[key] ?? overrides[model] ?? defaults[key] ?? defaults[model] ?? unknown
    }

    static func provider(for model: String?) -> String { price(for: model).provider }

    static func isPriced(_ model: String?) -> Bool {
        guard let model, !model.isEmpty else { return false }
        if isLocal(model) { return true }
        let key = normalize(model)
        return overrides[key] != nil || overrides[model] != nil || defaults[key] != nil || defaults[model] != nil
    }

    /// USD cost for a single model call. Rounded to 6 dp.
    static func usd(model: String?, inputTokens: Int, outputTokens: Int) -> Double {
        let p = price(for: model)
        let cost = (Double(inputTokens) / 1_000_000) * p.inPerMtok
                 + (Double(outputTokens) / 1_000_000) * p.outPerMtok
        return (cost * 1_000_000).rounded() / 1_000_000
    }
}
#endif
