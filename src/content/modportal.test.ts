import { describe, expect, it } from 'vitest';
import { buildContributionIssueBody } from './contribution';
import { loadUniverseWithDiagnostics } from './registry';
import { emptyModportalManifest, materializeApprovedModIssue, upsertModportalEntries } from './modportal';

const BASE = `
# info base
version: 1.0.0

# location camp
x: 0, y: 0
starting
`;

const LOCAL = `
# info local-changes
version: 0.0.0
dependencies:
  base

# item gem
title: Gem

# stat vigor

# item snack
food, +2 local-changes.vigor
`;

function issueBody(localModule: string): string {
  const validation = loadUniverseWithDiagnostics([
    { name: 'base', text: BASE },
    { name: 'local-changes', text: localModule },
  ]);
  return buildContributionIssueBody({ title: '[Content]: gem', notes: 'Adds a gem.', localModule, validation, contentFiles: ['content/base.dsl'] });
}

describe('approved mod issues', () => {
  it('turns a local-changes contribution into a unique issue module', () => {
    const mod = materializeApprovedModIssue({ number: 42, title: 'Gem mod', body: issueBody(LOCAL), url: 'https://example.test/42' });

    expect(mod.moduleId).toBe('approved-mod-42');
    expect(mod.file).toBe('42-approved-mod-42.dsl');
    expect(mod.text).toContain('# info approved-mod-42');
    expect(mod.text).toContain('+2 approved-mod-42.vigor');
    expect(mod.text).not.toContain('# info local-changes');
    expect(mod.text).not.toContain('local-changes.vigor');
  });

  it('preserves a custom module id from an approved issue', () => {
    const custom = LOCAL.replace('# info local-changes', '# info gem-pack').replace(/local-changes\./g, 'gem-pack.');
    const mod = materializeApprovedModIssue({ number: 7, title: 'Gem pack', body: issueBody(custom) });

    expect(mod.moduleId).toBe('gem-pack');
    expect(mod.file).toBe('7-gem-pack.dsl');
    expect(mod.text).toContain('# info gem-pack');
  });

  it('preserves local enablement when a synced issue updates', () => {
    const existing = {
      ...emptyModportalManifest(),
      entries: [{ issue: 42, title: 'Old', moduleId: 'approved-mod-42', file: '42-approved-mod-42.dsl', enabled: false }],
    };
    const next = upsertModportalEntries(
      existing,
      [{ issue: 42, title: 'New', moduleId: 'approved-mod-42', file: '42-approved-mod-42.dsl', text: LOCAL }],
      '2026-07-29T00:00:00.000Z',
    );

    expect(next.entries).toEqual([{ issue: 42, title: 'New', moduleId: 'approved-mod-42', file: '42-approved-mod-42.dsl', enabled: false }]);
  });
});
