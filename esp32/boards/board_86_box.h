#pragma once

// ===== ESP32-S3-4848S040 — 86 Box 4" 480x480 (ST7701 RGB parallel + GT911) =====
// Port: cu.usbserial-21130 (CH340)
// MAC: 1C:DB:D4:7E:17:30
// Manufacturer: Guition (Jingcai)

// Display: ST7701 (RGB 16-bit parallel + 3-wire SPI init)
#define BOARD_DISPLAY_TYPE       DISPLAY_ST7701_RGB

// 3-wire SPI for panel init commands
#define BOARD_PIN_3WIRE_CS       39
#define BOARD_PIN_3WIRE_CLK      48
#define BOARD_PIN_3WIRE_MOSI     47

// RGB parallel data pins
#define BOARD_PIN_PCLK           21
#define BOARD_PIN_HSYNC          16
#define BOARD_PIN_VSYNC          17
#define BOARD_PIN_DE             18

// RGB data pins (R5 G6 B5 = 16-bit)
#define BOARD_PIN_R0             11
#define BOARD_PIN_R1             12
#define BOARD_PIN_R2             13
#define BOARD_PIN_R3             14
#define BOARD_PIN_R4             0
#define BOARD_PIN_G0             8
#define BOARD_PIN_G1             20
#define BOARD_PIN_G2             3
#define BOARD_PIN_G3             46
#define BOARD_PIN_G4             9
#define BOARD_PIN_G5             10
#define BOARD_PIN_B0             4
#define BOARD_PIN_B1             5
#define BOARD_PIN_B2             6
#define BOARD_PIN_B3             7
#define BOARD_PIN_B4             15

// Backlight
#define BOARD_PIN_BL             38

// Touch: GT911 (I2C)
#define BOARD_TOUCH_TYPE         TOUCH_GT911
#define BOARD_TOUCH_ADDR         0x5D
#define BOARD_PIN_TOUCH_SDA      19
#define BOARD_PIN_TOUCH_SCL      45
#define BOARD_PIN_TOUCH_INT      -1
#define BOARD_PIN_TOUCH_RST      -1

// Display settings
#define BOARD_ROTATION           0     // Square — no rotation
#define BOARD_INVERT             false
#define BOARD_NATIVE_W           480
#define BOARD_NATIVE_H           480

// Relays (wall switch)
#define BOARD_PIN_RELAY1         40
#define BOARD_PIN_RELAY2         2
#define BOARD_PIN_RELAY3         1
