#include "water.h"
#include "draw.h"
#include "../theme.h"
#include "config.h"

// Floating particle system
struct Particle {
    float x, y;
    float vx, vy;
    float size;
    uint8_t alpha;
};

static constexpr int NUM_PARTICLES = 30;
static Particle particles[NUM_PARTICLES];
static bool particlesInit = false;

static float randf() { return (float)rand() / RAND_MAX; }

namespace Water {

void init() {
    // Init floating particles
    for (int i = 0; i < NUM_PARTICLES; i++) {
        particles[i].x = randf();
        particles[i].y = randf() * 0.60f + 0.05f;  // Water zone only
        particles[i].vx = (randf() - 0.5f) * 0.003f;
        particles[i].vy = (randf() - 0.5f) * 0.001f - 0.001f;  // Slight upward drift
        particles[i].size = randf() * 1.5f + 0.5f;
        particles[i].alpha = (uint8_t)(randf() * 30 + 10);
    }
    particlesInit = true;
}

void renderBackground(uint16_t* buf, int w, int h) {
    // 4x4 Bayer dither matrix
    static const uint8_t bayer4[4][4] = {
        { 0,  8,  2, 10}, {12,  4, 14,  6},
        { 3, 11,  1,  9}, {15,  7, 13,  5}
    };

    int surfaceY = (int)(h * 0.04f);
    int midY = h / 2;

    for (int y = 0; y < h; y++) {
        uint32_t c1, c2;
        float t;
        if (y < surfaceY) {
            c1 = 0x1E4D7A;
            c2 = Theme::ShallowWater;
            t = (float)y / max(1, surfaceY);
        } else if (y < midY) {
            c1 = Theme::ShallowWater;
            c2 = Theme::MidWater;
            t = (float)(y - surfaceY) / max(1, midY - surfaceY);
        } else {
            c1 = Theme::MidWater;
            c2 = Theme::DeepSea;
            t = (float)(y - midY) / max(1, h - midY);
        }

        uint8_t r1 = (c1 >> 16) & 0xFF, g1 = (c1 >> 8) & 0xFF, b1 = c1 & 0xFF;
        uint8_t r2 = (c2 >> 16) & 0xFF, g2 = (c2 >> 8) & 0xFF, b2 = c2 & 0xFF;
        uint8_t r = r1 + (int)((r2 - r1) * t);
        uint8_t g = g1 + (int)((g2 - g1) * t);
        uint8_t b = b1 + (int)((b2 - b1) * t);

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
}

void renderLightRays(uint16_t* buf, int w, int h, float time) {
    // 4-5 angled light shafts from surface, slowly swaying
    static const float rayBaseX[] = {0.18f, 0.35f, 0.55f, 0.72f, 0.88f};
    static const float rayWidth[] = {0.06f, 0.08f, 0.05f, 0.07f, 0.04f};
    static const float rayAlpha[] = {0.12f, 0.08f, 0.10f, 0.07f, 0.09f};

    int surfaceY = (int)(h * 0.04f);
    int sandTop = (int)(h * (1.0f - Layout::SandHeightFrac));
    int rayDepth = sandTop - surfaceY;

    for (int r = 0; r < 5; r++) {
        float sway = fastSin(time * 0.15f + r * 1.8f) * 0.04f;
        float baseX = rayBaseX[r] + sway;
        float spread = rayWidth[r];
        float maxAlpha = rayAlpha[r];

        for (int y = surfaceY; y < sandTop; y++) {
            float progress = (float)(y - surfaceY) / rayDepth;
            // Ray widens and fades as it goes deeper
            float currentWidth = spread * (1.0f + progress * 0.8f);
            float alpha = maxAlpha * (1.0f - progress * progress);  // Quadratic falloff

            float centerX = baseX + progress * 0.05f * fastSin(r * 2.1f);  // Slight angle
            float leftX = centerX - currentWidth / 2;
            float rightX = centerX + currentWidth / 2;

            int px1 = (int)(leftX * w);
            int px2 = (int)(rightX * w);

            for (int x = max(0, px1); x < min(w, px2); x++) {
                // Gaussian-ish falloff from center
                float dx = ((float)x / w - centerX) / (currentWidth / 2);
                float intensity = (1.0f - dx * dx) * alpha;
                if (intensity > 0.005f) {
                    uint8_t a = (uint8_t)(intensity * 255);
                    Draw::pixelA(x, y, 0x4488AA, a);
                }
            }
        }
    }
}

void renderCaustics(uint16_t* buf, int w, int h, float time) {
    // Animated light patterns on sand floor
    int sandTop = (int)(h * (1.0f - Layout::SandHeightFrac));
    int causticZone = (int)(h * 0.08f);  // Top portion of sand only

    for (int y = sandTop; y < sandTop + causticZone && y < h; y++) {
        float progress = (float)(y - sandTop) / causticZone;
        float baseAlpha = 25.0f * (1.0f - progress);  // Fades deeper into sand

        for (int x = 0; x < w; x += 2) {  // Step 2 for performance
            float nx = (float)x / w;
            float ny = (float)y / h;

            // Two overlapping sine patterns create caustic-like interference
            float v1 = fastSin(nx * 12.0f + time * 0.3f + ny * 8.0f);
            float v2 = fastSin(nx * 8.0f - time * 0.2f + ny * 15.0f + 1.5f);
            float v3 = fastSin((nx + ny) * 10.0f + time * 0.4f);

            float combined = (v1 + v2 + v3) / 3.0f;
            if (combined > 0.3f) {
                uint8_t a = (uint8_t)(baseAlpha * (combined - 0.3f) / 0.7f);
                Draw::pixelA(x, y, 0x88CCDD, a);
                Draw::pixelA(x + 1, y, 0x88CCDD, a);  // Fill step gap
            }
        }
    }
}

void renderParticles(uint16_t* buf, int w, int h, float time) {
    if (!particlesInit) return;

    for (int i = 0; i < NUM_PARTICLES; i++) {
        Particle& p = particles[i];

        // Drift motion
        p.x += p.vx + fastSin(time * 0.5f + i * 0.7f) * 0.0005f;
        p.y += p.vy;

        // Wrap around
        if (p.x < 0) p.x += 1.0f;
        if (p.x > 1.0f) p.x -= 1.0f;
        if (p.y < 0.04f) p.y = 0.60f;
        if (p.y > 0.62f) p.y = 0.05f;

        // Pulsing alpha
        float pulse = (fastSin(time * 0.8f + i * 2.3f) + 1.0f) * 0.5f;
        uint8_t alpha = (uint8_t)(p.alpha * (0.5f + 0.5f * pulse));

        int px = (int)(p.x * w);
        int py = (int)(p.y * h);

        if (p.size > 1.2f) {
            // Larger particle — 2px
            Draw::pixelA(px, py, 0xAADDEE, alpha);
            Draw::pixelA(px + 1, py, 0xAADDEE, (uint8_t)(alpha * 0.6f));
        } else {
            // Small dot
            Draw::pixelA(px, py, 0xCCEEFF, alpha);
        }
    }
}

void renderSurface(uint16_t* buf, int w, int h, float time) {
    int surfaceY = (int)(h * 0.04f);
    float amplitude1 = h * 0.006f;
    float amplitude2 = amplitude1 * 0.4f;

    // Calculate wave points
    static const int POINTS = 60;  // More segments for smooth connected line
    int waveY[POINTS + 1];
    int waveX[POINTS + 1];

    for (int seg = 0; seg <= POINTS; seg++) {
        float nx = (float)seg / POINTS;
        waveX[seg] = (int)(nx * w);

        float meniscus = 0;
        if (nx < 0.05f) meniscus = -amplitude1 * 0.6f * (1.0f - nx / 0.05f);
        else if (nx > 0.95f) meniscus = -amplitude1 * 0.6f * ((nx - 0.95f) / 0.05f);

        float wave = amplitude1 * fastSin(nx * 2.5f * 2 * M_PI + time * 0.6f)
                   + amplitude2 * fastSin(nx * 5.0f * 2 * M_PI + time * 1.2f)
                   + meniscus;

        waveY[seg] = surfaceY + (int)wave;
    }

    // Fill above surface with lighter color (air/sky tint)
    for (int seg = 0; seg < POINTS; seg++) {
        int x1 = waveX[seg], x2 = waveX[seg + 1];
        int y1 = waveY[seg], y2 = waveY[seg + 1];

        for (int x = x1; x < x2 && x < w; x++) {
            // Interpolate y
            float t = (x2 > x1) ? (float)(x - x1) / (x2 - x1) : 0;
            int wy = y1 + (int)((y2 - y1) * t);

            // Light zone above wave
            for (int y = max(0, wy - 3); y < wy; y++) {
                int dist = wy - y;
                uint8_t a = (dist == 1) ? 40 : (dist == 2) ? 20 : 8;
                Draw::pixelA(x, y, 0x88BBDD, a);
            }

            // Wave line itself (bright)
            Draw::pixelA(x, wy, 0xFFFFFF, 55);
            Draw::pixelA(x, wy + 1, 0xCCDDEE, 30);
        }
    }

    // Sparkle highlights
    static const float sparkleX[] = {0.12f, 0.28f, 0.45f, 0.62f, 0.78f, 0.92f};
    for (int i = 0; i < 6; i++) {
        float sx = sparkleX[i] + 0.02f * fastSin(time * 0.25f + i * 1.3f);
        int seg = (int)(sx * POINTS);
        if (seg < 0 || seg > POINTS) continue;

        int px = (int)(sx * w);
        int py = waveY[min(seg, POINTS)];
        float pulse = (fastSin(time * 1.2f + i * 2.1f) + 1.0f) * 0.5f;
        uint8_t alpha = (uint8_t)(80 * pulse);

        // Cross sparkle
        Draw::pixelA(px, py - 1, 0xFFFFFF, alpha);
        Draw::pixelA(px - 1, py, 0xFFFFFF, (uint8_t)(alpha * 0.7f));
        Draw::pixelA(px + 1, py, 0xFFFFFF, (uint8_t)(alpha * 0.7f));
        Draw::pixelA(px, py, 0xFFFFFF, alpha);
        Draw::pixelA(px, py + 1, 0xFFFFFF, (uint8_t)(alpha * 0.4f));
    }
}

}  // namespace Water
