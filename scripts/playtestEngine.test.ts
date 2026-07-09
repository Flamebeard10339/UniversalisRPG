import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadStagedBundle, readModule } from './playtestEngine';

const realModulesDir = path.join(import.meta.dirname, '..', 'public', 'content', 'universes', 'base', 'modules');

describe('playtestEngine readModule', () => {
  it('falls back to compiling DSL markdown when no .json module exists (real shipped content is .md now)', () => {
    const module = readModule([realModulesDir], 'tutorial-island-guide-house');
    expect(module.id).toBe('tutorial-island-guide-house');
    expect((module.data as { locations: unknown[] }).locations.length).toBeGreaterThan(0);
  });

  it('still prefers a .json module over a same-named .md file when both exist', () => {
    const module = readModule([realModulesDir], 'base-core');
    expect(module.id).toBe('base-core');
  });

  it('throws a clear error when a module exists in neither format', () => {
    expect(() => readModule([realModulesDir], 'does-not-exist')).toThrow(/not found/);
  });
});

describe('playtestEngine loadStagedBundle against real shipped content', () => {
  it('resolves the full tutorial-island module set with zero errors', () => {
    const moduleIds = [
      'base-core',
      'tutorial-island-foundation',
      'tutorial-island-guide-house',
      'tutorial-island-survival',
      'tutorial-island-bank',
      'tutorial-island-mining',
      'tutorial-island-combat',
    ];
    const { bundle, issues } = loadStagedBundle([realModulesDir], moduleIds);
    const errors = issues.filter((issue) => issue.severity === 'error');
    expect(errors).toEqual([]);
    expect(bundle.locations.some((location) => location.id === 'tutorial-guide-house')).toBe(true);
  });
});
