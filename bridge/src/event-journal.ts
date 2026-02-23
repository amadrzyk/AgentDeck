import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync, type WriteStream } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface JournalEntry {
  ts: number;
  type: string;    // 'state_change' | 'hook' | 'parser_emit' | 'pty_chunk' | 'ws_event' | 'error'
  source: string;  // 'hook' | 'pty' | 'ws' | 'internal'
  data: string;    // JSON payload (truncated to 500 chars)
}

const JOURNAL_DIR = join(homedir(), '.agentdeck', 'journal');
const CURRENT_FILE = 'current.jsonl';
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB per file
const MAX_RETAINED_FILES = 5;

export class EventJournal {
  private stream: WriteStream | null = null;
  private filePath: string;
  private bytesWritten = 0;

  constructor() {
    this.filePath = join(JOURNAL_DIR, CURRENT_FILE);
    this.init();
  }

  private init(): void {
    mkdirSync(JOURNAL_DIR, { recursive: true });

    // Rotate existing current.jsonl to timestamped file
    if (existsSync(this.filePath)) {
      try {
        const stat = statSync(this.filePath);
        if (stat.size > 0) {
          const ts = stat.mtimeMs ? Math.floor(stat.mtimeMs) : Date.now();
          const rotated = join(JOURNAL_DIR, `${ts}.jsonl`);
          renameSync(this.filePath, rotated);
        }
      } catch {
        // If rotation fails, just overwrite
      }
    }

    // Prune old files (keep MAX_RETAINED_FILES most recent)
    this.pruneOldFiles();

    this.stream = createWriteStream(this.filePath, { flags: 'a' });
    this.bytesWritten = 0;
  }

  private pruneOldFiles(): void {
    try {
      const files = readdirSync(JOURNAL_DIR)
        .filter(f => f.endsWith('.jsonl') && f !== CURRENT_FILE)
        .sort()
        .reverse(); // newest first

      for (const f of files.slice(MAX_RETAINED_FILES)) {
        try {
          unlinkSync(join(JOURNAL_DIR, f));
        } catch {
          // ignore individual deletion failures
        }
      }
    } catch {
      // ignore
    }
  }

  write(type: string, source: string, data: unknown): void {
    if (!this.stream) return;

    let payload: string;
    try {
      payload = typeof data === 'string' ? data : JSON.stringify(data);
    } catch {
      payload = String(data);
    }
    if (payload.length > 500) {
      payload = payload.slice(0, 497) + '...';
    }

    const entry: JournalEntry = {
      ts: Date.now(),
      type,
      source,
      data: payload,
    };

    const line = JSON.stringify(entry) + '\n';
    const lineBytes = Buffer.byteLength(line);

    // Rotate if file exceeds max size
    if (this.bytesWritten + lineBytes > MAX_FILE_BYTES) {
      this.rotate();
    }

    this.stream!.write(line);
    this.bytesWritten += lineBytes;
  }

  private rotate(): void {
    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }

    try {
      const rotated = join(JOURNAL_DIR, `${Date.now()}.jsonl`);
      if (existsSync(this.filePath)) {
        renameSync(this.filePath, rotated);
      }
    } catch {
      // ignore
    }

    this.pruneOldFiles();
    this.stream = createWriteStream(this.filePath, { flags: 'a' });
    this.bytesWritten = 0;
  }

  /** Get journal directory path (for diag dump) */
  getJournalDir(): string {
    return JOURNAL_DIR;
  }

  /** Get current journal file path */
  getCurrentFilePath(): string {
    return this.filePath;
  }

  close(): void {
    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }
  }
}
