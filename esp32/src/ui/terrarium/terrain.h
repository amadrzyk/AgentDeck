#pragma once

#include <cstdint>

namespace Terrain {

void init();

/** Render sand layer, rocks, and pebbles. */
void render(uint16_t* buf, int w, int h);

}  // namespace Terrain
