import { describe, expect, it } from 'vitest';
import { loadUniverse } from '../content/load';
import type { Registry } from '../content/registry';
import { sections } from '../content/sections';
import { withEngineLocale } from '../content/engineLocale';
import { parseSegments } from '../grammar/segment';
import { fixtureSources } from '../content/worldFixture';
import { proseAt, proseWritten, publishedSurfaces, unsaidFields } from './proseSaid';
import { apply, startSession } from './session';

const CLAUSE = 'and the clause this fragment gates is said';

const PROBE = [
  '# info fragment-probe',
  'version: 1.0.0',
  'pack: fragment-probe',
  'dependencies:',
  '  core',
  '  fixture-town',
  '  fixture-combat',
  '',
  '# item lantern',
  'title: Lantern',
  `examine: A tin lantern, {always: ${CLAUSE}}`,
  '',
  '# passive lit-passive',
  'title: Lit',
  `examine: A passive, {always: ${CLAUSE}}`,
  '+1 attack',
  '',
  '# cluster-jewel lit-core',
  'title: Lit Core',
  `examine: A jewel, {always: ${CLAUSE}}`,
  'shape: ring',
  'open-connections: e',
  'passives: 1 lit-passive, 2 core.keen, 3 core.hale, 4 core.warded, 5 core.keen, 6 core.fortune',
  '',
  '# location lit-yard',
  'x: 40, y: 40',
  'title: Lit Yard',
  `examine: A yard, {always: ${CLAUSE}}`,
  '',
  '# location fixture-town.green',
  '+entities: statue',
  '',
  '# entity statue',
  'title: Statue',
  `examine: A statue, {always: ${CLAUSE}}`,
  'uses: ring-the-bell',
  '',
  '# action ring-the-bell',
  'title: ring the bell',
  'instant',
  `say: A bell, {always: ${CLAUSE}}`,
  'stands: rung for 30s',
  '',
  '# guise rung',
  'title: A Statue Mid-Peal',
  `examine: A statue mid-peal, {always: ${CLAUSE}}`,
  'without: ring-the-bell',
].join('\n');

const PROBE_MODULE = 'fragment-probe';

const HOLDS_A_FRAGMENT = /\{[^}\n]*:[^}\n]*\}/;

const weighedTrue = (words: string): string =>
  parseSegments(words, 0)
    .map((segment) => (segment.kind === 'interpolate' ? '' : segment.text))
    .join('');

describe('a fragment written in prose the player reads', () => {
  const sources = withEngineLocale([...fixtureSources(), { name: PROBE_MODULE, text: PROBE }]);
  const world = loadUniverse(sources);
  const surfaces = publishedSurfaces(sources, world);
  const said = surfaces.flatMap((surface) => surface.said.map((words) => ({ surface: surface.name, words })));
  const haystack = said.map((each) => each.words).join('\n');
  const mute = new Set(unsaidFields(proseWritten(world), surfaces));
  const probed = proseWritten(world).filter((prose) => prose.key.startsWith(`${PROBE_MODULE}.`) && HOLDS_A_FRAGMENT.test(prose.words));

  it('stands in every prose field a kind declares beyond its title that any surface says at all', () => {
    const declared = new Set(sections().flatMap((section) => section.text.filter((field) => field !== 'title').map((field) => proseAt({ kind: section.kind, field }))));
    const carried = new Set(probed.map(proseAt));
    const wanted = [...declared].filter((field) => !mute.has(field));
    expect(wanted.length).toBeGreaterThan(0);
    expect(wanted.filter((field) => !carried.has(field))).toEqual([]);
    expect(said.length).toBeGreaterThan(100);
  });

  it('is weighed before it reaches a surface, on every surface that says one', () => {
    expect(said.filter((each) => HOLDS_A_FRAGMENT.test(each.words)).map((each) => `${each.surface}: ${each.words}`)).toEqual([]);
  });

  it('is weighed rather than dropped, so every field the probe writes arrives with its clause in it', () => {
    expect(probed.length).toBeGreaterThan(0);
    expect(probed.filter((prose) => !mute.has(proseAt(prose)) && !haystack.includes(weighedTrue(prose.words))).map((prose) => prose.key)).toEqual([]);
  });

  it('is weighed in a say: the moment the action carrying it is taken', () => {
    const session = startSession(world);
    apply(session, 'use:entity.fragment-probe.statue.examine');
    expect(apply(session, 'use:entity.fragment-probe.statue.ring-the-bell').said).toEqual([`A bell, ${CLAUSE}`]);
  });
});

describe('an id inside a fragment', () => {
  const standing = (words: string): (() => Registry) => {
    const text = [
      '# info id-probe',
      'version: 1.0.0',
      'pack: id-probe',
      'dependencies:',
      '  core',
      '  fixture-town',
      '',
      '# flag lamp-lit',
      '',
      '# entity statue',
      'title: Statue',
      `examine: ${words}`,
      'ring-the-bell:',
      '  instant',
      `  say: ${words}`,
      '',
      '# location fixture-town.green',
      '+entities: statue',
    ].join('\n');
    return () => loadUniverse(withEngineLocale([...fixtureSources(), { name: 'id-probe', text }]));
  };

  const storedIn = (registry: Registry, key: string): string | undefined => registry.locales.base.get(key)?.text;

  it('is written out whole at load, wherever the words stand, so nothing downstream reads a short one', () => {
    const registry = standing('A statue.{lamp-lit: Lit from the side.}')();

    expect(storedIn(registry, 'id-probe.entity.statue.examine')).toBe('A statue.{id-probe.lamp-lit: Lit from the side.}');
    expect(storedIn(registry, 'id-probe.entity.statue.say.0')).toBe('A statue.{id-probe.lamp-lit: Lit from the side.}');
  });

  it('is refused where nothing declares it, rather than standing as words that never hold', () => {
    expect(standing('A statue.{no-such-thing: Lit from the side.}')).toThrow(/names an unknown flag: no-such-thing/);
  });

  it('reads the two sides of an action, so a line can say a stat of whoever acts and of what it is aimed at', () => {
    const registry = standing('{us.attack}|{them.attack}')();
    const session = startSession(registry);
    const [ours, theirs] = String(apply(session, 'use:entity.id-probe.statue.examine').said[0]).split('|');

    expect(Number(ours)).toBeGreaterThan(0);
    expect(Number(theirs)).toBeGreaterThan(0);
    expect(ours).not.toBe(theirs);
  });

  it('refuses them. where nothing is aimed at, rather than saying a line with a hole in it', () => {
    const text = [
      '# info nobody-probe',
      'version: 1.0.0',
      'pack: nobody-probe',
      'dependencies:',
      '  core',
      '  fixture-town',
      '',
      '# location fixture-town.green',
      'shout:',
      '  instant',
      '  say: Facing {them.attack}.',
    ].join('\n');
    const registry = loadUniverse(withEngineLocale([...fixtureSources(), { name: 'nobody-probe', text }]));
    const session = startSession(registry);

    expect(() => apply(session, 'use:location.fixture-town.green.shout')).toThrow(/fixture-town.green is asked for core.attack and is no entity, so it carries no sheet to read one off/);
  });

  it('is left alone where the brace is written twice, which is how a line says one of its own', () => {
    const registry = standing('A statue in {{parentheses}.')();

    expect(storedIn(registry, 'id-probe.entity.statue.examine')).toBe('A statue in {{parentheses}.');
  });
});
