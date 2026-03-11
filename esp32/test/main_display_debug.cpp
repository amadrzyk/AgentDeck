/**
 * Display debug — verbose init + manual backlight + direct framebuffer test
 */
#include <Arduino.h>
#include <LovyanGFX.hpp>
#include <lgfx/v1/platforms/esp32s3/Bus_RGB.hpp>
#include <lgfx/v1/platforms/esp32s3/Panel_RGB.hpp>

// ===== Test 1: Manual backlight toggle =====
static void testBacklight() {
    Serial.println("\n--- Test 1: Manual Backlight (GPIO 38) ---");
    pinMode(38, OUTPUT);
    Serial.println("BL HIGH");
    digitalWrite(38, HIGH);
    delay(1000);
    Serial.println("BL LOW");
    digitalWrite(38, LOW);
    delay(500);
    Serial.println("BL HIGH again");
    digitalWrite(38, HIGH);
    delay(500);
    // Also try PWM
    Serial.println("BL PWM via ledcWrite");
    ledcSetup(0, 12000, 8);
    ledcAttachPin(38, 0);
    ledcWrite(0, 200);
    delay(500);
    Serial.printf("BL test done — backlight should be ON now\n");
}

// ===== LGFX definition =====
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
            cfg.panel = &_panel_instance;

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
    Serial.println("\n\n==============================");
    Serial.println("  Display Debug Test");
    Serial.println("==============================");
    Serial.printf("PSRAM: %s, %d KB\n", psramFound() ? "YES" : "NO", ESP.getFreePsram() / 1024);
    Serial.printf("Free heap: %d\n", ESP.getFreeHeap());

    // Test 1: Manual backlight
    testBacklight();

    // Test 2: TFT init
    Serial.println("\n--- Test 2: TFT Init ---");
    Serial.printf("Before init — heap: %d, PSRAM: %d\n", ESP.getFreeHeap(), ESP.getFreePsram());

    bool initOk = tft.init();
    Serial.printf("tft.init() returned: %s\n", initOk ? "TRUE" : "FALSE");
    Serial.printf("After init  — heap: %d, PSRAM: %d\n", ESP.getFreeHeap(), ESP.getFreePsram());

    if (!initOk) {
        Serial.println("!!! TFT INIT FAILED !!!");
        // Keep backlight on so we can see if it's a panel vs init issue
        while(1) delay(1000);
    }

    // Test 3: Brightness
    Serial.println("\n--- Test 3: Brightness ---");
    tft.setBrightness(255);
    Serial.println("Brightness set to 255");

    // Test 4: Direct fill
    Serial.println("\n--- Test 4: Fill Screen ---");
    tft.fillScreen(TFT_RED);
    delay(1000);
    Serial.println("Filled RED");

    tft.fillScreen(TFT_GREEN);
    delay(1000);
    Serial.println("Filled GREEN");

    tft.fillScreen(TFT_BLUE);
    delay(1000);
    Serial.println("Filled BLUE");

    tft.fillScreen(TFT_WHITE);
    delay(1000);
    Serial.println("Filled WHITE");

    // Test 5: Pattern
    Serial.println("\n--- Test 5: Test Pattern ---");
    tft.fillScreen(TFT_BLACK);
    // Color bars
    for (int i = 0; i < 8; i++) {
        uint16_t colors[] = {TFT_RED, TFT_GREEN, TFT_BLUE, TFT_YELLOW,
                             TFT_CYAN, TFT_MAGENTA, TFT_WHITE, TFT_ORANGE};
        tft.fillRect(i * 60, 0, 60, 240, colors[i]);
    }
    tft.setTextColor(TFT_WHITE, TFT_BLACK);
    tft.setTextSize(3);
    tft.setCursor(100, 280);
    tft.print("AgentDeck");
    tft.setTextSize(2);
    tft.setCursor(100, 320);
    tft.print("Display Debug");
    tft.setCursor(100, 360);
    tft.printf("480x480 ST7701");
    tft.setCursor(100, 400);
    tft.printf("PSRAM: %dKB", ESP.getFreePsram() / 1024);

    Serial.println("\n=== ALL TESTS COMPLETE ===");
    Serial.println("You should see color bars + text on screen.");
    Serial.println("If screen is dark: backlight or panel init issue.");
    Serial.println("If screen is white/garbage: RGB timing issue.");
}

void loop() {
    // Touch test
    uint16_t x, y;
    if (tft.getTouch(&x, &y)) {
        Serial.printf("Touch: %d, %d\n", x, y);
        tft.fillCircle(x, y, 8, TFT_RED);
    }

    static uint32_t lastPrint = 0;
    if (millis() - lastPrint > 5000) {
        lastPrint = millis();
        Serial.printf("[%lu] running, heap=%d\n", millis()/1000, ESP.getFreeHeap());
    }
    delay(20);
}
