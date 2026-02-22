/**
 * Local voice recording & transcription for disconnected mode.
 * Uses rec (sox) for audio capture, whisper-server or whisper-cli for transcription.
 */
import { spawn, execSync, type ChildProcess } from 'child_process';
import { tmpdir, homedir } from 'os';
import { join } from 'path';
import { unlinkSync, existsSync, statSync, readFileSync } from 'fs';
import {
  REC_CANDIDATES, SOX_CANDIDATES,
  WHISPER_CANDIDATES, WHISPER_SERVER_CANDIDATES,
  MODEL_SEARCH_DIRS, MODELS_WITH_METAL, MODELS_WITHOUT_METAL,
  WHISPER_SERVER_INFO_FILE,
} from '@agentdeck/shared';
import { dlog } from './log.js';

const TIMEOUT_BASE_MS = 15_000;
const TIMEOUT_MULTIPLIER_METAL = 1;
const TIMEOUT_MULTIPLIER_ROSETTA = 4;

function findBinary(candidates: string[], fallback: string): string {
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return fallback;
}

function detectMetal(whisperPath: string): boolean {
  try {
    const otoolOut = execSync(`otool -L "${whisperPath}"`, { encoding: 'utf8' });
    const hasMetal = otoolOut.includes('libggml-metal');
    const fileOut = execSync(`file "${whisperPath}"`, { encoding: 'utf8' });
    const isArm64 = fileOut.includes('arm64');
    return hasMetal && isArm64;
  } catch {
    return false;
  }
}

function findWhisperModel(preference: string[]): string {
  for (const model of preference) {
    for (const dir of MODEL_SEARCH_DIRS) {
      const path = join(dir, model);
      if (existsSync(path)) return path;
    }
  }
  return join(MODEL_SEARCH_DIRS[0], preference[0]);
}

function findFallbackModel(currentModel: string): string | null {
  const all = [...MODELS_WITH_METAL];
  const currentName = currentModel.split('/').pop() ?? '';
  const idx = all.indexOf(currentName);
  for (let i = idx + 1; i < all.length; i++) {
    for (const dir of MODEL_SEARCH_DIRS) {
      const path = join(dir, all[i]);
      if (existsSync(path)) return path;
    }
  }
  return null;
}

// Lazy-init state
let initialized = false;
let recBin: string;
let soxBin: string;
let whisperBin: string;
let whisperModel: string;
let hasMetal: boolean;

let recording = false;
let audioProcess: ChildProcess | null = null;
let audioFile = '';

function ensureInit(): void {
  if (initialized) return;
  initialized = true;
  recBin = findBinary(REC_CANDIDATES, 'rec');
  soxBin = findBinary(SOX_CANDIDATES, 'sox');
  whisperBin = findBinary(WHISPER_CANDIDATES, 'whisper-cli');
  hasMetal = detectMetal(whisperBin);
  const preference = hasMetal ? MODELS_WITH_METAL : MODELS_WITHOUT_METAL;
  whisperModel = findWhisperModel(preference);
  dlog('VoiceLocal', `init: rec=${recBin}, whisper=${whisperBin}, model=${whisperModel}, metal=${hasMetal}`);
}

export function startLocalRecording(): void {
  ensureInit();
  if (recording) return;

  audioFile = join(tmpdir(), `sdc-voice-local-${Date.now()}.wav`);
  recording = true;

  audioProcess = spawn(recBin, [
    '-r', '16000', '-c', '1', '-b', '16', audioFile,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  audioProcess.stderr?.on('data', (data: Buffer) => {
    const line = data.toString().trim();
    if (line && !line.startsWith('In:') && !line.startsWith('Out:')) {
      dlog('VoiceLocal', `rec: ${line}`);
    }
  });

  audioProcess.on('error', (err) => {
    dlog('VoiceLocal', `rec spawn error: ${err.message}`);
    recording = false;
    audioProcess = null;
  });

  audioProcess.on('exit', (code) => {
    dlog('VoiceLocal', `rec exited with code ${code}`);
    audioProcess = null;
  });

  dlog('VoiceLocal', `Recording started → ${audioFile}`);
}

export async function stopLocalRecording(): Promise<string> {
  if (!recording || !audioProcess) {
    throw new Error('Not currently recording');
  }

  const proc = audioProcess;
  recording = false;

  proc.kill('SIGINT');
  dlog('VoiceLocal', 'Sent SIGINT to rec');

  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    proc.on('exit', finish);
    setTimeout(finish, 3000);
  });

  if (!existsSync(audioFile)) {
    const path = audioFile;
    cleanup();
    throw new Error(`Recording file not created: ${path}`);
  }
  const sz = statSync(audioFile).size;
  dlog('VoiceLocal', `Recording file: ${sz} bytes`);
  if (sz < 100) {
    cleanup();
    throw new Error('Recording too short or empty');
  }

  try {
    let text: string;

    // Try whisper-server first (discover from info file)
    const serverPort = discoverWhisperServer();
    if (serverPort) {
      try {
        text = await transcribeViaServer(audioFile, serverPort);
      } catch (err) {
        dlog('VoiceLocal', `Server transcription failed, falling back to CLI: ${err}`);
        text = await transcribeWithCli(audioFile);
      }
    } else {
      text = await transcribeWithCli(audioFile);
    }

    dlog('VoiceLocal', `Transcription: "${text.slice(0, 80)}"`);
    cleanup();
    return text;
  } catch (err) {
    cleanup();
    throw err instanceof Error ? err : new Error(String(err));
  }
}

export function cancelLocalRecording(): void {
  if (audioProcess) {
    audioProcess.kill('SIGKILL');
    audioProcess = null;
  }
  recording = false;
  cleanup();
}

export function isLocalRecording(): boolean {
  return recording;
}

function discoverWhisperServer(): number | null {
  try {
    const info = JSON.parse(readFileSync(WHISPER_SERVER_INFO_FILE, 'utf-8'));
    if (info?.port && info?.pid) {
      // Check if PID is alive
      try { process.kill(info.pid, 0); } catch { return null; }
      return info.port;
    }
  } catch { /* no info file */ }
  return null;
}

async function transcribeViaServer(file: string, port: number): Promise<string> {
  const fileData = readFileSync(file);
  const boundary = `----whisper${Date.now()}`;
  const filename = file.split('/').pop() || 'audio.wav';

  const header = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: audio/wav\r\n\r\n`
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([header, fileData, footer]);

  const url = `http://127.0.0.1:${port}/inference`;
  dlog('VoiceLocal', `POST ${url} (${fileData.length} bytes)`);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`whisper-server returned ${res.status}: ${await res.text()}`);
  }

  const json = await res.json() as { text?: string };
  return (json.text ?? '').trim();
}

async function transcribeWithCli(file: string): Promise<string> {
  ensureInit();

  // Resample
  const resampledFile = file.replace('.wav', '_16k.wav');
  try {
    await resample(file, resampledFile);
  } catch {
    dlog('VoiceLocal', 'Resample failed, using original');
  }
  const whisperInput = existsSync(resampledFile) ? resampledFile : file;

  const audioDurationSec = (statSync(whisperInput).size - 44) / 32000;
  const multiplier = hasMetal ? TIMEOUT_MULTIPLIER_METAL : TIMEOUT_MULTIPLIER_ROSETTA;
  const timeoutMs = TIMEOUT_BASE_MS + Math.ceil(audioDurationSec * 1000 * multiplier);

  try {
    let text: string;
    try {
      text = await transcribe(whisperInput, whisperModel, timeoutMs);
    } catch (err) {
      const isTimeout = err instanceof Error && err.message.includes('timed out');
      const fallback = isTimeout ? findFallbackModel(whisperModel) : null;
      if (fallback) {
        whisperModel = fallback;
        text = await transcribe(whisperInput, fallback, timeoutMs);
      } else {
        throw err;
      }
    }
    if (existsSync(resampledFile)) try { unlinkSync(resampledFile); } catch { /* */ }
    return text;
  } catch (err) {
    if (existsSync(resampledFile)) try { unlinkSync(resampledFile); } catch { /* */ }
    throw err;
  }
}

function resample(inputFile: string, outputFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const sox = spawn(soxBin, [
      inputFile, '-r', '16000', '-c', '1', '-b', '16', outputFile,
      'highpass', '80', 'norm',
    ]);
    let stderr = '';
    sox.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });
    sox.on('error', (err) => reject(new Error(`sox spawn error: ${err.message}`)));
    sox.on('close', (code) => {
      if (code !== 0) reject(new Error(`sox exited with code ${code}: ${stderr.slice(-200)}`));
      else resolve();
    });
  });
}

function transcribe(file: string, modelPath: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      '-m', modelPath, '-l', 'auto', '-f', file,
      '--no-timestamps', '-np',
      '--prompt', 'coding, programming, Claude, terminal, git, function, component, API',
    ];

    const whisper = spawn(whisperBin, args);
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        whisper.kill('SIGKILL');
        reject(new Error(`whisper-cli timed out after ${(timeoutMs / 1000).toFixed(0)}s`));
      }
    }, timeoutMs);

    whisper.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    whisper.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    whisper.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Failed to run whisper-cli: ${err.message}`));
      }
    });

    whisper.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (code !== 0) {
        reject(new Error(`whisper-cli exited with code ${code}: ${stderr.slice(-300)}`));
        return;
      }

      const text = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) =>
          line.length > 0 &&
          !line.startsWith('[') &&
          line !== '(blank audio)' &&
          !line.startsWith('(') &&
          !/^\[BLANK_AUDIO\]$/i.test(line)
        )
        .join(' ')
        .trim();

      resolve(text);
    });
  });
}

function cleanup(): void {
  if (audioFile && existsSync(audioFile)) {
    try { unlinkSync(audioFile); } catch { /* */ }
  }
  audioFile = '';
}
