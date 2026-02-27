package dev.agentdeck.util

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage

/**
 * QR code scanner using CameraX + ML Kit.
 *
 * For a full implementation, this would use a CameraX preview composable.
 * This provides the scanning logic that can be integrated with a camera preview.
 */
object QrScanner {

    fun scan(context: Context, onResult: (String?) -> Unit) {
        if (!hasCameraPermission(context)) {
            Toast.makeText(context, "Camera permission required for QR scanning", Toast.LENGTH_SHORT).show()
            onResult(null)
            return
        }

        // In a real implementation, this would launch a camera preview activity/composable.
        // For now, provide the analyzer that processes frames.
        Toast.makeText(context, "QR Scanner: use manual entry for now", Toast.LENGTH_SHORT).show()
        onResult(null)
    }

    fun hasCameraPermission(context: Context): Boolean {
        return ContextCompat.checkSelfPermission(
            context, Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
    }

    /**
     * ImageAnalysis.Analyzer for CameraX that detects QR codes.
     * Wire this into a CameraX pipeline for real-time scanning.
     */
    class QrAnalyzer(private val onQrDetected: (String) -> Unit) : ImageAnalysis.Analyzer {

        private val scanner = BarcodeScanning.getClient()
        private var detected = false

        @androidx.camera.core.ExperimentalGetImage
        override fun analyze(imageProxy: ImageProxy) {
            if (detected) {
                imageProxy.close()
                return
            }

            val mediaImage = imageProxy.image
            if (mediaImage != null) {
                val image = InputImage.fromMediaImage(
                    mediaImage,
                    imageProxy.imageInfo.rotationDegrees,
                )
                scanner.process(image)
                    .addOnSuccessListener { barcodes ->
                        for (barcode in barcodes) {
                            if (barcode.valueType == Barcode.TYPE_URL || barcode.valueType == Barcode.TYPE_TEXT) {
                                val value = barcode.rawValue
                                if (value != null && value.startsWith("ws://")) {
                                    detected = true
                                    onQrDetected(value)
                                    break
                                }
                            }
                        }
                    }
                    .addOnCompleteListener {
                        imageProxy.close()
                    }
            } else {
                imageProxy.close()
            }
        }
    }
}
