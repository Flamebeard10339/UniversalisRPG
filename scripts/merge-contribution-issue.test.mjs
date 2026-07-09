import fs from 'node:fs';
import path from 'node:path';
import { createPatch } from 'diff';
import { describe, expect, it } from 'vitest';
import { addPackagedMods, mergeIntoExistingMod, parseContributionIssue, upsertDslModules } from './merge-contribution-issue.mjs';

const issueBody = `## Target universe
base

## Notes
First test of github issue. This mod only changes the base value of an existing stat.

## Validation
No validation issues.

## App version
0.1.0

## Changed JSON
\`\`\`json
[
  {
    "path": "modules/local-contributions.json",
    "json": {
      "id": "local-contributions",
      "version": "1.0.0",
      "universe": "base",
      "author": "UniversalisRPG",
      "game_version": "1.0",
      "dependencies": [
        "+base-core"
      ],
      "data-updates": {
        "patches": [
          {
            "targetModId": "base-core",
            "objectType": "stats",
            "objectId": "action-rate",
            "ops": [
              {
                "op": "replace",
                "path": "/base",
                "value": 30
              }
            ]
          },
          {
            "targetModId": "base-core",
            "objectType": "flags",
            "objectId": "death-count",
            "ops": [
              {
                "op": "replace",
                "path": "/initialValue",
                "value": 1
              }
            ]
          }
        ]
      }
    }
  }
]
\`\`\``;

describe('merge-contribution-issue tooling', () => {
  it('parses GitHub issue bodies emitted by contribution submission', () => {
    const parsed = parseContributionIssue(issueBody);

    expect(parsed.targetUniverseId).toBe('base');
    expect(parsed.changedFiles).toHaveLength(1);
    expect(parsed.changedFiles[0].json.id).toBe('local-contributions');
  });

  it('dry-runs add-mod by preparing module and manifest writes', () => {
    const parsed = parseContributionIssue(issueBody);
    const result = addPackagedMods({ universeId: parsed.targetUniverseId, changedFiles: parsed.changedFiles, dryRun: true });

    expect(result.moduleIds).toEqual(['local-contributions']);
    expect(result.writes[0].json.id).toBe('local-contributions');
    expect(result.writes[1].json.modules).toEqual(expect.arrayContaining(['base-core', 'local-contributions']));
  });

  it('dry-runs merge-mod by applying addressed patches into base-core data', () => {
    const parsed = parseContributionIssue(issueBody);
    const result = mergeIntoExistingMod({
      universeId: parsed.targetUniverseId,
      targetModId: 'base-core',
      changedFiles: parsed.changedFiles,
      dryRun: true,
    });

    const mergedModule = result.writes[0].json;
    const actionRate = mergedModule.data.find((entry) => entry.type === 'stat' && entry.id === 'action-rate');
    const deathCount = mergedModule.data.find((entry) => entry.type === 'flag' && entry.id === 'death-count');

    expect(result.applied).toBe(2);
    expect(actionRate.base).toBe(30);
    expect(deathCount.initialValue).toBe(1);
  });
});

const dslIssueBody = (diffBlock) => `## Target universe
base

## Notes
Test.

## Validation
No validation issues.

## App version
0.1.0

## Changed JSON
\`\`\`json
[]
\`\`\`

## Changed DSL Modules
\`\`\`diff
${diffBlock}
\`\`\``;

const universesRoot = path.join(import.meta.dirname, '..', 'public', 'content', 'universes');
const guideHousePath = path.join(universesRoot, 'base', 'modules', 'tutorial-island-guide-house.md');
const scratchModulePath = path.join(universesRoot, 'base', 'modules', 'merge-issue-scratch-module.md');
const manifestPath = path.join(universesRoot, 'base', 'universe.json');

describe('merge-contribution-issue tooling — DSL upsert', () => {
  it('dry-runs an edit to an existing DSL module cleanly (patch matches the real on-disk baseline)', () => {
    const currentSource = fs.readFileSync(guideHousePath, 'utf8');
    const editedSource = currentSource.replace('You catch your reflection.', 'You catch your own reflection.');
    const diff = createPatch('modules/tutorial-island-guide-house.md', currentSource, editedSource);

    const parsed = parseContributionIssue(dslIssueBody(diff));
    const result = upsertDslModules({ universeId: parsed.targetUniverseId, dslDiffText: parsed.dslDiffText, dryRun: true });

    expect(result.conflicts).toEqual([]);
    expect(result.moduleIds).toEqual(['tutorial-island-guide-house']);
    // dry-run: the real file on disk must be untouched.
    expect(fs.readFileSync(guideHousePath, 'utf8')).toBe(currentSource);
  });

  it('reports a conflict (without writing) when the file changed since the patch\'s baseline', () => {
    const staleBaseline = fs.readFileSync(guideHousePath, 'utf8').replace('miki', 'zzz-stale-baseline-zzz');
    const editedFromStaleBaseline = staleBaseline.replace('A guide with one eye on the door.', 'changed');
    const diff = createPatch('modules/tutorial-island-guide-house.md', staleBaseline, editedFromStaleBaseline);

    const parsed = parseContributionIssue(dslIssueBody(diff));
    const result = upsertDslModules({ universeId: parsed.targetUniverseId, dslDiffText: parsed.dslDiffText, dryRun: true });

    expect(result.moduleIds).toEqual([]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].path).toBe('modules/tutorial-island-guide-house.md');
  });

  it('upserts a brand-new module (writes the file for real, then cleans up) and registers it in universe.json', () => {
    expect(fs.existsSync(scratchModulePath)).toBe(false);
    const newModuleSource = '# info\nid: merge-issue-scratch-module\nversion: 1.0.0\nuniverse: base\nauthor: test\ngame_version: 1.0\n';
    const diff = createPatch('modules/merge-issue-scratch-module.md', '', newModuleSource);

    const parsed = parseContributionIssue(dslIssueBody(diff));
    // Restore the exact original bytes afterward — reconstructing via
    // JSON.parse/stringify would silently reformat unrelated parts of the
    // file (e.g. re-wrapping a compact `"locales": ["en"]` array).
    const originalManifestText = fs.readFileSync(manifestPath, 'utf8');
    try {
      const result = upsertDslModules({ universeId: parsed.targetUniverseId, dslDiffText: parsed.dslDiffText, dryRun: false });

      expect(result.conflicts).toEqual([]);
      expect(result.moduleIds).toEqual(['merge-issue-scratch-module']);
      expect(fs.readFileSync(scratchModulePath, 'utf8')).toBe(newModuleSource);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(manifest.modules).toContain('merge-issue-scratch-module');
    } finally {
      if (fs.existsSync(scratchModulePath)) fs.rmSync(scratchModulePath);
      fs.writeFileSync(manifestPath, originalManifestText);
    }
  });
});
