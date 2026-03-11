#pragma once

#include <lvgl.h>

namespace Screens {

/**
 * Create the timeline screen (full-text event log).
 */
lv_obj_t* timelineCreate();

/**
 * Refresh timeline content from state.
 */
void timelineUpdate();

}  // namespace Screens
