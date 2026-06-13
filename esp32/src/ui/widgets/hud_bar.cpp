#include "hud_bar.h"
#include "../theme.h"
#include "../display.h"
#include "../assets/logo.h"
#include "../../state/agent_state.h"
#include "config.h"
#include "net/serial_client.h"

// === Left panel: AgentDeck logo + session list ===
static lv_obj_t* panelLeft = nullptr;
static lv_obj_t* lblLogo = nullptr;
static lv_obj_t* logoLine = nullptr;   // accent underline
static lv_obj_t* lblSessions = nullptr;

#if defined(BOARD_IPS10)
// === IPS10 (800×1280) tablet sidebar: a LIVING AGENT MOSAIC ===
// One cell per active agent; each cell's height fluidly grows when the agent is working
// and shrinks when idle, and shows inline what that agent is doing. Replaces the static
// session list + separate timeline with a single dynamic surface.
static lv_obj_t* lblLogoImg = nullptr;
static constexpr int IPS10_SIDEBAR_W = 300;
static constexpr int MOSAIC_MAX = 6;        // up to 6 agent cells (matches sessions[6])
static lv_obj_t* cellsBox = nullptr;        // flex column holding the cells
static lv_obj_t* cell[MOSAIC_MAX] = {nullptr};
static lv_obj_t* cellName[MOSAIC_MAX] = {nullptr};   // project + state dot (recolor)
static lv_obj_t* cellAct[MOSAIC_MAX]  = {nullptr};   // "what it's doing" line
static float cellCurH[MOSAIC_MAX] = {0};    // animated current heights (lerped toward target)

// Activity weight by state → drives cell size. Working dominates; idle stays small-but-present.
static float ips10StateWeight(const char* state) {
    if (strcmp(state, "processing") == 0) return 1.0f;
    if (strstr(state, "awaiting") != nullptr) return 0.72f;
    return 0.40f;  // idle / unknown
}
// Human phrase for the in-cell activity line.
static const char* ips10StatePhrase(const char* state) {
    if (strcmp(state, "processing") == 0) return "working";
    if (strcmp(state, "awaiting_permission") == 0) return "awaiting permission";
    if (strcmp(state, "awaiting_option") == 0) return "choosing option";
    if (strcmp(state, "awaiting_diff") == 0) return "reviewing diff";
    if (strcmp(state, "idle") == 0) return "idle";
    return state;
}
static uint32_t ips10AgentColor(const char* agentType) {
    if (strstr(agentType, "openclaw") != nullptr) return Theme::CrayfishShell;
    if (strstr(agentType, "codex") != nullptr) return Theme::CloudBody;
    if (strstr(agentType, "opencode") != nullptr) return Theme::OpenCodeOuter;
    if (strstr(agentType, "claude") != nullptr) return Theme::ClaudeBody;
    return Theme::HUDDim;
}
static uint32_t ips10StateColor(const char* state) {
    if (strcmp(state, "idle") == 0) return Theme::StatusGreen;
    if (strcmp(state, "processing") == 0) return Theme::StatusBlue;
    if (strstr(state, "awaiting") != nullptr) return Theme::StatusAmber;
    return Theme::HUDDim;
}
#endif

// === Right panel: Tank Status (water-fill gauges) ===
static lv_obj_t* panelRight = nullptr;
static lv_obj_t* lblTankHeader = nullptr;

// 5h gauge
static lv_obj_t* gauge5hBox = nullptr;
static lv_obj_t* gauge5hFill = nullptr;
static lv_obj_t* gauge5hPct = nullptr;
static lv_obj_t* gauge5hPeriod = nullptr;
static lv_obj_t* gauge5hReset = nullptr;

// 7d gauge
static lv_obj_t* gauge7dBox = nullptr;
static lv_obj_t* gauge7dFill = nullptr;
static lv_obj_t* gauge7dPct = nullptr;
static lv_obj_t* gauge7dPeriod = nullptr;
static lv_obj_t* gauge7dReset = nullptr;

// Stale indicator
static lv_obj_t* lblStale = nullptr;

static bool visible = true;
static bool lastShowTankStatus = true;
static bool firstUpdate = true;

// Panel Y offset: just below water surface
static constexpr int PANEL_TOP_Y = 28;

// Gauge dimensions
#if defined(BOARD_TTGO)
static constexpr int GAUGE_SIZE = 40;
#elif IS_ROUND
static constexpr int GAUGE_SIZE = 44;
#else
static constexpr int GAUGE_SIZE = 58;
#endif
static constexpr int GAUGE_BORDER = 1;
static constexpr int GAUGE_INNER = GAUGE_SIZE - GAUGE_BORDER * 2;
static constexpr int GAUGE_GAP = 8;
static constexpr int GAUGE_RADIUS = 6;

static bool isCodexAgentType(const char* agentType) {
    return agentType &&
           (strstr(agentType, "codex-cli") != nullptr ||
            strstr(agentType, "codex-app") != nullptr);
}

static uint32_t agentDotColor(const char* agentType) {
    if (agentType && strstr(agentType, "openclaw") != nullptr) {
        return Theme::CrayfishShell;
    }
    if (isCodexAgentType(agentType)) {
        return Theme::CloudBody;
    }
    if (agentType && strstr(agentType, "opencode") != nullptr) {
        return Theme::OpenCodeOuter;
    }
    if (agentType && strstr(agentType, "claude-code") != nullptr) {
        return Theme::ClaudeBody;
    }
    return Theme::HUDDim;
}

namespace HUD {

// Helper: create a water-fill gauge column: [gauge box] + "1h 55m"
static void createGauge(lv_obj_t* parent,
                        lv_obj_t*& box, lv_obj_t*& fill,
                        lv_obj_t*& pctLabel, lv_obj_t*& periodLabel,
                        lv_obj_t*& resetLabel, const char* period) {
    // Column wrapper: gauge + reset time
    lv_obj_t* col = lv_obj_create(parent);
    lv_obj_set_size(col, GAUGE_SIZE, LV_SIZE_CONTENT);
    lv_obj_set_style_bg_opa(col, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(col, 0, 0);
    lv_obj_set_style_pad_all(col, 0, 0);
    lv_obj_set_style_pad_row(col, 1, 0);
    lv_obj_clear_flag(col, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_flex_flow(col, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(col, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

    // Gauge box (glass background)
    box = lv_obj_create(col);
    lv_obj_set_size(box, GAUGE_SIZE, GAUGE_SIZE);
    lv_obj_set_style_bg_color(box, lv_color_hex(0xFFFFFF), 0);
    lv_obj_set_style_bg_opa(box, (lv_opa_t)32, 0);  // 12.5% white glass
    lv_obj_set_style_border_width(box, GAUGE_BORDER, 0);
    lv_obj_set_style_border_color(box, lv_color_hex(0xFFFFFF), 0);
    lv_obj_set_style_border_opa(box, (lv_opa_t)20, 0);
    lv_obj_set_style_radius(box, GAUGE_RADIUS, 0);
    lv_obj_set_style_pad_all(box, 0, 0);
    lv_obj_clear_flag(box, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_clip_corner(box, true, 0);

    // Water fill bar (bottom-aligned, inside border)
    fill = lv_obj_create(box);
    lv_obj_set_size(fill, GAUGE_INNER, 0);
    lv_obj_align(fill, LV_ALIGN_BOTTOM_MID, 0, 0);
    lv_obj_set_style_bg_color(fill, lv_color_hex(Theme::StatusGreen), 0);
    lv_obj_set_style_bg_opa(fill, LV_OPA_50, 0);
    lv_obj_set_style_border_width(fill, 0, 0);
    lv_obj_set_style_radius(fill, 0, 0);
    lv_obj_set_style_pad_all(fill, 0, 0);
    lv_obj_clear_flag(fill, LV_OBJ_FLAG_SCROLLABLE);

    // Period label at top inside gauge ("5h" / "7d")
    periodLabel = lv_label_create(box);
    lv_obj_set_style_text_color(periodLabel, lv_color_hex(Theme::HUDDim), 0);
    lv_obj_set_style_text_font(periodLabel, &lv_font_montserrat_10, 0);
    lv_obj_align(periodLabel, LV_ALIGN_TOP_MID, 0, 4);
    lv_label_set_text(periodLabel, period);

    // Percentage text (centered in gauge)
    pctLabel = lv_label_create(box);
    lv_obj_set_style_text_color(pctLabel, lv_color_hex(Theme::HUDText), 0);
    lv_obj_set_style_text_font(pctLabel, &lv_font_montserrat_16, 0);
    lv_obj_align(pctLabel, LV_ALIGN_CENTER, 0, 2);
    lv_label_set_text(pctLabel, "0%");

    // Reset time BELOW gauge box (e.g. "1h 55m")
    resetLabel = lv_label_create(col);
    lv_obj_set_style_text_color(resetLabel, lv_color_hex(Theme::HUDDim), 0);
    lv_obj_set_style_text_font(resetLabel, &lv_font_montserrat_10, 0);
    lv_obj_set_style_text_opa(resetLabel, (lv_opa_t)178, 0);  // 70%
    lv_label_set_text(resetLabel, "");
}

void init(lv_obj_t* parent) {
#if defined(BOARD_IPS10)
    // === IPS10 tablet layout: full-height right sidebar (logo + sessions + usage + timeline) ===
    // The terrarium renders full-screen behind; creatures are biased left (theme.h Layout)
    // so they clear the sidebar. Mirrors the Android/iOS tablet "terrarium + timeline" split.
    panelLeft = lv_obj_create(parent);
    lv_obj_set_size(panelLeft, IPS10_SIDEBAR_W, g_screenH - 16);
    lv_obj_align(panelLeft, LV_ALIGN_TOP_RIGHT, -8, 8);
    lv_obj_set_style_bg_color(panelLeft, lv_color_hex(0x000000), 0);
    lv_obj_set_style_bg_opa(panelLeft, LV_OPA_60, 0);
    lv_obj_set_style_border_width(panelLeft, 0, 0);
    lv_obj_set_style_radius(panelLeft, 14, 0);
    lv_obj_set_style_pad_top(panelLeft, 16, 0);
    lv_obj_set_style_pad_bottom(panelLeft, 12, 0);
    lv_obj_set_style_pad_left(panelLeft, 14, 0);
    lv_obj_set_style_pad_right(panelLeft, 14, 0);
    lv_obj_set_style_pad_row(panelLeft, 8, 0);
    lv_obj_clear_flag(panelLeft, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_flex_flow(panelLeft, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(panelLeft, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

    // Logo image + wordmark
    lblLogoImg = lv_image_create(panelLeft);
    lv_image_set_src(lblLogoImg, &img_logo_64);

    lblLogo = lv_label_create(panelLeft);
    lv_obj_set_style_text_color(lblLogo, lv_color_hex(Theme::HUDText), 0);
    lv_obj_set_style_text_font(lblLogo, &lv_font_montserrat_20, 0);
    lv_label_set_text(lblLogo, "AgentDeck");

    logoLine = lv_obj_create(panelLeft);
    lv_obj_set_size(logoLine, IPS10_SIDEBAR_W - 60, 2);
    lv_obj_set_style_bg_color(logoLine, lv_color_hex(Theme::StatusBlue), 0);
    lv_obj_set_style_bg_opa(logoLine, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(logoLine, 0, 0);
    lv_obj_set_style_radius(logoLine, 1, 0);
    lv_obj_set_style_pad_all(logoLine, 0, 0);
    lv_obj_clear_flag(logoLine, LV_OBJ_FLAG_SCROLLABLE);

    // Not used on IPS10 (the mosaic replaces the flat session list); keep null so
    // the shared update() path guards them out.
    lblSessions = nullptr;

    // === Agent mosaic — flex column that fills the remaining sidebar height ===
    cellsBox = lv_obj_create(panelLeft);
    lv_obj_set_width(cellsBox, IPS10_SIDEBAR_W - 28);
    lv_obj_set_flex_grow(cellsBox, 1);          // eat all leftover vertical space
    lv_obj_set_style_bg_opa(cellsBox, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(cellsBox, 0, 0);
    lv_obj_set_style_pad_all(cellsBox, 0, 0);
    lv_obj_set_style_pad_row(cellsBox, 6, 0);
    lv_obj_clear_flag(cellsBox, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_flex_flow(cellsBox, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(cellsBox, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

    for (int i = 0; i < MOSAIC_MAX; i++) {
        cell[i] = lv_obj_create(cellsBox);
        lv_obj_set_width(cell[i], lv_pct(100));
        lv_obj_set_height(cell[i], 56);
        lv_obj_set_style_bg_color(cell[i], lv_color_hex(0xFFFFFF), 0);
        lv_obj_set_style_bg_opa(cell[i], (lv_opa_t)18, 0);
        lv_obj_set_style_radius(cell[i], 8, 0);
        lv_obj_set_style_border_width(cell[i], 0, 0);
        // Agent-type color accent down the left edge.
        lv_obj_set_style_border_side(cell[i], LV_BORDER_SIDE_LEFT, 0);
        lv_obj_set_style_border_width(cell[i], 3, 0);
        lv_obj_set_style_border_color(cell[i], lv_color_hex(Theme::HUDDim), 0);
        lv_obj_set_style_pad_left(cell[i], 8, 0);
        lv_obj_set_style_pad_right(cell[i], 6, 0);
        lv_obj_set_style_pad_top(cell[i], 5, 0);
        lv_obj_set_style_pad_bottom(cell[i], 5, 0);
        lv_obj_set_style_pad_row(cell[i], 2, 0);
        lv_obj_clear_flag(cell[i], LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_set_flex_flow(cell[i], LV_FLEX_FLOW_COLUMN);
        lv_obj_set_flex_align(cell[i], LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

        cellName[i] = lv_label_create(cell[i]);
        lv_obj_set_style_text_color(cellName[i], lv_color_hex(Theme::HUDText), 0);
        lv_obj_set_style_text_font(cellName[i], &font_kr_12, 0);
        lv_label_set_recolor(cellName[i], true);
        lv_label_set_long_mode(cellName[i], LV_LABEL_LONG_DOT);
        lv_obj_set_width(cellName[i], IPS10_SIDEBAR_W - 28 - 24);
        lv_label_set_text(cellName[i], "");

        cellAct[i] = lv_label_create(cell[i]);
        lv_obj_set_style_text_color(cellAct[i], lv_color_hex(Theme::HUDDim), 0);
        lv_obj_set_style_text_font(cellAct[i], &lv_font_montserrat_10, 0);
        lv_label_set_recolor(cellAct[i], true);
        lv_label_set_long_mode(cellAct[i], LV_LABEL_LONG_DOT);
        lv_obj_set_width(cellAct[i], IPS10_SIDEBAR_W - 28 - 24);
        lv_label_set_text(cellAct[i], "");

        lv_obj_add_flag(cell[i], LV_OBJ_FLAG_HIDDEN);
        cellCurH[i] = 56;
    }

    // Compact usage gauges pinned at the bottom (gauge row appended by shared code below)
    panelRight = lv_obj_create(panelLeft);
    lv_obj_set_size(panelRight, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_set_style_bg_opa(panelRight, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(panelRight, 0, 0);
    lv_obj_set_style_pad_all(panelRight, 0, 0);
    lv_obj_set_style_pad_row(panelRight, 2, 0);
    lv_obj_clear_flag(panelRight, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_flex_flow(panelRight, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(panelRight, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

    lblTankHeader = lv_label_create(panelRight);
    lv_obj_set_style_text_color(lblTankHeader, lv_color_hex(Theme::HUDDim), 0);
    lv_obj_set_style_text_font(lblTankHeader, &lv_font_montserrat_10, 0);
    lv_label_set_text(lblTankHeader, "CLAUDE USAGE");

#elif IS_ROUND
    // === Round AMOLED layout: top status bar + bottom gauges ===

    // Top status bar — centered, narrow
    panelLeft = lv_obj_create(parent);
    lv_obj_set_size(panelLeft, 260, LV_SIZE_CONTENT);
    lv_obj_align(panelLeft, LV_ALIGN_TOP_MID, 0, 20);
    lv_obj_set_style_bg_color(panelLeft, lv_color_hex(0x000000), 0);
    lv_obj_set_style_bg_opa(panelLeft, LV_OPA_50, 0);
    lv_obj_set_style_border_width(panelLeft, 0, 0);
    lv_obj_set_style_radius(panelLeft, 12, 0);
    lv_obj_set_style_pad_top(panelLeft, 4, 0);
    lv_obj_set_style_pad_bottom(panelLeft, 4, 0);
    lv_obj_set_style_pad_left(panelLeft, 8, 0);
    lv_obj_set_style_pad_right(panelLeft, 8, 0);
    lv_obj_set_style_pad_row(panelLeft, 1, 0);
    lv_obj_clear_flag(panelLeft, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_flex_flow(panelLeft, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(panelLeft, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

    // Logo text — smaller for round display
    lblLogo = lv_label_create(panelLeft);
    lv_obj_set_style_text_color(lblLogo, lv_color_hex(Theme::HUDText), 0);
    lv_obj_set_style_text_font(lblLogo, &lv_font_montserrat_14, 0);
    lv_label_set_text(lblLogo, "AgentDeck");

    // Accent underline
    logoLine = lv_obj_create(panelLeft);
    lv_obj_set_size(logoLine, 100, 2);
    lv_obj_set_style_bg_color(logoLine, lv_color_hex(Theme::StatusBlue), 0);
    lv_obj_set_style_bg_opa(logoLine, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(logoLine, 0, 0);
    lv_obj_set_style_radius(logoLine, 1, 0);
    lv_obj_set_style_pad_all(logoLine, 0, 0);
    lv_obj_clear_flag(logoLine, LV_OBJ_FLAG_SCROLLABLE);

    // Session list — compact, 1-line per session
    lblSessions = lv_label_create(panelLeft);
    lv_obj_set_style_text_color(lblSessions, lv_color_hex(Theme::HUDDim), 0);
    lv_obj_set_style_text_font(lblSessions, &lv_font_montserrat_10, 0);
    lv_label_set_recolor(lblSessions, true);
    lv_label_set_text(lblSessions, "");
    lv_obj_set_width(lblSessions, 240);
    lv_obj_set_style_text_align(lblSessions, LV_TEXT_ALIGN_CENTER, 0);

    // Bottom gauge panel — centered at bottom of circle
    panelRight = lv_obj_create(parent);
    int panelW = GAUGE_SIZE * 2 + GAUGE_GAP + 16;
    lv_obj_set_size(panelRight, panelW, LV_SIZE_CONTENT);
    lv_obj_align(panelRight, LV_ALIGN_BOTTOM_MID, 0, -30);
    lv_obj_set_style_bg_color(panelRight, lv_color_hex(0x000000), 0);
    lv_obj_set_style_bg_opa(panelRight, LV_OPA_50, 0);
    lv_obj_set_style_border_width(panelRight, 0, 0);
    lv_obj_set_style_radius(panelRight, 12, 0);
    lv_obj_set_style_pad_top(panelRight, 3, 0);
    lv_obj_set_style_pad_bottom(panelRight, 4, 0);
    lv_obj_set_style_pad_left(panelRight, 8, 0);
    lv_obj_set_style_pad_right(panelRight, 8, 0);
    lv_obj_set_style_pad_row(panelRight, 1, 0);
    lv_obj_set_style_pad_column(panelRight, GAUGE_GAP, 0);
    lv_obj_clear_flag(panelRight, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_flex_flow(panelRight, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(panelRight, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

    // No header for round — save space

    lblTankHeader = nullptr;

#else
    // === Rectangular layout: left panel + right panel ===

    // === Left panel: AgentDeck logo + sessions ===
    const bool portrait = !UI::isLandscape();
    panelLeft = lv_obj_create(parent);
#if defined(BOARD_TTGO)
    lv_obj_set_size(panelLeft, 110, LV_SIZE_CONTENT);
    lv_obj_set_pos(panelLeft, 6, 6);
#else
    if (portrait) {
        // Portrait: full-width panel at top
        lv_obj_set_size(panelLeft, g_screenW - 16, LV_SIZE_CONTENT);
        lv_obj_set_pos(panelLeft, 8, PANEL_TOP_Y);
    } else {
        lv_obj_set_size(panelLeft, 170, LV_SIZE_CONTENT);
        lv_obj_set_pos(panelLeft, 8, PANEL_TOP_Y);
    }
#endif
    lv_obj_set_style_bg_color(panelLeft, lv_color_hex(0x000000), 0);
    lv_obj_set_style_bg_opa(panelLeft, LV_OPA_50, 0);
    lv_obj_set_style_border_width(panelLeft, 0, 0);
    lv_obj_set_style_radius(panelLeft, 8, 0);
    lv_obj_set_style_pad_top(panelLeft, 6, 0);
    lv_obj_set_style_pad_bottom(panelLeft, 6, 0);
    lv_obj_set_style_pad_left(panelLeft, 8, 0);
    lv_obj_set_style_pad_right(panelLeft, 8, 0);
    lv_obj_set_style_pad_row(panelLeft, 2, 0);
    lv_obj_clear_flag(panelLeft, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_flex_flow(panelLeft, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(panelLeft, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

    // Logo text — large, centered (like Android tablet/e-reader)
    lblLogo = lv_label_create(panelLeft);
    lv_obj_set_style_text_color(lblLogo, lv_color_hex(Theme::HUDText), 0);
#if defined(BOARD_TTGO)
    lv_obj_set_style_text_font(lblLogo, &lv_font_montserrat_14, 0);
#else
    lv_obj_set_style_text_font(lblLogo, &lv_font_montserrat_20, 0);
#endif
    lv_label_set_text(lblLogo, "AgentDeck");

    // Accent underline below logo
    logoLine = lv_obj_create(panelLeft);
#if defined(BOARD_TTGO)
    lv_obj_set_size(logoLine, 80, 2);
#else
    lv_obj_set_size(logoLine, 130, 2);
#endif
    lv_obj_set_style_bg_color(logoLine, lv_color_hex(Theme::StatusBlue), 0);
    lv_obj_set_style_bg_opa(logoLine, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(logoLine, 0, 0);
    lv_obj_set_style_radius(logoLine, 1, 0);
    lv_obj_set_style_pad_all(logoLine, 0, 0);
    lv_obj_clear_flag(logoLine, LV_OBJ_FLAG_SCROLLABLE);

    // Session list (recolor enabled for colored dots)
    lblSessions = lv_label_create(panelLeft);
    lv_obj_set_style_text_color(lblSessions, lv_color_hex(Theme::HUDDim), 0);
    lv_obj_set_style_text_font(lblSessions, &font_kr_12, 0);
    lv_label_set_recolor(lblSessions, true);
    lv_label_set_text(lblSessions, "");
#if defined(BOARD_TTGO)
    lv_obj_set_width(lblSessions, 98);
#else
    lv_obj_set_width(lblSessions, 150);
#endif

    // === Right panel: Tank Status with water-fill gauges ===
    panelRight = lv_obj_create(parent);
    int panelW = GAUGE_SIZE * 2 + GAUGE_GAP + 16;
    lv_obj_set_size(panelRight, panelW, LV_SIZE_CONTENT);
#if defined(BOARD_TTGO)
    lv_obj_set_pos(panelRight, g_screenW - panelW - 6, 6);
#else
    if (portrait) {
        // Portrait: below left panel, aligned to bottom-right
        lv_obj_align(panelRight, LV_ALIGN_BOTTOM_RIGHT, -8, -8);
    } else {
        lv_obj_set_pos(panelRight, g_screenW - panelW - 8, PANEL_TOP_Y);
    }
#endif
    lv_obj_set_style_bg_color(panelRight, lv_color_hex(0x000000), 0);
    lv_obj_set_style_bg_opa(panelRight, LV_OPA_50, 0);
    lv_obj_set_style_border_width(panelRight, 0, 0);
    lv_obj_set_style_radius(panelRight, 8, 0);
    lv_obj_set_style_pad_top(panelRight, 3, 0);
    lv_obj_set_style_pad_bottom(panelRight, 0, 0);
    lv_obj_set_style_pad_left(panelRight, 8, 0);
    lv_obj_set_style_pad_right(panelRight, 8, 0);
    lv_obj_set_style_pad_row(panelRight, 1, 0);
    lv_obj_set_style_pad_column(panelRight, GAUGE_GAP, 0);
    lv_obj_clear_flag(panelRight, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_flex_flow(panelRight, LV_FLEX_FLOW_COLUMN);

    // Header
    lblTankHeader = lv_label_create(panelRight);
    lv_obj_set_style_text_color(lblTankHeader, lv_color_hex(Theme::HUDDim), 0);
    lv_obj_set_style_text_font(lblTankHeader, &lv_font_montserrat_10, 0);
    lv_label_set_text(lblTankHeader, "TANK STATUS");
#endif

    // Gauge row (horizontal) — shared by both layouts
    lv_obj_t* gaugeRow = lv_obj_create(panelRight);
    lv_obj_set_size(gaugeRow, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_set_style_bg_opa(gaugeRow, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(gaugeRow, 0, 0);
    lv_obj_set_style_pad_all(gaugeRow, 0, 0);
    lv_obj_set_style_pad_column(gaugeRow, GAUGE_GAP, 0);
    lv_obj_set_style_pad_row(gaugeRow, 0, 0);
    lv_obj_clear_flag(gaugeRow, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_flex_flow(gaugeRow, LV_FLEX_FLOW_ROW);

    // Create two gauges side by side
    createGauge(gaugeRow, gauge5hBox, gauge5hFill, gauge5hPct, gauge5hPeriod, gauge5hReset, "5h");
    createGauge(gaugeRow, gauge7dBox, gauge7dFill, gauge7dPct, gauge7dPeriod, gauge7dReset, "7d");

    // Stale indicator (only shown when data is stale, hidden by default)
    lblStale = lv_label_create(panelRight);
    lv_obj_set_style_text_color(lblStale, lv_color_hex(Theme::StatusAmber), 0);
    lv_obj_set_style_text_font(lblStale, &lv_font_montserrat_10, 0);
    lv_label_set_text(lblStale, "");
    lv_obj_add_flag(lblStale, LV_OBJ_FLAG_HIDDEN);
}

// Helper: status color for AgentState
static uint32_t stateColor(AgentState st) {
    switch (st) {
        case AgentState::IDLE:                 return Theme::StatusGreen;
        case AgentState::PROCESSING:           return Theme::StatusBlue;
        case AgentState::AWAITING_PERMISSION:
        case AgentState::AWAITING_OPTION:
        case AgentState::AWAITING_DIFF:        return Theme::StatusAmber;
        default:                               return Theme::StatusRed;
    }
}

// Map session state string to color
static uint32_t sessionStateColor(const char* state) {
    if (strcmp(state, "idle") == 0)       return Theme::StatusGreen;
    if (strcmp(state, "processing") == 0) return Theme::StatusBlue;
    if (strstr(state, "awaiting") != nullptr) return Theme::StatusAmber;
    return Theme::HUDDim;
}

// Gauge color based on usage %
static uint32_t gaugeColor(float pct) {
    if (pct >= 90.0f) return Theme::StatusRed;
    if (pct >= 70.0f) return Theme::StatusAmber;
    return Theme::StatusGreen;
}

// Update a water-fill gauge. pct < 0 means "no data" (sentinel).
static void updateGauge(lv_obj_t* fill, lv_obj_t* pctLabel, lv_obj_t* resetLabel,
                        float pct, const char* resetStr, bool stale) {
    if (pct < 0.0f) {
        // No data — empty gauge, "--" text
        lv_obj_set_height(fill, 0);
        lv_obj_align(fill, LV_ALIGN_BOTTOM_MID, 0, 0);
        lv_obj_set_style_bg_color(fill, lv_color_hex(Theme::HUDDim), 0);
        lv_label_set_text(pctLabel, "--");
        lv_label_set_text(resetLabel, "");
        return;
    }

    // Fill height proportional to percentage (inside border)
    int fillH = (int)(GAUGE_INNER * pct / 100.0f);
    if (fillH < 0) fillH = 0;
    if (fillH > GAUGE_INNER) fillH = GAUGE_INNER;
    lv_obj_set_height(fill, fillH);
    lv_obj_align(fill, LV_ALIGN_BOTTOM_MID, 0, 0);

    // Fill color
    uint32_t color = gaugeColor(pct);
    lv_obj_set_style_bg_color(fill, lv_color_hex(color), 0);

    // Percentage text (append "!" when stale, matching Android behavior)
    char pctBuf[12];
    if (stale)
        snprintf(pctBuf, sizeof(pctBuf), "%d%%!", (int)pct);
    else
        snprintf(pctBuf, sizeof(pctBuf), "%d%%", (int)pct);
    lv_label_set_text(pctLabel, pctBuf);

    // Reset time below gauge
    if (resetStr[0]) {
        lv_label_set_text(resetLabel, resetStr);
    } else {
        lv_label_set_text(resetLabel, "");
    }
}

void update() {
    if (!panelLeft) return;

    lockState();
    bool hasData = g_state.dataReceived;
    float p5h = g_state.fiveHourPercent;
    float p7d = g_state.sevenDayPercent;
    char reset5h[20], reset7d[20];
    strncpy(reset5h, g_state.fiveHourReset, sizeof(reset5h) - 1);
    strncpy(reset7d, g_state.sevenDayReset, sizeof(reset7d) - 1);
    reset5h[sizeof(reset5h) - 1] = '\0';
    reset7d[sizeof(reset7d) - 1] = '\0';
    bool usageStale = g_state.usageStale;

    // Copy session list
    uint8_t sessionCount = hasData ? g_state.sessionCount : (uint8_t)0;
    SessionInfo sessions[6];
    memcpy(sessions, g_state.sessions, sizeof(sessions));

    // Fallback: if no sessions, use primary state
    AgentState primaryState = g_state.state;
    char primaryProject[40], primaryAgent[16];
    strncpy(primaryProject, g_state.projectName, sizeof(primaryProject) - 1);
    primaryProject[sizeof(primaryProject) - 1] = '\0';
    strncpy(primaryAgent, g_state.agentType, sizeof(primaryAgent) - 1);
    primaryAgent[sizeof(primaryAgent) - 1] = '\0';

    // HUD shows the OpenClaw label only when the Gateway is authenticated,
    // matching the creature gate. Reachability alone (`gatewayAvailable`)
    // used to light up an "OpenClaw" row even with no shared token.
    bool gateway = g_state.gatewayConnected;
    unlockState();

    // === Left panel: session list ===
    char buf[400];
    int pos = 0;

    if (sessionCount > 0) {
        // Show real session list from bridge
        for (uint8_t i = 0; i < sessionCount && i < 6; i++) {
            if (!sessions[i].alive) continue;

            // Pick color by agent type
            uint32_t dotColor = agentDotColor(sessions[i].agentType);

            // State color for status dot
            uint32_t sColor = sessionStateColor(sessions[i].state);

            // Format: colored-type-dot + project name + state dot
            pos += snprintf(buf + pos, sizeof(buf) - pos,
                "#%06lX " LV_SYMBOL_BULLET "# %s  #%06lX " LV_SYMBOL_BULLET "#\n",
                (unsigned long)dotColor,
                sessions[i].projectName[0] ? sessions[i].projectName : sessions[i].id,
                (unsigned long)sColor);
        }
    } else if (hasData) {
        // Fallback: show primary session info (only when real data received)
        uint32_t dotColor = agentDotColor(primaryAgent);
        uint32_t sColor = stateColor(primaryState);

        pos += snprintf(buf + pos, sizeof(buf) - pos,
            "#%06lX " LV_SYMBOL_BULLET "# %s  #%06lX " LV_SYMBOL_BULLET "#\n",
            (unsigned long)dotColor,
            primaryProject[0] ? primaryProject : "Agent",
            (unsigned long)sColor);
    } else {
        // No data yet — show connecting message
        pos += snprintf(buf + pos, sizeof(buf) - pos,
            "#808080 Connecting...#\n");
    }

    // Gateway indicator (if available but no openclaw session shown)
    if (gateway) {
        bool hasOC = false;
        for (uint8_t i = 0; i < sessionCount; i++) {
            if (sessions[i].alive && strstr(sessions[i].agentType, "openclaw") != nullptr) {
                hasOC = true;
                break;
            }
        }
        if (!hasOC) {
            pos += snprintf(buf + pos, sizeof(buf) - pos,
                "#%06lX " LV_SYMBOL_BULLET "# OpenClaw\n",
                (unsigned long)Theme::CrayfishShell);
        }
    }

    // Remove trailing newline
    if (pos > 0 && buf[pos - 1] == '\n') buf[pos - 1] = '\0';
    else buf[pos] = '\0';

    if (lblSessions) lv_label_set_text(lblSessions, buf);  // null on IPS10 (mosaic instead)

    // === Right panel: water-fill gauges ===
    updateGauge(gauge5hFill, gauge5hPct, gauge5hReset, p5h, reset5h, usageStale);
    updateGauge(gauge7dFill, gauge7dPct, gauge7dReset, p7d, reset7d, usageStale);

    // Stale indicator (shown only when we have data but it's stale)
    bool showStale = usageStale && (p5h >= 0.0f || p7d >= 0.0f);
    if (showStale) {
        lv_label_set_text(lblStale, "! stale");
        lv_obj_clear_flag(lblStale, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_label_set_text(lblStale, "");
        lv_obj_add_flag(lblStale, LV_OBJ_FLAG_HIDDEN);
    }

#if defined(BOARD_IPS10)
    // === Living agent mosaic — one cell per agent, height fluidly tracks activity,
    //     each cell narrates inline what that agent is doing. ===
    if (cellsBox) {
        struct MCell { uint32_t accent; uint32_t stateCol; char name[40]; char agent[16]; char state[20]; char model[32]; };
        MCell mc[MOSAIC_MAX];
        int n = 0;
        char latestAction[48] = "";

        lockState();
        if (g_state.timelineCount > 0) {
            int li = (g_state.timelineHead + g_state.timelineCount - 1) % TIMELINE_MAX_ENTRIES;
            strncpy(latestAction, g_state.timeline[li].raw, sizeof(latestAction) - 1);
            latestAction[sizeof(latestAction) - 1] = '\0';
        }
        for (uint8_t s = 0; s < g_state.sessionCount && n < MOSAIC_MAX; s++) {
            if (!g_state.sessions[s].alive) continue;
            const SessionInfo& si = g_state.sessions[s];
            mc[n].accent = ips10AgentColor(si.agentType);
            mc[n].stateCol = ips10StateColor(si.state);
            strncpy(mc[n].name, si.projectName[0] ? si.projectName : si.id, sizeof(mc[n].name) - 1);
            mc[n].name[sizeof(mc[n].name) - 1] = '\0';
            strncpy(mc[n].agent, si.agentType, sizeof(mc[n].agent) - 1); mc[n].agent[sizeof(mc[n].agent) - 1] = '\0';
            strncpy(mc[n].state, si.state, sizeof(mc[n].state) - 1); mc[n].state[sizeof(mc[n].state) - 1] = '\0';
            strncpy(mc[n].model, si.modelName, sizeof(mc[n].model) - 1); mc[n].model[sizeof(mc[n].model) - 1] = '\0';
            n++;
        }
        bool hasOC = false;
        for (int i = 0; i < n; i++) if (strstr(mc[i].agent, "openclaw")) hasOC = true;
        if (g_state.gatewayConnected && !hasOC && n < MOSAIC_MAX) {
            mc[n].accent = Theme::CrayfishShell; mc[n].stateCol = Theme::StatusGreen;
            strcpy(mc[n].name, "OpenClaw"); strcpy(mc[n].agent, "openclaw");
            strcpy(mc[n].state, "idle"); mc[n].model[0] = '\0'; n++;
        }
        if (n == 0 && hasData) {  // single-session fallback (no sessions_list yet)
            mc[0].accent = ips10AgentColor(g_state.agentType);
            const char* ps = (primaryState == AgentState::PROCESSING) ? "processing" :
                             (primaryState == AgentState::AWAITING_PERMISSION || primaryState == AgentState::AWAITING_OPTION ||
                              primaryState == AgentState::AWAITING_DIFF) ? "awaiting_permission" : "idle";
            mc[0].stateCol = ips10StateColor(ps);
            strncpy(mc[0].name, primaryProject[0] ? primaryProject : "Agent", sizeof(mc[0].name) - 1);
            mc[0].name[sizeof(mc[0].name) - 1] = '\0';
            strncpy(mc[0].agent, primaryAgent, sizeof(mc[0].agent) - 1); mc[0].agent[sizeof(mc[0].agent) - 1] = '\0';
            strncpy(mc[0].state, ps, sizeof(mc[0].state) - 1); mc[0].state[sizeof(mc[0].state) - 1] = '\0';
            mc[0].model[0] = '\0'; n = 1;
        }
        unlockState();

        for (int i = 0; i < n; i++)  // protect recolor markup
            for (char* c = mc[i].name; *c; c++) if (*c == '#' || *c == '\n') *c = ' ';
        for (char* c = latestAction; *c; c++) if (*c == '#' || *c == '\n') *c = ' ';

        int avail = lv_obj_get_content_height(cellsBox);
        float wsum = 0; float weights[MOSAIC_MAX];
        for (int i = 0; i < n; i++) { weights[i] = ips10StateWeight(mc[i].state); wsum += weights[i]; }
        int gaps = (n > 1) ? (n - 1) * 6 : 0;
        int usable = avail - gaps;
        if (usable < n * 44) usable = n * 44;  // floor when layout not ready
        bool actionUsed = false;

        for (int i = 0; i < MOSAIC_MAX; i++) {
            if (i >= n) { lv_obj_add_flag(cell[i], LV_OBJ_FLAG_HIDDEN); continue; }
            // Fluid height: lerp current toward the activity-weighted target.
            float target = (wsum > 0) ? (usable * weights[i] / wsum) : (usable / (float)n);
            if (target < 44) target = 44;
            cellCurH[i] += (target - cellCurH[i]) * 0.25f;
            lv_obj_clear_flag(cell[i], LV_OBJ_FLAG_HIDDEN);
            lv_obj_set_height(cell[i], (int)(cellCurH[i] + 0.5f));
            lv_obj_set_style_border_color(cell[i], lv_color_hex(mc[i].accent), 0);

            char nb[96];
            snprintf(nb, sizeof(nb), "#%06lX " LV_SYMBOL_BULLET "# %s", (unsigned long)mc[i].stateCol, mc[i].name);
            lv_label_set_text(cellName[i], nb);

            char ab[96];
            bool working = (strcmp(mc[i].state, "processing") == 0);
            if (working && latestAction[0] && !actionUsed) {
                snprintf(ab, sizeof(ab), LV_SYMBOL_PLAY " %s", latestAction);
                actionUsed = true;
            } else if (mc[i].model[0]) {
                snprintf(ab, sizeof(ab), "%s \xC2\xB7 %s", ips10StatePhrase(mc[i].state), mc[i].model);
            } else {
                snprintf(ab, sizeof(ab), "%s", ips10StatePhrase(mc[i].state));
            }
            lv_label_set_text(cellAct[i], ab);
        }
    }
#endif

    bool connected = hasData && (g_state.wsConnected || Net::serialConnected());
    bool showTankStatus = connected && (p5h >= 0.0f || p7d >= 0.0f);
    if (firstUpdate || showTankStatus != lastShowTankStatus) {
        firstUpdate = false;
        lastShowTankStatus = showTankStatus;

        if (showTankStatus) {
            if (panelRight && visible) {
                lv_obj_clear_flag(panelRight, LV_OBJ_FLAG_HIDDEN);
            }
#if !IS_ROUND
            if (UI::isLandscape()) {
#if defined(BOARD_TTGO)
                lv_obj_align(panelLeft, LV_ALIGN_TOP_LEFT, 6, 6);
#else
                lv_obj_align(panelLeft, LV_ALIGN_TOP_LEFT, 8, PANEL_TOP_Y);
#endif
            }
#endif
        } else {
            if (panelRight) {
                lv_obj_add_flag(panelRight, LV_OBJ_FLAG_HIDDEN);
            }
#if !IS_ROUND
            if (UI::isLandscape()) {
#if defined(BOARD_TTGO)
                lv_obj_align(panelLeft, LV_ALIGN_TOP_MID, 0, 6);
#else
                lv_obj_align(panelLeft, LV_ALIGN_TOP_MID, 0, PANEL_TOP_Y);
#endif
            }
#endif
        }
    }
}

void setVisible(bool v) {
    visible = v;
    if (panelLeft) {
        if (v) {
            lv_obj_clear_flag(panelLeft, LV_OBJ_FLAG_HIDDEN);
            if (lastShowTankStatus && panelRight) {
                lv_obj_clear_flag(panelRight, LV_OBJ_FLAG_HIDDEN);
            }
        } else {
            lv_obj_add_flag(panelLeft, LV_OBJ_FLAG_HIDDEN);
            if (panelRight) {
                lv_obj_add_flag(panelRight, LV_OBJ_FLAG_HIDDEN);
            }
        }
    }
}

bool isVisible() {
    return visible;
}

}  // namespace HUD
