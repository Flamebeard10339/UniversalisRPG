import { describe, expect, it } from 'vitest';
import { addPackagedMods, mergeIntoExistingMod, parseContributionIssue } from './merge-contribution-issue.mjs';

const issueBody = `## Target universe
base

## Notes
First test of github issue. This mod only changes the positions of existing locations.

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
            "objectType": "locations",
            "objectId": "emberwood",
            "ops": [
              {
                "op": "replace",
                "path": "/position/x",
                "value": 200
              },
              {
                "op": "replace",
                "path": "/position/y",
                "value": 80
              }
            ]
          },
          {
            "targetModId": "base-core",
            "objectType": "locations",
            "objectId": "old-quarry",
            "ops": [
              {
                "op": "replace",
                "path": "/position/x",
                "value": 200
              },
              {
                "op": "replace",
                "path": "/position/y",
                "value": 184
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
    expect(result.writes[1].json.modules).toEqual(expect.arrayContaining(['base-core', 'wayside-supplies', 'local-contributions']));
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
    const emberwood = mergedModule.data.find((entry) => entry.type === 'location' && entry.id === 'emberwood');
    const oldQuarry = mergedModule.data.find((entry) => entry.type === 'location' && entry.id === 'old-quarry');

    expect(result.applied).toBe(2);
    expect(emberwood.position).toEqual({ x: 200, y: 80 });
    expect(oldQuarry.position).toEqual({ x: 200, y: 184 });
  });
});
