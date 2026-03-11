#pragma once

// Board-specific pin configurations
// Selected at compile time via -DBOARD_xxx build flags

#if defined(BOARD_IPS_35)
    #include "board_35_ips.h"
#elif defined(BOARD_BOX_86)
    #include "board_86_box.h"
#elif defined(BOARD_ROUND_AMOLED)
    #include "board_round_amoled.h"
#else
    #error "No board defined! Use -DBOARD_IPS_35, -DBOARD_BOX_86, or -DBOARD_ROUND_AMOLED"
#endif
