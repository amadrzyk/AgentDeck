/**
 * Open the AgentDeck macOS companion app (the daemon host) when the D200H is
 * offline. Mirrors the SD plugin's `openAgentDeckAppOrGitHub`
 * (plugin/src/utility-modes/macos.ts) — duplicated here because the Ulanzi
 * package can't import cross-package. Node + macOS only; a no-op elsewhere.
 */
import { execFile } from 'node:child_process';

export async function launchCompanionApp(): Promise<void> {
  if (process.platform !== 'darwin') return;
  const opened = await new Promise<boolean>((resolve) =>
    execFile('open', ['-a', 'AgentDeck'], { timeout: 3000 }, (err) => resolve(!err)),
  );
  if (opened) return;
  // App not installed → fall back to the project page so the user can get it.
  await new Promise<void>((resolve) =>
    execFile('open', ['https://puritysb.github.io/AgentDeck/'], { timeout: 3000 }, () => resolve()),
  );
}
