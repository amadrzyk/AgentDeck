/**
 * Resolve a stable project label for a working directory.
 *
 * Order:
 *   1. AGENTDECK_PROJECT_NAME env var (explicit opt-out)
 *   2. `git rev-parse --show-toplevel` → basename (handles monorepo subdirs)
 *   3. Nearest ancestor `package.json` with a non-empty `name` field
 *   4. basename(cwd)
 *   5. 'unknown'
 *
 * The monorepo-root case is handled by (2); (3) only fires outside git, where
 * the user almost certainly cares about cwd-local identity, so nearest-match
 * (not outermost) is the right semantics.
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const MAX_WALK_DEPTH = 32;

export interface ResolveProjectNameOptions {
  cwd?: string;
  envOverride?: string;
}

export function resolveProjectName(opts: ResolveProjectNameOptions = {}): string {
  const cwd = opts.cwd ?? process.cwd();
  const envValue = opts.envOverride ?? process.env.AGENTDECK_PROJECT_NAME;
  if (typeof envValue === 'string' && envValue.trim() !== '') return envValue.trim();

  const gitName = gitToplevelBasename(cwd);
  if (gitName) return gitName;

  const pkgName = nearestPackageJsonName(cwd);
  if (pkgName) return pkgName;

  const base = basename(cwd);
  if (base) return base;

  return 'unknown';
}

export function gitToplevelBasename(cwd: string): string | null {
  try {
    const out = execSync('git rev-parse --show-toplevel', {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).trim();
    if (!out) return null;
    const name = basename(out);
    return name || null;
  } catch {
    return null;
  }
}

export function nearestPackageJsonName(cwd: string): string | null {
  let dir = cwd;
  for (let i = 0; i < MAX_WALK_DEPTH; i++) {
    try {
      const raw = readFileSync(join(dir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(raw);
      if (pkg && typeof pkg.name === 'string' && pkg.name.trim() !== '') {
        return pkg.name.trim();
      }
    } catch {
      // no package.json here or parse failed — keep walking
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}
