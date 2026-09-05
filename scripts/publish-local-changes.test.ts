import { repoRoot } from './lib/repo';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tsxCli } from './lib/tsxCli';

const script = path.join(repoRoot, 'scripts/publish-local-changes.ts');

interface Run {
  status: number;
  stdout: string;
  stderr: string;
}

function runPublish(args: string[], env: NodeJS.ProcessEnv = process.env): Run {
  const result = spawnSync(process.execPath, [tsxCli, script, ...args], { cwd: repoRoot, encoding: 'utf8', env });
  return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

function dsl(text: string): string {
  const trimmed = text.replace(/^\n/, '').trimEnd();
  const indent = Math.min(...trimmed.split('\n').filter((line) => line.trim()).map((line) => line.match(/^[ \t]*/)?.[0].length ?? 0));
  return `${trimmed.split('\n').map((line) => line.slice(indent)).join('\n')}\n`;
}

function fixture(run: (context: { dir: string; base: string; local: string }) => void): void {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-publish-'));
  try {
    const base = path.join(dir, 'base.dsl');
    const local = path.join(dir, 'local-changes.dsl');
    writeFileSync(
      base,
      dsl(`
        # info base
        version: 1.0.0

        # location camp
        x: 0, y: 0
        starting
      `),
      'utf8',
    );
    writeFileSync(
      local,
      dsl(`
        # info local-changes
        version: 0.0.0
        dependencies:
          base

        # item gem
        title: Gem
      `),
      'utf8',
    );
    run({ dir, base, local });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('publish-local-changes CLI', () => {
  it('prints an issue body with notes from --notes-file and the validated content files', () => {
    fixture(({ dir, base, local }) => {
      const notes = path.join(dir, 'notes.md');
      writeFileSync(notes, 'Adds a gem to the smoke fixture.\n', 'utf8');

      const result = runPublish([`local=${local}`, `content=${base}`, '--notes-file', notes]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('## Summary\nAdds a gem to the smoke fixture.');
      expect(result.stdout).toContain(`## Content Files\n- ${base}`);
      expect(result.stdout).toContain('Loaded modules: base, local-changes');
      expect(result.stdout).toContain('# item gem');
    });
  });

  it('refuses to publish when the local-changes module did not load cleanly', () => {
    fixture(({ base, local }) => {
      writeFileSync(
        local,
        dsl(`
          # info local-changes
          version: 0.0.0
          dependencies:
            base

          # entity sprite
          gift: give: no-such-item
        `),
        'utf8',
      );

      const result = runPublish([`local=${local}`, `content=${base}`]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('local-changes did not validate:');
      expect(result.stderr).toContain('names an unknown item: no-such-item');
      expect(result.stdout).toBe('');
    });
  });

  it('reports a missing gh executable during --create and removes its temporary issue body', () => {
    fixture(({ base, local }) => {
      const before = new Set(readdirSync(os.tmpdir()).filter((name) => name.startsWith('universalis-issue-')));
      const env = { ...process.env, PATH: '', Path: '' };

      const result = runPublish([`local=${local}`, `content=${base}`, '--create'], env);

      const after = readdirSync(os.tmpdir()).filter((name) => name.startsWith('universalis-issue-') && !before.has(name));
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Could not create GitHub issue with gh:');
      expect(after).toEqual([]);
    });
  });
});
