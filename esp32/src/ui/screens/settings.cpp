#include "settings.h"
#include "../theme.h"
#include "../../net/wifi_manager.h"
#include "config.h"
#include <cstdio>

static lv_obj_t* screen = nullptr;

static void onWifiReset(lv_event_t* e) {
    Net::wifiReset();
}

namespace Screens {

lv_obj_t* settingsCreate() {
    screen = lv_obj_create(NULL);
    lv_obj_set_style_bg_color(screen, lv_color_hex(Theme::DeepSea), 0);
    lv_obj_clear_flag(screen, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_flex_flow(screen, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_all(screen, 20, 0);
    lv_obj_set_style_pad_row(screen, 12, 0);

    // Title
    lv_obj_t* title = lv_label_create(screen);
    lv_obj_set_style_text_color(title, lv_color_hex(Theme::HUDText), 0);
    lv_obj_set_style_text_font(title, &lv_font_montserrat_20, 0);
    lv_label_set_text(title, "Settings");

    // WiFi info
    lv_obj_t* wifiInfo = lv_label_create(screen);
    lv_obj_set_style_text_color(wifiInfo, lv_color_hex(Theme::HUDDim), 0);
    lv_obj_set_style_text_font(wifiInfo, &lv_font_montserrat_12, 0);
    char buf[64];
    snprintf(buf, sizeof(buf), "WiFi: %s", Net::wifiLocalIP());
    lv_label_set_text(wifiInfo, buf);

    // WiFi reset button
    lv_obj_t* btnReset = lv_btn_create(screen);
    lv_obj_set_size(btnReset, 200, 40);
    lv_obj_set_style_bg_color(btnReset, lv_color_hex(0x7F1D1D), 0);
    lv_obj_set_style_radius(btnReset, 6, 0);
    lv_obj_add_event_cb(btnReset, onWifiReset, LV_EVENT_CLICKED, NULL);

    lv_obj_t* lblReset = lv_label_create(btnReset);
    lv_obj_set_style_text_color(lblReset, lv_color_hex(Theme::HUDText), 0);
    lv_obj_center(lblReset);
    lv_label_set_text(lblReset, "Reset WiFi");

    // Brightness slider
    lv_obj_t* lblBright = lv_label_create(screen);
    lv_obj_set_style_text_color(lblBright, lv_color_hex(Theme::HUDDim), 0);
    lv_obj_set_style_text_font(lblBright, &lv_font_montserrat_12, 0);
    lv_label_set_text(lblBright, "Brightness");

    // Version
    lv_obj_t* lblVer = lv_label_create(screen);
    lv_obj_set_style_text_color(lblVer, lv_color_hex(Theme::HUDDim), 0);
    lv_obj_set_style_text_font(lblVer, &lv_font_montserrat_12, 0);
    lv_label_set_text(lblVer, "AgentDeck Display v0.1.0");

    return screen;
}

}  // namespace Screens
