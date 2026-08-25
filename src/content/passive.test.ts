import { describe, expect, it } from 'vitest';
import { loadModule } from './load';

describe('# passive', () => {
  it('reads bare tags and stat-bonus payloads in one comma list', () => {
    const registry = loadModule('# stat max-health\n\n# passive hale\ntitle: Hale\nlife, +15 max-health');
    const passive = registry.passives.get('hale')!;
    expect(passive.title).toBe('Hale');
    expect(passive.tags).toEqual([
      { kind: 'keyword', value: 'life' },
      {
        kind: 'stat-bonus',
        statId: 'max-health',
        percent: false,
        amount: { min: 15, max: 15 },
      },
    ]);
  });

  it('defaults its title from its id, the way every other section does', () => {
    const registry = loadModule('# passive fortune');
    expect(registry.passives.get('fortune')!.title).toBe('Fortune');
  });

  it('is named from the global id space, so any number of cluster jewels can reference it', () => {
    const source = ['# stat max-health', '# passive hale', '# cluster-jewel a', 'shape: spindle', 'open-connections: e', 'passives: 1 hale', '# cluster-jewel b', 'shape: spindle', 'open-connections: ne', 'passives: 1 hale'].join('\n');
    const registry = loadModule(source);
    expect(registry.clusterJewels.get('a')!.positions).toEqual({ 1: 'hale' });
    expect(registry.clusterJewels.get('b')!.positions).toEqual({ 1: 'hale' });
  });
});

describe('# passive carries the hook blocks a character modifier carries', () => {
  const SOURCE = `
# stat attack

# stat max-health

# resource health
max: max-health

# item venom
-2 attack, 8s

# passive envenom
poison
on hit:
  1 in 4: inflict: venom on them

# passive retribution
when hit: drain: 3 health from them
`;

  it('reads both blocks, and the party phrase inside them', () => {
    const registry = loadModule(SOURCE);
    expect(registry.passives.get('envenom')!.onHit).toEqual([
      {
        kind: 'chance',
        numerator: 1,
        denominator: 4,
        results: [{ kind: 'inflict', buff: 'venom', party: 'them' }],
      },
    ]);
    expect(registry.passives.get('retribution')!.whenHit).toEqual([
      {
        kind: 'pool',
        resource: 'health',
        delta: { min: -3, max: -3 },
        party: 'them',
      },
    ]);
  });

  it('is empty rather than absent where a passive writes neither, so a reload returns what an edit emptied', () => {
    const passive = loadModule('# passive plain').passives.get('plain')!;
    expect(passive.onHit).toEqual([]);
    expect(passive.whenHit).toEqual([]);
  });

  it('refuses a party phrase in a list no moment identifies a second party for', () => {
    const table = `
# stat max-health

# resource health
max: max-health

# droptable spite
drain: 3 health from them
`;
    expect(() => loadModule(table)).toThrow(/names one of two parties/);
  });
});

const RISKY = '# stat accuracy\n\n# passive risky\n+5-8 accuracy';

describe('# passive takes a range payload, which the cluster carrying it rolls', () => {
  it('reads +5-8 accuracy as the range it is', () => {
    const registry = loadModule(RISKY);
    expect(registry.passives.get('risky')!.tags).toEqual([{ kind: 'stat-bonus', statId: 'accuracy', percent: false, amount: { min: 5, max: 8 } }]);
  });

  it('still refuses a percent range, which tagClause itself already catches', () => {
    expect(() => loadModule(RISKY.replace('+5-8', '+5-8%'))).toThrow(/a percent stat bonus cannot be a range/);
  });
});
