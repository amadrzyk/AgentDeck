#pragma once

#include <cstddef>

namespace Protocol {

/**
 * Parse an incoming JSON message from the bridge WebSocket.
 * Updates g_state accordingly (thread-safe via mutex).
 */
void parseMessage(const char* json, size_t length);

}  // namespace Protocol
