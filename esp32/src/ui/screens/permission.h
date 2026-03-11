#pragma once

#include <lvgl.h>

namespace Screens {

/**
 * Create permission modal overlay (shown on top of aquarium).
 */
void permissionCreate(lv_obj_t* parent);

/**
 * Show/hide permission modal based on state.
 */
void permissionUpdate();

/**
 * Check if modal is currently visible.
 */
bool permissionVisible();

}  // namespace Screens
