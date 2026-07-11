// A contribution is always a small, self-contained new module (edits to
// existing content go through `# patch <targetModuleId>`, never a direct
// edit to the target's own file — see docs/content-dsl-grammar.md) — so
// there's never a large "before" to diff against, and the GitHub issue
// embeds each changed/new module's complete source directly: concise by
// construction, and plug-and-play (no merge step needed to test it).
import { describe, expect, it } from 'vitest';
import { createPrefilledIssueUrl, formatContributionIssueBody, formatDslModulesBlock } from './githubIssues';

describe('DSL module packaging', () => {
  it('embeds the full source of each module under its own path heading', () => {
    const block = formatDslModulesBlock([
      { path: 'modules/tutorial-island-guide-house-mod.md', source: '# info\nid: tutorial-island-guide-house-mod\n' },
    ]);
    expect(block).toContain('### modules/tutorial-island-guide-house-mod.md');
    expect(block).toContain('```md');
    expect(block).toContain('# info\nid: tutorial-island-guide-house-mod\n');
  });

  it('packages multiple changed modules as separate, individually headed blocks', () => {
    const block = formatDslModulesBlock([
      { path: 'modules/a.md', source: 'a1\na2 changed\n' },
      { path: 'modules/b.md', source: 'b1 changed\nb2\n' },
    ]);
    expect(block.match(/^### /gm)).toHaveLength(2);
    expect(block).toContain('### modules/a.md');
    expect(block).toContain('### modules/b.md');
    expect(block).toContain('a1\na2 changed');
    expect(block).toContain('b1 changed\nb2');
  });

  it('omits the DSL section entirely when there are no DSL changes, and includes it when there are', () => {
    const withoutDsl = formatContributionIssueBody({
      appVersion: '1.0.0', targetUniverseId: 'base', notes: '', validationIssues: [],
    });
    expect(withoutDsl).not.toContain('github.changedDslModules');

    const withDsl = formatContributionIssueBody({
      appVersion: '1.0.0', targetUniverseId: 'base', notes: '', validationIssues: [],
      dslModules: [{ path: 'modules/x.md', source: 'b\n' }],
    });
    expect(withDsl).toContain('github.changedDslModules');
    expect(withDsl).toContain('### modules/x.md');
    expect(withDsl).toContain('```md');
  });

  it('never includes a Changed JSON section or a diff of the target module', () => {
    const body = formatContributionIssueBody({
      appVersion: '1.0.0', targetUniverseId: 'base', notes: '', validationIssues: [],
      dslModules: [{ path: 'modules/x.md', source: 'b\n' }],
    });
    expect(body).not.toContain('Changed JSON');
    expect(body).not.toContain('```json');
    expect(body).not.toContain('```diff');
  });
});

describe('createPrefilledIssueUrl', () => {
  it('never puts the body in the URL — GitHub silently rejects issues/new URLs beyond a modest length', () => {
    const url = createPrefilledIssueUrl({
      appVersion: '1.0.0', targetUniverseId: 'base', notes: '', validationIssues: [],
      dslModules: [{ path: 'modules/x.md', source: 'x'.repeat(10_000) }],
    });
    expect(url).not.toContain('body=');
    expect(url.length).toBeLessThan(500);
  });
});
