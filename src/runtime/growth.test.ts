import { RuntimeError } from './error';
import { describe, expect, it } from 'vitest';
import { DslError } from '../grammar/parser';
import { engineLocale, loadInEnglish } from '../content/engineLocale';
import { loadUniverse } from '../content/load';
import { grow, growLine } from './growth';
import { itemInstance, type Growth } from './itemInstance';
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
max-level: 20
origin-cluster: core

# item spark-jewel
cluster-jewel: spark

# item goad
cluster-effect: +50% attack

# item whetstone
item-experience: 1000
`;

const registry = loadInEnglish(MODULE);

// One fed copy, which is the only way a plane with points to spend exists.
function fed(extra: Record<string, number> = {}): GameState {
  const state = initialState(registry);
  Object.assign(state.inventory, { blade: 1, whetstone: 1, ...extra });
  const growth = growLine(state, registry, 'feed: blade with whetstone');
  if (!growth.ok) throw new Error(inEnglish(registry, growth.refused));
  return state;
}

const clusters = (state: GameState): Array<[string, string]> =>
  (planeReport(registry, state, '1')?.clusters ?? []).map((cluster) => [cluster.hex, cluster.jewel]);

const refusalOf = (outcome: Growth): string => (outcome.ok ? 'not refused' : inEnglish(registry, outcome.refused));

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
    expect(refusalOf(grow(fed(), registry, { kind: 'allocate', target: '1', node: { hex: { q: 9, r: 9 }, kind: 'position', position: 1 } }))).toBe('no cluster stands in 9,9');
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
    expect(refusalOf(growLine(fed(), registry, 'allocate: 1 at 9,9 position 1'))).toBe('no cluster stands in 9,9');
  });

  it('is an engine fault, not a refusal, when a line is not a growth at all', () => {
    expect(() => growLine(fed(), registry, 'travel: camp')).toThrow(RuntimeError);
    expect(() => growLine(fed(), registry, 'nothing at all')).toThrow(RuntimeError);
    expect(() => growLine(fed(), registry, 'allocate: 1 at nowhere position 1')).toThrow(DslError);
  });
});

// c4: a refusal reaches the player through a key, so it reads in the language
// being played and shows that key where the language has nothing for it. Half
// of these are translated and half are not, because a screen full of Spanish
// hides which half the engine is answering from.
describe('a refusal is a key, not a sentence', () => {
  const SPANISH = [
    '# info camp-es',
    'version: 1.0.0',
    '',
    '# locale es',
    'engine.plane.no-cluster: ningun cumulo esta en {hex}',
    'engine.growth.no-experience: {item} no da experiencia',
  ].join('\n');
  const bilingual = loadUniverse([engineLocale(), { name: 'camp', text: MODULE }, { name: 'camp-es', text: SPANISH }]);

  const refusalIn = (language: string, line: string): string => {
    const state = initialState(bilingual, language);
    Object.assign(state.inventory, { blade: 1, whetstone: 1, goad: 1 });
    const growth = growLine(state, bilingual, line);
    if (growth.ok) throw new Error(`${line} was not refused`);
    return say(localizerFor(bilingual, language), growth.refused);
  };

  it('reads in the language being played', () => {
    expect(refusalIn('en', 'allocate: blade at 9,9 position 1')).toBe('no cluster stands in 9,9');
    expect(refusalIn('es', 'allocate: blade at 9,9 position 1')).toBe('ningun cumulo esta en 9,9');
    expect(refusalIn('es', 'feed: blade with goad')).toBe('goad no da experiencia');
  });

  it('shows its key where the language being played has no entry for it', () => {
    expect(refusalIn('en', 'slot: blade at 0,0 e with whetstone')).toBe('whetstone is not a cluster jewel');
    expect(refusalIn('es', 'slot: blade at 0,0 e with whetstone')).toBe('engine.growth.not-a-jewel');
  });
});
