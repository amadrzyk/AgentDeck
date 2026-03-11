/**
 * AgentDeck ESP32-S3 Touch Display Client
 *
 * FreeRTOS dual-core architecture:
 *   Core 0: WiFi + mDNS + WebSocket (network task)
 *   Core 1: LVGL rendering + touch (UI task)
 *
 * Screens:
 *   Splash → Aquarium ↔ Timeline (swipe)
 *   Permission modal overlay on Aquarium
 */

#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/semphr.h>

#include "config.h"
#include "state/agent_state.h"
#include "net/serial_client.h"
#include "net/wifi_manager.h"
#include "net/mdns_discovery.h"
#include "net/ws_client.h"
#include "ui/display.h"
#include "ui/screens/splash.h"
#include "ui/screens/aquarium.h"
#include "ui/screens/timeline_scr.h"
#include "ui/screens/permission.h"

// ===== Global state =====
DashboardState g_state;
SemaphoreHandle_t g_stateMutex = nullptr;

// ===== Screen objects =====
static lv_obj_t* scrSplash = nullptr;
static lv_obj_t* scrAquarium = nullptr;
static lv_obj_t* scrTimeline = nullptr;

static enum {
    VIEW_SPLASH,
    VIEW_AQUARIUM,
    VIEW_TIMELINE
} currentView = VIEW_SPLASH;


// ===== Network task (Core 0) =====
static void networkTask(void* param) {
    Serial.println("[Net] Task started on core 0");

    // 1. Serial JSON listener (always active — USB is always connected)
    Net::serialInit();

    // 2. Connect WiFi (non-blocking attempt)
    Net::wifiInit();

    // 3. Start mDNS discovery
    Net::mdnsInit();

    // 4. Init WebSocket
    Net::wsInit();

    Net::BridgeInfo bridge;
    bool bridgeFound = false;

    while (true) {
        // === Always poll serial (USB JSON from bridge) ===
        Net::serialLoop();

        // === WiFi portal (non-blocking, processes captive portal if active) ===
        Net::wifiLoop();

        // === WiFi WebSocket (parallel to serial) ===
        // Only attempt WiFi discovery if serial is not the active connection
        if (!bridgeFound || !Net::wsConnected()) {
            if (Net::wifiConnected() && Net::mdnsPoll(bridge)) {
                Serial.printf("[Net] Bridge found via mDNS: %s:%d\n", bridge.ip, bridge.port);
                lockState();
                strncpy(g_state.bridgeIp, bridge.ip, sizeof(g_state.bridgeIp) - 1);
                g_state.bridgePort = bridge.port;
                strncpy(g_state.authToken, bridge.token, sizeof(g_state.authToken) - 1);
                unlockState();

                Net::wsConnect(bridge.ip, bridge.port, bridge.token);
                bridgeFound = true;
            }
        }

        // Process WebSocket events
        Net::wsLoop();

        // Update combined connection status (serial OR wifi)
        bool conn = Net::serialConnected() || Net::wsConnected();
        lockState();
        g_state.wsConnected = conn;
        unlockState();

        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

// ===== UI task (Core 1) =====
static void uiTask(void* param) {
    Serial.println("[UI] Task started on core 1");

    // Initialize display + LVGL
    UI::displayInit();

    // Create screens
    scrSplash = Screens::splashCreate();
    lv_screen_load(scrSplash);
    Screens::splashSetStatus("Connecting WiFi...");

    scrAquarium = Screens::aquariumCreate();
    Screens::permissionCreate(scrAquarium);
    scrTimeline = Screens::timelineCreate();

    Serial.println("[UI] Screens created, entering main loop");

    // DEBUG: skip splash, go straight to aquarium for terrarium testing
    lv_screen_load(scrAquarium);
    currentView = VIEW_AQUARIUM;

    uint32_t lastFrameMs = millis();
    bool wasTimelineView = false;

    while (true) {
        uint32_t now = millis();
        uint32_t dt_ms = now - lastFrameMs;
        float dt = dt_ms / 1000.0f;
        lastFrameMs = now;
        if (dt > 0.1f) dt = 0.1f;

        // LVGL tick
        if (dt_ms > 0) lv_tick_inc(dt_ms);

        // Read view state
        lockState();
        bool connected = g_state.wsConnected;
        bool wantTimeline = g_state.timelineView;
        unlockState();

        // Screen transitions
        if (currentView == VIEW_SPLASH && connected) {
            lv_screen_load_anim(scrAquarium, LV_SCR_LOAD_ANIM_FADE_IN, 300, 0, false);
            currentView = VIEW_AQUARIUM;
        } else if (currentView == VIEW_SPLASH && !connected) {
            if (Net::wifiConnected()) {
                Screens::splashSetStatus("Searching for bridge...");
            }
        }

        // Aquarium ↔ Timeline swipe
        if (currentView == VIEW_AQUARIUM && wantTimeline && !wasTimelineView) {
            lv_screen_load_anim(scrTimeline, LV_SCR_LOAD_ANIM_MOVE_TOP, 200, 0, false);
            currentView = VIEW_TIMELINE;
        } else if (currentView == VIEW_TIMELINE && !wantTimeline && wasTimelineView) {
            lv_screen_load_anim(scrAquarium, LV_SCR_LOAD_ANIM_MOVE_BOTTOM, 200, 0, false);
            currentView = VIEW_AQUARIUM;
        }
        wasTimelineView = wantTimeline;

        // Disconnect → splash (disabled during terrarium debug)
        // if (!connected && currentView != VIEW_SPLASH) {
        //     lv_screen_load_anim(scrSplash, LV_SCR_LOAD_ANIM_FADE_IN, 300, 0, false);
        //     currentView = VIEW_SPLASH;
        //     Screens::splashSetStatus("Reconnecting...");
        // }

        // Update current view
        switch (currentView) {
            case VIEW_AQUARIUM:
                Screens::aquariumUpdate(dt);
                Screens::permissionUpdate();
                break;
            case VIEW_TIMELINE:
                Screens::timelineUpdate();
                break;
            case VIEW_SPLASH:
                break;
        }

        // LVGL timer handler
        lv_timer_handler();

        // ~5ms yield for smooth animation
        vTaskDelay(pdMS_TO_TICKS(5));
    }
}

// ===== Arduino setup =====
void setup() {
    Serial.begin(115200);
    delay(100);
    Serial.println("\n=== AgentDeck ESP32-S3 Display ===");
    Serial.printf("Board: %s  Screen: %dx%d\n",
#if defined(BOARD_IPS_35)
        "IPS 3.5\"",
#elif defined(BOARD_BOX_86)
        "86 Box 4\"",
#elif defined(BOARD_ROUND_AMOLED)
        "AMOLED Round 1.8\"",
#else
        "Unknown",
#endif
        SCREEN_W, SCREEN_H);

    // Init PSRAM
    if (psramFound()) {
        Serial.printf("PSRAM: %d KB free\n", ESP.getFreePsram() / 1024);
    } else {
        Serial.println("WARNING: No PSRAM found!");
    }

    // Init state
    g_stateMutex = xSemaphoreCreateMutex();
    g_state.reset();

    // Launch tasks on separate cores
    xTaskCreatePinnedToCore(networkTask, "net", STACK_NETWORK, NULL, 1, NULL, CORE_NETWORK);
    xTaskCreatePinnedToCore(uiTask, "ui", STACK_LVGL, NULL, 2, NULL, CORE_LVGL);
}

void loop() {
    // Main loop unused — everything runs in FreeRTOS tasks
    vTaskDelay(portMAX_DELAY);
}
