import { describe, expect, it } from 'vitest';
import { DslError } from '../grammar/parser';
import { loadModule } from '../content/registry';
import { grow, growLine } from './growth';
import { itemInstance } from './itemInstance';
import { planeReport } from './planeReport';
import { initialState } from './save';
import { GameState, RuntimeError } from './state';

const MODULE = `
# location camp
x: 0, y: 0
starting

# stat attack
base: 4

# passive keen
+4 attack

# cluster-jewel core
shape: point
open-connections: e, ne
passives: 1 keen

# cluster-jewel spark
shape: spindle
open-connections: e

# item blade
title: Blade
slot: mainhand
max-level: 20
origin-cluster: core

# item spark-jewel
cluster-jewel: spark

# item goad
cluster-effect: +50% attack

# item whetstone
item-experience: 1000
`;

const registry = loadModule(MODULE);

// One fed copy, which is the only way a plane with points to spend exists.
function fed(extra: Record<string, number> = {}): GameState {
  const state = initialState(registry);
  Object.assign(state.inventory, { blade: 1, whetstone: 1, ...extra });
  const growth = growLine(state, registry, 'feed: blade with whetstone');
  if (!growth.ok) throw new Error(growth.refused);
  return state;
}

const clusters = (state: GameState): Array<[string, string]> =>
  (planeReport(registry, state, '1')?.clusters ?? []).map((cluster) => [cluster.hex, cluster.jewel]);

describe('the four verbs a growth names', () => {
  it('feeds a copy the experience its food carries', () => {
    expect(itemInstance(fed(), '1')?.experience).toBe(1000);
  });

  it('allocates a node, and slots a jewel into one that is allocated', () => {
    const state = fed({ 'spark-jewel': 1 });

    expect(grow(state, registry, { kind: 'allocate', target: '1', node: { hex: { q: 0, r: 0 }, kind: 'slot', direction: 'e' } })).toEqual({ ok: true, instance: '1' });
    expect(grow(state, registry, { kind: 'slot', target: '1', hex: { q: 0, r: 0 }, direction: 'e', jewel: 'spark-jewel' })).toEqual({ ok: true, instance: '1' });
    expect(clusters(state)).toEqual([
      ['0,0', 'core'],
      ['1,0', 'spark'],
    ]);
  });

  it('applies an orb to the cluster standing in a hexagon', () => {
    const state = fed({ goad: 1 });

    expect(grow(state, registry, { kind: 'apply', target: '1', hex: { q: 0, r: 0 }, effect: 'goad' })).toEqual({ ok: true, instance: '1' });
    expect(planeReport(registry, state, '1')?.clusters[0].effects.map((each) => each.id)).toEqual(['goad']);
  });

  // The dispatch owns no rule of its own: the refusal a caller reads is the one
  // the plane wrote, handed back rather than restated here.
  it('hands back the refusal the verb itself wrote', () => {
    expect(grow(fed(), registry, { kind: 'allocate', target: '1', node: { hex: { q: 9, r: 9 }, kind: 'position', position: 1 } })).toEqual({
      ok: false,
      refused: 'no cluster stands in 9,9',
    });
  });
});

describe('a growth reached from a line', () => {
  // The seam a screen composing one of its own values goes through: the same
  // four verbs, read by the parser every `# test` line is read by.
  it('reaches the same four verbs a parsed directive does', () => {
    const line = fed({ 'spark-jewel': 1 });
    const parsed = fed({ 'spark-jewel': 1 });

    growLine(line, registry, 'allocate: 1 at 0,0 slot e');
    growLine(line, registry, 'slot: 1 at 0,0 e with spark-jewel');
    grow(parsed, registry, { kind: 'allocate', target: '1', node: { hex: { q: 0, r: 0 }, kind: 'slot', direction: 'e' } });
    grow(parsed, registry, { kind: 'slot', target: '1', hex: { q: 0, r: 0 }, direction: 'e', jewel: 'spark-jewel' });

    expect(JSON.stringify(line)).toBe(JSON.stringify(parsed));
  });

  it('refuses through the plane rather than through the parser, for a line that parses but cannot grow', () => {
    expect(growLine(fed(), registry, 'allocate: 1 at 9,9 position 1')).toEqual({ ok: false, refused: 'no cluster stands in 9,9' });
  });

  it('is an engine fault, not a refusal, when a line is not a growth at all', () => {
    expect(() => growLine(fed(), registry, 'travel: camp')).toThrow(RuntimeError);
    expect(() => growLine(fed(), registry, 'nothing at all')).toThrow(RuntimeError);
    expect(() => growLine(fed(), registry, 'allocate: 1 at nowhere position 1')).toThrow(DslError);
  });
});
