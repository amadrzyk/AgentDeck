// VoiceRecorder.swift — AVAudioEngine recording → WAV → HTTP POST

import Foundation
@preconcurrency import AVFoundation
import Combine

final class VoiceRecorder: ObservableObject, @unchecked Sendable {
    private final class ConversionInputBox: @unchecked Sendable {
        var inputUsed = false
    }

    enum State: Sendable {
        case idle
        case recording
        case transcribing
        case error(String)
    }

    @Published private(set) var state: State = .idle
    @Published private(set) var transcription: String?
    @Published private(set) var recordingDuration: TimeInterval = 0

    private var audioEngine: AVAudioEngine?
    private var tempFileURL: URL?
    private var startTime: Date?
    private var pcmBuffers: [AVAudioPCMBuffer] = []
    private var rmsSum: Float = 0
    private var rmsSamples: Int = 0

    // MARK: - Record

    func startRecording() {
        #if os(iOS)
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .default)
            try session.setActive(true)
        } catch {
            state = .error("Audio session: \(error.localizedDescription)")
            return
        }
        #endif

        let engine = AVAudioEngine()
        let inputNode = engine.inputNode
        let format = inputNode.outputFormat(forBus: 0)

        // Target: 16kHz mono — convert on flush
        pcmBuffers.removeAll()
        rmsSum = 0
        rmsSamples = 0

        inputNode.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, _ in
            guard let self else { return }
            self.pcmBuffers.append(buffer)

            // RMS calculation
            if let channelData = buffer.floatChannelData?[0] {
                let count = Int(buffer.frameLength)
                var sum: Float = 0
                for i in 0..<count {
                    sum += channelData[i] * channelData[i]
                }
                self.rmsSum += sum
                self.rmsSamples += count
            }
        }

        do {
            try engine.start()
            audioEngine = engine
            startTime = Date()
            state = .recording
        } catch {
            state = .error("Engine start: \(error.localizedDescription)")
        }
    }

    func stopRecording() -> URL? {
        guard case .recording = state else { return nil }

        audioEngine?.inputNode.removeTap(onBus: 0)
        audioEngine?.stop()
        recordingDuration = Date().timeIntervalSince(startTime ?? Date())

        // RMS silence check
        if rmsSamples > 0 {
            let rms = sqrt(rmsSum / Float(rmsSamples))
            if rms < 0.001 {
                state = .idle
                return nil  // silence — prevent whisper hallucination
            }
        }

        // Convert buffers to 16kHz mono WAV
        guard let url = writeWAV() else {
            state = .error("WAV write failed")
            return nil
        }

        tempFileURL = url
        state = .transcribing
        return url
    }

    func cancel() {
        audioEngine?.inputNode.removeTap(onBus: 0)
        audioEngine?.stop()
        audioEngine = nil
        pcmBuffers.removeAll()
        state = .idle
        transcription = nil
    }

    // MARK: - WAV Writer

    private func writeWAV() -> URL? {
        guard !pcmBuffers.isEmpty,
              let firstBuffer = pcmBuffers.first else { return nil }

        let sourceFormat = firstBuffer.format
        let sampleRate: Double = 16000
        let channels: UInt32 = 1

        // Target format: 16-bit PCM, 16kHz, mono
        guard let targetFormat = AVAudioFormat(commonFormat: .pcmFormatInt16,
                                               sampleRate: sampleRate,
                                               channels: channels,
                                               interleaved: true) else { return nil }

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("agentdeck_voice_\(Int(Date().timeIntervalSince1970)).wav")

        guard let audioFile = try? AVAudioFile(forWriting: url,
                                                settings: targetFormat.settings) else { return nil }

        // Convert and write each buffer
        guard let converter = AVAudioConverter(from: sourceFormat, to: targetFormat) else { return nil }

        for buffer in pcmBuffers {
            let frameCount = AVAudioFrameCount(
                Double(buffer.frameLength) * sampleRate / sourceFormat.sampleRate
            )
            guard frameCount > 0,
                  let convertedBuffer = AVAudioPCMBuffer(pcmFormat: targetFormat,
                                                          frameCapacity: frameCount) else { continue }

            var error: NSError?
            let inputBox = ConversionInputBox()
            converter.convert(to: convertedBuffer, error: &error) { _, outStatus in
                if inputBox.inputUsed {
                    outStatus.pointee = .noDataNow
                    return nil
                }
                inputBox.inputUsed = true
                outStatus.pointee = .haveData
                return buffer
            }

            if error == nil, convertedBuffer.frameLength > 0 {
                try? audioFile.write(from: convertedBuffer)
            }
        }

        pcmBuffers.removeAll()
        return url
    }

    // MARK: - Transcribe

    func transcribe(fileURL: URL, bridgeHost: String, bridgePort: Int) async throws -> String {
        state = .transcribing

        let url = URL(string: "http://\(bridgeHost):\(bridgePort)/voice/transcribe")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("audio/wav", forHTTPHeaderField: "Content-Type")
        request.httpBody = try Data(contentsOf: fileURL)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            let errorText = String(data: data, encoding: .utf8) ?? "Unknown error"
            state = .error(errorText)
            throw NSError(domain: "VoiceRecorder", code: -1, userInfo: [NSLocalizedDescriptionKey: errorText])
        }

        // Clean up temp file
        try? FileManager.default.removeItem(at: fileURL)

        let text = String(data: data, encoding: .utf8) ?? ""
        transcription = text
        state = .idle
        return text
    }
}
