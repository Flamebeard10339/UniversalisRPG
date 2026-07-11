import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseContributionIssue, upsertDslModules } from './merge-contribution-issue.mjs';

const dslIssueBody = (dslBlock) => `## Target universe
base

## Notes
Test.

## Validation
No validation issues.

## App version
0.1.0

${dslBlock}`;

const moduleBlock = (moduleFilePath, source) => `## Changed DSL Modules

### ${moduleFilePath}
\`\`\`md
${source}
\`\`\``;

describe('merge-contribution-issue tooling — parsing', () => {
  it('parses the target universe and embedded full-source DSL module blocks', () => {
    const source = '# info\nid: local-contributions\nversion: 1.0.0\nuniverse: base\nauthor: test\ngame_version: 1.0\n';
    const parsed = parseContributionIssue(dslIssueBody(moduleBlock('modules/local-contributions.md', source)));

    expect(parsed.targetUniverseId).toBe('base');
    expect(parsed.dslModules).toEqual([{ path: 'modules/local-contributions.md', source }]);
  });

  it('parses multiple module blocks from one issue', () => {
    const block = `## Changed DSL Modules

### modules/a.md
\`\`\`md
a-source
\`\`\`

### modules/b.md
\`\`\`md
b-source
\`\`\``;
    const parsed = parseContributionIssue(dslIssueBody(block));
    expect(parsed.dslModules).toEqual([
      { path: 'modules/a.md', source: 'a-source' },
      { path: 'modules/b.md', source: 'b-source' },
    ]);
  });

  it('returns no DSL modules when the issue has no Changed DSL Modules section', () => {
    const parsed = parseContributionIssue(dslIssueBody(''));
    expect(parsed.dslModules).toEqual([]);
  });

  it('throws when the issue is missing "Target universe"', () => {
    expect(() => parseContributionIssue('## Notes\nnothing else')).toThrow('Target universe');
  });
});

const universesRoot = path.join(import.meta.dirname, '..', 'public', 'content', 'universes');
const guideHousePath = path.join(universesRoot, 'base', 'modules', 'tutorial-island-guide-house.md');
const scratchModulePath = path.join(universesRoot, 'base', 'modules', 'merge-issue-scratch-module.md');
const manifestPath = path.join(universesRoot, 'base', 'universe.json');

describe('merge-contribution-issue tooling — DSL upsert', () => {
  it('writes a brand-new module for real, registers it in universe.json, and does not bump its version', () => {
    expect(fs.existsSync(scratchModulePath)).toBe(false);
    const newModuleSource = '# info\nid: merge-issue-scratch-module\nversion: 1.0.0\nuniverse: base\nauthor: test\ngame_version: 1.0\n';
    const originalManifestText = fs.readFileSync(manifestPath, 'utf8');

    try {
      const result = upsertDslModules({
        universeId: 'base',
        dslModules: [{ path: 'modules/merge-issue-scratch-module.md', source: newModuleSource }],
        dryRun: false,
      });

      expect(result.moduleIds).toEqual(['merge-issue-scratch-module']);
      expect(result.bumped).toEqual([]);
      expect(fs.readFileSync(scratchModulePath, 'utf8')).toBe(newModuleSource);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(manifest.modules).toContain('merge-issue-scratch-module');
    } finally {
      if (fs.existsSync(scratchModulePath)) fs.rmSync(scratchModulePath);
      // Restore the exact original bytes — reconstructing via
      // JSON.parse/stringify would silently reformat unrelated parts of the
      // file (e.g. re-wrapping a compact array).
      fs.writeFileSync(manifestPath, originalManifestText);
    }
  });

  it('dry-runs an edit to an existing module and bumps its patch version from what is currently on disk', () => {
    const currentSource = fs.readFileSync(guideHousePath, 'utf8');
    const editedSource = currentSource.replace('You catch your reflection.', 'You catch your own reflection.');

    const result = upsertDslModules({
      universeId: 'base',
      dslModules: [{ path: 'modules/tutorial-island-guide-house.md', source: editedSource }],
      dryRun: true,
    });

    expect(result.moduleIds).toEqual(['tutorial-island-guide-house']);
    expect(result.bumped).toHaveLength(1);
    expect(result.bumped[0].moduleId).toBe('tutorial-island-guide-house');
    expect(result.bumped[0].to).not.toBe(result.bumped[0].from);
    // dry-run: the real file on disk must be untouched.
    expect(fs.readFileSync(guideHousePath, 'utf8')).toBe(currentSource);
  });

  it('is a no-op when the submitted source is byte-identical to what is already on disk', () => {
    const currentSource = fs.readFileSync(guideHousePath, 'utf8');

    const result = upsertDslModules({
      universeId: 'base',
      dslModules: [{ path: 'modules/tutorial-island-guide-house.md', source: currentSource }],
      dryRun: true,
    });

    expect(result.moduleIds).toEqual([]);
    expect(result.writes).toEqual([]);
  });

  it('throws when the issue has no Changed DSL Modules block at all', () => {
    expect(() => upsertDslModules({ universeId: 'base', dslModules: [], dryRun: true })).toThrow('No Changed DSL Modules block');
  });
});
