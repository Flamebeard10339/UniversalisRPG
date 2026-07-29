import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.join(import.meta.dirname, '..');
const tsx = path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs');
const script = path.join(repoRoot, 'scripts/modportal.ts');

function runModportal(args: string[]): string {
  return execFileSync(process.execPath, [tsx, script, ...args], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function dsl(text: string): string {
  const trimmed = text.replace(/^\n/, '').trimEnd();
  const indent = Math.min(...trimmed.split('\n').filter((line) => line.trim()).map((line) => line.match(/^[ \t]*/)?.[0].length ?? 0));
  return `${trimmed.split('\n').map((line) => line.slice(indent)).join('\n')}\n`;
}

describe('modportal CLI', () => {
  it('syncs approved issue DSL, lists it, and toggles enabled sources', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-modportal-'));
    try {
      const base = path.join(dir, 'base.dsl');
      const issues = path.join(dir, 'issues.json');
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
        issues,
        JSON.stringify({
          number: 9,
          title: 'Gem',
          url: 'https://example.test/issues/9',
          body: [
            '## Local Changes DSL',
            '```dsl',
            '# info local-changes',
            'version: 0.0.0',
            'dependencies:',
            '  base',
            '',
            '# item gem',
            'title: Gem',
            '```',
          ].join('\n'),
        }),
        'utf8',
      );

      const synced = runModportal(['sync', '--from', issues, '--cache', dir, `content=${base}`]);
      const listed = runModportal(['list', '--cache', dir]);
      const sources = runModportal(['sources', '--cache', dir]);
      const disabled = runModportal(['disable', 'approved-mod-9', '--cache', dir]);
      const disabledSources = runModportal(['sources', '--cache', dir]);
      const enabled = runModportal(['enable', '9', '--cache', dir]);

      expect(synced).toContain('Synced 1 approved mod(s)');
      expect(listed).toContain('enabled  #9 approved-mod-9 - Gem');
      expect(sources).toContain('9-approved-mod-9.dsl');
      expect(disabled).toContain('Disabled approved-mod-9 (#9).');
      expect(disabledSources).toBe('');
      expect(enabled).toContain('Enabled approved-mod-9 (#9).');
      expect(readFileSync(path.join(dir, '9-approved-mod-9.dsl'), 'utf8')).toContain('# info approved-mod-9');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
