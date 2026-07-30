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

interface Issue {
  number: number;
  title: string;
  tier?: 'approved' | 'auto-enabled';
  body: string;
}

function issue(number: number, title: string, tier: 'approved' | 'auto-enabled', ...lines: string[]): Issue {
  return { number, title, tier, body: issueBody(...lines) };
}

const GEM = ['# item gem', 'title: Gem'];
const BROKEN = ['# entity gull', 'peck:', '  give: no-such-item'];

function cache(run: (context: { dir: string; base: string; fetch: (...issues: Issue[]) => string }) => void): void {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-modportal-'));
  try {
    const base = path.join(dir, 'base.dsl');
    const issues = path.join(dir, 'issues.json');
    writeFileSync(base, BASE, 'utf8');
    run({
      dir,
      base,
      fetch: (...list: Issue[]) => {
        writeFileSync(issues, JSON.stringify(list), 'utf8');
        return issues;
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function manifestOf(dir: string): { entries: { issue: number; enabled: boolean; diagnostics?: string[] }[]; intent: Record<string, boolean> } {
  return JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
}

describe('modportal CLI', () => {
  it('syncs an approved mod available but switched off, and only auto-enabled defaults on', () => {
    cache(({ dir, base, fetch }) => {
      const from = fetch(issue(3, 'Gem', 'approved', ...GEM), issue(4, 'Cave', 'auto-enabled', '# location cave', 'x: 1, y: 0'));
      const synced = runModportal(['sync', '--from', from, '--cache', dir, `content=${base}`]);
      const listed = runModportal(['list', '--cache', dir]);
      const sources = runModportal(['sources', '--cache', dir]);

      expect(synced.status).toBe(0);
      expect(synced.stdout).toContain('Synced 2 mod(s)');
      expect(synced.stdout).toContain('1 enabled, 1 available, 0 blocked, 0 unusable');
      expect(listed.stdout).toContain('disabled #3 approved-mod-3 [mod-approved] - Gem');
      expect(listed.stdout).toContain('enabled  #4 approved-mod-4 [mod-auto-enabled] - Cave');
      expect(sources.stdout).toContain('4-approved-mod-4.dsl');
      expect(sources.stdout).not.toContain('3-approved-mod-3.dsl');
    });
  });

  it('opts an approved mod in and back out, recording the choice as intent', () => {
    cache(({ dir, base, fetch }) => {
      const from = fetch(issue(9, 'Gem', 'approved', ...GEM));
      runModportal(['sync', '--from', from, '--cache', dir, `content=${base}`]);
      const enabled = runModportal(['enable', '9', '--cache', dir, `content=${base}`]);
      const afterEnable = runModportal(['sources', '--cache', dir]);
      const disabled = runModportal(['disable', 'approved-mod-9', '--cache', dir]);
      const afterDisable = runModportal(['sources', '--cache', dir]);

      expect(enabled.stdout).toContain('Enabled approved-mod-9 (#9).');
      expect(afterEnable.stdout).toContain('9-approved-mod-9.dsl');
      expect(disabled.stdout).toContain('Disabled approved-mod-9 (#9).');
      expect(afterDisable.stdout).toBe('');
      expect(manifestOf(dir).intent).toEqual({ 9: false });
      expect(readFileSync(path.join(dir, '9-approved-mod-9.dsl'), 'utf8')).toContain('# info approved-mod-9');
    });
  });

  it('refuses to enable a cached mod that would stop the cache loading, leaving the manifest untouched', () => {
    cache(({ dir, base, fetch }) => {
      const from = fetch(issue(4, 'Broken', 'approved', ...BROKEN));
      runModportal(['sync', '--from', from, '--cache', dir, `content=${base}`]);
      const before = readFileSync(path.join(dir, 'manifest.json'), 'utf8');
      const enabled = runModportal(['enable', '4', '--cache', dir, `content=${base}`]);

      expect(enabled.status).toBe(1);
      expect(enabled.stderr).toContain('names an unknown item: no-such-item');
      expect(enabled.stderr).toContain('Left approved-mod-4 switched off');
      expect(readFileSync(path.join(dir, 'manifest.json'), 'utf8')).toBe(before);
      expect(runModportal(['sources', '--cache', dir]).stdout).toBe('');
    });
  });

  it('lets one broken mod stay broken from an empty cache without blocking the mods that load', () => {
    cache(({ dir, base, fetch }) => {
      const from = fetch(issue(4, 'Broken', 'auto-enabled', ...BROKEN), issue(9, 'Gem', 'auto-enabled', ...GEM));
      const synced = runModportal(['sync', '--from', from, '--cache', dir, `content=${base}`]);
      const listed = runModportal(['list', '--cache', dir]);

      expect(synced.status).toBe(0);
      expect(synced.stderr).toContain('Blocked #4 approved-mod-4');
      expect(synced.stderr).toContain('names an unknown item: no-such-item');
      expect(synced.stdout).toContain('1 enabled, 0 available, 1 blocked');
      expect(existsSync(path.join(dir, '9-approved-mod-9.dsl'))).toBe(true);
      expect(listed.stdout).toContain('blocked  #4 approved-mod-4');
      expect(listed.stdout).toContain('enabled  #9 approved-mod-9');
      expect(runModportal(['sources', '--cache', dir]).stdout).toContain('9-approved-mod-9.dsl');
    });
  });

  it('keeps a broken mod reachable, so the operator can read it and switch the rest', () => {
    cache(({ dir, base, fetch }) => {
      const from = fetch(issue(4, 'Broken', 'auto-enabled', ...BROKEN), issue(9, 'Gem', 'auto-enabled', ...GEM));
      runModportal(['sync', '--from', from, '--cache', dir, `content=${base}`]);
      const shown = runModportal(['show', '4', '--cache', dir]);
      const disabled = runModportal(['disable', '4', '--cache', dir]);

      expect(shown.status).toBe(0);
      expect(shown.stdout).toContain('give: no-such-item');
      expect(disabled.status).toBe(0);
      expect(manifestOf(dir).intent).toEqual({ 4: false });
    });
  });

  it('reports an issue it cannot turn into a module without abandoning the ones it can', () => {
    cache(({ dir, base, fetch }) => {
      const from = fetch({ number: 5, title: 'No DSL', tier: 'approved', body: 'I forgot to paste anything.' }, issue(9, 'Gem', 'auto-enabled', ...GEM));
      const synced = runModportal(['sync', '--from', from, '--cache', dir, `content=${base}`]);

      expect(synced.status).toBe(0);
      expect(synced.stderr).toContain('Skipped #5: issue body has no Local Changes DSL heading');
      expect(synced.stdout).toContain('Synced 1 mod(s)');
      expect(synced.stdout).toContain('1 unusable');
      expect(runModportal(['sources', '--cache', dir]).stdout).toContain('9-approved-mod-9.dsl');
    });
  });

  it('prunes the cache file of an unlabelled issue but remembers the user switched it off', () => {
    cache(({ dir, base, fetch }) => {
      const content = `content=${base}`;
      runModportal(['sync', '--from', fetch(issue(9, 'Gem', 'auto-enabled', ...GEM)), '--cache', dir, content]);
      runModportal(['disable', '9', '--cache', dir]);
      const unlabelled = runModportal(['sync', '--from', fetch(), '--cache', dir, content]);
      const pruned = readdirSync(dir);
      const relabelled = runModportal(['sync', '--from', fetch(issue(9, 'Gem', 'auto-enabled', ...GEM)), '--cache', dir, content]);

      expect(unlabelled.status).toBe(0);
      expect(pruned).not.toContain('9-approved-mod-9.dsl');
      expect(pruned).toContain('base.dsl');
      expect(relabelled.stdout).toContain('0 enabled, 1 available, 0 blocked');
      expect(manifestOf(dir).entries).toMatchObject([{ issue: 9, enabled: false }]);
    });
  });

  it('warns instead of crashing when a manifest entry names a file that is gone', () => {
    cache(({ dir, base, fetch }) => {
      const from = fetch(issue(9, 'Gem', 'auto-enabled', ...GEM));
      runModportal(['sync', '--from', from, '--cache', dir, `content=${base}`]);
      rmSync(path.join(dir, '9-approved-mod-9.dsl'));
      const shown = runModportal(['show', '9', '--cache', dir]);
      const enabled = runModportal(['enable', '9', '--cache', dir, `content=${base}`]);

      expect(shown.status).toBe(1);
      expect(shown.stderr).toContain('Modportal skipped approved-mod-9: missing 9-approved-mod-9.dsl');
      expect(shown.stderr).not.toContain('ENOENT');
      expect(enabled.status).toBe(1);
      expect(enabled.stderr).toContain('missing 9-approved-mod-9.dsl');
      expect(enabled.stderr).not.toContain('ENOENT');
    });
  });

  it('reads a corrupt manifest as an empty cache, so the repair commands still run', () => {
    cache(({ dir }) => {
      writeFileSync(path.join(dir, 'manifest.json'), '{"entries": [', 'utf8');
      const listed = runModportal(['list', '--cache', dir]);
      const toggled = runModportal(['enable', '9', '--cache', dir]);

      expect(listed.status).toBe(0);
      expect(listed.stdout).toContain('No mods synced.');
      expect(listed.stderr).toContain('Modportal ignored manifest.json');
      expect(toggled.status).toBe(1);
      expect(toggled.stderr).toContain('No mod matches 9');
    });
  });

  it('lifts the enable choices out of a manifest written before tiers existed', () => {
    cache(({ dir, base, fetch }) => {
      writeFileSync(path.join(dir, '9-approved-mod-9.dsl'), '# info approved-mod-9\nversion: 0.0.0\n', 'utf8');
      writeFileSync(
        path.join(dir, 'manifest.json'),
        JSON.stringify({ version: 1, label: 'approved-mod', entries: [{ issue: 9, title: 'Gem', moduleId: 'approved-mod-9', file: '9-approved-mod-9.dsl', enabled: false }] }),
        'utf8',
      );
      const listed = runModportal(['list', '--cache', dir]);
      const synced = runModportal(['sync', '--from', fetch(issue(9, 'Gem', 'auto-enabled', ...GEM)), '--cache', dir, `content=${base}`]);

      expect(listed.stderr).toContain('kept your enable/disable choices');
      expect(listed.stdout).toContain('No mods synced.');
      expect(synced.stdout).toContain('0 enabled, 1 available');
      expect(manifestOf(dir).intent).toEqual({ 9: false });
    });
  });
});
