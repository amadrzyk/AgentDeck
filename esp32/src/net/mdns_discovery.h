#pragma once

#include <cstdint>

namespace Net {

struct BridgeInfo {
    char ip[16];
    uint16_t port;
    char token[40];
    char project[40];
    char agent[16];
    bool found;
};

/**
 * Initialize mDNS and start browsing for _agentdeck._tcp services.
 */
void mdnsInit();

/**
 * Poll for discovered bridges. Non-blocking.
 * Returns true if a new bridge was found since last call.
 */
bool mdnsPoll(BridgeInfo& out);

/**
 * Force a fresh mDNS query.
 */
void mdnsRefresh();

}  // namespace Net
