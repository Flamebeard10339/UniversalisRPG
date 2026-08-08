import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { branch, changedFiles, changedIn, commitCount, commitLog, commitsTouching, diffStat, dirtyPaths, fileAt, head, install, isAncestor, lsFiles, mergeBase, mergeInProgress, parseCommitLog, resolveCommit, type GitFacts } from './git';
import { makeRealGitRepo } from './realGitRepo';

let dir: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  dir = makeRealGitRepo('universalis-git-');
  process.chdir(dir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(dir, { recursive: true, force: true });
});

function commit(message: string): string {
  writeFileSync(path.join(dir, `file-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`), 'x', 'utf8');
  spawnSync('git', ['add', '.'], { cwd: dir });
  spawnSync('git', ['commit', '--no-verify', '-m', message], { cwd: dir });
  return spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).stdout.trim();
}

describe('git seam', () => {
  it('head returns the current commit', () => {
    const sha = commit('first');
    expect(head()).toBe(sha);
  });

  it('head returns null on an unborn HEAD, instead of throwing', () => {
    expect(head()).toBeNull();
  });

  // The reads disagree here, which is why a fixture standing in for this
  // state has to be checked against it: `rev-parse` fails before the first
  // commit while `ls-files` succeeds on an empty index, so "nothing yet" is
  // null from one and an empty list from the other.
  it('an unborn HEAD is null from the revision reads and empty from ls-files, not uniformly null', () => {
    writeFileSync(path.join(dir, 'untracked.txt'), 'x', 'utf8');
    expect(branch()).toBeNull();
    expect(resolveCommit('HEAD')).toBeNull();
    expect(mergeBase('main')).toBeNull();
    expect(lsFiles()).toEqual([]);
    expect(dirtyPaths()).toEqual(['untracked.txt']);
  });

  it('branch names the current branch, and is null outside a repo rather than throwing', () => {
    commit('first');
    spawnSync('git', ['checkout', '-q', '-b', 'named-branch'], { cwd: dir });
    expect(branch()).toBe('named-branch');

    // Called before every command body, so throwing here takes down reads too.
    const outside = mkdtempSync(path.join(os.tmpdir(), 'universalis-norepo-'));
    process.chdir(outside);
    try {
      expect(branch()).toBeNull();
    } finally {
      process.chdir(dir);
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('fileAt reads a path out of a revision, and is null rather than throwing when it is not there', () => {
    writeFileSync(path.join(dir, 'tracked.txt'), 'first version\n', 'utf8');
    spawnSync('git', ['add', '.'], { cwd: dir });
    spawnSync('git', ['commit', '--no-verify', '-m', 'add tracked'], { cwd: dir });
    writeFileSync(path.join(dir, 'tracked.txt'), 'second version\n', 'utf8');

    // HEAD, not the working tree — the whole point of reading through a rev.
    expect(fileAt('HEAD', 'tracked.txt')).toBe('first version');
    expect(fileAt('HEAD', 'never-existed.txt')).toBeNull();
    expect(fileAt('no-such-rev', 'tracked.txt')).toBeNull();
  });

  it('fileAt takes an absolute path, which git\'s colon syntax rejects on its own', () => {
    writeFileSync(path.join(dir, 'tracked.txt'), 'content\n', 'utf8');
    spawnSync('git', ['add', '.'], { cwd: dir });
    spawnSync('git', ['commit', '--no-verify', '-m', 'add tracked'], { cwd: dir });

    // `git show HEAD:C:/...` fails with "exists on disk, but not in HEAD" —
    // an answer-shaped failure, which is why the normalization belongs
    // inside the seam and not at each call site.
    expect(fileAt('HEAD', path.join(dir, 'tracked.txt'))).toBe('content');
  });

  // Overflowing the subprocess buffer nulls the read, and null is this
  // seam's word for "does not exist" — so a buffer sized under the answer
  // would lie, not fail.
  it('reads an answer larger than a default subprocess buffer, instead of nulling it', () => {
    writeFileSync(path.join(dir, 'large.txt'), `${'x'.repeat(2 * 1024 * 1024)}\n`, 'utf8');
    spawnSync('git', ['add', '.'], { cwd: dir });
    spawnSync('git', ['commit', '--no-verify', '-m', 'add large'], { cwd: dir });
    expect(fileAt('HEAD', 'large.txt')?.length).toBe(2 * 1024 * 1024);
  });

  it('resolveCommit turns a revspec into the sha it means now, and is null for anything that is not a commit', () => {
    const first = commit('first');
    expect(resolveCommit('HEAD')).toBe(first);
    const second = commit('second');
    expect(resolveCommit('HEAD~1')).toBe(first);
    expect(resolveCommit('HEAD')).toBe(second);
    expect(resolveCommit('no-such-ref-anywhere')).toBeNull();
  });

  it('mergeBase resolves the common ancestor of two branches', () => {
    const base = commit('base');
    spawnSync('git', ['branch', '-M', 'main'], { cwd: dir });
    spawnSync('git', ['checkout', '-q', '-b', 'feature'], { cwd: dir });
    commit('feature work');
    expect(mergeBase('main')).toBe(base);
  });

  it('mergeBase returns null for an unresolvable base, instead of throwing', () => {
    commit('only commit');
    expect(mergeBase('no-such-branch')).toBeNull();
  });

  it('isAncestor is true when the first commit is reachable from the second', () => {
    const first = commit('first');
    const second = commit('second');
    expect(isAncestor(first, second)).toBe(true);
  });

  it('isAncestor is false for a commit on an unmerged branch', () => {
    commit('on main');
    spawnSync('git', ['branch', '-M', 'main'], { cwd: dir });
    spawnSync('git', ['checkout', '-q', '-b', 'stray'], { cwd: dir });
    const strayCommit = commit('stray');
    spawnSync('git', ['checkout', '-q', 'main'], { cwd: dir });
    expect(isAncestor(strayCommit, 'HEAD')).toBe(false);
  });

  it('isAncestor is false, not throwing, for a ref that does not resolve at all', () => {
    commit('first');
    expect(isAncestor('0123456789abcdef0123456789abcdef01234567', 'HEAD')).toBe(false);
  });

  it('commitCount counts commits in a range', () => {
    const base = commit('a');
    spawnSync('git', ['branch', '-M', 'main'], { cwd: dir });
    commit('b');
    commit('c');
    expect(commitCount(`${base}..HEAD`)).toBe(2);
  });

  it('commitCount returns null for an unresolvable range, instead of throwing', () => {
    commit('a');
    expect(commitCount('no-such-ref..HEAD')).toBeNull();
  });

  it('dirtyPaths lists what the working tree changed, and [] means clean', () => {
    commit('first');
    expect(dirtyPaths()).toEqual([]);
    writeFileSync(path.join(dir, 'untracked.txt'), 'x', 'utf8');
    expect(dirtyPaths()).toEqual(['untracked.txt']);
  });

  it('dirtyPaths narrows to a pathspec, so one file\'s dirtiness is answerable alone', () => {
    commit('first');
    writeFileSync(path.join(dir, 'one.txt'), 'x', 'utf8');
    writeFileSync(path.join(dir, 'two.txt'), 'x', 'utf8');
    expect(dirtyPaths('one.txt')).toEqual(['one.txt']);
  });

  it('dirtyPaths is null outside a repository, not an empty clean answer', () => {
    const outside = mkdtempSync(path.join(os.tmpdir(), 'universalis-norepo-'));
    process.chdir(outside);
    try {
      expect(dirtyPaths()).toBeNull();
    } finally {
      process.chdir(dir);
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('changedFiles names what a range touched, [] for an empty range, null for a bad one', () => {
    const base = commit('base');
    writeFileSync(path.join(dir, 'changed.txt'), 'x', 'utf8');
    spawnSync('git', ['add', '.'], { cwd: dir });
    spawnSync('git', ['commit', '--no-verify', '-m', 'change'], { cwd: dir });
    expect(changedFiles(`${base}..HEAD`)).toEqual(['changed.txt']);
    expect(changedFiles(`${base}..${base}`)).toEqual([]);
    expect(changedFiles('no-such-ref..HEAD')).toBeNull();
  });

  it('diffStat renders a range\'s stat, and is null for a range git cannot answer', () => {
    const base = commit('base');
    writeFileSync(path.join(dir, 'changed.txt'), 'x', 'utf8');
    spawnSync('git', ['add', '.'], { cwd: dir });
    spawnSync('git', ['commit', '--no-verify', '-m', 'change'], { cwd: dir });
    expect(diffStat(`${base}..HEAD`)).toContain('changed.txt');
    expect(diffStat('no-such-ref..HEAD')).toBeNull();
  });

  it('commitLog returns a range\'s commits as data, files attached to their own commit', () => {
    const base = commit('base');
    writeFileSync(path.join(dir, 'named.txt'), 'x', 'utf8');
    spawnSync('git', ['add', '.'], { cwd: dir });
    spawnSync('git', ['commit', '--no-verify', '-m', 'the subject'], { cwd: dir });
    const commits = commitLog(`${base}..HEAD`);
    expect(commits).toHaveLength(1);
    expect(commits?.[0].subject).toBe('the subject');
    expect(commits?.[0].files).toEqual(['named.txt']);
    expect(commitLog('no-such-ref..HEAD')).toBeNull();
  });

  it('reads a commit log whose subject spans lines without losing the files under it', () => {
    expect(parseCommitLog('\0abc1234 a subject\nwith a second line\nsrc/one.ts\n\0def5678 another\nsrc/two.ts\n')).toEqual([
      { sha: 'abc1234', subject: 'a subject', files: ['with a second line', 'src/one.ts'] },
      { sha: 'def5678', subject: 'another', files: ['src/two.ts'] },
    ]);
  });

  it('lsFiles lists tracked paths, not the working tree, and is null outside a repository', () => {
    writeFileSync(path.join(dir, 'tracked.txt'), 'x', 'utf8');
    spawnSync('git', ['add', '.'], { cwd: dir });
    spawnSync('git', ['commit', '--no-verify', '-m', 'add tracked'], { cwd: dir });
    writeFileSync(path.join(dir, 'untracked.txt'), 'x', 'utf8');
    expect(lsFiles()).toEqual(['tracked.txt']);

    const outside = mkdtempSync(path.join(os.tmpdir(), 'universalis-norepo-'));
    process.chdir(outside);
    try {
      expect(lsFiles()).toBeNull();
    } finally {
      process.chdir(dir);
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('commitsTouching walks the commits that changed one path, newest first', () => {
    writeFileSync(path.join(dir, 'walked.txt'), 'v1', 'utf8');
    spawnSync('git', ['add', '.'], { cwd: dir });
    spawnSync('git', ['commit', '--no-verify', '-m', 'first touch'], { cwd: dir });
    const first = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).stdout.trim();
    commit('unrelated');
    writeFileSync(path.join(dir, 'walked.txt'), 'v2', 'utf8');
    spawnSync('git', ['add', '.'], { cwd: dir });
    spawnSync('git', ['commit', '--no-verify', '-m', 'second touch'], { cwd: dir });
    const second = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).stdout.trim();
    expect(commitsTouching('walked.txt')).toEqual([second, first]);
    expect(commitsTouching('never-touched.txt')).toEqual([]);
  });

  it('changedIn carries one commit against its parent, and answers null for a revision git cannot resolve', () => {
    const base = commit('base');
    const earlier = changedIn(base) ?? [];
    writeFileSync(path.join(dir, 'only-here.txt'), 'x\n', 'utf8');
    const sha = commit('adds only-here.txt');
    expect(changedIn(sha)).toContain('only-here.txt');
    for (const file of earlier) expect(changedIn(sha)).not.toContain(file);
    expect(changedIn('no-such-rev')).toBeNull();
  });

  it('install swaps the implementation every exported read answers from, and hands back the one it replaced', () => {
    const sha = commit('real');
    // A sentinel per method, so an export that reaches around the install
    // point is caught by name rather than surviving because some other test
    // happened to read it.
    const sentinel: GitFacts = {
      mergeBase: () => 'sentinel-mergeBase',
      head: () => 'sentinel-head',
      branch: () => 'sentinel-branch',
      resolveCommit: () => 'sentinel-resolveCommit',
      fileAt: () => 'sentinel-fileAt',
      isAncestor: () => true,
      commitCount: () => 424242,
      mergeInProgress: () => true,
      dirtyPaths: () => ['sentinel-dirty.txt'],
      changedFiles: () => ['sentinel-changed.txt'],
      changedIn: () => ['sentinel-changedIn.txt'],
      diffStat: () => 'sentinel-diffStat',
      commitLog: () => [{ sha: 'sentinel', subject: 'sentinel-subject', files: [] }],
      commitsTouching: () => ['sentinel-touching'],
      lsFiles: () => ['sentinel-tracked.ts'],
    };
    const previous = install(sentinel);
    try {
      expect(mergeBase('main')).toBe('sentinel-mergeBase');
      expect(head()).toBe('sentinel-head');
      expect(branch()).toBe('sentinel-branch');
      expect(resolveCommit('HEAD')).toBe('sentinel-resolveCommit');
      expect(fileAt('HEAD', 'any.txt')).toBe('sentinel-fileAt');
      expect(isAncestor('a', 'b')).toBe(true);
      expect(commitCount('a..b')).toBe(424242);
      expect(mergeInProgress()).toBe(true);
      expect(dirtyPaths()).toEqual(['sentinel-dirty.txt']);
      expect(changedFiles('a..b')).toEqual(['sentinel-changed.txt']);
      expect(changedIn('abc123')).toEqual(['sentinel-changedIn.txt']);
      expect(diffStat('a..b')).toBe('sentinel-diffStat');
      expect(commitLog('a..b')?.[0].subject).toBe('sentinel-subject');
      expect(commitsTouching('any.txt')).toEqual(['sentinel-touching']);
      expect(lsFiles()).toEqual(['sentinel-tracked.ts']);
    } finally {
      install(previous);
    }
    expect(head()).toBe(sha);
  });
});
