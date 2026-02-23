import stripAnsi from 'strip-ansi';

interface TimestampedChunk {
  ts: number;
  clean: string;  // ANSI-stripped text
}

const DEFAULT_MAX_BYTES = 128 * 1024; // 128KB

export class PtyRingBuffer {
  private chunks: TimestampedChunk[] = [];
  private totalBytes = 0;
  private maxBytes: number;

  constructor(maxBytes = DEFAULT_MAX_BYTES) {
    this.maxBytes = maxBytes;
  }

  /** Append a raw PTY data chunk (will be ANSI-stripped and timestamped) */
  push(rawData: string): void {
    const clean = stripAnsi(rawData);
    if (!clean) return;

    const entry: TimestampedChunk = { ts: Date.now(), clean };
    const chunkBytes = Buffer.byteLength(clean);

    this.chunks.push(entry);
    this.totalBytes += chunkBytes;

    // Evict oldest chunks to stay within budget
    while (this.totalBytes > this.maxBytes && this.chunks.length > 1) {
      const removed = this.chunks.shift()!;
      this.totalBytes -= Buffer.byteLength(removed.clean);
    }
  }

  /** Get chunks within a time window around a given timestamp */
  getAroundTimestamp(ts: number, windowMs = 5000): TimestampedChunk[] {
    const from = ts - windowMs;
    const to = ts + windowMs;
    return this.chunks.filter(c => c.ts >= from && c.ts <= to);
  }

  /** Get the most recent N bytes of clean PTY output */
  getTail(maxBytes = 32 * 1024): string {
    const parts: string[] = [];
    let remaining = maxBytes;

    // Walk backwards
    for (let i = this.chunks.length - 1; i >= 0 && remaining > 0; i--) {
      const chunk = this.chunks[i];
      const bytes = Buffer.byteLength(chunk.clean);
      if (bytes <= remaining) {
        parts.unshift(chunk.clean);
        remaining -= bytes;
      } else {
        // Partial chunk — take suffix
        const suffix = chunk.clean.slice(-remaining);
        parts.unshift(suffix);
        remaining = 0;
      }
    }
    return parts.join('');
  }

  /** Get all chunks (for diag dump) */
  getAll(): TimestampedChunk[] {
    return [...this.chunks];
  }

  /** Get total stored size in bytes */
  getSize(): number {
    return this.totalBytes;
  }

  clear(): void {
    this.chunks = [];
    this.totalBytes = 0;
  }
}
