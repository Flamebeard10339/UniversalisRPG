// A GitHub contribution issue needs to be plug-and-play — a reviewer drops
// the file in and tests it directly. A diff alone isn't runnable without a
// merge step first, so each changed/new DSL module is embedded as its
// complete, self-contained source instead.
import { describe, expect, it } from 'vitest';
import { formatContributionIssueBody, formatDslModulesBlock } from './githubIssues';

describe('DSL module packaging', () => {
  it('embeds the full source of each module under its own path heading', () => {
    const block = formatDslModulesBlock([
      { path: 'modules/tutorial-island-guide-house.md', source: '# info\nid: tutorial-island-guide-house\n' },
    ]);
    expect(block).toContain('### modules/tutorial-island-guide-house.md');
    expect(block).toContain('```md');
    expect(block).toContain('# info\nid: tutorial-island-guide-house\n');
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

  it('never includes a Changed JSON section (retired in favor of full DSL source)', () => {
    const body = formatContributionIssueBody({
      appVersion: '1.0.0', targetUniverseId: 'base', notes: '', validationIssues: [],
      dslModules: [{ path: 'modules/x.md', source: 'b\n' }],
    });
    expect(body).not.toContain('Changed JSON');
    expect(body).not.toContain('```json');
  });
});
