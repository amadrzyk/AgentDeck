/**
 * Voice binary/model path constants shared between bridge and plugin.
 */
import { join } from 'path';
import { homedir } from 'os';

export const MODEL_SEARCH_DIRS = [
  join(homedir(), '.local/share/whisper-cpp'),
  '/opt/homebrew/share/whisper-cpp',   // arm64 Homebrew
  '/usr/local/share/whisper-cpp',      // x86 Homebrew
  join(homedir(), 'models'),
];

// Model tiers: Metal-accelerated GPU can handle large models; CPU/Rosetta cannot
export const MODELS_WITH_METAL = [
  'ggml-large-v3-turbo.bin',
  'ggml-small.bin',
  'ggml-base.bin',
];
export const MODELS_WITHOUT_METAL = [
  'ggml-base.bin',
  'ggml-small.bin',
];

// Preferred binary paths: arm64 Homebrew first, then system PATH
export const WHISPER_CANDIDATES = [
  '/opt/homebrew/bin/whisper-cli',
  '/usr/local/bin/whisper-cli',
];
export const REC_CANDIDATES = [
  '/opt/homebrew/bin/rec',
  '/usr/local/bin/rec',
];
export const SOX_CANDIDATES = [
  '/opt/homebrew/bin/sox',
  '/usr/local/bin/sox',
];
export const WHISPER_SERVER_CANDIDATES = [
  '/opt/homebrew/bin/whisper-server',
  '/usr/local/bin/whisper-server',
];

/** Whisper-server discovery info file path */
export const WHISPER_SERVER_INFO_FILE = join(homedir(), '.agentdeck', 'whisper-server.json');
