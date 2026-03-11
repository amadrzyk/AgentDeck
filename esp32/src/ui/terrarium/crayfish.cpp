#include "crayfish.h"
#include "draw.h"
#include "../theme.h"
#include "config.h"
#include <cmath>

// Simplified crayfish rendering using filled shapes
// (SVG Path → approximate polygon shapes for ESP32)

constexpr float CLAW_CLAP_PERIOD = 1.2f;  // seconds
constexpr float EYE_FLASH_PERIOD = 0.8f;
constexpr float HEARTBEAT_PERIOD = 4.0f;

namespace Crayfish {

void init() {}

static void drawBody(uint16_t* buf, int w, int h,
                     int cx, int cy, int bodyW, int bodyH,
                     uint32_t shellColor, uint8_t alpha) {
    // Main body — oval
    for (int dy = -bodyH / 2; dy <= bodyH / 2; dy++) {
        float t = (float)abs(dy) / (bodyH / 2 + 1);
        int halfW = (int)(bodyW / 2 * (1.0f - t * t * 0.3f));
        for (int dx = -halfW; dx <= halfW; dx++) {
            Draw::pixelA(cx + dx, cy + dy, shellColor, alpha);
        }
    }

    // Head segment — smaller oval at top
    int headY = cy - bodyH / 2 - bodyH / 6;
    int headW = bodyW * 3 / 8;
    int headH = bodyH / 4;
    for (int dy = -headH; dy <= headH; dy++) {
        int hw = (int)(headW * sqrtf(1.0f - (float)(dy * dy) / (headH * headH + 1)));
        for (int dx = -hw; dx <= hw; dx++) {
            Draw::pixelA(cx + dx, headY + dy, shellColor, alpha);
        }
    }
}

static void drawClaw(uint16_t* buf, int w, int h,
                     int pivotX, int pivotY, int clawW, int clawH,
                     float angle, uint32_t color, uint8_t alpha) {
    // Rotated claw shape (simplified as rotated rectangle + tip)
    float cosA = fastCos(angle * M_PI / 180.0f);
    float sinA = fastSin(angle * M_PI / 180.0f);

    // Claw arm
    for (int i = 0; i < clawW; i++) {
        float t = (float)i / clawW;
        int px = pivotX + (int)(i * cosA);
        int py = pivotY + (int)(i * sinA);
        int thickness = (int)(clawH * (1.0f - t * 0.5f));
        for (int dy = -thickness / 2; dy <= thickness / 2; dy++) {
            Draw::pixelA(px + (int)(dy * -sinA * 0.3f),
                        py + (int)(dy * cosA * 0.3f),
                        color, alpha);
        }
    }

    // Claw tip (V-shape pincer)
    int tipX = pivotX + (int)(clawW * cosA);
    int tipY = pivotY + (int)(clawW * sinA);
    for (int i = 0; i < clawH; i++) {
        Draw::pixelA(tipX + (int)(i * -sinA), tipY + (int)(i * cosA), color, alpha);
        Draw::pixelA(tipX - (int)(i * -sinA), tipY - (int)(i * cosA), color, alpha);
    }
}

void render(uint16_t* buf, int w, int h, float time, CrayfishState state) {
    if (state == CrayfishState::DORMANT) return;

    float bodyW_frac = Layout::CfWidthFrac;
    int bodyW = (int)(w * bodyW_frac);
    int bodyH = (int)(bodyW * 1.2f);
    int cx = (int)(Layout::CfHomeX * w);
    int cy;

    uint32_t shellColor = Theme::CrayfishShell;
    uint32_t eyeColor = Theme::CrayfishEye;
    uint8_t alpha = 255;
    float vertBob = 0;
    float clawAngle = 0;  // degrees

    switch (state) {
        case CrayfishState::SITTING: {
            cy = (int)(Layout::CfSittingY * h);
            vertBob = fastSin(time * 0.5f) * bodyW * 0.008f;
            clawAngle = fastSin(time * 0.4f) * 1.5f;

            // Heartbeat glow (4s double-pulse)
            float cycle = fmodf(time, HEARTBEAT_PERIOD) / HEARTBEAT_PERIOD;
            float pulse = 0;
            if (cycle < 0.0375f) {
                pulse = fastSin(cycle / 0.0375f * M_PI);
            } else if (cycle >= 0.0625f && cycle < 0.1f) {
                pulse = fastSin((cycle - 0.0625f) / 0.0375f * M_PI) * 0.6f;
            }
            if (pulse > 0.01f) {
                int glowR = (int)(bodyW * (0.25f + pulse * 0.08f));
                Draw::circle(cx, cy, glowR, Theme::CrayfishEye, (uint8_t)(pulse * 30));
            }
            break;
        }

        case CrayfishState::ROUTING: {
            cy = (int)(Layout::CfRoutingY * h);
            vertBob = fastSin(time * 3.0f) * bodyW * 0.05f;

            // Claw clap ±28°
            float phase = time * 2 * M_PI / CLAW_CLAP_PERIOD;
            clawAngle = fastSin(phase) * 28.0f;

            // Body color pulse
            float colorPulse = fastSin(time * 4.0f) * 0.5f + 0.5f;
            shellColor = lerpColor(Theme::CrayfishShell, Theme::CrayfishBodyLight, colorPulse * 0.3f);

            // Eye flash
            float eyeFlash = fastSin(time * 2 * M_PI / EYE_FLASH_PERIOD) * 0.5f + 0.5f;
            eyeColor = lerpColor(Theme::CrayfishEye, 0xFFFFFF, eyeFlash * 0.5f);

            // Shell glow
            float glow = (fastSin(time * 4.0f) * 0.5f + 0.5f) * 0.15f;
            int glowR = (int)(bodyW * (0.4f + glow * 0.15f * bodyW / w));
            Draw::circle(cx, cy, glowR, Theme::CrayfishBodyLight, (uint8_t)(glow * 255));

            // Signal waves (4 expanding arcs)
            for (int i = 0; i < 4; i++) {
                float prog = fmodf(time * 0.8f + i * 0.25f, 1.0f);
                int waveR = (int)(bodyW * 0.3f + prog * w * 0.15f);
                uint8_t waveAlpha = (uint8_t)((1.0f - prog) * 90);
                // Draw arc segments (simplified as circle outline)
                for (int a = 120; a < 240; a += 5) {
                    float rad = a * M_PI / 180.0f;
                    int wx = cx + (int)(fastCos(rad) * waveR);
                    int wy = cy + (int)(fastSin(rad) * waveR);
                    Draw::pixelA(wx, wy, Theme::TetraNeon, waveAlpha);
                }
            }
            break;
        }

        case CrayfishState::SICK: {
            cy = (int)(Layout::CfSittingY * h) + (int)(bodyW * 0.08f);
            vertBob = fastSin(time * 0.7f) * bodyW * 0.02f;
            alpha = 178;  // 0.7

            // Desaturated colors
            shellColor = lerpColor(Theme::CrayfishShell, 0x8B7B7B, 0.55f);
            eyeColor = lerpColor(Theme::CrayfishEye, 0x5A4A4A, 0.55f);

            // Drooping claw
            clawAngle = -8.0f + fastSin(time * 0.5f) * 2.0f;
            break;
        }

        default:
            return;
    }

    cy += (int)vertBob;

    // Draw body
    drawBody(buf, w, h, cx, cy, bodyW, bodyH, shellColor, alpha);

    // Draw claws
    int clawW_px = bodyW / 3;
    int clawH_px = bodyW / 8;
    drawClaw(buf, w, h, cx - bodyW / 3, cy - bodyH / 4,
             clawW_px, clawH_px, 180 + clawAngle, shellColor, alpha);
    drawClaw(buf, w, h, cx + bodyW / 3, cy - bodyH / 4,
             clawW_px, clawH_px, -clawAngle, shellColor, alpha);

    // Draw eyes
    int eyeR = bodyW / 12;
    int eyeSpacing = bodyW / 5;
    int eyeY = cy - bodyH / 2 - bodyH / 6;
    Draw::circle(cx - eyeSpacing, eyeY, eyeR + 1, 0x050810, alpha);
    Draw::circle(cx + eyeSpacing, eyeY, eyeR + 1, 0x050810, alpha);
    Draw::circle(cx - eyeSpacing, eyeY, eyeR - 1, eyeColor, alpha);
    Draw::circle(cx + eyeSpacing, eyeY, eyeR - 1, eyeColor, alpha);

    // Antennae
    float antWiggle = 0;
    if (state == CrayfishState::ROUTING) {
        antWiggle = fastSin(time * 7.0f) * 4.0f;
    }
    int antBaseY = eyeY - eyeR;
    Draw::line(cx - eyeSpacing, antBaseY, cx - eyeSpacing - bodyW / 6 + (int)antWiggle,
               antBaseY - bodyH / 4, shellColor, (uint8_t)(alpha * 0.8f));
    Draw::line(cx + eyeSpacing, antBaseY, cx + eyeSpacing + bodyW / 6 - (int)antWiggle,
               antBaseY - bodyH / 4, shellColor, (uint8_t)(alpha * 0.8f));

    // Tail segments
    int tailY = cy + bodyH / 2;
    for (int i = 0; i < 3; i++) {
        int segW = bodyW / 3 - i * bodyW / 12;
        int segH = bodyH / 8;
        int segY = tailY + i * segH;
        uint32_t segColor = lerpColor(shellColor, Theme::CrayfishDark, (float)i / 3);
        for (int dy = 0; dy < segH; dy++) {
            int hw = segW / 2;
            for (int dx = -hw; dx <= hw; dx++) {
                Draw::pixelA(cx + dx, segY + dy, segColor, alpha);
            }
        }
    }
}

}  // namespace Crayfish
