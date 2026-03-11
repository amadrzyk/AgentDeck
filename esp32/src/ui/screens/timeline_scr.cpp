#include "timeline_scr.h"
#include "../theme.h"
#include "../display.h"
#include "../../state/agent_state.h"
#include "config.h"
#include <algorithm>
using std::min;

static lv_obj_t* screen = nullptr;
static lv_obj_t* topBar = nullptr;
static lv_obj_t* lblStatus = nullptr;
static lv_obj_t* lblProject = nullptr;
static lv_obj_t* lblModel = nullptr;
static lv_obj_t* listPanel = nullptr;
static lv_obj_t* hint = nullptr;

// Timeline entry labels (recycled)
constexpr int MAX_VISIBLE = 12;
static lv_obj_t* entryLabels[MAX_VISIBLE] = {nullptr};

static uint32_t typeColor(const char* type) {
    if (strcmp(type, "chat_start") == 0 || strcmp(type, "user_action") == 0)
        return Theme::TLChatStart;
    if (strcmp(type, "tool_request") == 0 || strcmp(type, "tool_exec") == 0)
        return Theme::TLToolReq;
    if (strcmp(type, "tool_resolved") == 0)
        return Theme::TLToolOk;
    if (strcmp(type, "error") == 0)
        return Theme::TLError;
    if (strcmp(type, "chat_end") == 0 || strcmp(type, "chat_response") == 0)
        return Theme::TLChatEnd;
    if (strcmp(type, "model_call") == 0 || strcmp(type, "model_response") == 0)
        return Theme::TLModelCall;
    return Theme::HUDDim;
}

static const char* typeIcon(const char* type) {
    if (strcmp(type, "chat_start") == 0 || strcmp(type, "user_action") == 0) return ">";
    if (strcmp(type, "tool_request") == 0 || strcmp(type, "tool_exec") == 0) return "#";
    if (strcmp(type, "tool_resolved") == 0) return "v";
    if (strcmp(type, "error") == 0) return "x";
    if (strcmp(type, "chat_end") == 0 || strcmp(type, "chat_response") == 0) return "*";
    if (strcmp(type, "model_call") == 0 || strcmp(type, "model_response") == 0) return "~";
    return ".";
}

static void gestureEvent(lv_event_t* e) {
    lv_dir_t dir = lv_indev_get_gesture_dir(lv_indev_active());
    if (dir == LV_DIR_BOTTOM) {
        // Swipe down → back to aquarium
        lockState();
        g_state.timelineView = false;
        unlockState();
    }
}

namespace Screens {

lv_obj_t* timelineCreate() {
    screen = lv_obj_create(NULL);
    lv_obj_set_style_bg_color(screen, lv_color_hex(Theme::TimelineBg), 0);
    lv_obj_clear_flag(screen, LV_OBJ_FLAG_SCROLLABLE);

    // Top status bar (28px)
    topBar = lv_obj_create(screen);
    lv_obj_set_size(topBar, SCREEN_W, 28);
    lv_obj_align(topBar, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_style_bg_color(topBar, lv_color_hex(0x111827), 0);
    lv_obj_set_style_bg_opa(topBar, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(topBar, 0, 0);
    lv_obj_set_style_radius(topBar, 0, 0);
    lv_obj_set_style_pad_all(topBar, 4, 0);
    lv_obj_clear_flag(topBar, LV_OBJ_FLAG_SCROLLABLE);

    // Status dot + state label
    lblStatus = lv_label_create(topBar);
    lv_obj_set_style_text_font(lblStatus, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(lblStatus, lv_color_hex(Theme::StatusGreen), 0);
    lv_obj_align(lblStatus, LV_ALIGN_LEFT_MID, 2, 0);

    // Project name
    lblProject = lv_label_create(topBar);
    lv_obj_set_style_text_font(lblProject, &font_kr_12, 0);
    lv_obj_set_style_text_color(lblProject, lv_color_hex(Theme::HUDText), 0);
    lv_obj_align(lblProject, LV_ALIGN_CENTER, 0, 0);

    // Model name
    lblModel = lv_label_create(topBar);
    lv_obj_set_style_text_font(lblModel, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(lblModel, lv_color_hex(Theme::HUDDim), 0);
    lv_obj_align(lblModel, LV_ALIGN_RIGHT_MID, -4, 0);

    // Timeline list area
    listPanel = lv_obj_create(screen);
    lv_obj_set_size(listPanel, SCREEN_W, SCREEN_H - 28 - 24);
    lv_obj_align(listPanel, LV_ALIGN_TOP_LEFT, 0, 28);
    lv_obj_set_style_bg_opa(listPanel, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(listPanel, 0, 0);
    lv_obj_set_style_pad_all(listPanel, 4, 0);
    lv_obj_set_flex_flow(listPanel, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_row(listPanel, 2, 0);
    lv_obj_set_scroll_dir(listPanel, LV_DIR_VER);

    // Pre-create entry labels
    for (int i = 0; i < MAX_VISIBLE; i++) {
        entryLabels[i] = lv_label_create(listPanel);
        lv_obj_set_width(entryLabels[i], SCREEN_W - 8);
        lv_obj_set_style_text_font(entryLabels[i], &font_kr_12, 0);
        lv_obj_set_style_text_color(entryLabels[i], lv_color_hex(Theme::HUDText), 0);
        lv_label_set_long_mode(entryLabels[i], LV_LABEL_LONG_CLIP);
        lv_label_set_text(entryLabels[i], "");
    }

    // Bottom hint
    hint = lv_label_create(screen);
    lv_obj_set_style_text_font(hint, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(hint, lv_color_hex(Theme::HUDDim), 0);
    lv_obj_align(hint, LV_ALIGN_BOTTOM_MID, 0, -4);
    lv_label_set_text(hint, "Swipe down to aquarium");

    // Gesture
    lv_obj_add_event_cb(screen, gestureEvent, LV_EVENT_GESTURE, NULL);

    return screen;
}

void timelineUpdate() {
    if (!screen) return;

    lockState();

    // Top bar
    const char* stateStr;
    uint32_t stateColor;
    switch (g_state.state) {
        case AgentState::IDLE:                 stateStr = "IDLE"; stateColor = Theme::StatusGreen; break;
        case AgentState::PROCESSING:           stateStr = "PROCESSING"; stateColor = Theme::StatusBlue; break;
        case AgentState::AWAITING_PERMISSION:  stateStr = "AWAITING"; stateColor = Theme::StatusAmber; break;
        case AgentState::AWAITING_OPTION:      stateStr = "OPTIONS"; stateColor = Theme::StatusAmber; break;
        case AgentState::AWAITING_DIFF:        stateStr = "DIFF"; stateColor = Theme::StatusAmber; break;
        default:                               stateStr = "DISCONN"; stateColor = Theme::StatusRed; break;
    }

    char statusBuf[32];
    snprintf(statusBuf, sizeof(statusBuf), "  %s", stateStr);
    lv_label_set_text(lblStatus, statusBuf);
    lv_obj_set_style_text_color(lblStatus, lv_color_hex(stateColor), 0);
    lv_label_set_text(lblProject, g_state.projectName);
    lv_label_set_text(lblModel, g_state.modelName);

    // Timeline entries (most recent first)
    int visible = min((int)g_state.timelineCount, MAX_VISIBLE);
    for (int i = 0; i < MAX_VISIBLE; i++) {
        if (i >= visible) {
            lv_label_set_text(entryLabels[i], "");
            continue;
        }
        // Reverse order — newest at top
        int entryIdx = (g_state.timelineHead + g_state.timelineCount - 1 - i) % TIMELINE_MAX_ENTRIES;
        TimelineEntry& e = g_state.timeline[entryIdx];

        // Format: HH:MM icon raw
        int hours = (e.ts / 3600) % 24;
        int minutes = (e.ts / 60) % 60;
        char buf[180];
        snprintf(buf, sizeof(buf), "%02d:%02d %s %s",
                 hours, minutes, typeIcon(e.type), e.raw);
        lv_label_set_text(entryLabels[i], buf);

        uint32_t color = typeColor(e.type);
        lv_obj_set_style_text_color(entryLabels[i], lv_color_hex(color), 0);
    }

    unlockState();
}

}  // namespace Screens
