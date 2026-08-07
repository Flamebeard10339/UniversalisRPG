import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as git from '../lib/git';
import { defaultStoreGitFixture, enclosingGitFixture, fixture, gitFixture } from './cliFixtures';

// c3: which git a test reads is declared by the fixture it calls, and the
// same read answers differently under each — not implied by which fields
// the test happens to assert on.
describe('the git a fixture test reads is the one its call site declares', () => {
  it('fixture answers every git fact as "no repository here"', () => {
    fixture(() => {
      expect(git.head()).toBeNull();
      expect(git.branch()).toBeNull();
      expect(git.mergeBase('main')).toBeNull();
      expect(git.dirtyPaths()).toBeNull();
      expect(git.resolveCommit('HEAD')).toBeNull();
    });
  });

  it('enclosingGitFixture answers from the repository the suite runs inside', () => {
    const realHead = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    enclosingGitFixture(() => {
      expect(git.head()).toBe(realHead);
    });
  });

  it('a done --commit HEAD resolves under the enclosing form and is refused under the hermetic one', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'hermetic task', '--id', 'hermetic');
      expect(tasks('done', 'hermetic', '--commit', 'HEAD').status).toBe(1);
      expect(readFileSync(path.join(dir, 'tasks.jsonl'), 'utf8')).toContain('"state":"open"');
    });
    enclosingGitFixture(({ tasks, dir }) => {
      tasks('add', 'enclosing task', '--id', 'enclosing');
      expect(tasks('done', 'enclosing', '--commit', 'HEAD').status).toBe(0);
      expect(readFileSync(path.join(dir, 'tasks.jsonl'), 'utf8')).toContain('"state":"done"');
    });
  });

  it('restores the real seam when the fixture returns, even after a throw inside it', () => {
    const realHead = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    expect(() =>
      fixture(() => {
        throw new Error('a test body failing');
      }),
    ).toThrow('a test body failing');
    expect(git.head()).toBe(realHead);
  });
});

// c4's companion behaviour: the git facts under gitFixture come from the
// data the test itself put there, so every read is answerable without a
// repository existing at all.
describe('gitFixture answers git from the data its own commits built', () => {
  it('commit() advances HEAD and main stays at the branch base', () => {
    gitFixture(({ commit }) => {
      const base = git.resolveCommit('main');
      const first = commit('first change');
      expect(first).toMatch(/^[0-9a-f]{40}$/);
      expect(git.head()).toBe(first);
      expect(git.mergeBase('main')).toBe(base);
      expect(git.isAncestor(base!, first)).toBe(true);
      expect(git.isAncestor(first, base!)).toBe(false);
    });
  });

  it('changedFiles and commitLog carry what each commit touched, newest first', () => {
    gitFixture(({ dir, commit }) => {
      const base = git.head()!;
      commit('touch one', ['one.txt']);
      commit('touch two', ['sub/two.txt']);
      expect(git.changedFiles(`${base}..HEAD`)).toEqual(['one.txt', 'sub/two.txt']);
      const log = git.commitLog(`${base}..HEAD`)!;
      expect(log.map((entry) => entry.subject)).toEqual(['touch two', 'touch one']);
      expect(log[0].files).toEqual(['sub/two.txt']);
      expect(git.commitsTouching(path.join(dir, 'one.txt'))).toHaveLength(1);
    });
  });

  it('fileAt reads a revision snapshot, not the working tree', () => {
    gitFixture(({ dir, commit }) => {
      writeFileSync(path.join(dir, 'tracked.txt'), 'first version\n', 'utf8');
      const rev = commit('add tracked', []);
      writeFileSync(path.join(dir, 'tracked.txt'), 'second version\n', 'utf8');
      const at = process.cwd();
      process.chdir(dir);
      try {
        expect(git.fileAt(rev, 'tracked.txt')).toBe('first version');
        expect(git.fileAt('main', 'tracked.txt')).toBeNull();
        expect(git.dirtyPaths()).toEqual(['tracked.txt']);
      } finally {
        process.chdir(at);
      }
    });
  });

  it('the default-store form tracks the store the way a committed repo would', () => {
    defaultStoreGitFixture(({ dir, tasks }) => {
      const at = process.cwd();
      process.chdir(dir);
      try {
        expect(git.dirtyPaths('docs/tasks.jsonl')).toEqual([]);
        tasks('add', 'a store write', '--id', 'store-write');
        expect(git.dirtyPaths('docs/tasks.jsonl')).toEqual(['docs/tasks.jsonl']);
        expect(git.fileAt('HEAD', 'docs/tasks.jsonl')).toBe('');
      } finally {
        process.chdir(at);
      }
    });
  });
});
