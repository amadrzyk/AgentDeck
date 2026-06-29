import { describe, it, expect } from 'vitest';
import { renderSessionSlot } from '../../svg-renderers/session-slot-renderer.js';
import type { SessionInfo } from '../../protocol.js';

const awaiting: SessionInfo = {
  id: 's1', port: 9121, projectName: 'demo', agentType: 'claude-code',
  alive: true, state: 'awaiting_permission',
} as SessionInfo;

const FLASH = 'fill="#F5B942" opacity="0.30"';

describe('renderSessionSlot awaiting hard flash', () => {
  it('shows the amber wash on the "on" phase of the flash cycle', () => {
    // floor(0/3) % 2 === 0 → flash ON
    expect(renderSessionSlot(awaiting, false, 0)).toContain(FLASH);
  });

  it('hides the wash on the "off" phase', () => {
    // floor(3/3) % 2 === 1 → flash OFF
    expect(renderSessionSlot(awaiting, false, 3)).not.toContain(FLASH);
  });

  it('does not flash when animation is disabled (static render)', () => {
    expect(renderSessionSlot(awaiting, false, 0, undefined, { animated: false })).not.toContain(FLASH);
  });

  it('does not flash a non-awaiting (idle) session', () => {
    const idle = { ...awaiting, state: 'idle' } as SessionInfo;
    expect(renderSessionSlot(idle, false, 0)).not.toContain(FLASH);
  });
});
