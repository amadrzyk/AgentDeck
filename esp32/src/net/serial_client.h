#pragma once

namespace Net {

/**
 * Initialize serial JSON listener.
 * Reads newline-delimited JSON from Serial (same USB used for debug).
 * Lines starting with '{' are parsed as bridge protocol messages.
 */
void serialInit();

/**
 * Poll serial for incoming JSON messages. Call from network task loop.
 * Non-blocking — returns immediately if no data available.
 */
void serialLoop();

/**
 * Check if we've received any serial JSON recently (within timeout).
 */
bool serialConnected();

}  // namespace Net
