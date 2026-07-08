// A one-line fix in a large DSL module must produce a small, reviewable
// diff in the GitHub issue — not the whole file. This is the whole point of
// packaging DSL changes as unified diffs (see the DSL mod editor plan)
// instead of raw file concatenation.
import { applyPatch, parsePatch } from 'diff';
import { describe, expect, it } from 'vitest';
import { formatContributionIssueBody, formatDslModulesDiffBlock } from './githubIssues';

const bigFileWithTypo = Array.from({ length: 200 }, (_, index) => `line ${index}`)
  .map((line, index) => (index === 150 ? 'take coins: give: gold 5, say: You tkae the coins.' : line))
  .join('\n');
const bigFileFixed = bigFileWithTypo.replace('You tkae the coins.', 'You take the coins.');

describe('DSL module diff packaging', () => {
  it('produces a diff far smaller than the whole file for a one-line change', () => {
    const diff = formatDslModulesDiffBlock([{ path: 'modules/tutorial-island-guide-house.md', baselineSource: bigFileWithTypo, source: bigFileFixed }]);
    expect(diff.length).toBeLessThan(bigFileWithTypo.length / 4);
    expect(diff).toContain('-take coins: give: gold 5, say: You tkae the coins.');
    expect(diff).toContain('+take coins: give: gold 5, say: You take the coins.');
    // Untouched lines far from the change shouldn't appear in the diff at all.
    expect(diff).not.toContain('line 0\n');
    expect(diff).not.toContain('line 199');
  });

  it('round-trips through parsePatch/applyPatch (what the merge script does)', () => {
    const diff = formatDslModulesDiffBlock([{ path: 'modules/x.md', baselineSource: bigFileWithTypo, source: bigFileFixed }]);
    const [patch] = parsePatch(diff);
    const applied = applyPatch(bigFileWithTypo, patch);
    expect(applied).toBe(bigFileFixed);
  });

  it('detects a conflict when the on-disk file has moved since the baseline', () => {
    const diff = formatDslModulesDiffBlock([{ path: 'modules/x.md', baselineSource: bigFileWithTypo, source: bigFileFixed }]);
    const [patch] = parsePatch(diff);
    const divergedOnDisk = bigFileWithTypo.replace('line 149', 'line 149 (someone else edited this)');
    expect(applyPatch(divergedOnDisk, patch)).toBe(false);
  });

  it('packages multiple changed modules into one concatenated diff block, split back out by parsePatch', () => {
    const diff = formatDslModulesDiffBlock([
      { path: 'modules/a.md', baselineSource: 'a1\na2\n', source: 'a1\na2 changed\n' },
      { path: 'modules/b.md', baselineSource: 'b1\nb2\n', source: 'b1 changed\nb2\n' },
    ]);
    const patches = parsePatch(diff);
    expect(patches).toHaveLength(2);
    expect(patches.map((patch) => patch.oldFileName)).toEqual(['modules/a.md', 'modules/b.md']);
  });

  it('omits the DSL section entirely when there are no DSL changes, and includes it when there are', () => {
    const withoutDsl = formatContributionIssueBody({
      appVersion: '1.0.0', targetUniverseId: 'base', notes: '', validationIssues: [], changedFiles: [],
    });
    expect(withoutDsl).not.toContain('github.changedDslModules');

    const withDsl = formatContributionIssueBody({
      appVersion: '1.0.0', targetUniverseId: 'base', notes: '', validationIssues: [], changedFiles: [],
      dslModules: [{ path: 'modules/x.md', baselineSource: 'a\n', source: 'b\n' }],
    });
    expect(withDsl).toContain('github.changedDslModules');
    expect(withDsl).toContain('```diff');
  });
});
