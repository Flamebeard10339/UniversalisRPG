import { describe, expect, it } from 'vitest';
import { buildContributionIssueBody, contributionBase, extractContributionDsl, localModuleLoaded } from './contribution';
import { loadUniverseWithDiagnostics } from './load';
import { FIXTURE_WORLD } from './worldFixture';

const BASE =
  `
# info base
version: 1.0.0
` + FIXTURE_WORLD;

const LOCAL = `
# info local-changes
version: 0.0.0
dependencies:
  base

# item gem
title: Gem
`;

describe('contribution issue packaging', () => {
  it('builds an issue body with validation status and an extractable DSL block', () => {
    const validation = loadUniverseWithDiagnostics([
      { name: 'base', text: BASE },
      { name: 'local-changes', text: LOCAL },
    ]);

    expect(localModuleLoaded('local-changes', validation)).toBe(true);
    const body = buildContributionIssueBody({
      notes: 'Adds a gem.',
      localModule: `\uFEFF${LOCAL}`,
      validation,
      contentFiles: ['content/base.dsl'],
    });

    expect(body).toContain('Adds a gem.');
    expect(body).toContain('Diagnostics: none');
    expect(extractContributionDsl(body)).toBe(LOCAL.trimEnd() + '\n');
  });

  it('takes the DSL under its own heading, not a fence a contributor put in their notes', () => {
    const validation = loadUniverseWithDiagnostics([
      { name: 'base', text: BASE },
      { name: 'local-changes', text: LOCAL },
    ]);
    const body = buildContributionIssueBody({
      notes: ['Replaces what used to read:', '```dsl', '# item gem', 'title: Rock', '```'].join('\n'),
      localModule: LOCAL,
      validation,
      contentFiles: ['content/base.dsl'],
    });

    expect(extractContributionDsl(body)).toBe(LOCAL.trimEnd() + '\n');
  });

  it('refuses to build a body whose notes carry the delimiter, before it is submitted', () => {
    const validation = loadUniverseWithDiagnostics([
      { name: 'base', text: BASE },
      { name: 'local-changes', text: LOCAL },
    ]);
    const build = (notes: string): string =>
      buildContributionIssueBody({
        notes,
        localModule: LOCAL,
        validation,
        contentFiles: ['content/base.dsl'],
      });

    expect(() => build(['## Local Changes DSL', '```dsl', '# item gem', 'title: NOT WHAT WAS VALIDATED', '```'].join('\n'))).toThrow(/notes cannot contain a Local Changes DSL heading/);
    expect(() => build('### local changes dsl')).toThrow(/notes cannot contain a Local Changes DSL heading/);
    expect(() => build(['Quoting the shape of it:', '```md', '## Local Changes DSL', '```'].join('\n'))).not.toThrow();
  });

  it('reads back the content files it recorded, so a maintainer knows the base', () => {
    const validation = loadUniverseWithDiagnostics([
      { name: 'base', text: BASE },
      { name: 'local-changes', text: LOCAL },
    ]);
    const body = buildContributionIssueBody({
      localModule: LOCAL,
      validation,
      contentFiles: ['content/base.dsl', 'content/extra.dsl'],
    });

    expect(contributionBase(body).contentFiles).toEqual(['content/base.dsl', 'content/extra.dsl']);
    expect(contributionBase(body).universe).toBeUndefined();
  });

  it('refuses a body with no delimiter rather than taking the first fence it finds', () => {
    const body = ['## Summary', 'Here is my module:', '```dsl', '# info local-changes', 'version: 0.0.0', '```'].join('\n');

    expect(() => extractContributionDsl(body)).toThrow(/no Local Changes DSL heading/);
  });

  it('reports a local module as not loaded when diagnostics disabled it', () => {
    const validation = loadUniverseWithDiagnostics([
      { name: 'base', text: BASE },
      { name: 'local-changes', text: '# item' },
    ]);

    expect(localModuleLoaded('local-changes', validation)).toBe(false);
  });

  it('requires the loaded local source to declare the managed module id', () => {
    const validation = loadUniverseWithDiagnostics([
      { name: 'base', text: BASE },
      { name: 'local-changes', text: '# info other\nversion: 1.0.0\n' },
    ]);

    expect(validation.diagnostics).toEqual([]);
    expect(localModuleLoaded('local-changes', validation)).toBe(false);
  });
});
