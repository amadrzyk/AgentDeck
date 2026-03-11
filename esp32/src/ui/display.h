#pragma once

#include <lvgl.h>

namespace UI {

/**
 * Initialize display driver (LovyanGFX), LVGL, touch input.
 * Must be called from LVGL core (Core 1).
 */
void displayInit();

/**
 * Get the main LVGL display pointer.
 */
lv_display_t* getDisplay();

/**
 * LVGL tick handler — call from timer ISR or task.
 */
void lvglTick();

/**
 * LVGL task handler — call from LVGL core loop.
 */
void lvglLoop();

}  // namespace UI
