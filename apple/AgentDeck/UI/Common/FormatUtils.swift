// FormatUtils.swift — Shared formatting utilities
// Ported from Android util/TimeFormatUtils.kt

import Foundation

/// Format ISO 8601 reset time string to human-readable relative duration
/// e.g., "45m", "2h 15m", "1d 5h"
func formatResetTime(_ isoString: String?) -> String? {
    guard let isoString, !isoString.isEmpty else { return nil }

    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let date = formatter.date(from: isoString)
            ?? ISO8601DateFormatter().date(from: isoString) else { return nil }

    let remaining = date.timeIntervalSinceNow
    guard remaining > 0 else { return "now" }

    let totalMinutes = Int(remaining / 60)
    let days = totalMinutes / (60 * 24)
    let hours = (totalMinutes % (60 * 24)) / 60
    let minutes = totalMinutes % 60

    if days > 0 {
        return hours > 0 ? "\(days)d \(hours)h" : "\(days)d"
    } else if hours > 0 {
        return minutes > 0 ? "\(hours)h \(minutes)m" : "\(hours)h"
    } else {
        return "\(max(1, minutes))m"
    }
}

/// Format bytes to human-readable string (e.g., "4.5G", "512M")
func formatBytes(_ bytes: Int) -> String {
    if bytes >= 1_073_741_824 {
        let gb = Double(bytes) / 1_073_741_824
        return gb >= 10 ? "\(Int(gb))G" : String(format: "%.1fG", gb)
    } else if bytes >= 1_048_576 {
        let mb = Double(bytes) / 1_048_576
        return mb >= 10 ? "\(Int(mb))M" : String(format: "%.1fM", mb)
    } else if bytes >= 1024 {
        return "\(bytes / 1024)K"
    } else {
        return "\(bytes)B"
    }
}
