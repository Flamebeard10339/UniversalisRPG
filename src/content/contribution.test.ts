import { describe, expect, it } from 'vitest';
import { buildContributionIssueBody, extractContributionDsl, localModuleLoaded } from './contribution';
import { loadUniverseWithDiagnostics } from './registry';

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
`;

describe('contribution issue packaging', () => {
  it('builds an issue body with validation status and an extractable DSL block', () => {
    const validation = loadUniverseWithDiagnostics([
      { name: 'base', text: BASE },
      { name: 'local-changes', text: LOCAL },
    ]);

    expect(localModuleLoaded('local-changes', validation)).toBe(true);
    const body = buildContributionIssueBody({
      title: '[Content]: gem',
      notes: 'Adds a gem.',
      localModule: `\uFEFF${LOCAL}`,
      validation,
      contentFiles: ['content/base.dsl'],
    });

    expect(body).toContain('Adds a gem.');
    expect(body).toContain('Diagnostics: none');
    expect(extractContributionDsl(body)).toBe(LOCAL.trimEnd() + '\n');
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
