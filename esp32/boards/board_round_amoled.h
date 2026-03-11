#pragma once

// ===== JC3636W518 — 1.8" Round AMOLED 360x360 (ST77916 QSPI + CST816S) =====
// Port: cu.usbmodem211201 (Native JTAG)
// MAC: D0:CF:13:1E:0B:64
// Manufacturer: Guition (Jingcai)

// Display: ST77916 (QSPI interface)
#define BOARD_DISPLAY_TYPE   DISPLAY_ST77916_QSPI
#define BOARD_PIN_QSPI_CS   14
#define BOARD_PIN_QSPI_CLK  13
#define BOARD_PIN_QSPI_D0   15
#define BOARD_PIN_QSPI_D1   16
#define BOARD_PIN_QSPI_D2   17
#define BOARD_PIN_QSPI_D3   18
#define BOARD_PIN_RST        21
#define BOARD_PIN_BL         47

// Touch: CST816S (I2C)
#define BOARD_TOUCH_TYPE     TOUCH_CST816S
#define BOARD_TOUCH_ADDR     0x15
#define BOARD_PIN_TOUCH_SDA  11
#define BOARD_PIN_TOUCH_SCL  12
#define BOARD_PIN_TOUCH_INT  9
#define BOARD_PIN_TOUCH_RST  10

// Display settings
#define BOARD_ROTATION       0
#define BOARD_INVERT         false
#define BOARD_NATIVE_W       360   // Actual resolution (not 240!)
#define BOARD_NATIVE_H       360

// Audio (I2S PDM — speaker + microphone)
#define BOARD_HAS_AUDIO      1
#define BOARD_PIN_I2S_LRCLK  45
#define BOARD_PIN_I2S_DIN    46
