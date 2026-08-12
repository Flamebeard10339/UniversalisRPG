import { describe, expect, it } from 'vitest';
import { loadModule } from './registry';

const JEWEL = ['# stat max-health', '# passive hale', '# cluster-jewel keen-edge', 'shape: point', 'open-connections: e', 'passives: 1 hale'].join('\n');

// c10: a cluster jewel reaches the player as an ordinary item, named through
// cluster-jewel:, and an unknown declaration is a load-time reference error
// like every other reference in the language.
describe('# item cluster-jewel:', () => {
  it('names a # cluster-jewel to become the droppable jewel', () => {
    const registry = loadModule([JEWEL, '# item keen-edge-jewel', 'cluster-jewel: keen-edge'].join('\n'));
    expect(registry.items.get('keen-edge-jewel')!.clusterJewel).toBe('keen-edge');
  });

  it('rejects a cluster-jewel: naming an unknown declaration', () => {
    expect(() => loadModule([JEWEL, '# item keen-edge-jewel', 'cluster-jewel: nope'].join('\n'))).toThrow(/# item keen-edge-jewel cluster-jewel: names an unknown cluster-jewel: nope/);
  });

  it('is optional: an ordinary item declares no cluster-jewel: at all', () => {
    const registry = loadModule('# item straw');
    expect(registry.items.get('straw')!.clusterJewel).toBeUndefined();
  });
});

describe('# item cluster-effect:', () => {
  it('reads a percent and a stat', () => {
    const registry = loadModule('# stat max-health\n\n# item orb-of-vitality\ncluster-effect: +25% max-health');
    expect(registry.items.get('orb-of-vitality')!.clusterEffect).toEqual({ statId: 'max-health', percent: 25 });
  });

  it('rejects a flat amount, since a cluster effect is a percentage by grammar', () => {
    expect(() => loadModule('# stat max-health\n\n# item orb-of-vitality\ncluster-effect: +25 max-health')).toThrow(/expected a percent stat bonus/);
  });

  it('rejects a stat that does not resolve', () => {
    expect(() => loadModule('# item orb\ncluster-effect: +25% nope')).toThrow(/# item orb cluster-effect: names an unknown stat: nope/);
  });
});

describe('# item item-experience: and max-level:', () => {
  it('reads item-experience: as a flat grant', () => {
    const registry = loadModule('# item whetstone\nitem-experience: 1000');
    expect(registry.items.get('whetstone')!.itemExperience).toBe(1000);
  });

  it('defaults max-level: to 99, and reads an explicit lower ceiling', () => {
    const registry = loadModule('# item iron-sword\nmax-level: 10\n\n# item heartwood-blade');
    expect(registry.items.get('iron-sword')!.maxLevel).toBe(10);
    expect(registry.items.get('heartwood-blade')!.maxLevel).toBe(99);
  });
});
