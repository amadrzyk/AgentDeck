#include "aquarium.h"
#include "../terrarium/renderer.h"
#include "../widgets/hud_bar.h"
#include "../../state/agent_state.h"
#include "config.h"

static lv_obj_t* screen = nullptr;

// Gesture state for swipe detection
static lv_point_t touchStart;
static bool tracking = false;

static void gestureEvent(lv_event_t* e) {
    lv_dir_t dir = lv_indev_get_gesture_dir(lv_indev_active());
    if (dir == LV_DIR_TOP) {
        // Swipe up → switch to timeline
        lockState();
        g_state.timelineView = true;
        unlockState();
    }
}

static void touchEvent(lv_event_t* e) {
    lv_event_code_t code = lv_event_get_code(e);
    if (code == LV_EVENT_SHORT_CLICKED) {
        // Tap → toggle HUD visibility
        HUD::setVisible(!HUD::isVisible());
    }
}

namespace Screens {

lv_obj_t* aquariumCreate() {
    screen = lv_obj_create(NULL);
    lv_obj_set_style_bg_color(screen, lv_color_hex(0x000000), 0);
    lv_obj_clear_flag(screen, LV_OBJ_FLAG_SCROLLABLE);

    // Create terrarium canvas (full screen)
    Terrarium::init(screen);

    // Create HUD overlay
    HUD::init(screen);

    // Gesture detection for swipe up → timeline
    lv_obj_add_event_cb(screen, gestureEvent, LV_EVENT_GESTURE, NULL);
    lv_obj_add_event_cb(screen, touchEvent, LV_EVENT_SHORT_CLICKED, NULL);

    return screen;
}

void aquariumUpdate(float dt) {
    // Render terrarium frame
    Terrarium::render(dt);

    // Update HUD data
    HUD::update();
}

}  // namespace Screens
