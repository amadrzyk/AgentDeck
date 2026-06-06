#pragma once

// ===== LilyGO TTGO T-Display 1.14" (ST7789 SPI + 2 buttons) =====
// MCU: ESP32-D0WDQ6 (Classic ESP32, no PSRAM)
// Flash: 16MB

#define BOARD_DISPLAY_TYPE   DISPLAY_ST7789_SPI

// Display SPI Pins
#define BOARD_PIN_SPI_MOSI   19
#define BOARD_PIN_SPI_SCLK   18
#define BOARD_PIN_SPI_CS     5
#define BOARD_PIN_SPI_DC     16
#define BOARD_PIN_SPI_RST    23
#define BOARD_PIN_BL         4

// Buttons (Active LOW, internal pull-up)
#define BOARD_PIN_BTN1       35
#define BOARD_PIN_BTN2       0

// Display settings
#define BOARD_ROTATION       0     // Portrait native: 135 x 240
#define BOARD_INVERT         true  // Invert required for TTGO ST7789
#define BOARD_NATIVE_W       135
#define BOARD_NATIVE_H       240

// System dimensions
#define SCREEN_W             135
#define SCREEN_H             240
