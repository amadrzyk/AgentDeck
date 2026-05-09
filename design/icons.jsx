// AgentDeck — Extended icon set.
// All 24px viewbox, currentColor, 1.6px stroke unless noted.
// Use these wherever you'd otherwise reach for a generic icon font.

const STROKE = 1.6;

function _svg(children, { size = 24, color = "currentColor", stroke = STROKE, fill = "none" } = {}) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill={fill} stroke={color} strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

// === Status ===
function IconRunning(p)   { return _svg(<><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="8" opacity="0.5"/></>, p); }
function IconAwaiting(p)  { return _svg(<><path d="M12 7 v5 l3 2"/><circle cx="12" cy="12" r="9"/></>, p); }
function IconIdle(p)      { return _svg(<circle cx="12" cy="12" r="8"/>, p); }
function IconError(p)     { return _svg(<><circle cx="12" cy="12" r="9"/><path d="M9 9 l6 6 M15 9 l-6 6"/></>, p); }

// === Surfaces / hardware ===
function IconMenubar(p)   { return _svg(<><rect x="2" y="4" width="20" height="3" rx="1"/><rect x="3" y="9" width="18" height="11" rx="2" opacity="0.4"/></>, p); }
function IconTablet(p)    { return _svg(<><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="12" cy="18" r="0.8" fill="currentColor" stroke="none"/></>, p); }
function IconPhone(p)     { return _svg(<><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M10 19 h4"/></>, p); }
function IconLED(p)       { return _svg(<><rect x="2" y="9" width="20" height="6" rx="1"/><circle cx="6" cy="12" r="0.8" fill="currentColor" stroke="none"/><circle cx="10" cy="12" r="0.8" fill="currentColor" stroke="none"/><circle cx="14" cy="12" r="0.8" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="0.8" fill="currentColor" stroke="none"/></>, p); }
function IconEink(p)      { return _svg(<><rect x="2" y="5" width="20" height="14" rx="1.5"/><path d="M5 9 h14 M5 12 h10 M5 15 h12" opacity="0.6"/></>, p); }
function IconRound(p)     { return _svg(<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" opacity="0.4"/></>, p); }
function IconChip(p)      { return _svg(<><rect x="6" y="6" width="12" height="12" rx="1.5"/><path d="M9 2 v3 M15 2 v3 M9 19 v3 M15 19 v3 M2 9 h3 M2 15 h3 M19 9 h3 M19 15 h3"/></>, p); }

// === Actions ===
function IconPlay(p)      { return _svg(<path d="M8 5 v14 l11 -7 z"/>, p); }
function IconPause(p)     { return _svg(<><path d="M8 5 v14"/><path d="M16 5 v14"/></>, p); }
function IconRestart(p)   { return _svg(<><path d="M3 12 a9 9 0 1 0 3 -6.7"/><path d="M3 4 v5 h5"/></>, p); }
function IconCheck(p)     { return _svg(<path d="M5 12 l5 5 l9 -10"/>, p); }
function IconArrowR(p)    { return _svg(<><path d="M5 12 h14"/><path d="M13 6 l6 6 l-6 6"/></>, p); }
function IconExternal(p)  { return _svg(<><path d="M14 4 h6 v6"/><path d="M20 4 l-9 9"/><path d="M18 14 v6 H4 V6 h6"/></>, p); }
function IconCommand(p)   { return _svg(<path d="M9 6 a3 3 0 1 0 0 0 v12 a3 3 0 1 0 0 0 h6 a3 3 0 1 0 0 0 V6 a3 3 0 1 0 0 0 z"/>, p); }
function IconCopy(p)      { return _svg(<><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8 V6 a2 2 0 0 0 -2 -2 H6 a2 2 0 0 0 -2 2 v8 a2 2 0 0 0 2 2 h2"/></>, p); }

// === Concept ===
function IconAgent(p)     { return _svg(<><circle cx="12" cy="9" r="4"/><path d="M5 21 a7 7 0 0 1 14 0"/></>, p); }
function IconStack(p)     { return _svg(<><rect x="4" y="8" width="12" height="14" rx="1.5" opacity="0.35"/><rect x="6" y="5" width="12" height="14" rx="1.5" opacity="0.6"/><rect x="8" y="2" width="12" height="14" rx="1.5"/></>, p); }
function IconRouter(p)    { return _svg(<><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/><circle cx="4" cy="4" r="2" opacity="0.7"/><circle cx="20" cy="4" r="2" opacity="0.7"/><circle cx="4" cy="20" r="2" opacity="0.7"/><circle cx="20" cy="20" r="2" opacity="0.7"/><line x1="6" y1="6" x2="10" y2="10"/><line x1="18" y1="6" x2="14" y2="10"/><line x1="6" y1="18" x2="10" y2="14"/><line x1="18" y1="18" x2="14" y2="14"/></>, p); }
function IconShield(p)    { return _svg(<><path d="M12 3 l8 3 v6 c0 4.5 -3.5 8 -8 9 -4.5 -1 -8 -4.5 -8 -9 V6 z"/><path d="M9 12 l2 2 l4 -4"/></>, p); }
function IconLock(p)      { return _svg(<><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11 V8 a4 4 0 0 1 8 0 v3"/></>, p); }
function IconKey(p)       { return _svg(<><circle cx="8" cy="15" r="4"/><path d="M11 12 L21 2 M17 6 l3 3 M14 9 l3 3"/></>, p); }
function IconBell(p)      { return _svg(<><path d="M6 16 V11 a6 6 0 0 1 12 0 v5 l2 2 H4 z"/><path d="M10 20 a2 2 0 0 0 4 0"/></>, p); }
function IconSparkle(p)   { return _svg(<><path d="M12 3 v6 M12 15 v6 M3 12 h6 M15 12 h6"/><path d="M6 6 l3 3 M15 15 l3 3 M18 6 l-3 3 M9 15 l-3 3" opacity="0.5"/></>, p); }

// === Tools / dev ===
function IconTerminal(p)  { return _svg(<><rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M7 9 l3 3 l-3 3 M12 15 h5"/></>, p); }
function IconBranch(p)    { return _svg(<><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="9" r="2"/><path d="M6 7 v10 M6 12 a6 6 0 0 0 6 -6 a3 3 0 0 1 4 -1"/></>, p); }
function IconBox(p)       { return _svg(<><path d="M3 7 l9 -4 l9 4 v10 l-9 4 l-9 -4 z"/><path d="M3 7 l9 4 l9 -4 M12 11 v10" opacity="0.6"/></>, p); }
function IconLayers(p)    { return _svg(<><path d="M12 3 l9 5 l-9 5 l-9 -5 z"/><path d="M3 13 l9 5 l9 -5 M3 18 l9 5 l9 -5" opacity="0.5"/></>, p); }

window.AgentDeckIcons = {
  // status
  IconRunning, IconAwaiting, IconIdle, IconError,
  // surfaces
  IconMenubar, IconTablet, IconPhone, IconLED, IconEink, IconRound, IconChip,
  // actions
  IconPlay, IconPause, IconRestart, IconCheck, IconArrowR, IconExternal, IconCommand, IconCopy,
  // concept
  IconAgent, IconStack, IconRouter, IconShield, IconLock, IconKey, IconBell, IconSparkle,
  // dev
  IconTerminal, IconBranch, IconBox, IconLayers,
};
