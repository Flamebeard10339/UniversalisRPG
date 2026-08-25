import { RuntimeError } from './error';
import { describe, expect, it } from 'vitest';
import { DslError } from '../grammar/parser';
import { engineLocale, loadInEnglish } from '../content/engineLocale';
import { loadUniverse } from '../content/load';
import { grow, growLine } from './growth';
import { itemInstance, itemLevel, receiveItem, type Growth } from './itemInstance';
import { planeReport } from './planeReport';
import { initialState } from './save';
import { GameState } from './state';
import { localizerFor } from './localized';
import { say } from './said';
import { inEnglish } from './sayFixture';

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
item-level: 6
origin-cluster: core

# item spark-jewel
cluster-jewel: spark

# item goad
cluster-effect: +50% attack

# item rope

`;

const registry = loadInEnglish(MODULE);

function fed(extra: Record<string, number> = {}): GameState {
  const state = initialState(registry);
  receiveItem(state, registry, 'blade', 1);
  Object.assign(state.inventory, extra);
  return state;
}

const clusters = (state: GameState): Array<[string, string]> =>
  (planeReport(registry, state, '1')?.clusters ?? []).map((cluster) => [cluster.hex, cluster.jewel]);

const refusalOf = (outcome: Growth): string => (outcome.ok ? 'not refused' : inEnglish(registry, outcome.refused));

describe('the three verbs a growth names', () => {
  it('drops a copy carrying the level its item declares', () => {
    const state = fed();
    expect(itemLevel(itemInstance(state, '1')!, registry.items.get('blade')!)).toBe(6);
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

  it('hands back the refusal the verb itself wrote', () => {
    expect(refusalOf(grow(fed(), registry, { kind: 'allocate', target: '1', node: { hex: { q: 9, r: 9 }, kind: 'position', position: 1 } }))).toBe('no cluster stands in 9,9');
  });
});

describe('a growth reached from a line', () => {
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
    expect(refusalOf(growLine(fed(), registry, 'allocate: 1 at 9,9 position 1'))).toBe('no cluster stands in 9,9');
  });

  it('is an engine fault, not a refusal, when a line is not a growth at all', () => {
    expect(() => growLine(fed(), registry, 'travel: camp')).toThrow(RuntimeError);
    expect(() => growLine(fed(), registry, 'nothing at all')).toThrow(RuntimeError);
    expect(() => growLine(fed(), registry, 'allocate: 1 at nowhere position 1')).toThrow(DslError);
  });
});

describe('a refusal is a key, not a sentence', () => {
  const SPANISH = [
    '# info camp-es',
    'version: 1.0.0',
    '',
    '# locale es',
    'engine.plane.no-cluster: ningun cumulo esta en {hex}',
  ].join('\n');
  const bilingual = loadUniverse([engineLocale(), { name: 'camp', text: MODULE }, { name: 'camp-es', text: SPANISH }]);

  const refusalIn = (language: string, line: string): string => {
    const state = initialState(bilingual, language);
    receiveItem(state, bilingual, 'blade', 1);
    Object.assign(state.inventory, { goad: 1, rope: 1 });
    const growth = growLine(state, bilingual, line);
    if (growth.ok) throw new Error(`${line} was not refused`);
    return say(localizerFor(bilingual, language), growth.refused);
  };

  it('reads in the language being played', () => {
    expect(refusalIn('en', 'allocate: 1 at 9,9 position 1')).toBe('no cluster stands in 9,9');
    expect(refusalIn('es', 'allocate: 1 at 9,9 position 1')).toBe('ningun cumulo esta en 9,9');
  });

  it('shows its key where the language being played has no entry for it', () => {
    expect(refusalIn('en', 'slot: 1 at 0,0 e with rope')).toBe('rope is not a cluster jewel');
    expect(refusalIn('es', 'slot: 1 at 0,0 e with rope')).toBe('engine.growth.not-a-jewel');
  });
});
