#pragma once

#include <cstdint>

namespace Kelp {

void init();

/** Render kelp strands with sin-based sway animation. */
void render(uint16_t* buf, int w, int h, float time);

}  // namespace Kelp
