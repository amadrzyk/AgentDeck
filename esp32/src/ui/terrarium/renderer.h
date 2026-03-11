#pragma once

#include <lvgl.h>

namespace Terrarium {

/**
 * Initialize terrarium canvas and static elements.
 * @param parent LVGL parent object (screen)
 */
void init(lv_obj_t* parent);

/**
 * Render one frame of the terrarium animation.
 * Called at ~30fps from LVGL timer.
 * @param dt Delta time in seconds since last frame
 */
void render(float dt);

/**
 * Get the canvas object for screen management.
 */
lv_obj_t* getCanvas();

}  // namespace Terrarium
