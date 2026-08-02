import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { branch, commitCount, head, isAncestor, mergeBase, resolveCommit } from './git';

let dir: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-git-'));
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
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

  it('branch names the current branch, and is null outside a repo rather than throwing', () => {
    commit('first');
    spawnSync('git', ['checkout', '-q', '-b', 'named-branch'], { cwd: dir });
    expect(branch()).toBe('named-branch');

    // resolveConfig calls this before every command body, so throwing here
    // killed every command — reads included — with a raw Node stack trace.
    const outside = mkdtempSync(path.join(os.tmpdir(), 'universalis-norepo-'));
    process.chdir(outside);
    try {
      expect(branch()).toBeNull();
    } finally {
      process.chdir(dir);
      rmSync(outside, { recursive: true, force: true });
    }
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
});
