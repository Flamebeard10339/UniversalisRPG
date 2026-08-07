import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { install as installGit, realGit } from '../lib/git';
import { initRealGitRepo, makeRealGitRepo } from '../lib/realGitRepo';
import { isolateTmp, repoRoot, runInProcess, runInProcessAt, type Run } from './cliFixtures';

// The real-repository forms of the fixtures in cliFixtures.ts, spawning
// actual git per call. Importing from this module is how a test declares it
// needs the real thing — the gap between git's index and the disk, a whole
// child process, a real unmerged branch — so the import list of this file's
// consumers is the set of tests paying for real git.

export function realGitFixture(run: (context: { dir: string; commit: (message: string, files?: string[]) => string; tasks: (...args: string[]) => Run }) => void): void {
  const dir = makeRealGitRepo('universalis-git-fixture-');
  const restoreTmp = isolateTmp(dir);
  try {
    const specsDir = path.join(dir, 'specs');
    mkdirSync(specsDir);
    writeFileSync(path.join(specsDir, 'demo-spec.md'), '# Demo spec\n\n## Deliverable\n\nSomething this branch promises.\n\nProof:\n\n- The first clause holds.\n\n## Decisions\n\n## Open questions\n\nNone.\n', 'utf8');
    const systemsPath = path.join(dir, 'systems.json');
    writeFileSync(systemsPath, JSON.stringify({ unowned: { note: '', paths: ['docs', '*.md'] }, systems: [] }), 'utf8');
    const storePath = path.join(dir, 'tasks.jsonl');
    const globals = ['--store', storePath, '--systems', systemsPath, '--specs-dir', specsDir, '--branch', 'demo-spec'];
    spawnSync('git', ['add', '.'], { cwd: dir });
    spawnSync('git', ['commit', '--no-verify', '-m', 'Initial fixture\n\nA branch base exists.'], { cwd: dir, encoding: 'utf8' });
    spawnSync('git', ['checkout', '-q', '-b', 'demo-spec'], { cwd: dir });

    run({
      dir,
      commit: (message: string, files: string[] = [`file-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`]) => {
        for (const file of files) {
          const target = path.join(dir, file);
          mkdirSync(path.dirname(target), { recursive: true });
          writeFileSync(target, 'x', 'utf8');
        }
        spawnSync('git', ['add', '.'], { cwd: dir });
        spawnSync('git', ['commit', '--no-verify', '-m', message], { cwd: dir, encoding: 'utf8' });
        return spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).stdout.trim();
      },
      tasks: (...args: string[]) => runInProcessAt(dir, [...args, ...globals]),
    });
  } finally {
    restoreTmp();
    rmSync(dir, { recursive: true, force: true });
  }
}

// A bare real repository on main, chdir'd into for the callback with the
// real seam pinned — for direct-library tests whose subject is git's own
// semantics (a merge base that stays put while main moves on) rather than
// facts a snapshot can carry.
export function realGitRepo(run: (context: { dir: string; git: (...args: string[]) => void; write: (relPath: string, content: string) => void; commit: (message: string) => void }) => void): void {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-real-git-'));
  const cwd = process.cwd();
  const restoreGit = installGit(realGit);
  const git = (...args: string[]): void => void spawnSync('git', args, { cwd: dir });
  try {
    initRealGitRepo(dir);
    process.chdir(dir);
    run({
      dir,
      git,
      write: (relPath: string, content: string) => {
        mkdirSync(path.dirname(path.join(dir, relPath)), { recursive: true });
        writeFileSync(path.join(dir, relPath), content, 'utf8');
      },
      commit: (message: string) => {
        git('add', '.');
        git('commit', '--no-verify', '-q', '-m', message);
      },
    });
  } finally {
    installGit(restoreGit);
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  }
}

// A git repo whose store sits at docs/tasks.jsonl, carrying this repo's own
// .gitattributes — so the merge tests prove the lines actually shipped
// rather than a copy of them written for the occasion.
export function eventLogGitFixture(
  run: (context: { dir: string; storePath: string; tasks: (...args: string[]) => Run; commit: (message: string) => void; git: (...args: string[]) => { status: number; stdout: string } }) => void,
): void {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-event-log-'));
  try {
    const git = (...args: string[]): { status: number; stdout: string } => {
      const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
      return { status: result.status ?? 1, stdout: result.stdout.trim() };
    };
    initRealGitRepo(dir);

    writeFileSync(path.join(dir, '.gitattributes'), readFileSync(path.join(repoRoot, '.gitattributes'), 'utf8'), 'utf8');
    const specsDir = path.join(dir, 'docs', 'specs');
    mkdirSync(specsDir, { recursive: true });
    writeFileSync(path.join(specsDir, 'demo-spec.md'), '# Demo spec\n\n## Deliverable\n\nSomething this branch promises.\n\nProof:\n\n- The first clause holds.\n\n## Decisions\n\n## Open questions\n\nNone.\n', 'utf8');
    const systemsPath = path.join(dir, 'systems.json');
    writeFileSync(systemsPath, JSON.stringify({ unowned: { note: '', paths: ['docs', '*.md'] }, systems: [{ name: 'Runtime', paths: ['src/runtime'], lastAudit: null, lastAuditDoc: null, note: null }] }), 'utf8');
    const storePath = path.join(dir, 'docs', 'tasks.jsonl');
    writeFileSync(storePath, '', 'utf8');
    writeFileSync(path.join(dir, 'docs', 'events.jsonl'), '', 'utf8');
    const globals = ['--store', storePath, '--systems', systemsPath, '--specs-dir', specsDir, '--branch', 'demo-spec'];

    git('add', '-A');
    git('commit', '--no-verify', '-m', 'Initial fixture\n\nA tracked store and log exist.');
    git('checkout', '-q', '-b', 'demo-spec');

    run({
      dir,
      storePath,
      tasks: (...args: string[]) => runInProcess([...args, ...globals]),
      // -a, not add -A: every file these tests change is tracked from the
      // initial commit, and one spawn per commit is half of two.
      commit: (message: string) => {
        git('commit', '--no-verify', '-am', message);
      },
      git,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function realDefaultStoreGitFixture(run: (context: { dir: string; tasks: (...args: string[]) => Run }) => void): void {
  const dir = makeRealGitRepo('universalis-default-store-');
  try {
    mkdirSync(path.join(dir, 'docs', 'specs'), { recursive: true });
    mkdirSync(path.join(dir, 'docs', 'audits'), { recursive: true });
    writeFileSync(path.join(dir, 'docs', 'specs', 'demo-spec.md'), '# Demo spec\n\n## Deliverable\n\nSomething this branch promises.\n\nProof:\n\n- The first clause holds.\n\n## Decisions\n\n## Open questions\n\nNone.\n', 'utf8');
    writeFileSync(path.join(dir, 'docs', 'audits', 'systems.json'), JSON.stringify({ unowned: { note: '', paths: ['docs', '*.md'] }, systems: [] }), 'utf8');
    writeFileSync(path.join(dir, 'docs', 'tasks.jsonl'), '', 'utf8');
    spawnSync('git', ['add', '.'], { cwd: dir });
    spawnSync('git', ['commit', '--no-verify', '-m', 'Initial fixture\n\nA tracked task store exists.'], { cwd: dir, encoding: 'utf8' });

    run({
      dir,
      tasks: (...args: string[]) => runInProcessAt(dir, [...args, '--branch', 'demo-spec']),
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
