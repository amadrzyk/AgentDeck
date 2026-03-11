#pragma once

#include <cstdint>

namespace Water {

void init();

/** Fill entire buffer with 3-color vertical water gradient. */
void renderBackground(uint16_t* buf, int w, int h);

/** Draw light rays from surface (after background, before terrain). */
void renderLightRays(uint16_t* buf, int w, int h, float time);

/** Draw caustic light patterns on sand (after terrain). */
void renderCaustics(uint16_t* buf, int w, int h, float time);

/** Draw floating plankton/dust particles. */
void renderParticles(uint16_t* buf, int w, int h, float time);

/** Draw animated water surface waves + sparkles. */
void renderSurface(uint16_t* buf, int w, int h, float time);

}  // namespace Water
