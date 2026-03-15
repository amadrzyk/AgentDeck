/**
 * Terminal screen management: alternate buffer, raw mode, resize, keypress.
 */

import { cursor, screen as screenCodes } from './ansi.js';

export interface ScreenOptions {
  onResize: () => void;
  onKey: (key: string) => void;
}

export class Screen {
  private originalRawMode: boolean | undefined;
  private resizeHandler: () => void;
  private cleanedUp = false;

  constructor(private opts: ScreenOptions) {
    this.resizeHandler = () => opts.onResize();
  }

  /** Enter alternate screen, hide cursor, setup raw mode and listeners */
  enter(): void {
    const { stdout, stdin } = process;

    // Enter alternate screen + hide cursor
    stdout.write(screenCodes.altEnter + cursor.hide + screenCodes.clear);

    // Raw mode for keypress capture
    if (stdin.isTTY) {
      this.originalRawMode = stdin.isRaw;
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf-8');
      stdin.on('data', this.handleInput);
    }

    // Resize listener
    process.on('SIGWINCH', this.resizeHandler);

    // Cleanup on exit signals
    process.on('SIGINT', this.cleanup);
    process.on('SIGTERM', this.cleanup);
    process.on('uncaughtException', (err) => {
      this.cleanup();
      console.error(err);
      process.exit(1);
    });
  }

  /** Get terminal dimensions */
  get cols(): number {
    return process.stdout.columns || 80;
  }

  get rows(): number {
    return process.stdout.rows || 24;
  }

  /** Write string to stdout at position */
  write(str: string): void {
    process.stdout.write(str);
  }

  /** Move cursor and write */
  writeAt(row: number, col: number, str: string): void {
    process.stdout.write(cursor.moveTo(row, col) + str);
  }

  /** Restore terminal state */
  cleanup = (): void => {
    if (this.cleanedUp) return;
    this.cleanedUp = true;

    const { stdout, stdin } = process;

    // Restore cursor + exit alternate screen
    stdout.write(cursor.show + screenCodes.altExit);

    // Restore raw mode
    if (stdin.isTTY && this.originalRawMode !== undefined) {
      stdin.setRawMode(this.originalRawMode);
      stdin.pause();
    }

    // Remove listeners
    stdin.removeListener('data', this.handleInput);
    process.removeListener('SIGWINCH', this.resizeHandler);
    process.removeListener('SIGINT', this.cleanup);
    process.removeListener('SIGTERM', this.cleanup);
  };

  private handleInput = (data: string): void => {
    for (let i = 0; i < data.length; i++) {
      const ch = data[i];

      // Ctrl+C
      if (ch === '\x03') {
        this.opts.onKey('q');
        return;
      }

      // Escape sequences
      if (ch === '\x1b' && i + 2 < data.length && data[i + 1] === '[') {
        const code = data[i + 2];
        i += 2;
        switch (code) {
          case 'A': this.opts.onKey('up'); continue;
          case 'B': this.opts.onKey('down'); continue;
          case 'C': this.opts.onKey('right'); continue;
          case 'D': this.opts.onKey('left'); continue;
        }
      }

      // Enter
      if (ch === '\r' || ch === '\n') {
        this.opts.onKey('enter');
        continue;
      }

      // Regular character
      this.opts.onKey(ch);
    }
  };
}
