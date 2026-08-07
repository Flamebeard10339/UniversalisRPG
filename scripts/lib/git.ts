import { spawnSync } from 'node:child_process';
import path from 'node:path';

export interface Commit {
  sha: string;
  subject: string;
  files: string[];
}

// One method per git fact the task system reads. `install` swaps the whole
// implementation, so a caller holding data can answer every fact without a
// repository; the exported functions below always read the installed one.
export interface GitFacts {
  mergeBase(baseBranch: string): string | null;
  head(): string | null;
  branch(): string | null;
  resolveCommit(revspec: string): string | null;
  fileAt(rev: string, filePath: string): string | null;
  isAncestor(ancestor: string, descendant: string): boolean;
  commitCount(range: string): number | null;
  mergeInProgress(): boolean;
  dirtyPaths(pathspec?: string): string[] | null;
  changedFiles(range: string): string[] | null;
  diffStat(range: string): string | null;
  commitLog(range: string): Commit[] | null;
  commitsTouching(filePath: string): string[] | null;
}

// Every fact here is quiet and nullable: a failed git invocation
// (unknown ref, no repo, detached HEAD) returns null/false instead of
// throwing or leaking git's stderr, so every caller gets the same failure
// behaviour and decides for itself how loud to be about it.
// maxBuffer is sized for the largest read served — a whole-history log with
// file lists — because overflowing it nulls status and truncates stdout, so
// the quiet-null contract would turn "too much history" into answers like
// "no commits in this range".
function raw(args: string[]): string | null {
  const result = spawnSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) return null;
  return result.stdout;
}

function run(args: string[]): string | null {
  return raw(args)?.trim() ?? null;
}

function lines(text: string | null): string[] | null {
  if (text === null) return null;
  return text === '' ? [] : text.split('\n');
}

// `%x00` opens each record, so a subject containing a newline cannot be read
// as the start of the file list under it.
export function parseCommitLog(text: string): Commit[] {
  return text
    .split('\0')
    .map((record) => record.replace(/^\n+/, '').trimEnd())
    .filter((record) => record !== '')
    .map((record) => {
      const [header, ...files] = record.split('\n');
      const space = header.indexOf(' ');
      return {
        sha: space === -1 ? header : header.slice(0, space),
        subject: space === -1 ? '' : header.slice(space + 1),
        files: files.map((file) => file.trim()).filter((file) => file !== ''),
      };
    });
}

export const realGit: GitFacts = {
  mergeBase(baseBranch) {
    return run(['merge-base', baseBranch, 'HEAD']);
  },

  head() {
    return run(['rev-parse', 'HEAD']);
  },

  branch() {
    return run(['rev-parse', '--abbrev-ref', 'HEAD']);
  },

  // `^{commit}` makes this refuse a tag or tree that rev-parse would otherwise
  // resolve to something that is not a commit.
  resolveCommit(revspec) {
    return run(['rev-parse', '--verify', `${revspec}^{commit}`]);
  },

  // `<rev>:<path>` colon syntax, which git resolves from the repo root with
  // forward slashes only — unlike a `-- <path>` pathspec it rejects an
  // absolute Windows path outright ("exists on disk, but not in <rev>"). The
  // normalization lives here rather than at each caller, because getting it
  // wrong fails as "no such file in that revision", which reads like an
  // answer rather than a bug.
  fileAt(rev, filePath) {
    const relative = path.relative(process.cwd(), path.resolve(filePath)).split(path.sep).join('/');
    return run(['show', `${rev}:${relative}`]);
  },

  isAncestor(ancestor, descendant) {
    return run(['merge-base', '--is-ancestor', ancestor, descendant]) !== null;
  },

  commitCount(range) {
    const output = run(['rev-list', '--count', range]);
    if (output === null) return null;
    const count = Number(output);
    return Number.isNaN(count) ? null : count;
  },

  // Asked of git rather than the filesystem: `.git` is a file in a worktree,
  // so probing `.git/MERGE_HEAD` by path answers wrongly exactly where this
  // repo does most of its work.
  mergeInProgress() {
    return run(['rev-parse', '--verify', '--quiet', 'MERGE_HEAD']) !== null;
  },

  // Parsed from untrimmed output: porcelain's two status columns mean the
  // first line of a trimmed read would lose its leading space and misalign
  // the path slice.
  dirtyPaths(pathspec) {
    const text = raw(['status', '--porcelain', ...(pathspec === undefined ? [] : ['--', pathspec])]);
    if (text === null) return null;
    return text
      .split('\n')
      .map((line) => line.slice(3).trim())
      .filter((line) => line.length > 0);
  },

  changedFiles(range) {
    return lines(run(['diff', '--name-only', range]));
  },

  diffStat(range) {
    return raw(['diff', '--stat', range])?.trimEnd() ?? null;
  },

  commitLog(range) {
    const text = run(['log', '--format=%x00%h %s', '--name-only', range]);
    return text === null ? null : parseCommitLog(text);
  },

  commitsTouching(filePath) {
    return lines(run(['log', '--format=%H', '--', filePath]));
  },
};

let installed: GitFacts = realGit;

export function install(facts: GitFacts): GitFacts {
  const previous = installed;
  installed = facts;
  return previous;
}

export function mergeBase(baseBranch: string): string | null {
  return installed.mergeBase(baseBranch);
}

export function head(): string | null {
  return installed.head();
}

export function branch(): string | null {
  return installed.branch();
}

export function resolveCommit(revspec: string): string | null {
  return installed.resolveCommit(revspec);
}

export function fileAt(rev: string, filePath: string): string | null {
  return installed.fileAt(rev, filePath);
}

export function isAncestor(ancestor: string, descendant: string): boolean {
  return installed.isAncestor(ancestor, descendant);
}

export function commitCount(range: string): number | null {
  return installed.commitCount(range);
}

export function mergeInProgress(): boolean {
  return installed.mergeInProgress();
}

export function dirtyPaths(pathspec?: string): string[] | null {
  return installed.dirtyPaths(pathspec);
}

export function changedFiles(range: string): string[] | null {
  return installed.changedFiles(range);
}

export function diffStat(range: string): string | null {
  return installed.diffStat(range);
}

export function commitLog(range: string): Commit[] | null {
  return installed.commitLog(range);
}

export function commitsTouching(filePath: string): string[] | null {
  return installed.commitsTouching(filePath);
}
