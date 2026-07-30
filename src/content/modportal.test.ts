import { describe, expect, it } from 'vitest';
import { buildContributionIssueBody } from './contribution';
import { loadUniverseWithDiagnostics } from './registry';
import { emptyModportalManifest, issueTier, materializeApprovedModIssue, planModportalSync } from './modportal';
import type { MaterializedMod, ModportalManifest, ModTier } from './modportal';

const BASE = `
# info base
version: 1.0.0

# item rock
title: Rock

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

const base = [{ name: 'base', text: BASE }];

function issueBody(localModule: string): string {
  const validation = loadUniverseWithDiagnostics([
    { name: 'base', text: BASE },
    { name: 'local-changes', text: localModule },
  ]);
  return buildContributionIssueBody({ title: '[Content]: gem', notes: 'Adds a gem.', localModule, validation, contentFiles: ['content/base.dsl'] });
}

function mod(issue: number, tier: ModTier, body: string): MaterializedMod {
  const moduleId = `approved-mod-${issue}`;
  return {
    issue,
    title: `Mod ${issue}`,
    tier,
    base: { universe: 'base', contentFiles: [] },
    moduleId,
    file: `${issue}-${moduleId}.dsl`,
    text: `# info ${moduleId}\nversion: 0.0.0\ndependencies:\n  base\n\n${body}`,
  };
}

const gem = (issue: number, tier: ModTier): MaterializedMod => mod(issue, tier, '# item gem\ntitle: Gem\n');
const broken = (issue: number, tier: ModTier): MaterializedMod => mod(issue, tier, '# entity gull\ntitle: Gull\npeck:\n  give: no-such-item\n');
const startsHere = (issue: number, tier: ModTier): MaterializedMod => mod(issue, tier, `# location home-${issue}\nx: ${issue}, y: 0\nstarting\n`);

function plan(materialized: readonly MaterializedMod[], intent: Record<string, boolean> = {}, over = base): ModportalManifest {
  return planModportalSync({ existing: { ...emptyModportalManifest(), intent }, materialized, base: over, syncedAt: '2026-07-29T00:00:00.000Z' });
}

function enablement(manifest: ModportalManifest): Record<number, boolean> {
  return Object.fromEntries(manifest.entries.map((entry) => [entry.issue, entry.enabled]));
}

describe('approved mod issues', () => {
  it('turns a local-changes contribution into a unique issue module', () => {
    const materialized = materializeApprovedModIssue({ number: 42, title: 'Gem mod', body: issueBody(LOCAL), url: 'https://example.test/42' });

    expect(materialized.moduleId).toBe('approved-mod-42');
    expect(materialized.file).toBe('42-approved-mod-42.dsl');
    expect(materialized.text).toContain('# info approved-mod-42');
    expect(materialized.text).toContain('+2 approved-mod-42.vigor');
    expect(materialized.text).not.toContain('# info local-changes');
    expect(materialized.text).not.toContain('local-changes.vigor');
  });

  it('preserves a custom module id from an approved issue', () => {
    const custom = LOCAL.replace('# info local-changes', '# info gem-pack').replace(/local-changes\./g, 'gem-pack.');
    const materialized = materializeApprovedModIssue({ number: 7, title: 'Gem pack', body: issueBody(custom) });

    expect(materialized.moduleId).toBe('gem-pack');
    expect(materialized.file).toBe('7-gem-pack.dsl');
    expect(materialized.text).toContain('# info gem-pack');
  });

  it('refuses an issue whose declared target universe its module does not depend on', () => {
    const targeting = (universe: string): string => `### Target universe\n\n${universe}\n\n### Local changes DSL\n\n\`\`\`dsl\n${LOCAL.trim()}\n\`\`\`\n`;

    expect(materializeApprovedModIssue({ number: 8, title: 'Gem', body: targeting('base') }).base.universe).toBe('base');
    expect(() => materializeApprovedModIssue({ number: 8, title: 'Gem', body: targeting('some-other-universe') })).toThrow(
      /targets universe some-other-universe, which its module does not declare a dependency on \(it declares base\)/,
    );
  });

  it('reads the activation tier from the issue labels, taking the stronger channel', () => {
    expect(issueTier({ number: 1, title: 'One', labels: [{ name: 'mod-approved' }] })).toBe('approved');
    expect(issueTier({ number: 1, title: 'One', labels: [{ name: 'mod-auto-enabled' }] })).toBe('auto-enabled');
    expect(issueTier({ number: 1, title: 'One', labels: [{ name: 'mod-approved' }, { name: 'mod-auto-enabled' }] })).toBe('auto-enabled');
    expect(issueTier({ number: 1, title: 'One', labels: [{ name: 'content' }] })).toBe('approved');
    expect(issueTier({ number: 1, title: 'One' })).toBe('approved');
  });

  it('keeps the generated module id off the label, so promoting a mod does not rename it', () => {
    const body = issueBody(LOCAL);
    const approved = materializeApprovedModIssue({ number: 42, title: 'Gem mod', body, labels: [{ name: 'mod-approved' }] });
    const promoted = materializeApprovedModIssue({ number: 42, title: 'Gem mod', body, labels: [{ name: 'mod-auto-enabled' }] });

    expect(promoted.tier).toBe('auto-enabled');
    expect(promoted.moduleId).toBe(approved.moduleId);
    expect(promoted.file).toBe(approved.file);
    expect(promoted.text).toBe(approved.text);
  });
});

describe('modportal sync plan', () => {
  it('lists an approved mod switched off and enables only the auto-enabled tier', () => {
    const manifest = plan([gem(3, 'approved'), gem(4, 'auto-enabled')]);

    expect(enablement(manifest)).toEqual({ 3: false, 4: true });
    expect(manifest.entries.map((entry) => entry.diagnostics)).toEqual([undefined, undefined]);
  });

  it('records a mod that does not load switched off with its diagnostic, without withholding the rest', () => {
    const manifest = plan([broken(4, 'auto-enabled'), gem(9, 'auto-enabled')]);

    expect(enablement(manifest)).toEqual({ 4: false, 9: true });
    expect(manifest.entries[0].diagnostics?.[0]).toContain('names an unknown item: no-such-item');
    expect(manifest.entries[1].diagnostics).toBeUndefined();
  });

  it('lets stored intent override the tier default in both directions', () => {
    const manifest = plan([gem(3, 'approved'), gem(4, 'auto-enabled')], { 3: true, 4: false });

    expect(enablement(manifest)).toEqual({ 3: true, 4: false });
  });

  it('keeps intent for an issue that left the labelled set, so re-labelling does not resurrect it', () => {
    const disabled = plan([gem(3, 'auto-enabled')], { 3: false });
    const unlabelled = planModportalSync({ existing: disabled, materialized: [], base, syncedAt: '2026-07-29T00:01:00.000Z' });
    const relabelled = planModportalSync({ existing: unlabelled, materialized: [gem(3, 'auto-enabled')], base, syncedAt: '2026-07-29T00:02:00.000Z' });

    expect(unlabelled.entries).toEqual([]);
    expect(unlabelled.intent).toEqual({ 3: false });
    expect(enablement(relabelled)).toEqual({ 3: false });
  });

  it('admits an explicitly enabled mod ahead of one that is only on by default', () => {
    // Two mods that each want to own where a new game begins: either loads over
    // a start-less base, neither loads with the other, so which one is admitted
    // is a policy choice rather than an accident of ordering.
    const rival = [startsHere(2, 'auto-enabled'), startsHere(8, 'auto-enabled')];
    const startless = [{ name: 'base', text: BASE.replace('starting\n', '') }];
    const byDefault = plan(rival, {}, startless);
    const chosen = plan(rival, { 8: true }, startless);

    expect(enablement(byDefault)).toEqual({ 2: true, 8: false });
    expect(enablement(chosen)).toEqual({ 2: false, 8: true });
    expect(byDefault.entries[1].diagnostics?.[0]).toContain('a new game begins in exactly one place');
    expect(chosen.entries[0].diagnostics?.[0]).toContain('a new game begins in exactly one place');
  });
});
