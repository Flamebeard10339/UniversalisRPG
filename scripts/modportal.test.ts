import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.join(import.meta.dirname, '..');
const tsx = path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs');
const script = path.join(repoRoot, 'scripts/modportal.ts');

interface Run {
  status: number;
  stdout: string;
  stderr: string;
}

function runModportal(args: string[]): Run {
  const result = spawnSync(process.execPath, [tsx, script, ...args], { cwd: repoRoot, encoding: 'utf8' });
  return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

function dsl(text: string): string {
  const trimmed = text.replace(/^\n/, '').trimEnd();
  const indent = Math.min(...trimmed.split('\n').filter((line) => line.trim()).map((line) => line.match(/^[ \t]*/)?.[0].length ?? 0));
  return `${trimmed.split('\n').map((line) => line.slice(indent)).join('\n')}\n`;
}

const BASE = dsl(`
  # info base
  version: 1.0.0

  # location camp
  x: 0, y: 0
  starting
`);

function issueBody(...lines: string[]): string {
  return ['## Local Changes DSL', '```dsl', '# info local-changes', 'version: 0.0.0', 'dependencies:', '  base', '', ...lines, '```'].join('\n');
}

function cache(setUp: (dir: string, base: string, issues: string) => void, run: (dir: string, base: string, issues: string) => void): void {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-modportal-'));
  try {
    const base = path.join(dir, 'base.dsl');
    const issues = path.join(dir, 'issues.json');
    writeFileSync(base, BASE, 'utf8');
    setUp(dir, base, issues);
    run(dir, base, issues);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('modportal CLI', () => {
  it('syncs approved issue DSL, lists it, and toggles enabled sources', () => {
    cache(
      (_dir, _base, issues) => {
        writeFileSync(issues, JSON.stringify({ number: 9, title: 'Gem', url: 'https://example.test/issues/9', body: issueBody('# item gem', 'title: Gem') }), 'utf8');
      },
      (dir, base, issues) => {
        const synced = runModportal(['sync', '--from', issues, '--cache', dir, `content=${base}`]);
        const listed = runModportal(['list', '--cache', dir]);
        const sources = runModportal(['sources', '--cache', dir]);
        const disabled = runModportal(['disable', 'approved-mod-9', '--cache', dir]);
        const disabledSources = runModportal(['sources', '--cache', dir]);
        const enabled = runModportal(['enable', '9', '--cache', dir]);

        expect(synced.stdout).toContain('Synced 1 approved mod(s)');
        expect(listed.stdout).toContain('enabled  #9 approved-mod-9 - Gem');
        expect(sources.stdout).toContain('9-approved-mod-9.dsl');
        expect(disabled.stdout).toContain('Disabled approved-mod-9 (#9).');
        expect(disabledSources.stdout).toBe('');
        expect(enabled.stdout).toContain('Enabled approved-mod-9 (#9).');
        expect(readFileSync(path.join(dir, '9-approved-mod-9.dsl'), 'utf8')).toContain('# info approved-mod-9');
      },
    );
  });

  it('writes nothing when an approved mod does not load, rather than leaving it enabled in the cache', () => {
    cache(
      (_dir, _base, issues) => {
        writeFileSync(issues, JSON.stringify({ number: 4, title: 'Broken', body: issueBody('# entity gull', 'peck:', '  give: no-such-item') }), 'utf8');
      },
      (dir, base, issues) => {
        const synced = runModportal(['sync', '--from', issues, '--cache', dir, `content=${base}`]);

        expect(synced.status).toBe(1);
        expect(synced.stderr).toContain('names an unknown item: no-such-item');
        expect(synced.stderr).toContain('Synced nothing');
        expect(readdirSync(dir).filter((entry) => entry !== 'base.dsl' && entry !== 'issues.json')).toEqual([]);
      },
    );
  });

  it('reads a corrupt manifest as an empty cache, so the repair commands still run', () => {
    cache(
      (dir) => writeFileSync(path.join(dir, 'manifest.json'), '{"entries": [', 'utf8'),
      (dir) => {
        const listed = runModportal(['list', '--cache', dir]);
        const toggled = runModportal(['enable', '9', '--cache', dir]);

        expect(listed.status).toBe(0);
        expect(listed.stdout).toContain('No approved mods synced.');
        expect(listed.stderr).toContain('Modportal ignored manifest.json');
        expect(toggled.status).toBe(1);
        expect(toggled.stderr).toContain('No approved mod matches 9');
      },
    );
  });

  it('lets a switched-off mod stay broken without blocking the mods that are on', () => {
    cache(
      (dir, _base, issues) => {
        writeFileSync(
          issues,
          JSON.stringify([
            { number: 4, title: 'Broken', body: issueBody('# entity gull', 'peck:', '  give: no-such-item') },
            { number: 9, title: 'Gem', body: issueBody('# item gem', 'title: Gem') },
          ]),
          'utf8',
        );
        writeFileSync(path.join(dir, '4-approved-mod-4.dsl'), '# info approved-mod-4\n', 'utf8');
        writeFileSync(
          path.join(dir, 'manifest.json'),
          JSON.stringify({ version: 1, label: 'approved-mod', entries: [{ issue: 4, title: 'Broken', moduleId: 'approved-mod-4', file: '4-approved-mod-4.dsl', enabled: false }] }),
          'utf8',
        );
      },
      (dir, base, issues) => {
        const synced = runModportal(['sync', '--from', issues, '--cache', dir, `content=${base}`]);
        const listed = runModportal(['list', '--cache', dir]);

        expect(synced.status).toBe(0);
        expect(synced.stderr).toBe('');
        expect(existsSync(path.join(dir, '9-approved-mod-9.dsl'))).toBe(true);
        expect(listed.stdout).toContain('disabled #4 approved-mod-4');
        expect(listed.stdout).toContain('enabled  #9 approved-mod-9');
      },
    );
  });
});
