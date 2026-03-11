#include "permission.h"
#include "../theme.h"
#include "../../state/agent_state.h"
#include "../../net/ws_client.h"
#include "config.h"

static lv_obj_t* overlay = nullptr;
static lv_obj_t* modal = nullptr;
static lv_obj_t* lblQuestion = nullptr;
static lv_obj_t* btnContainer = nullptr;
static lv_obj_t* optionBtns[4] = {nullptr};
static lv_obj_t* optionLabels[4] = {nullptr};
static bool shown = false;

static void onOptionClick(lv_event_t* e) {
    int idx = (int)(intptr_t)lv_event_get_user_data(e);

    lockState();
    if (idx < g_state.optionCount) {
        // Use shortcut or select by index
        PromptOption& opt = g_state.options[idx];
        if (opt.action[0] != '\0') {
            Net::wsSendRespond(opt.action);
        } else {
            Net::wsSendSelectOption(idx);
        }
    }
    unlockState();
}

namespace Screens {

void permissionCreate(lv_obj_t* parent) {
    // Semi-transparent overlay
    overlay = lv_obj_create(parent);
    lv_obj_set_size(overlay, SCREEN_W, SCREEN_H);
    lv_obj_align(overlay, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_style_bg_color(overlay, lv_color_hex(0x000000), 0);
    lv_obj_set_style_bg_opa(overlay, LV_OPA_50, 0);
    lv_obj_set_style_border_width(overlay, 0, 0);
    lv_obj_clear_flag(overlay, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(overlay, LV_OBJ_FLAG_HIDDEN);

    // Modal card
    int modalW = SCREEN_W * 3 / 4;
    int modalH = SCREEN_H / 2;
    modal = lv_obj_create(overlay);
    lv_obj_set_size(modal, modalW, modalH);
    lv_obj_center(modal);
    lv_obj_set_style_bg_color(modal, lv_color_hex(0x111827), 0);
    lv_obj_set_style_bg_opa(modal, LV_OPA_90, 0);
    lv_obj_set_style_border_color(modal, lv_color_hex(Theme::HUDDim), 0);
    lv_obj_set_style_border_width(modal, 1, 0);
    lv_obj_set_style_radius(modal, 8, 0);
    lv_obj_set_style_pad_all(modal, 12, 0);
    lv_obj_set_flex_flow(modal, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_row(modal, 8, 0);
    lv_obj_clear_flag(modal, LV_OBJ_FLAG_SCROLLABLE);

    // Question text
    lblQuestion = lv_label_create(modal);
    lv_obj_set_width(lblQuestion, modalW - 24);
    lv_obj_set_style_text_color(lblQuestion, lv_color_hex(Theme::HUDText), 0);
    lv_obj_set_style_text_font(lblQuestion, &lv_font_montserrat_14, 0);
    lv_label_set_long_mode(lblQuestion, LV_LABEL_LONG_WRAP);
    lv_label_set_text(lblQuestion, "");

    // Button container
    btnContainer = lv_obj_create(modal);
    lv_obj_set_width(btnContainer, modalW - 24);
    lv_obj_set_flex_grow(btnContainer, 1);
    lv_obj_set_style_bg_opa(btnContainer, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(btnContainer, 0, 0);
    lv_obj_set_style_pad_all(btnContainer, 0, 0);
    lv_obj_set_flex_flow(btnContainer, LV_FLEX_FLOW_ROW_WRAP);
    lv_obj_set_style_pad_row(btnContainer, 6, 0);
    lv_obj_set_style_pad_column(btnContainer, 6, 0);
    lv_obj_clear_flag(btnContainer, LV_OBJ_FLAG_SCROLLABLE);

    // Pre-create 4 option buttons
    for (int i = 0; i < 4; i++) {
        optionBtns[i] = lv_btn_create(btnContainer);
        lv_obj_set_size(optionBtns[i], (modalW - 36) / 2, 36);
        lv_obj_set_style_bg_color(optionBtns[i], lv_color_hex(0x1E293B), 0);
        lv_obj_set_style_radius(optionBtns[i], 6, 0);
        lv_obj_add_event_cb(optionBtns[i], onOptionClick, LV_EVENT_CLICKED,
                            (void*)(intptr_t)i);

        optionLabels[i] = lv_label_create(optionBtns[i]);
        lv_obj_set_style_text_color(optionLabels[i], lv_color_hex(Theme::HUDText), 0);
        lv_obj_set_style_text_font(optionLabels[i], &lv_font_montserrat_12, 0);
        lv_obj_center(optionLabels[i]);
        lv_label_set_text(optionLabels[i], "");
        lv_obj_add_flag(optionBtns[i], LV_OBJ_FLAG_HIDDEN);
    }
}

void permissionUpdate() {
    if (!overlay) return;

    lockState();
    bool shouldShow = (g_state.state == AgentState::AWAITING_PERMISSION ||
                       g_state.state == AgentState::AWAITING_OPTION ||
                       g_state.state == AgentState::AWAITING_DIFF);
    unlockState();

    if (shouldShow && !shown) {
        lv_obj_clear_flag(overlay, LV_OBJ_FLAG_HIDDEN);
        shown = true;

        lockState();
        lv_label_set_text(lblQuestion, g_state.question);

        for (int i = 0; i < 4; i++) {
            if (i < g_state.optionCount) {
                lv_label_set_text(optionLabels[i], g_state.options[i].label);
                lv_obj_clear_flag(optionBtns[i], LV_OBJ_FLAG_HIDDEN);

                // Highlight recommended
                if (g_state.options[i].recommended) {
                    lv_obj_set_style_bg_color(optionBtns[i], lv_color_hex(0x1E40AF), 0);
                } else {
                    lv_obj_set_style_bg_color(optionBtns[i], lv_color_hex(0x1E293B), 0);
                }
            } else {
                lv_obj_add_flag(optionBtns[i], LV_OBJ_FLAG_HIDDEN);
            }
        }
        unlockState();

    } else if (!shouldShow && shown) {
        lv_obj_add_flag(overlay, LV_OBJ_FLAG_HIDDEN);
        shown = false;
    }
}

bool permissionVisible() {
    return shown;
}

}  // namespace Screens
