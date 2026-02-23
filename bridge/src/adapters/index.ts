import type { AgentType, AgentAdapter } from '../types.js';
import { ClaudeCodeAdapter } from './claude-code.js';

export { ClaudeCodeAdapter } from './claude-code.js';

/**
 * Factory: create an adapter for the given agent type.
 * Phase 1: only 'claude-code' is supported.
 * Phase 2 will add 'openclaw'.
 */
export function createAdapter(type: AgentType): AgentAdapter {
  switch (type) {
    case 'claude-code':
      return new ClaudeCodeAdapter();
    case 'openclaw':
      throw new Error('OpenClaw adapter not yet implemented (Phase 2)');
    default:
      throw new Error(`Unknown agent type: ${type}`);
  }
}
