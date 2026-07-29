import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.join(import.meta.dirname, '..');
const tsx = path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs');
const script = path.join(repoRoot, 'scripts/squash-local-changes.ts');

function runSquash(args: string[]): string {
  return execFileSync(process.execPath, [tsx, script, ...args], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function write(file: string, text: string): string {
  const trimmed = text.replace(/^\n/, '').trimEnd();
  const indent = Math.min(...trimmed.split('\n').filter((line) => line.trim()).map((line) => line.match(/^[ \t]*/)?.[0].length ?? 0));
  writeFileSync(file, `${trimmed.split('\n').map((line) => line.slice(indent)).join('\n')}\n`, 'utf8');
  return file;
}

describe('squash-local-changes', () => {
  it('emits a target module when local changes only patch that module', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-squash-'));
    try {
      const base = write(
        path.join(dir, 'base.dsl'),
        `
        # info base
        version: 1.0.0

        # item bread
        title: Bread

        # location camp
        x: 0, y: 0
        starting
        `,
      );
      const local = write(
        path.join(dir, 'local-changes.dsl'),
        `
        # info local-changes
        version: 0.0.0
        dependencies:
          base

        # item base.bread
        title: Toast
        `,
      );

      const output = runSquash([`local=${local}`, `content=${base}`]);

      expect(output).toContain('# info base');
      expect(output).toContain('title: Toast');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails instead of dropping local-created content from the squashed target', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-squash-'));
    try {
      const base = write(
        path.join(dir, 'base.dsl'),
        `
        # info base
        version: 1.0.0

        # location camp
        x: 0, y: 0
        starting
        `,
      );
      const local = write(
        path.join(dir, 'local-changes.dsl'),
        `
        # info local-changes
        version: 0.0.0
        dependencies:
          base

        # item gem
        title: Gem
        `,
      );

      try {
        runSquash([`local=${local}`, `content=${base}`]);
        throw new Error('expected squash-local-changes to fail');
      } catch (error) {
        const stderr = String((error as { stderr?: Buffer | string }).stderr ?? '');
        expect(stderr).toContain('Squashed output would not preserve the loaded universe');
        expect(stderr).toContain('items: missing local-changes.gem');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
