#pragma once

#include <lvgl.h>

namespace Screens {

/**
 * Create the aquarium (main) screen with terrarium + HUD.
 */
lv_obj_t* aquariumCreate();

/**
 * Called every frame (~30fps) to animate.
 */
void aquariumUpdate(float dt);

}  // namespace Screens
