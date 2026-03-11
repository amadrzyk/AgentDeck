#pragma once

#include <cstdint>

// ===== Screen dimensions (set by build flags) =====
#ifndef SCREEN_W
#define SCREEN_W 480
#endif
#ifndef SCREEN_H
#define SCREEN_H 320
#endif

// ===== Network =====
constexpr uint16_t BRIDGE_DEFAULT_PORT = 9120;
constexpr uint16_t BRIDGE_PORT_MAX     = 9139;
constexpr const char* MDNS_SERVICE     = "_agentdeck";
constexpr const char* MDNS_PROTO       = "_tcp";
constexpr const char* AP_SSID          = "AgentDeck-Setup";

// ===== WebSocket =====
constexpr uint32_t WS_RECONNECT_MIN_MS  = 1000;
constexpr uint32_t WS_RECONNECT_MAX_MS  = 8000;
constexpr uint32_t WS_PING_INTERVAL_MS  = 15000;
constexpr uint32_t WS_PONG_TIMEOUT_MS   = 30000;

// ===== LVGL =====
constexpr uint32_t LVGL_TICK_MS        = 5;
constexpr uint32_t LVGL_TIMER_MS       = 5;
constexpr uint32_t RENDER_INTERVAL_MS  = 33;  // ~30fps

// ===== Terrarium =====
constexpr uint8_t  MAX_OCTOPUS         = 3;
constexpr uint8_t  MAX_TETRA           = 6;
constexpr uint8_t  MAX_BUBBLES         = 20;
constexpr uint8_t  MAX_FOOD_CRUMBS     = 10;
constexpr uint8_t  KELP_COUNT          = 3;
constexpr uint8_t  WAVE_SEGMENTS       = 20;

// ===== Timeline =====
constexpr uint8_t  TIMELINE_MAX_ENTRIES = 64;

// ===== Sin/Cos lookup table =====
constexpr uint16_t SIN_TABLE_SIZE      = 256;

// ===== FreeRTOS =====
constexpr uint8_t  CORE_NETWORK        = 0;
constexpr uint8_t  CORE_LVGL           = 1;
constexpr uint32_t STACK_NETWORK       = 8192;
constexpr uint32_t STACK_LVGL          = 16384;

// ===== Deep Sleep =====
constexpr uint32_t SLEEP_TIMEOUT_MS    = 5 * 60 * 1000;  // 5 min no connection
constexpr uint32_t SLEEP_RETRY_MS      = 30 * 1000;       // 30s mDNS retry

// ===== HUD =====
constexpr uint8_t  HUD_BAR_HEIGHT      = 24;
