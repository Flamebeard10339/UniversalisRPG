import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The one place a test builds a real repository. Importing this module —
// directly, or through scripts/tasks/realGitFixture.ts, which is built on it —
// is how a test declares that it pays for a real `git` rather than for the
// snapshot facts cliFixtures.ts installs. That import list is the whole set.
//
// The identity is written rather than spawned: `git config user.email` and
// `git config user.name` do exactly this, and three processes per repository
// was the largest fixed cost the set had left.
export function initRealGitRepo(dir: string, branch = 'main'): void {
  spawnSync('git', ['init', '-q', '-b', branch], { cwd: dir });
  appendFileSync(path.join(dir, '.git', 'config'), '[user]\n\temail = test@example.com\n\tname = Test\n', 'utf8');
}

export function makeRealGitRepo(prefix: string, branch = 'main'): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  initRealGitRepo(dir, branch);
  return dir;
}
