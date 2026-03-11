#pragma once

#include <lvgl.h>

namespace HUD {

/**
 * Create HUD bar overlay at bottom of screen.
 * @param parent Screen object
 */
void init(lv_obj_t* parent);

/**
 * Update HUD content from current state.
 */
void update();

/**
 * Show/hide HUD bar.
 */
void setVisible(bool visible);
bool isVisible();

}  // namespace HUD
