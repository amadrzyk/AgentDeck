#include "serial_client.h"
#include "protocol.h"
#include "../state/agent_state.h"
#include <Arduino.h>

// Line buffer for incoming serial JSON
static constexpr int SERIAL_BUF_SIZE = 4096;
static char serialBuf[SERIAL_BUF_SIZE];
static int serialBufPos = 0;

// Connection tracking: consider "connected" if we got JSON within timeout
static constexpr uint32_t SERIAL_TIMEOUT_MS = 10000;  // 10s
static uint32_t lastSerialJsonMs = 0;
static bool hasReceivedJson = false;

namespace Net {

void serialInit() {
    // Serial is already initialized in setup() at 115200
    serialBufPos = 0;
    hasReceivedJson = false;
    Serial.println("[Serial] JSON listener ready");
}

void serialLoop() {
    while (Serial.available()) {
        char c = Serial.read();

        if (c == '\n' || c == '\r') {
            if (serialBufPos > 0) {
                serialBuf[serialBufPos] = '\0';

                // Only parse lines that look like JSON objects
                if (serialBuf[0] == '{') {
                    Protocol::parseMessage(serialBuf, serialBufPos);
                    lastSerialJsonMs = millis();

                    if (!hasReceivedJson) {
                        hasReceivedJson = true;
                        Serial.println("[Serial] First JSON received — bridge connected via USB");

                        lockState();
                        g_state.wsConnected = true;  // Reuse connection flag
                        unlockState();
                    }
                }

                serialBufPos = 0;
            }
        } else {
            if (serialBufPos < SERIAL_BUF_SIZE - 1) {
                serialBuf[serialBufPos++] = c;
            } else {
                // Buffer overflow — discard line
                serialBufPos = 0;
            }
        }
    }

    // Detect serial disconnect (no JSON for timeout period)
    if (hasReceivedJson && (millis() - lastSerialJsonMs > SERIAL_TIMEOUT_MS)) {
        hasReceivedJson = false;
        Serial.println("[Serial] Bridge timeout — no JSON received");

        lockState();
        if (!Net::serialConnected()) {
            // Only mark disconnected if WiFi WS is also not connected
            // (handled by caller in networkTask)
        }
        unlockState();
    }
}

bool serialConnected() {
    return hasReceivedJson && (millis() - lastSerialJsonMs < SERIAL_TIMEOUT_MS);
}

}  // namespace Net
