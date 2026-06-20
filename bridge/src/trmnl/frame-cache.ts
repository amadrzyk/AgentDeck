/**
 * TRMNL frame cache — the single rendered 800×480 1-bit PNG the BYOS HTTP routes
 * serve. The device module keeps it fresh by re-rendering on state change; the
 * daemon's /api/display + /trmnl/image routes read it. Unlike push devices
 * (Pixoo/D200H), TRMNL pulls on its own schedule, so we only ever hold the
 * latest frame and let the device fetch it when it polls.
 */
import { renderTrmnlFrame, type TrmnlFrame } from './image-renderer.js';

let currentFrame: TrmnlFrame | null = null;
let lastStateEvt: any = {
  state: 'IDLE',
  projectName: '',
  modelName: '',
  mode: 'default',
  agentType: 'daemon',
  fiveHourPercent: 0,
  sevenDayPercent: 0,
  totalTokens: 0,
  totalCost: 0,
  options: [],
  currentTool: '',
  allSessions: [],
};
let lastHash = '';

/** Visual-state fingerprint (excludes the wall clock so it doesn't churn). */
export function trmnlStateHash(evt: any): string {
  const sessions = Array.isArray(evt?.allSessions) ? evt.allSessions : [];
  const sessKey = sessions
    .map((s: any) => `${s?.id}:${s?.agentType}:${s?.state}:${s?.projectName}:${s?.modelName}`)
    .join('|');
  return [
    evt?.state,
    evt?.projectName,
    evt?.modelName,
    Math.round(evt?.fiveHourPercent ?? 0),
    Math.round(evt?.sevenDayPercent ?? 0),
    evt?.totalTokens ?? 0,
    Math.round((evt?.totalCost ?? 0) * 100),
    sessKey,
  ].join('~');
}

/** Store the latest broadcast state for lazy rendering, without rendering now. */
export function setTrmnlState(evt: any): void {
  lastStateEvt = evt;
}

/**
 * Re-render the frame if the visual state changed. Returns true if a new frame
 * was produced. Called by the device module on each relevant broadcast.
 */
export function refreshTrmnlFrame(evt: any): boolean {
  lastStateEvt = evt;
  const hash = trmnlStateHash(evt);
  if (hash === lastHash && currentFrame) return false;
  lastHash = hash;
  currentFrame = renderTrmnlFrame(evt);
  return true;
}

/** Force a render from the last known state (e.g. right after device setup). */
export function forceRenderTrmnlFrame(): TrmnlFrame {
  currentFrame = renderTrmnlFrame(lastStateEvt);
  lastHash = trmnlStateHash(lastStateEvt);
  return currentFrame;
}

/** Current frame, lazily rendered from the last known state if none exists. */
export function getTrmnlFrame(): TrmnlFrame {
  if (!currentFrame) return forceRenderTrmnlFrame();
  return currentFrame;
}
