#if os(macOS)
// QRPairingWindow.swift — macOS pairing window showing a QR code with the
// daemon's connection URL. Users scan this from the iOS companion app to
// pair without depending on mDNS (useful when Local Network permission is
// denied, or when iPad + Mac are on different-but-routable networks).
//
// QR payload = `AuthManager.getWsUrl(port:)` output, i.e.
//   ws://<lan-ip>:<port>?token=<token>
//
// The window also shows the URL as selectable text so copy-paste works as
// a fallback when the iPad camera isn't available (e.g. Stage Manager).

import SwiftUI
import CoreImage
import CoreImage.CIFilterBuiltins
import AppKit

struct QRPairingWindow: View {
    @EnvironmentObject private var daemonService: DaemonService
    @EnvironmentObject private var preferences: AppPreferences
    @Environment(\.dismiss) private var dismiss

    @State private var showCopiedToast: Bool = false

    /// Current daemon WebSocket URL with auth token. Re-evaluated whenever
    /// `daemonService.port` or the auth token changes so the QR keeps
    /// matching the live daemon state.
    private var pairingURL: String {
        let port: Int = daemonService.port > 0 ? Int(daemonService.port) : preferences.daemonPort
        return AuthManager.shared.getWsUrl(port: port)
    }

    var body: some View {
        VStack(spacing: 18) {
            Text("Pair your iPad or iPhone")
                .font(HUDFont.title)

            Text("Open AgentDeck on your iOS device and tap **Scan QR**, or copy the URL into the manual field.")
                .font(HUDFont.body)
                .foregroundStyle(TerrariumHUD.subtext)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 20)

            // QR card keeps a white fill so iPad cameras can scan it — an
            // aquarium-tinted QR would lower contrast and break pairing.
            qrImage
                .frame(width: 280, height: 280)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color.white)
                )

            VStack(spacing: 6) {
                Text(pairingURL)
                    .font(HUDFont.mono)
                    .foregroundStyle(TerrariumHUD.subtext)
                    .textSelection(.enabled)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .padding(.horizontal, 12)

                Button {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(pairingURL, forType: .string)
                    showCopiedToast = true
                    Task { @MainActor in
                        try? await Task.sleep(for: .seconds(1.5))
                        showCopiedToast = false
                    }
                } label: {
                    Label(showCopiedToast ? "Copied" : "Copy URL",
                          systemImage: showCopiedToast ? "checkmark.circle.fill" : "doc.on.doc")
                        .font(HUDFont.caption)
                }
                .buttonStyle(.borderless)
                .tint(showCopiedToast ? TerrariumHUD.ledGreen : TerrariumColors.tetraNeon)
            }

            Spacer()

            HStack {
                Spacer()
                Button("Close") { dismiss() }
                    .keyboardShortcut(.cancelAction)
            }
        }
        .padding(20)
        .frame(width: 400, height: 480)
        .aquariumSurface()
    }

    /// Render a QR code for `pairingURL` at 280×280 pixels. The CIImage is
    /// produced without blur so the result stays crisp when the iPad camera
    /// scans it; `interpolation(.none)` preserves pixel edges.
    @ViewBuilder
    private var qrImage: some View {
        if let nsImage = renderQR(content: pairingURL, size: 280) {
            Image(nsImage: nsImage)
                .interpolation(.none)
                .resizable()
                .scaledToFit()
                .padding(12)
        } else {
            // Fallback: shouldn't hit since CIFilter is built-in and pairing
            // URL is never empty, but show a placeholder rather than a
            // blank rectangle so the window never looks broken.
            Text("QR render failed")
                .foregroundStyle(.red)
        }
    }

    private func renderQR(content: String, size: CGFloat) -> NSImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(content.utf8)
        filter.correctionLevel = "M"  // balance density vs recovery
        guard let ciImage = filter.outputImage else { return nil }
        // Scale up with nearest-neighbor by transforming before rasterizing.
        let scale = size / ciImage.extent.width
        let scaled = ciImage.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        let context = CIContext()
        guard let cgImage = context.createCGImage(scaled, from: scaled.extent) else {
            return nil
        }
        return NSImage(cgImage: cgImage, size: NSSize(width: size, height: size))
    }
}
#endif
