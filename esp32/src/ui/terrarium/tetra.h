#pragma once

#include <cstdint>
#include "../../state/agent_state.h"

namespace Tetra {

void init();

/** Update fish positions (Boids flocking). */
void update(float dt, float time, TetraState tState, CreatureState octState, uint8_t octCount);

/** Render all fish. */
void render(uint16_t* buf, int w, int h);

}  // namespace Tetra
