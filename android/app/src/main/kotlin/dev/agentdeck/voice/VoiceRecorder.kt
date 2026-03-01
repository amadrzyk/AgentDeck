package dev.agentdeck.voice

import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import dev.agentdeck.net.BridgeConnection
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import kotlin.math.sqrt

private const val TAG = "VoiceRecorder"
private const val SAMPLE_RATE = 16000
private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
private const val MIN_RECORDING_MS = 500L
private const val SILENCE_THRESHOLD = 0.001

class VoiceRecorder(private val context: Context) {

    private var audioRecord: AudioRecord? = null
    private var isRecording = false
    private var pcmStream: ByteArrayOutputStream? = null
    private var recordingStartMs: Long = 0L

    fun start() {
        if (isRecording) return

        val bufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)
            .coerceAtLeast(4096)

        try {
            audioRecord = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                SAMPLE_RATE,
                CHANNEL_CONFIG,
                AUDIO_FORMAT,
                bufferSize,
            )
        } catch (e: SecurityException) {
            Log.e(TAG, "RECORD_AUDIO permission not granted", e)
            return
        }

        if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
            Log.e(TAG, "AudioRecord failed to initialize")
            audioRecord?.release()
            audioRecord = null
            return
        }

        pcmStream = ByteArrayOutputStream()
        isRecording = true
        recordingStartMs = System.currentTimeMillis()
        audioRecord?.startRecording()

        // Read in a background thread
        Thread {
            val buffer = ShortArray(bufferSize / 2)
            while (isRecording) {
                val read = audioRecord?.read(buffer, 0, buffer.size) ?: -1
                if (read > 0) {
                    // Convert shorts to little-endian bytes
                    val bytes = ByteArray(read * 2)
                    for (i in 0 until read) {
                        bytes[i * 2] = (buffer[i].toInt() and 0xFF).toByte()
                        bytes[i * 2 + 1] = (buffer[i].toInt() shr 8 and 0xFF).toByte()
                    }
                    pcmStream?.write(bytes)
                }
            }
        }.start()

        Log.i(TAG, "Recording started")
    }

    /**
     * Stop recording and upload to bridge for transcription.
     * Returns transcription text or null if silence/too short/error.
     */
    suspend fun stopAndTranscribe(connection: BridgeConnection): String? {
        if (!isRecording) return null

        isRecording = false
        val elapsedMs = System.currentTimeMillis() - recordingStartMs

        audioRecord?.stop()
        audioRecord?.release()
        audioRecord = null

        val pcmData = pcmStream?.toByteArray() ?: return null
        pcmStream = null

        // Check minimum duration
        if (elapsedMs < MIN_RECORDING_MS) {
            Log.w(TAG, "Recording too short: ${elapsedMs}ms")
            return null
        }

        // Check RMS silence
        val rms = computeRms(pcmData)
        if (rms < SILENCE_THRESHOLD) {
            Log.w(TAG, "Recording is silence (RMS=$rms)")
            return null
        }

        // Build WAV file
        val wavData = buildWav(pcmData)

        // Upload to bridge
        return withContext(Dispatchers.IO) {
            connection.uploadVoiceForTranscription(wavData)
        }
    }

    fun cancel() {
        if (!isRecording) return
        isRecording = false
        audioRecord?.stop()
        audioRecord?.release()
        audioRecord = null
        pcmStream = null
        Log.i(TAG, "Recording cancelled")
    }

    val recording: Boolean get() = isRecording

    private fun computeRms(pcmData: ByteArray): Double {
        if (pcmData.size < 2) return 0.0

        var sumSquares = 0.0
        val sampleCount = pcmData.size / 2

        for (i in 0 until sampleCount) {
            val lo = pcmData[i * 2].toInt() and 0xFF
            val hi = pcmData[i * 2 + 1].toInt()
            val sample = (hi shl 8 or lo).toShort()
            val normalized = sample.toDouble() / 32768.0
            sumSquares += normalized * normalized
        }

        return sqrt(sumSquares / sampleCount)
    }

    private fun buildWav(pcmData: ByteArray): ByteArray {
        val totalDataLen = pcmData.size + 36
        val channels = 1
        val bitsPerSample = 16
        val byteRate = SAMPLE_RATE * channels * bitsPerSample / 8
        val blockAlign = channels * bitsPerSample / 8

        val header = ByteArray(44)
        // RIFF header
        header[0] = 'R'.code.toByte()
        header[1] = 'I'.code.toByte()
        header[2] = 'F'.code.toByte()
        header[3] = 'F'.code.toByte()
        writeInt32LE(header, 4, totalDataLen)
        header[8] = 'W'.code.toByte()
        header[9] = 'A'.code.toByte()
        header[10] = 'V'.code.toByte()
        header[11] = 'E'.code.toByte()
        // fmt sub-chunk
        header[12] = 'f'.code.toByte()
        header[13] = 'm'.code.toByte()
        header[14] = 't'.code.toByte()
        header[15] = ' '.code.toByte()
        writeInt32LE(header, 16, 16) // sub-chunk size
        writeInt16LE(header, 20, 1)  // PCM format
        writeInt16LE(header, 22, channels)
        writeInt32LE(header, 24, SAMPLE_RATE)
        writeInt32LE(header, 28, byteRate)
        writeInt16LE(header, 32, blockAlign)
        writeInt16LE(header, 34, bitsPerSample)
        // data sub-chunk
        header[36] = 'd'.code.toByte()
        header[37] = 'a'.code.toByte()
        header[38] = 't'.code.toByte()
        header[39] = 'a'.code.toByte()
        writeInt32LE(header, 40, pcmData.size)

        return header + pcmData
    }

    private fun writeInt32LE(buf: ByteArray, offset: Int, value: Int) {
        buf[offset] = (value and 0xFF).toByte()
        buf[offset + 1] = (value shr 8 and 0xFF).toByte()
        buf[offset + 2] = (value shr 16 and 0xFF).toByte()
        buf[offset + 3] = (value shr 24 and 0xFF).toByte()
    }

    private fun writeInt16LE(buf: ByteArray, offset: Int, value: Int) {
        buf[offset] = (value and 0xFF).toByte()
        buf[offset + 1] = (value shr 8 and 0xFF).toByte()
    }
}
