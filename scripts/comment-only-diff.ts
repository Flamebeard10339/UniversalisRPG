import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { codeOnly } from './lib/stripComments';

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];
const WORKTREE = '--worktree';

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function contentAt(revision: string | null, path: string): string {
  return revision === null ? readFileSync(path, 'utf8') : git('show', `${revision}:${path}`);
}

interface Divergence {
  path: string;
  reason: string;
  detail?: string;
}

const args = process.argv.slice(2);
const againstWorktree = args.includes(WORKTREE);
const positional = args.filter((arg) => arg !== WORKTREE);
const base = positional[0] ?? (againstWorktree ? 'HEAD' : 'HEAD~1');
const head = againstWorktree ? null : positional[1] ?? 'HEAD';

const nameStatus = git('diff', '--name-status', base, ...(head === null ? [] : [head]))
  .split('\n')
  .filter((line) => line.trim() !== '');

const divergences: Divergence[] = [];
let verified = 0;

for (const entry of nameStatus) {
  const [status, ...paths] = entry.split('\t');
  const path = paths[paths.length - 1];
  if (!SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension))) continue;

  if (status.startsWith('A')) {
    divergences.push({ path, reason: 'added — a comment-only change adds no files' });
    continue;
  }
  if (status.startsWith('D')) {
    divergences.push({ path, reason: 'deleted — a comment-only change deletes no files' });
    continue;
  }

  const before = codeOnly(contentAt(base, paths[0]));
  const after = codeOnly(contentAt(head, path));

  if (before.length !== after.length || before.some((line, index) => line !== after[index])) {
    const at = before.findIndex((line, index) => line !== after[index]);
    const position = at === -1 ? Math.min(before.length, after.length) : at;
    divergences.push({
      path,
      reason: `code changed (${before.length} → ${after.length} code lines)`,
      detail: `  first difference at code line ${position + 1}:\n  - ${before[position] ?? '<end of file>'}\n  + ${after[position] ?? '<end of file>'}`,
    });
    continue;
  }
  verified++;
}

const range = `${base}..${head ?? 'working tree'}`;

if (divergences.length > 0) {
  console.error(`${range} is not comment-only:\n`);
  for (const divergence of divergences) {
    console.error(`  ${divergence.path}: ${divergence.reason}`);
    if (divergence.detail) console.error(divergence.detail);
  }
  console.error(`\n${verified} files verified identical, ${divergences.length} diverged.`);
  process.exit(1);
}

console.log(`${range} is comment-only: ${verified} files changed, all code identical after stripping comments.`);
