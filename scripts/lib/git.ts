import { spawnSync } from 'node:child_process';

// Every function here is quiet and nullable: a failed git invocation
// (unknown ref, no repo, detached HEAD) returns null/false instead of
// throwing or leaking git's stderr, so every caller gets the same failure
// behaviour and decides for itself how loud to be about it.
function run(args: string[]): string | null {
  const result = spawnSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

export function mergeBase(baseBranch: string): string | null {
  return run(['merge-base', baseBranch, 'HEAD']);
}

export function head(): string | null {
  return run(['rev-parse', 'HEAD']);
}

export function isAncestor(ancestor: string, descendant: string): boolean {
  return run(['merge-base', '--is-ancestor', ancestor, descendant]) !== null;
}

export function commitCount(range: string): number | null {
  const output = run(['rev-list', '--count', range]);
  if (output === null) return null;
  const count = Number(output);
  return Number.isNaN(count) ? null : count;
}
