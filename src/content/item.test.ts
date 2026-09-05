import { describe, expect, it } from 'vitest';
import { loadModule, loadUniverse, loadUniverseWithDiagnostics } from './load';
import { roundTripModule } from './serialize';
import { DEFAULT_MOD_SLOTS } from './sections/clusterJewel';
import { isBase } from './sections/item';

const JEWEL = ['# stat max-health', '# passive hale', '# cluster-jewel keen-edge', 'shape: point', 'open-connections: e', 'passives: 1 hale'].join('\n');

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

describe('# item cluster-jewel: written as a block', () => {
  const PASSIVES = ['# stat max-health', '# passive hale', '# passive mending'].join('\n');
  const carrying = (...lines: string[]) => [PASSIVES, '# item quiet-hour-jewel', 'title: Quiet Hour', 'examine: An hour nobody asked after.', ...lines].join('\n');
  const QUIET_HOUR = carrying('cluster-jewel:', '  shape: spindle', '  open-connections: e', '  passives: 1 hale, 3 mending');
  const jewelIn = (source: string) => loadModule(source).clusterJewels.get('quiet-hour-jewel')!;

  it('declares the jewel at the item, so nothing has to name it and the item is that jewel', () => {
    const registry = loadModule(QUIET_HOUR);
    expect(registry.items.get('quiet-hour-jewel')!.clusterJewel).toBe('quiet-hour-jewel');
    expect(registry.clusterJewels.get('quiet-hour-jewel')!.positions).toEqual([
      [1, 'hale'],
      [3, 'mending'],
    ]);
  });

  it('is hydrated like a section of its own, defaults and all', () => {
    expect(jewelIn(QUIET_HOUR).modSlots).toBe(DEFAULT_MOD_SLOTS);
    expect(jewelIn(carrying('cluster-jewel:', '  shape: spindle', '  open-connections: e', '  mod-slots: 4')).modSlots).toBe(4);
  });

  it('says the words of the item carrying it, having none of its own to say', () => {
    const jewel = jewelIn(QUIET_HOUR);
    expect(jewel.title).toBe('Quiet Hour');
    expect(jewel.examine).toBe('An hour nobody asked after.');
  });

  it('refuses words written inside it, since the item is where they are written', () => {
    expect(() => loadModule(carrying('cluster-jewel:', '  title: Quieter Hour', '  shape: spindle', '  open-connections: e'))).toThrow(/title: is the item's, and a cluster-jewel written under one says what the item says/);
    expect(() => loadModule(carrying('cluster-jewel:', '  examine: A quieter hour.', '  shape: spindle', '  open-connections: e'))).toThrow(/examine: is the item's/);
  });

  it('is refused for what a section of its own would be refused for, named as the item', () => {
    expect(() => loadModule(carrying('cluster-jewel:', '  shape: spindle', '  open-connections: e', '  passives: 9 hale'))).toThrow(/# cluster-jewel quiet-hour-jewel: passives: position 9 is outside spindle's 1-3 range/);
    expect(() => loadModule(carrying('cluster-jewel:', '  shape: spindle', '  open-connections: e', '  passives: 1 nope'))).toThrow(/# item quiet-hour-jewel cluster-jewel: passives: names an unknown passive: nope/);
  });

  it('refuses a # cluster-jewel written at the same id, which would be two bodies under one name', () => {
    const written = ['# cluster-jewel quiet-hour-jewel', 'shape: point', 'open-connections: e'].join('\n');
    expect(() => loadModule([QUIET_HOUR, written].join('\n'))).toThrow(/# cluster-jewel quiet-hour-jewel is already minted by # item quiet-hour-jewel/);
    expect(() => loadModule([written, QUIET_HOUR].join('\n'))).toThrow(/# cluster-jewel quiet-hour-jewel is already minted by # item quiet-hour-jewel/);
  });

  it('prints back as the block it was written as, beside an item that names one instead', () => {
    const text = ['# info jewels', 'version: 1.0.0', '', PASSIVES, '', '# cluster-jewel keen-edge', 'shape: point', 'open-connections: e', '', '# item keen-edge-jewel', 'cluster-jewel: keen-edge', '', '# item quiet-hour-jewel', 'title: Quiet Hour', 'cluster-jewel:', '  shape: spindle', '  open-connections: e', '  passives: 1 hale, 3 mending'].join('\n');
    const trip = roundTripModule(loadUniverse([{ name: 'jewels', text }]), { info: { id: 'jewels', version: [1, 0, 0] } }, (again) => loadUniverseWithDiagnostics([{ name: 'jewels', text: again }]));

    expect(trip.diagnostics.map((each) => each.message)).toEqual([]);
    expect(trip.differences).toEqual([]);
    expect(trip.printed).toContain(['cluster-jewel:', '  shape: spindle', '  open-connections: e', '  passives: 1 jewels.hale, 3 jewels.mending'].join('\n'));
    expect(trip.printed).toContain('cluster-jewel: jewels.keen-edge\n');
  });
});

describe('# item origin-cluster:', () => {
  const SWORD = ['# item heartwood-blade', 'slot: mainhand', 'item-level: 3-8'].join('\n');

  it('names the # cluster-jewel standing at hex (0,0) of the base plane', () => {
    const registry = loadModule([JEWEL, SWORD, 'origin-cluster: keen-edge'].join('\n'));
    expect(registry.items.get('heartwood-blade')!.originCluster).toBe('keen-edge');
    expect(registry.items.get('heartwood-blade')!.clusterJewel).toBeUndefined();
  });

  it('rejects an origin-cluster: naming an unknown declaration', () => {
    expect(() => loadModule([JEWEL, SWORD, 'origin-cluster: nope'].join('\n'))).toThrow(/# item heartwood-blade origin-cluster: names an unknown cluster-jewel: nope/);
  });

  it('refuses an item declaring both, because one item cannot be a jewel and have a plane', () => {
    expect(() => loadModule([JEWEL, '# item oddity', 'origin-cluster: keen-edge', 'cluster-jewel: keen-edge'].join('\n'))).toThrow(/# item oddity: cluster-jewel: makes oddity a jewel, which is exclusive with the origin-cluster:/);
    expect(() => loadModule([JEWEL, SWORD, 'origin-cluster: keen-edge', 'cluster-jewel: keen-edge'].join('\n'))).toThrow(/# item heartwood-blade: cluster-jewel: makes heartwood-blade a jewel/);
  });

  it('refuses a jewel that is also a base, since a base is spelled item-level: and a base carries a plane', () => {
    expect(() => loadModule([JEWEL, '# item keen-edge-jewel', 'slot: mainhand', 'item-level: 3-8', 'cluster-jewel: keen-edge'].join('\n'))).toThrow(/# item keen-edge-jewel: cluster-jewel: makes keen-edge-jewel a jewel, which is exclusive with the item-level:/);
  });

  it('refuses an origin-cluster: on an item that declares no level, because only a base has a plane', () => {
    expect(() => loadModule([JEWEL, '# item ration', 'origin-cluster: keen-edge'].join('\n'))).toThrow(/# item ration: origin-cluster: is the cluster hex \(0,0\) of ration's plane, and only a base has one: give it an item-level:/);
  });
});

describe('# item cluster-effect:', () => {
  it('reads a percent and a stat', () => {
    const registry = loadModule('# stat max-health\n\n# item orb-of-vitality\ncluster-effect: +25% max-health');
    expect(registry.items.get('orb-of-vitality')!.clusterEffect).toEqual({
      statId: 'max-health',
      percent: 25,
    });
  });

  it('rejects a flat amount, since a cluster effect is a percentage by grammar', () => {
    expect(() => loadModule('# stat max-health\n\n# item orb-of-vitality\ncluster-effect: +25 max-health')).toThrow(/expected a percent stat bonus/);
  });

  it('rejects a stat that does not resolve', () => {
    expect(() => loadModule('# item orb\ncluster-effect: +25% nope')).toThrow(/# item orb cluster-effect: names an unknown stat: nope/);
  });

  it('refuses an item declaring both item-level: and cluster-effect:, since a base has no orb role', () => {
    expect(() => loadModule('# stat max-health\n\n# item warding-blade\nslot: mainhand\nitem-level: 3-8\ncluster-effect: +25% max-health')).toThrow(/# item warding-blade: cluster-effect: makes warding-blade an orb, which is exclusive with the item-level: that makes it a base/);
  });

  it('refuses an item declaring both origin-cluster: and cluster-effect:, for the same reason one field over', () => {
    const JEWEL = ['# stat max-health', '# passive hale', '# cluster-jewel keen-edge', 'shape: point', 'open-connections: e', 'passives: 1 hale'].join('\n');
    expect(() => loadModule([JEWEL, '# item warding-orb', 'origin-cluster: keen-edge', 'cluster-effect: +25% max-health'].join('\n'))).toThrow(/# item warding-orb: cluster-effect: makes warding-orb an orb, which is exclusive with the origin-cluster: that makes it a base/);
  });
});

describe('# item item-level:', () => {
  it('reads a range, and a bare number as the range that rolls one way', () => {
    const registry = loadModule('# item iron-sword\nslot: mainhand\nitem-level: 3-8\n\n# item practice-blade\nslot: mainhand\nitem-level: 2');
    expect(registry.items.get('iron-sword')!.itemLevel).toEqual({ min: 3, max: 8 });
    expect(registry.items.get('practice-blade')!.itemLevel).toEqual({ min: 2, max: 2 });
  });

  it('is what makes an item a base, so an item declaring none has no plane at all', () => {
    const registry = loadModule('# item wooden-shield\nslot: offhand');
    expect(registry.items.get('wooden-shield')!.itemLevel).toBeUndefined();
    expect(isBase(registry.items.get('wooden-shield')!)).toBe(false);
  });

  it('refuses a level that lets a base drop with no points to spend', () => {
    expect(() => loadModule('# item iron-sword\nslot: mainhand\nitem-level: 0-4')).toThrow(/# item iron-sword: item-level: is how many points one of these drops carrying, and 0-4 lets one drop with none/);
  });

  it('refuses a level on an item nothing can wear, because a plane is only read off worn gear', () => {
    expect(() => loadModule('# item ration\nitem-level: 3-8')).toThrow(/# item ration: item-level: gives ration a plane, and a plane is only ever read off what the player is wearing/);
  });
});
