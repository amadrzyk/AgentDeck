/**
 * Build a looping animated GIF from rasterized SVG frames for `setGifDataIcon`.
 *
 * Ulanzi Studio plays the GIF natively and loops it, so we push ONE GIF per state
 * transition (no per-frame ticking like the Stream Deck plugin needs). Transparency
 * is preserved (rgba4444) so the tile's rounded corners stay see-through.
 */
// gifenc ships as CommonJS (its `main`); under Node ESM only the default
// (the CJS namespace) is importable — destructure the helpers from it.
import gifenc from 'gifenc';
import { svgToRgba } from './raster.js';

const { GIFEncoder, quantize, applyPalette } = gifenc;
import { derr } from './log.js';

export interface AnimSpec {
  /** SVG frame strings (already rendered at the desired animFrame phases). */
  frames: string[];
  /** Per-frame delay in ms. */
  delayMs: number;
}

/**
 * Render the given SVG frames to a single looping GIF, returned as base64
 * (no `data:` prefix), suitable for `$UD.setGifDataIcon`.
 * Returns null on failure so the caller can fall back to a static PNG.
 */
export function framesToGifBase64(spec: AnimSpec, size: number): string | null {
  if (spec.frames.length === 0) return null;
  try {
    const gif = GIFEncoder();
    let w = size;
    let h = size;
    for (let i = 0; i < spec.frames.length; i++) {
      const img = svgToRgba(spec.frames[i], size);
      w = img.width;
      h = img.height;
      const palette = quantize(img.data, 256, { format: 'rgba4444', oneBitAlpha: true });
      const index = applyPalette(img.data, palette, 'rgba4444');
      gif.writeFrame(index, w, h, {
        palette,
        delay: spec.delayMs,
        transparent: true,
        transparentIndex: 0,
        repeat: 0, // loop forever
        first: i === 0,
      });
    }
    gif.finish();
    return Buffer.from(gif.bytes()).toString('base64');
  } catch (err) {
    derr('gif', `encode failed: ${err}`);
    return null;
  }
}
