#include "terrain.h"
#include "draw.h"
#include "../theme.h"
#include "config.h"
#include <cmath>

// Rock formation definitions (simplified cubic → polygon)
struct Rock {
    float cx, baseY, rw, rh;
    uint32_t color;
};

static const Rock rocks[] = {
    {0.70f, 0.0f, 0.15f, 0.08f, Theme::RockMid},
    {0.80f, -0.02f, 0.12f, 0.10f, Theme::RockDark},
    {0.75f, -0.01f, 0.08f, 0.06f, Theme::RockLight},
    {0.05f, 0.0f,  0.08f, 0.05f, Theme::RockDark},
    {0.12f, 0.01f, 0.06f, 0.04f, Theme::RockMid},
    {0.45f, 0.01f, 0.05f, 0.03f, Theme::RockLight},
};

// Pebble positions
static const float pebbleX[] = {0.10f, 0.22f, 0.35f, 0.48f, 0.58f, 0.30f, 0.42f, 0.65f, 0.18f, 0.52f};
static const float pebbleYOff[] = {0.25f, 0.40f, 0.55f, 0.30f, 0.50f, 0.70f, 0.65f, 0.45f, 0.60f, 0.75f};
static const float pebbleW[] = {0.004f, 0.003f, 0.005f, 0.003f, 0.004f, 0.003f, 0.005f, 0.004f, 0.003f, 0.004f};

namespace Terrain {

void init() {
    // Terrain is mostly static — could cache to a buffer
}

void render(uint16_t* buf, int w, int h) {
    int sandTop = (int)(h * (1.0f - Layout::SandHeightFrac));
    int sandH = h - sandTop;

    // 4x4 Bayer dither matrix
    static const uint8_t bayer4[4][4] = {
        { 0,  8,  2, 10}, {12,  4, 14,  6},
        { 3, 11,  1,  9}, {15,  7, 13,  5}
    };

    // Sand gradient fill with smooth water→sand transition + dithering
    int transitionH = (int)(h * 0.04f);  // 4% transition zone
    for (int y = sandTop; y < h; y++) {
        float t = (float)(y - sandTop) / sandH;
        uint32_t c;
        if (y - sandTop < transitionH) {
            // Water→sand transition (blend water bottom color with sand top)
            float tt = (float)(y - sandTop) / transitionH;
            c = lerpColor(Theme::DeepSea, Theme::SandLight, tt);
        } else {
            c = lerpColor(Theme::SandLight, Theme::SandBase, t);
        }

        uint8_t r = (c >> 16) & 0xFF, g = (c >> 8) & 0xFF, b = c & 0xFF;
        uint16_t* row = &buf[y * w];
        int by = y & 3;
        for (int x = 0; x < w; x++) {
            int threshold = bayer4[by][x & 3] - 8;
            uint8_t rd = (uint8_t)min(255, max(0, (int)r + threshold));
            uint8_t gd = (uint8_t)min(255, max(0, (int)g + threshold));
            uint8_t bd = (uint8_t)min(255, max(0, (int)b + threshold));
            row[x] = toRGB565((rd << 16) | (gd << 8) | bd);
        }
    }

    // Sand ripples (subtle sine lines)
    static const float rippleX[] = {0.03f, 0.15f, 0.28f, 0.42f, 0.55f, 0.68f,
                                     0.08f, 0.22f, 0.35f, 0.50f, 0.62f, 0.78f};
    static const float rippleLen[] = {0.15f, 0.12f, 0.18f, 0.10f, 0.14f, 0.12f,
                                      0.13f, 0.16f, 0.11f, 0.14f, 0.10f, 0.15f};
    static const float rippleYOff[] = {0.15f, 0.25f, 0.35f, 0.20f, 0.40f, 0.30f,
                                        0.50f, 0.45f, 0.55f, 0.60f, 0.70f, 0.65f};

    for (int i = 0; i < 12; i++) {
        int startX = (int)(rippleX[i] * w);
        int endX = startX + (int)(rippleLen[i] * w);
        int baseY = sandTop + (int)(rippleYOff[i] * sandH);

        for (int x = startX; x < endX && x < w; x++) {
            int y = baseY + (int)(fastSin(x * 0.02f + i * 0.7f) * 2.0f);
            Draw::pixelA(x, y, Theme::SandBase, 64);
        }
    }

    // Rocks with shadow and highlight for 3D appearance
    for (int r = 0; r < 6; r++) {
        int cx = (int)(rocks[r].cx * w);
        int baseY2 = sandTop + (int)(rocks[r].baseY * w);
        int rw = (int)(rocks[r].rw * w / 2);
        int rh = (int)(rocks[r].rh * w);

        // Shadow underneath rock (offset down-right)
        for (int dy = -rh + 2; dy <= 3; dy++) {
            float t = (float)(dy - 2) / (-rh);
            if (t < 0) t = 0;
            int halfW = (int)(rw * fastCos(t * M_PI / 2));
            for (int dx = -halfW + 3; dx <= halfW + 3; dx++) {
                int px = cx + dx;
                int py = baseY2 + dy + 2;
                if (px >= 0 && px < w && py >= 0 && py < h) {
                    Draw::pixelA(px, py, 0x000000, 40);
                }
            }
        }

        // Rock body with gradient (lighter top, darker bottom)
        uint32_t rockColor = rocks[r].color;
        uint8_t rr = (rockColor >> 16) & 0xFF;
        uint8_t rg = (rockColor >> 8) & 0xFF;
        uint8_t rb = rockColor & 0xFF;

        for (int dy = -rh; dy <= 0; dy++) {
            float t = (float)dy / (-rh);
            int halfW = (int)(rw * fastCos(t * M_PI / 2));
            // Top is lighter, bottom is darker
            float shade = 0.7f + 0.6f * t;  // 1.3 at top, 0.7 at bottom
            uint8_t sr = (uint8_t)min(255, (int)(rr * shade));
            uint8_t sg = (uint8_t)min(255, (int)(rg * shade));
            uint8_t sb = (uint8_t)min(255, (int)(rb * shade));
            uint32_t shadedColor = (sr << 16) | (sg << 8) | sb;

            for (int dx = -halfW; dx <= halfW; dx++) {
                int px = cx + dx;
                int py = baseY2 + dy;
                if (px >= 0 && px < w && py >= 0 && py < h) {
                    // Edge darkening for roundness
                    float edgeDist = (float)abs(dx) / max(1, halfW);
                    uint8_t alpha = (uint8_t)(220 - edgeDist * 40);
                    Draw::pixelA(px, py, shadedColor, alpha);
                }
            }
        }

        // Top highlight (crescent)
        for (int dx = -rw / 3; dx <= rw / 3; dx++) {
            float edgeFade = 1.0f - (float)(dx * dx) / (float)(rw * rw / 9);
            uint8_t a = (uint8_t)(30 * edgeFade);
            Draw::pixelA(cx + dx, baseY2 - rh, 0xFFFFFF, a);
            Draw::pixelA(cx + dx, baseY2 - rh + 1, 0xFFFFFF, (uint8_t)(a * 0.5f));
        }
    }

    // Pebbles (small ovals)
    for (int i = 0; i < 10; i++) {
        int px = (int)(pebbleX[i] * w);
        int py = sandTop + (int)(pebbleYOff[i] * sandH);
        int pw = (int)(pebbleW[i] * w);
        int ph = (int)(pw * 0.6f);
        uint32_t color = (i % 2 == 0) ? Theme::RockDark : Theme::RockMid;

        // Small filled ellipse
        for (int dy = -ph; dy <= ph; dy++) {
            int halfW2 = (int)(pw * sqrtf(1.0f - (float)(dy * dy) / (ph * ph + 1)));
            for (int dx = -halfW2; dx <= halfW2; dx++) {
                Draw::pixelA(px + dx, py + dy, color, 102);
            }
        }
    }
}

}  // namespace Terrain
