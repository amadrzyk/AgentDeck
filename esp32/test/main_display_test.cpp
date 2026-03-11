/**
 * Display test — LovyanGFX init + basic drawing, no LVGL.
 */
#include <Arduino.h>
#include <LovyanGFX.hpp>
#include "config.h"
#include "../boards/board_config.h"

#include <lgfx/v1/platforms/esp32s3/Bus_RGB.hpp>
#include <lgfx/v1/platforms/esp32s3/Panel_RGB.hpp>

class LGFX : public lgfx::LGFX_Device {
public:
    lgfx::Bus_RGB        _bus_instance;
    lgfx::Panel_ST7701_guition_esp32_4848S040 _panel_instance;
    lgfx::Light_PWM      _light_instance;
    lgfx::Touch_GT911    _touch_instance;

    LGFX() {
        {
            auto cfg = _bus_instance.config();
            cfg.freq_write = 14000000;
            cfg.panel = &_panel_instance;  // CRITICAL: Bus_RGB needs panel pointer

            cfg.pin_pclk    = 21;
            cfg.pin_vsync   = 17;
            cfg.pin_hsync   = 16;
            cfg.pin_henable = 18;

            cfg.pin_d0  = 4;   cfg.pin_d1  = 5;   cfg.pin_d2  = 6;
            cfg.pin_d3  = 7;   cfg.pin_d4  = 15;  cfg.pin_d5  = 8;
            cfg.pin_d6  = 20;  cfg.pin_d7  = 3;   cfg.pin_d8  = 46;
            cfg.pin_d9  = 9;   cfg.pin_d10 = 10;  cfg.pin_d11 = 11;
            cfg.pin_d12 = 12;  cfg.pin_d13 = 13;  cfg.pin_d14 = 14;
            cfg.pin_d15 = 0;

            cfg.hsync_pulse_width  = 8;
            cfg.hsync_back_porch   = 50;
            cfg.hsync_front_porch  = 10;
            cfg.hsync_polarity     = 0;
            cfg.vsync_pulse_width  = 8;
            cfg.vsync_back_porch   = 20;
            cfg.vsync_front_porch  = 10;
            cfg.vsync_polarity     = 0;
            cfg.pclk_active_neg    = 0;
            cfg.de_idle_high       = 1;
            cfg.pclk_idle_high     = 0;

            _bus_instance.config(cfg);
        }
        _panel_instance.setBus(&_bus_instance);

        {
            auto cfg = _panel_instance.config();
            cfg.memory_width  = 480;
            cfg.memory_height = 480;
            cfg.panel_width   = 480;
            cfg.panel_height  = 480;
            cfg.offset_x      = 0;
            cfg.offset_y      = 0;
            _panel_instance.config(cfg);
        }

        {
            auto cfg = _panel_instance.config_detail();
            cfg.pin_cs   = 39;
            cfg.pin_sclk = 48;
            cfg.pin_mosi = 47;
            _panel_instance.config_detail(cfg);
        }

        {
            auto cfg = _light_instance.config();
            cfg.pin_bl = 38;
            cfg.invert = false;
            cfg.freq   = 12000;
            cfg.pwm_channel = 0;
            _light_instance.config(cfg);
            _panel_instance.setLight(&_light_instance);
        }

        {
            auto cfg = _touch_instance.config();
            cfg.i2c_port = 0;
            cfg.i2c_addr = 0x5D;
            cfg.pin_sda  = 19;
            cfg.pin_scl  = 45;
            cfg.pin_int  = -1;
            cfg.pin_rst  = -1;
            cfg.x_min = 0;  cfg.x_max = 479;
            cfg.y_min = 0;  cfg.y_max = 479;
            _touch_instance.config(cfg);
            _panel_instance.setTouch(&_touch_instance);
        }

        setPanel(&_panel_instance);
    }
};

static LGFX tft;

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n=== Display Test ===");
    Serial.printf("PSRAM: %d KB\n", psramFound() ? ESP.getFreePsram() / 1024 : 0);

    Serial.println("Initializing TFT...");
    tft.init();
    Serial.println("TFT init OK");

    tft.setRotation(0);
    tft.setBrightness(200);
    Serial.println("Brightness set");

    // Test pattern: colored rectangles
    tft.fillScreen(TFT_BLACK);
    Serial.println("Screen cleared");

    // Water gradient test
    for (int y = 0; y < 480; y++) {
        uint8_t r = 10 + y * 22 / 480;
        uint8_t g = 22 + y * 59 / 480;
        uint8_t b = 40 + y * 92 / 480;
        uint16_t color = tft.color565(r, g, b);
        tft.drawFastHLine(0, y, 480, color);
    }
    Serial.println("Gradient drawn");

    // Draw test text
    tft.setTextColor(TFT_WHITE);
    tft.setTextSize(3);
    tft.setCursor(120, 200);
    tft.println("AgentDeck");
    tft.setTextSize(2);
    tft.setCursor(140, 240);
    tft.println("86 Box Display OK");

    // Touch marker area
    tft.drawRect(0, 400, 480, 80, TFT_CYAN);
    tft.setTextSize(1);
    tft.setCursor(180, 430);
    tft.println("Touch here to test");

    Serial.println("Display test complete!");
    Serial.printf("Free heap after: %d\n", ESP.getFreeHeap());
}

void loop() {
    uint16_t x, y;
    if (tft.getTouch(&x, &y)) {
        Serial.printf("Touch: %d, %d\n", x, y);
        tft.fillCircle(x, y, 5, TFT_RED);
    }
    delay(20);
}
