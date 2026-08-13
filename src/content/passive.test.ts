import { describe, expect, it } from 'vitest';
import { loadModule } from './registry';
import { passiveRangeProblem } from './passive';

// c1: # passive is a section kind, its body the same tag-clause list # item
// already uses.
describe('# passive', () => {
  it('reads bare tags and stat-bonus payloads in one comma list', () => {
    const registry = loadModule('# stat max-health\n\n# passive hale\ntitle: Hale\nlife, +15 max-health');
    const passive = registry.passives.get('hale')!;
    expect(passive.title).toBe('Hale');
    expect(passive.tags).toEqual([
      { kind: 'keyword', value: 'life' },
      { kind: 'stat-bonus', statId: 'max-health', percent: false, amount: { min: 15, max: 15 } },
    ]);
  });

  it('defaults its title from its id, the way every other section does', () => {
    const registry = loadModule('# passive fortune');
    expect(registry.passives.get('fortune')!.title).toBe('Fortune');
  });

  it('is named from the global id space, so any number of cluster jewels can reference it', () => {
    const source = [
      '# stat max-health',
      '# passive hale',
      '# cluster-jewel a',
      'shape: spindle',
      'open-connections: e',
      'passives: 1 hale',
      '# cluster-jewel b',
      'shape: spindle',
      'open-connections: ne',
      'passives: 1 hale',
    ].join('\n');
    const registry = loadModule(source);
    expect(registry.clusterJewels.get('a')!.positions).toEqual({ 1: 'hale' });
    expect(registry.clusterJewels.get('b')!.positions).toEqual({ 1: 'hale' });
  });
});

// c2: a passive's payload may not be a range. tagClause produces a Range for
// every +N stat, and it is the # passive schema's job to refuse it.
describe('# passive refuses a range payload', () => {
  it('rejects +5-8 accuracy, naming the clause it rejected', () => {
    expect(() => loadModule('# stat accuracy\n\n# passive risky\n+5-8 accuracy')).toThrow(/\+5-8 accuracy is a range/);
  });

  it('accepts the fixed payload a range was written as a typo of', () => {
    expect(() => loadModule('# stat accuracy\n\n# passive steady\n+5 accuracy')).not.toThrow();
  });

  it('still refuses a percent range, which tagClause itself already catches', () => {
    expect(() => loadModule('# stat accuracy\n\n# passive risky\n+5-8% accuracy')).toThrow(/a percent stat bonus cannot be a range/);
  });
});

describe('passiveRangeProblem', () => {
  it('finds nothing wrong with a passive whose payloads are all fixed', () => {
    const problem = passiveRangeProblem({ id: 'hale', title: 'Hale', tags: [{ kind: 'stat-bonus', statId: 'max-health', percent: false, amount: { min: 15, max: 15 } }] });
    expect(problem).toBeUndefined();
  });

  it('names the statId and the range when a payload is not fixed', () => {
    const problem = passiveRangeProblem({ id: 'risky', title: 'Risky', tags: [{ kind: 'stat-bonus', statId: 'accuracy', percent: false, amount: { min: 5, max: 8 } }] });
    expect(problem).toMatch(/\+5-8 accuracy is a range/);
  });
});
