#pragma once

#include <lvgl.h>

/**
 * Montserrat 12 + Korean fallback (Noto Sans KR 12).
 * RAM copy of lv_font_montserrat_12 with fallback pointer set.
 * Use &font_kr_12 instead of &lv_font_montserrat_12 for labels
 * that may display Korean text (session names, timeline, etc.).
 * Initialized in displayInit().
 */
extern lv_font_t font_kr_12;

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
 * Set display backlight brightness (0-255).
 */
void setBrightness(int level);

/**
 * LVGL tick handler — call from timer ISR or task.
 */
void lvglTick();

/**
 * LVGL task handler — call from LVGL core loop.
 */
void lvglLoop();

}  // namespace UI
