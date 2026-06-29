import { describe, it, expect } from 'vitest';
import { renderOptionButton } from '../../svg-renderers/session-slot-renderer.js';

const opt = { index: 0, label: 'Yes' };

describe('renderOptionButton awaiting pulse', () => {
  it('renders no pulse stroke when animFrame is omitted (static)', () => {
    const svg = renderOptionButton(opt, 0);
    // The pulse uses the amber stroke #fbbf24 on a full-key border rect.
    expect(svg).not.toContain('stroke="#fbbf24" stroke-width="5"');
  });

  it('adds an amber pulse border when animFrame is provided', () => {
    const svg = renderOptionButton(opt, 0, 0);
    expect(svg).toContain('stroke="#fbbf24" stroke-width="5"');
  });

  it('varies the pulse opacity across animation frames', () => {
    // Frames chosen so |sin(f*0.15)| differs noticeably (trough vs near-peak).
    const trough = renderOptionButton(opt, 0, 0);      // sin(0) = 0 → opacity 0.35
    const peak = renderOptionButton(opt, 0, 10);       // sin(1.5) ≈ 0.997 → ~1.0
    const op = (svg: string) => svg.match(/stroke="#fbbf24" stroke-width="5" opacity="([\d.]+)"/)?.[1];
    expect(op(trough)).toBe('0.35');
    expect(Number(op(peak))).toBeGreaterThan(0.9);
  });
});
