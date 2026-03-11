#pragma once

#include <cstdint>
#include "../../state/agent_state.h"

namespace Octopus {

void init();

/**
 * Render one octopus instance.
 * @param buf    Pixel buffer
 * @param w,h    Screen dimensions
 * @param time   Total elapsed time
 * @param state  Creature state
 * @param idx    Instance index (0-based, for multi-session)
 * @param total  Total octopus count
 */
void render(uint16_t* buf, int w, int h, float time,
            CreatureState state, uint8_t idx, uint8_t total);

}  // namespace Octopus
