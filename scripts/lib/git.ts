import { spawnSync } from 'node:child_process';
import path from 'node:path';

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

export function branch(): string | null {
  return run(['rev-parse', '--abbrev-ref', 'HEAD']);
}

// `^{commit}` makes this refuse a tag or tree that rev-parse would otherwise
// resolve to something that is not a commit.
export function resolveCommit(revspec: string): string | null {
  return run(['rev-parse', '--verify', `${revspec}^{commit}`]);
}

// `<rev>:<path>` colon syntax, which git resolves from the repo root with
// forward slashes only — unlike a `-- <path>` pathspec it rejects an
// absolute Windows path outright ("exists on disk, but not in <rev>"). The
// normalization lives here rather than at each caller, because getting it
// wrong fails as "no such file in that revision", which reads like an
// answer rather than a bug.
export function fileAt(rev: string, filePath: string): string | null {
  const relative = path.relative(process.cwd(), path.resolve(filePath)).split(path.sep).join('/');
  return run(['show', `${rev}:${relative}`]);
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
