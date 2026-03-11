#include "kelp.h"
#include "draw.h"
#include "../theme.h"
#include "config.h"

// Kelp strand definitions
struct KelpStrand {
    float baseX;      // fraction of width
    float baseY;      // fraction of height (bottom anchor)
    float height;     // fraction of height
    uint8_t segments; // number of segments
    float phase;      // sin phase offset
};

static const KelpStrand strands[] = {
    {0.06f, 0.72f, 0.25f, 8, 0.0f},
    {0.10f, 0.75f, 0.20f, 6, 1.2f},
    {0.88f, 0.70f, 0.28f, 9, 2.4f},
};

namespace Kelp {

void init() {}

void render(uint16_t* buf, int w, int h, float time) {
    constexpr float SWAY_SPEED = 1.0f;
    constexpr float SWAY_AMP = 0.015f;  // fraction of width

    for (int k = 0; k < KELP_COUNT; k++) {
        const KelpStrand& s = strands[k];
        int baseX = (int)(s.baseX * w);
        int baseY = (int)(s.baseY * h);
        int strandH = (int)(s.height * h);
        int segH = strandH / s.segments;

        int prevX = baseX;
        int prevY = baseY;

        for (int seg = 1; seg <= s.segments; seg++) {
            float t = (float)seg / s.segments;
            // Increasing sway toward tip
            float sway = fastSin(time * SWAY_SPEED + s.phase + seg * 0.5f) * SWAY_AMP * w * t;
            int x = baseX + (int)sway;
            int y = baseY - seg * segH;

            // Color gradient: dark at base → bright at tip
            uint32_t color = lerpColor(Theme::KelpDark, Theme::KelpGreen, t);
            uint8_t alpha = (uint8_t)(180 + 50 * t);

            // Draw thick line segment (2px width)
            Draw::line(prevX, prevY, x, y, color, alpha);
            Draw::line(prevX + 1, prevY, x + 1, y, color, alpha);

            // Small leaf at every other segment
            if (seg % 2 == 1 && seg < s.segments) {
                int leafDir = (seg % 4 < 2) ? 1 : -1;
                int leafX = x + leafDir * (int)(w * 0.008f);
                int leafY = y + segH / 3;
                Draw::line(x, y, leafX, leafY, color, (uint8_t)(alpha * 0.7f));
                Draw::line(x, y + 1, leafX, leafY + 1, color, (uint8_t)(alpha * 0.5f));
            }

            prevX = x;
            prevY = y;
        }
    }
}

}  // namespace Kelp
