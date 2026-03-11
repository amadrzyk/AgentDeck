#pragma once

namespace Net {

/**
 * Initialize WiFi.
 * Tries saved credentials first (8s timeout).
 * If no saved WiFi, starts AP portal "AgentDeck-Setup" (non-blocking).
 * Serial JSON connection works regardless of WiFi state.
 */
void wifiInit();

/**
 * Process WiFiManager portal (call from network loop if portal active).
 */
void wifiLoop();

/**
 * Check WiFi connection status.
 */
bool wifiConnected();

/**
 * Reset saved WiFi credentials and restart AP portal.
 */
void wifiReset();

/**
 * Get local IP address as string.
 */
const char* wifiLocalIP();

}  // namespace Net
