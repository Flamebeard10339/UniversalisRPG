import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isolateTmp, runInProcessAt, type Run } from './cliFixtures';

// The real-repository forms of the fixtures in cliFixtures.ts, spawning
// actual git per call. Importing from this module is how a test declares it
// needs the real thing — the gap between git's index and the disk, a whole
// child process, a real unmerged branch — so the import list of this file's
// consumers is the set of tests paying for real git.

export function realGitFixture(run: (context: { dir: string; commit: (message: string, files?: string[]) => string; tasks: (...args: string[]) => Run }) => void): void {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-git-fixture-'));
  const restoreTmp = isolateTmp(dir);
  try {
    spawnSync('git', ['init', '-q'], { cwd: dir });
    spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: dir });

    const specsDir = path.join(dir, 'specs');
    mkdirSync(specsDir);
    writeFileSync(path.join(specsDir, 'demo-spec.md'), '# Demo spec\n\n## Deliverable\n\nSomething this branch promises.\n\nProof:\n\n- The first clause holds.\n\n## Decisions\n\n## Open questions\n\nNone.\n', 'utf8');
    const systemsPath = path.join(dir, 'systems.json');
    writeFileSync(systemsPath, JSON.stringify({ unowned: { note: '', paths: ['docs', '*.md'] }, systems: [] }), 'utf8');
    const storePath = path.join(dir, 'tasks.jsonl');
    const globals = ['--store', storePath, '--systems', systemsPath, '--specs-dir', specsDir, '--branch', 'demo-spec'];
    spawnSync('git', ['add', '.'], { cwd: dir });
    spawnSync('git', ['commit', '--no-verify', '-m', 'Initial fixture\n\nA branch base exists.'], { cwd: dir, encoding: 'utf8' });
    spawnSync('git', ['branch', '-M', 'main'], { cwd: dir });
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

export function realDefaultStoreGitFixture(run: (context: { dir: string; tasks: (...args: string[]) => Run }) => void): void {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-default-store-'));
  try {
    spawnSync('git', ['init', '-q'], { cwd: dir });
    spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: dir });

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
