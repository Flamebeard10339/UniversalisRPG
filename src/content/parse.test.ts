import { describe, expect, it } from 'vitest';
import { comparison, condition, holds, type ComparisonOperator, type Condition } from '../grammar/condition';
import { Action, entity } from './sections/entity';
import { item } from './sections/item';
import { location } from './sections/location';
import { loadModule, loadUniverse } from './load';
import { Section, parseModule, sections } from './sections';
import { Cursor, DslError, Parser, parseWhole } from '../grammar/parser';
import { isList, ListParser } from '../grammar/list';
import { point } from '../grammar/range';
import { Authored, DEFAULT_CONTEXT, HydrateContext, SectionSchema, hydrateSection, isPositionalField } from '../grammar/section';
import { skill } from './sections/skill';
import { stat } from './sections/stat';
import { RawLine, splitSections } from '../grammar/structure';
import { variable } from './sections/variable';
import { tagClause } from '../grammar/tagClause';
import { text } from '../grammar/values';

function parseOne<V extends { id: string }, M extends Record<string, unknown>>(source: string, kind: Section<V, M>): Authored<V> {
  const found = splitSections(source);
  expect(found).toHaveLength(1);
  return kind.parse(found[0]) as Authored<V>;
}

const hydrate = <V extends { id: string }, M extends Record<string, unknown>>(kind: Section<V, M>, authored: Authored<V>, context: HydrateContext = DEFAULT_CONTEXT): V => kind.build(authored, context);

const ref = (...path: string[]) => ({
  kind: 'reference' as const,
  reference: { path },
});
const literal = (text: string) => ({ kind: 'literal' as const, text });
const interpolate = (...path: string[]) => ({
  kind: 'interpolate' as const,
  reference: { path },
});

describe('items and tag clauses', () => {
  it('parses a bare-clause list, keeping duration and stat-bonus shapes', () => {
    const shrimp = parseOne('# item cooked-shrimp\nexamine: A simple meal.\nfood, +3 regeneration, 60s', item);
    expect(shrimp.examine).toBe('A simple meal.');
    expect(shrimp.tags).toEqual([
      { kind: 'keyword', value: 'food' },
      {
        kind: 'stat-bonus',
        statId: 'regeneration',
        amount: point(3),
        percent: false,
      },
      { kind: 'duration', seconds: 60 },
    ]);
  });

  it('parses a counter-scaled stat bonus beside the flat and percent forms', () => {
    const blade = parseOne('# item blade\n+4-7 attack, +2 attack per rage, +10% attack per rage, +1% attack per stack of vigor', item);
    expect(blade.tags).toEqual([
      {
        kind: 'stat-bonus',
        statId: 'attack',
        amount: { min: 4, max: 7 },
        percent: false,
      },
      {
        kind: 'stat-bonus',
        statId: 'attack',
        amount: point(2),
        percent: false,
        per: { kind: 'resource', id: 'rage' },
      },
      {
        kind: 'stat-bonus',
        statId: 'attack',
        amount: 10,
        percent: true,
        per: { kind: 'resource', id: 'rage' },
      },
      {
        kind: 'stat-bonus',
        statId: 'attack',
        amount: 1,
        percent: true,
        per: { kind: 'stack', id: 'vigor' },
      },
    ]);
  });

  it('resolves the counter as a resource, so a bonus scaled by nothing is a load error', () => {
    const source = (counter: string) => `# stat attack\nbase: 5\n\n# resource rage\nmax: attack\ndisplay: minimal\n\n# item blade\n+2 attack per ${counter}\n`;
    expect(loadModule(source('rage')).items.get('blade')!.tags).toEqual([
      {
        kind: 'stat-bonus',
        statId: 'attack',
        amount: point(2),
        percent: false,
        per: { kind: 'resource', id: 'rage' },
      },
    ]);
    expect(() => loadModule(source('fury'))).toThrow(/resource/);
  });

  it('resolves a stack counter as the buff source it names, which is an item', () => {
    const source = (counter: string) => `# stat attack\nbase: 5\n\n# item vigor\nfood, +1 attack, 60s\n\n# item blade\n+2 attack per stack of ${counter}\n`;
    expect(loadModule(source('vigor')).items.get('blade')!.tags).toEqual([
      {
        kind: 'stat-bonus',
        statId: 'attack',
        amount: point(2),
        percent: false,
        per: { kind: 'stack', id: 'vigor' },
      },
    ]);
    expect(() => loadModule(source('torpor'))).toThrow(/item/);
  });

  it('rejects a labelled tags: with a message naming it as a bare field, not a tag-clause parse error', () => {
    expect(() => parseOne('# item cooked-shrimp\nexamine: A simple meal.\ntags: food', item)).toThrow("item field tags must be written bare, without a 'tags:' label");
  });
});

describe('the two carriers of a hook', () => {
  const DRAIN_THEM = {
    kind: 'pool',
    resource: 'health',
    delta: { min: -2, max: -2 },
    party: 'them',
  };

  it('reads on hit: on an entity as a hook rather than as an action or an on <event>: handler', () => {
    const berserker = parseOne(['# entity berserker', 'uses: melee-combat', 'on hit:', '  restore: 1 rage', '  1 in 20:', '    drain: 4 health from them', 'when hit: drain: 2 health from them', 'on death: say: It falls.'].join('\n'), entity);
    expect(berserker.onHit).toEqual([
      { kind: 'pool', resource: 'rage', delta: point(1) },
      {
        kind: 'chance',
        numerator: 1,
        denominator: 20,
        results: [
          {
            kind: 'pool',
            resource: 'health',
            delta: { min: -4, max: -4 },
            party: 'them',
          },
        ],
      },
    ]);
    expect(berserker.whenHit).toEqual([DRAIN_THEM]);
    expect(berserker.blocks).toEqual([
      {
        label: 'on death',
        event: 'death',
        results: [{ kind: 'say', text: 'It falls.' }],
      },
    ]);
  });

  it('reads both on an item, whose labelled blocks were actions until now', () => {
    const blade = parseOne(['# item venomous-blade', 'slot: mainhand', '+4-7 attack', 'on hit: 1 in 4: drain: 3 health from them', 'when hit: drain: 2 health from them', 'swing: say: You swing it.'].join('\n'), item);
    expect(blade.onHit).toEqual([
      {
        kind: 'chance',
        numerator: 1,
        denominator: 4,
        results: [
          {
            kind: 'pool',
            resource: 'health',
            delta: { min: -3, max: -3 },
            party: 'them',
          },
        ],
      },
    ]);
    expect(blade.whenHit).toEqual([DRAIN_THEM]);
    expect(blade.actions?.map((action) => action.label)).toEqual(['swing']);
  });

  it('refuses a hook on a section that carries no character modifier', () => {
    expect(() => parseOne('# location camp\nx: 0, y: 0\non hit: drain: 2 health from them', location)).toThrow('write it on the `# entity` or `# item` that carries it');
  });

  it('refuses each defined more than once, the way any field of a section is', () => {
    expect(() => parseOne('# entity rat\non hit: restore: 1 rage\non hit: restore: 2 rage', entity)).toThrow('entity field on hit is defined more than once');
  });

  it('names the field an author was one letter from, rather than reading the typo as an action', () => {
    expect(() => parseOne('# item blade\non hi: restore: 1 rage', item)).toThrow('unknown item field: on hi, one letter from on hit');
  });

  it('resolves a hook written as an edit, on a carrier that has none to edit yet', () => {
    const module = '# stat attack\nbase: 5\n\n# resource rage\nmax: attack\ndisplay: minimal\n\n# entity rat\nstats: attack 5\n+on hit: restore: 1 rage\n\n# item mail\n-when hit: restore: 1 rage\n';
    expect(loadModule(module).entities.get('rat')!.onHit).toEqual([{ kind: 'pool', resource: 'rage', delta: point(1) }]);
    expect(loadModule(module).items.get('mail')!.whenHit).toEqual([]);
  });

  it('appends to the hook a patch module overlays rather than replacing it', () => {
    const base = {
      name: 'base',
      text: '# info base\nversion: 1.0.0\n\n# stat attack\nbase: 5\n\n# resource rage\nmax: attack\ndisplay: minimal\n\n# entity rat\nstats: attack 5\non hit: restore: 1 rage\n',
    };
    const patch = {
      name: 'patch',
      text: '# info patch\nversion: 1.0.0\ndependencies:\n  base\n\n# entity base.rat\n+on hit: drain: 2 base.rage from them\n',
    };
    expect(loadUniverse([base, patch]).entities.get('base.rat')!.onHit).toEqual([
      { kind: 'pool', resource: 'base.rage', delta: point(1) },
      {
        kind: 'pool',
        resource: 'base.rage',
        delta: { min: -2, max: -2 },
        party: 'them',
      },
    ]);
  });

  it('drops the hook whose reference went away, and leaves the other standing', () => {
    const source = {
      name: 'base',
      text: ['# info base', 'version: 1.0.0', 'dependencies:', '  ?extra', '', '# stat attack', 'base: 5', '', '# resource rage', 'max: attack', 'display: minimal', '', '# entity rat', 'stats: attack 5', 'on hit: roll: extra.spoils', 'when hit: restore: 1 rage'].join('\n'),
    };
    const rat = loadUniverse([source]).entities.get('base.rat')!;
    expect(rat.onHit).toEqual([]);
    expect(rat.whenHit).toEqual([{ kind: 'pool', resource: 'base.rage', delta: point(1) }]);
  });

  it('refuses an event whose name only a hook block could answer', () => {
    expect(() => loadModule('# stat attack\nbase: 5\n\n# resource rage\nmax: attack\ndisplay: minimal\n\n# event hit\nresource: rage\ntrigger: on empty\n')).toThrow('which is a hook block');
    expect(() => loadModule('# stat attack\nbase: 5\n\n# resource rage\nmax: attack\ndisplay: minimal\n\n# event spent\nresource: rage\ntrigger: on empty\n')).not.toThrow();
  });
});

describe('multi-kind dispatch', () => {
  const mixed = ['# item gold', 'examine: Small bright coins.', 'currency', '', '# stat health', 'base: 10', '', '# skill mining'].join('\n');

  it('dispatches each section by its heading kind', () => {
    expect(parseModule(mixed).map((section) => section.kind)).toEqual(['item', 'stat', 'skill']);
  });

  it('rejects an unknown section kind with a span', () => {
    let error: unknown;
    try {
      parseModule('# widget foo');
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(DslError);
    expect((error as DslError).span?.start).toBe(0);
  });
});

describe('comments', () => {
  it('ignores // lines, at any indentation', () => {
    const source = ['// a leading note', '# item gold', 'examine: Small bright coins.', '// trailing note', 'currency'].join('\n');
    const [section] = parseModule(source);
    expect(section.value).toEqual({
      id: 'gold',
      examine: 'Small bright coins.',
      tags: [{ kind: 'keyword', value: 'currency' }],
    });
  });

  it('accepts a UTF-8 BOM before the first section', () => {
    const [section] = parseModule('\uFEFF# item gold\nexamine: Small bright coins.');
    expect(section.value).toMatchObject({
      id: 'gold',
      examine: 'Small bright coins.',
    });
  });

  it('accepts CRLF line endings', () => {
    const parsed = parseModule('# item gold\r\nexamine: Small bright coins.\r\n# stat vigor\r\nbase: 3');
    expect(parsed.map((section) => section.kind)).toEqual(['item', 'stat']);
    expect(parsed[0].value).toMatchObject({
      id: 'gold',
      examine: 'Small bright coins.',
    });
  });
});

describe('stat and skill', () => {
  it('leaves stat base and title absent, defaulting them in hydration', () => {
    const attack = parseOne('# stat attack', stat);
    expect(attack).toEqual({ id: 'attack' });
    const hydrated = hydrate(stat, attack);
    expect(hydrated.title).toBe('Attack');
    expect(hydrated.base).toEqual(point(0));
  });

  it('leaves a gathering skill carrying nothing, since tags have no default', () => {
    const mining = parseOne('# skill mining', skill);
    expect(mining.tags).toBeUndefined();
    expect(hydrate(skill, mining)).toMatchObject({ title: 'Mining', tags: [] });
  });
});

describe('variable', () => {
  it('parses a decimal value', () => {
    const perUnit = parseOne('# variable travel-seconds-per-unit\nvalue: 5', variable);
    expect(perUnit).toEqual({ id: 'travel-seconds-per-unit', value: 5 });
  });

  it('leaves an omitted value absent so the consumer applies its own fallback', () => {
    const perUnit = parseOne('# variable travel-seconds-per-unit', variable);
    expect(perUnit.value).toBeUndefined();
    expect(hydrate(variable, perUnit).value).toBeUndefined();
  });
});

describe('location: schema-aware line parsing', () => {
  it('parses several fields from one line', () => {
    const loft = parseOne('# location loft\nx: 0, y: 0, z: 1\nentities: stairs-down, 3 window', location);
    expect(loft).toEqual({
      id: 'loft',
      x: 0,
      y: 0,
      z: 1,
      entities: [{ entity: 'stairs-down' }, { count: 3, entity: 'window' }],
    });
  });

  it('keeps commas inside a free-text field while splitting a coordinate line', () => {
    const beach = parseOne("# location beach\nx: 1, y: 0\nexamine: Wow, isn't this place empty?", location);
    expect(beach.x).toBe(1);
    expect(beach.y).toBe(0);
    expect(beach.examine).toBe("Wow, isn't this place empty?");
  });

  it('parses adjacency inline and as a block, with edge conditions', () => {
    const inline = parseOne('# location beach\nx: 1, y: 0\nadjacent: guide-house, bridge', location);
    expect(inline.adjacent).toEqual([{ target: 'guide-house' }, { target: 'bridge' }]);

    const block = parseOne('# location bridge\nx: 2, y: 0\nadjacent:\n  beach\n  bank while bridge-open', location);
    expect(block.adjacent).toEqual([{ target: 'beach' }, { target: 'bank', condition: ref('bridge-open') }]);
  });

  it('parses the full corpus guide-house end to end, including the starting flag', () => {
    const source = ['# location guide-house', 'x: 0, y: 0', 'starting', 'adjacent:', '  beach while front-door.unlocked', 'entities:', '  miki, stairs-up, front-door, dresser, bookshelf, painting, mirror'].join('\n');
    expect(parseOne(source, location)).toEqual({
      id: 'guide-house',
      x: 0,
      y: 0,
      starting: true,
      adjacent: [{ target: 'beach', condition: ref('front-door', 'unlocked') }],
      entities: ['miki', 'stairs-up', 'front-door', 'dresser', 'bookshelf', 'painting', 'mirror'].map((entity) => ({ entity })),
    });
  });

  it('defaults an absent starting flag to false on hydration', () => {
    const plain = parseOne('# location plain-room\nx: 1, y: 0', location);
    expect(plain.starting).toBeUndefined();
    expect(hydrate(location, plain).starting).toBe(false);
  });
});

describe('parser guards', () => {
  it('makes a free-text field line-terminal (M1)', () => {
    const beach = parseOne('# location beach\nx: 1, y: 0\ntitle: Sunny, warm, x: 9', location);
    expect(beach.title).toBe('Sunny, warm, x: 9');
    expect(beach.x).toBe(1);
  });

  it('parses a relative position and rejects defining position two ways (M2)', () => {
    const dock = parseOne('# location dock\neast of bridge', location);
    expect(dock.relative).toEqual({ direction: 'east', of: 'bridge' });
    expect(dock.x).toBeUndefined();
    expect(() => parseOne('# location dock\nx: 0, y: 0\neast of bridge', location)).toThrow(/cannot both be set/);
  });

  it('rejects a key written inline and as a block, rather than keeping the inline half', () => {
    expect(() => parseOne('# entity rat\nstats: vigor 3\n  attack 4', entity)).toThrow('entity field stats is written inline and as a block; give it one');
    expect(() => parseOne('# item blade\non hit: restore: 1 rage\n  restore: 5 rage', item)).toThrow('item field on hit is written inline and as a block; give it one');
    expect(() => parseOne('# entity rat\nswing: say: a\n  say: b', entity)).toThrow('entity swing: is written inline and as a block; give it one');
  });

  it('leaves a comma line whose last key takes the block alone', () => {
    const camp = parseOne('# location camp\ny: 0, x: 1, adjacent:\n  grove', location);
    expect(camp).toMatchObject({ x: 1, y: 0, adjacent: [{ target: 'grove' }] });
  });

  it('rejects a field defined twice', () => {
    expect(() => parseOne('# location dock\nx: 0\nx: 1', location)).toThrow(/defined more than once/);
  });

  it('treats an empty value as unspecified — indistinguishable from absent (L7)', () => {
    const loc = parseOne('# location void\nx: \ny: 0', location);
    expect(loc.x).toBeUndefined();
    expect(loc.y).toBe(0);
    expect(hydrate(location, loc).x).toBe(0);

    const empty = parseOne('# location void\nx: 0\nentities:', location);
    const absent = parseOne('# location void\nx: 0', location);
    expect(empty).toEqual(absent);
  });
});

describe('entity actions', () => {
  it('parses an inline action and a space-labelled block action', () => {
    const stairs = parseOne('# entity stairs-up\ntitle: Stairs\nascend: relocate: guide-house-upstairs, say: You climb the stairs.', entity);
    expect(stairs.blocks).toEqual([
      {
        label: 'ascend',
        results: [
          { kind: 'relocate', location: 'guide-house-upstairs' },
          { kind: 'say', text: 'You climb the stairs.' },
        ],
      },
    ]);

    const window = parseOne(['# entity window', 'look through:', '  discover: beach', '  say: Through the window, a bridge.'].join('\n'), entity);
    expect(window.blocks).toEqual([
      {
        label: 'look through',
        results: [
          { kind: 'discover', location: 'beach' },
          { kind: 'say', text: 'Through the window, a bridge.' },
        ],
      },
    ]);
  });

  it('parses every result verb, accepting both set forms', () => {
    const source = ['# entity chest', 'loot:', '  set drawers-open', '  unset: sealed', '  give: 12 coins', '  take: 5 cooked-shrimp', '  xp: thieving 4', '  open modal: choose-name'].join('\n');
    expect(parseOne(source, entity).blocks?.[0].results).toEqual([
      { kind: 'set', variable: 'drawers-open' },
      { kind: 'unset', variable: 'sealed' },
      { kind: 'give', item: 'coins', amount: point(12) },
      { kind: 'take', item: 'cooked-shrimp', amount: 5 },
      { kind: 'xp', skill: 'thieving', amount: point(4) },
      { kind: 'open-modal', modal: 'choose-name' },
    ]);
  });

  it('parses add: with and without an explicit amount, defaulting to 1', () => {
    const source = ['# entity chest', 'loot:', '  add: rats-killed', '  add: coins-found 5'].join('\n');
    expect(parseOne(source, entity).blocks?.[0].results).toEqual([
      { kind: 'add', variable: 'rats-killed', amount: 1 },
      { kind: 'add', variable: 'coins-found', amount: 5 },
    ]);
  });

  it('defaults an entity title from its id and hydrates empty actions', () => {
    const miki = parseOne('# entity miki\nexamine: A tall man.', entity);
    expect(miki.blocks).toBeUndefined();
    const hydrated = hydrate(entity, miki);
    expect(hydrated.title).toBe('Miki');
    expect(hydrated.blocks).toEqual([]);
  });
});

describe('entity action modifiers', () => {
  it('parses requires, hidden if, bare tags and on success, treating require as requires', () => {
    const source = ['# entity front-door', 'pick lock:', '  requires: lockpick', '  hidden if: unlocked', '  instant', '  xp: thieving 4', '  on success:', '    set: unlocked', '    say: The lock clicks.'].join('\n');
    const door = parseOne(source, entity);
    expect(door.blocks).toEqual([
      {
        label: 'pick lock',
        requires: ref('lockpick'),
        hiddenIf: ref('unlocked'),
        kind: 'instant',
        tags: [{ kind: 'keyword', value: 'instant' }],
        results: [{ kind: 'xp', skill: 'thieving', amount: point(4) }],
        onSuccess: [
          { kind: 'set', variable: 'unlocked' },
          { kind: 'say', text: 'The lock clicks.' },
        ],
      },
    ]);
    expect(parseOne(source.replace('requires: lockpick', 'require: lockpick'), entity)).toEqual(door);
  });

  it('rejects requires, hidden if, and on success each defined more than once', () => {
    expect(() => parseOne('# entity chest\nopen:\n  requires: a\n  require: b\n  say: hi', entity)).toThrow(/requires is defined more than once/);
    expect(() => parseOne('# entity chest\nopen:\n  hidden if: a\n  hidden if: b\n  say: hi', entity)).toThrow(/hidden if is defined more than once/);
    expect(() => parseOne('# entity chest\nopen:\n  on success:\n    say: a\n  on success:\n    say: b', entity)).toThrow(/on success is defined more than once/);
  });

  it.each([
    ['requires: a', 'requires'],
    ['hidden if: a', 'hidden if'],
    ['on success: say: a', 'on success'],
    ['on refused: say: a', 'on refused'],
    ['on attempts exhausted: say: a', 'on attempts exhausted'],
    ['time: 1', 'time'],
    ['rate: quickness', 'rate'],
    ['accuracy: aim', 'accuracy'],
    ['damage: might', 'damage'],
    ['depletes: health', 'depletes'],
    ['attempts: 3', 'attempts'],
  ])('rejects %s written twice', (line, written) => {
    expect(parseOne(`# entity chest\nopen:\n  ${line}\n  say: hi`, entity).blocks).toHaveLength(1);
    expect(() => parseOne(`# entity chest\nopen:\n  ${line}\n  ${line}\n  say: hi`, entity)).toThrow(`action "open": ${written} is defined more than once`);
  });

  it('no longer accepts a health: field, which the implicit target pool replaced', () => {
    expect(() => parseOne('# entity chest\nopen:\n  health: 3\n  say: hi', entity)).toThrow(/unrecognized tag clause/);
  });

  it('parses on refused inline and as a block, and rejects it defined more than once', () => {
    const inline = parseOne('# entity chest\nopen:\n  take: 5 cooked-shrimp\n  on refused: say: Not enough shrimp.', entity);
    expect(inline.blocks).toEqual([
      {
        label: 'open',
        results: [{ kind: 'take', item: 'cooked-shrimp', amount: 5 }],
        onRefused: [{ kind: 'say', text: 'Not enough shrimp.' }],
      },
    ]);

    const block = parseOne('# entity chest\nopen:\n  take: 5 cooked-shrimp\n  on refused:\n    say: Not enough shrimp.\n    set: chest-jammed', entity);
    expect((block.blocks?.[0] as Action).onRefused).toEqual([
      { kind: 'say', text: 'Not enough shrimp.' },
      { kind: 'set', variable: 'chest-jammed' },
    ]);

    expect(() => parseOne('# entity chest\nopen:\n  on refused:\n    say: a\n  on refused:\n    say: b', entity)).toThrow(/on refused is defined more than once/);
  });

  it('surfaces result-related errors for malformed results, not tag errors', () => {
    expect(() => parseOne('# entity chest\nopen:\n  give:', entity)).toThrow(/expected an id/);
  });
});

describe('action kinds and their cadence', () => {
  const parseAction = (...lines: string[]) => parseOne(['# entity forge', 'work:', ...lines.map((line) => `  ${line}`)].join('\n'), entity).blocks![0] as Action;

  it('makes an untagged action a duration, and lifts the two written kinds off their tags', () => {
    expect(parseAction('say: hi').kind).toBeUndefined();
    expect(parseAction('instant', 'say: hi').kind).toBe('instant');
    expect(parseAction('continuous', 'time: 2', 'say: hi').kind).toBe('continuous');
  });

  it('keeps both cadence spellings, a stat rate apart from a literal one', () => {
    expect(parseAction('time: 2.5', 'say: hi')).toMatchObject({ time: 2.5 });
    expect(parseAction('rate: 15', 'say: hi')).toMatchObject({ rate: 15 });
    expect(parseAction('rate: quickness', 'say: hi')).toMatchObject({
      rate: { id: 'quickness' },
    });
  });

  it.each([
    [['once'], /tag "once" was never implemented/],
    [['repeating'], /tag "repeating" was renamed — write `continuous`/],
    [['instnt'], /unknown tag "instnt" — an action's bare tags are instant, continuous/],
    [['4s'], /a duration clause paces nothing on an action/],
  ])('refuses the bare tag %s rather than keeping a word nothing reads', (lines, message) => {
    expect(() => parseAction(...lines, 'say: hi')).toThrow(message);
  });

  it('keeps the tags an action does read: the two kinds and a stat bonus', () => {
    expect(parseAction('continuous', 'time: 2', '+2 attack', 'say: hi')).toMatchObject({
      kind: 'continuous',
      tags: [
        { kind: 'keyword', value: 'continuous' },
        { kind: 'stat-bonus', statId: 'attack' },
      ],
    });
  });

  it.each([['rate: 0'], ['rate: -30'], ['time: 0'], ['time: -3']])('refuses %s on a recipe, naming the recipe and its craft', (line) => {
    expect(() => loadModule(`# item ore\nexamine: Rock.\n# recipe dig\n${line}\nout: 1 ore\n`)).toThrow(/# recipe dig action "craft": (time|rate): must be positive/);
  });

  it.each([
    [['rate:'], /action "work": rate: expected an id/],
    [['time: abc'], /action "work": time: expected a number/],
    [['depletes:'], /action "work": depletes: expected an id/],
  ])('names the field and the action when a value will not read: %s', (lines, message) => {
    expect(() => parseAction(...lines, 'say: hi')).toThrow(message);
  });

  it.each([
    [['instant', 'time: 2'], /action "work": an instant action takes no time:/],
    [['instant', 'rate: 15'], /an instant action takes no rate:/],
    [['continuous', 'say: hi'], /action "work": a continuous action needs a time: or rate:/],
    [['time: 2', 'rate: 15'], /action "work": time: and rate: are the same axis/],
    [['instant', 'continuous'], /action "work": cannot be both instant and continuous/],
    [['time: 0'], /action "work": time: must be positive/],
    [['rate: 0'], /action "work": rate: must be positive/],
    [['speed: quickness'], /action "work": speed: was retired — write rate:/],
  ])('rejects %s', (lines, message) => {
    expect(() => parseAction(...lines)).toThrow(message);
  });
});

describe('dialogue', () => {
  it('parses owner, nodes, beats, effects, menus, and node metadata', () => {
    const source = [
      '# dialogue miki',
      'owner = miki',
      '',
      'node greeting:',
      '  when: not tutorial.quest-given',
      '  Greetings, adventurer!',
      '  What do you say I show you the ropes?',
      '  set: tutorial.quest-given',
      '  -> Sounds good.',
      "  -> I'd rather not.",
      '    set: tutorial.snubbed',
      '    goto snub',
      '',
      'node remind-mirror:',
      '  when: tutorial.quest-given',
      '  again: The mirror is still waiting.',
      '  The mirror awaits you.',
      '',
      'node snub:',
      '  Hmph. Suit yourself.',
    ].join('\n');

    const [section] = parseModule(source);
    expect(section.value).toEqual({
      id: 'miki',
      owner: 'miki',
      nodes: [
        {
          name: 'greeting',
          when: { kind: 'not', condition: ref('tutorial', 'quest-given') },
          steps: [
            { kind: 'say', segments: [literal('Greetings, adventurer!')] },
            {
              kind: 'say',
              segments: [literal('What do you say I show you the ropes?')],
            },
            {
              kind: 'effect',
              result: { kind: 'set', variable: 'tutorial.quest-given' },
            },
            {
              kind: 'menu',
              choices: [
                { segments: [literal('Sounds good.')], effects: [] },
                {
                  segments: [literal("I'd rather not.")],
                  effects: [{ kind: 'set', variable: 'tutorial.snubbed' }],
                  goto: 'snub',
                },
              ],
            },
          ],
        },
        {
          name: 'remind-mirror',
          when: ref('tutorial', 'quest-given'),
          again: { segments: [literal('The mirror is still waiting.')] },
          steps: [{ kind: 'say', segments: [literal('The mirror awaits you.')] }],
        },
        {
          name: 'snub',
          steps: [{ kind: 'say', segments: [literal('Hmph. Suit yourself.')] }],
        },
      ],
    });
  });

  it('refuses a node that is sticky and also writes again:, whichever grammar wrote the node', () => {
    const node = ['  always', '  sticky', '  again: We have spoken already.', '  Well met.'];

    expect(() => parseModule(['# dialogue miki', 'owner = miki', '', 'node greet:', ...node].join('\n'))).toThrow(/node greet is sticky and also writes again:/);
    expect(() => parseModule(['# quest errand', 'stage offered:', '  complete', '  miki says:', ...node.map((line) => `  ${line}`)].join('\n'))).toThrow(/node said is sticky and also writes again:/);
  });

  it('refuses a take: on the line said when no thread is open, since nothing stands behind that one', () => {
    const fallback = ['  always', '  take: 5 coin', '  Thanks for the coins.'];

    expect(() => parseModule(['# dialogue miki', 'owner = miki', '', 'node greet:', ...fallback].join('\n'))).toThrow(/node greet is what is said when no thread is open and also takes coin/);
    expect(() => parseModule(['# quest errand', 'stage offered:', '  complete', '  miki says:', ...fallback.map((line) => `  ${line}`)].join('\n'))).toThrow(/node said is what is said when no thread is open and also takes coin/);
  });

  it('leaves the same take: alone on a thread and on a choice, which are the two ways to write a cost that hides only itself', () => {
    const asked = ['  always', '  ask: I owe you five.', '  take: 5 coin', '  Thanks for the coins.'];
    const chosen = ['  always', '  Owe me anything?', '  -> Here, five coins.', '    take: 5 coin'];
    const gated = ['  when: has coin', '  take: 5 coin', '  Thanks for the coins.'];

    for (const node of [asked, chosen, gated]) expect(() => parseModule(['# dialogue miki', 'owner = miki', '', 'node greet:', ...node].join('\n'))).not.toThrow();
  });

  it('parses a guarded, consuming choice and a visit-count when: as a comparison', () => {
    const source = ['# dialogue troll', 'owner = bridge-troll', '', 'node toll:', '  when: toll.visits >= 5', '  Pay the toll!', '  -> Here, five shrimp.  (when has-shrimp)', '    take: 5 cooked-shrimp', '    goto paid'].join('\n');
    const [{ value }] = parseModule(source) as {
      value: { nodes: { when: unknown; steps: unknown[] }[] };
    }[];
    expect(value.nodes[0].when).toEqual({
      kind: 'comparison',
      left: { path: ['toll', 'visits'] },
      operator: '>=',
      right: { value: 5, places: 0 },
    });
    expect(value.nodes[0].steps[1]).toEqual({
      kind: 'menu',
      choices: [
        {
          segments: [literal('Here, five shrimp.')],
          when: ref('has-shrimp'),
          effects: [{ kind: 'take', item: 'cooked-shrimp', amount: 5 }],
          goto: 'paid',
        },
      ],
    });
  });

  it('parses an interpolation, a conditional fragment, and a literal/interpolation mix', () => {
    const source = ['# dialogue miki', 'owner = miki', '', 'node greeting:', '  There you are — {player.name}, is it?', '  {tutorial.snubbed: You already made your choice.}', '  Welcome to {location.name}, {player.name}.'].join('\n');

    const [{ value }] = parseModule(source) as {
      value: { nodes: { steps: { kind: string; segments: unknown[] }[] }[] };
    }[];
    const steps = value.nodes[0].steps;
    expect(steps[0].segments).toEqual([literal('There you are — '), interpolate('player', 'name'), literal(', is it?')]);
    expect(steps[1].segments).toEqual([
      {
        kind: 'conditional',
        condition: ref('tutorial', 'snubbed'),
        text: 'You already made your choice.',
      },
    ]);
    expect(steps[2].segments).toEqual([literal('Welcome to '), interpolate('location', 'name'), literal(', '), interpolate('player', 'name'), literal('.')]);
  });
});

describe('condition grammar', () => {
  const parse = (source: string) => condition.parse(new Cursor(source));

  it('parses references, dotted paths, combinators, and comparisons', () => {
    expect(parse('bridge-open')).toEqual(ref('bridge-open'));
    expect(parse('front-door.unlocked')).toEqual(ref('front-door', 'unlocked'));
    expect(parse('not troll-antagonized')).toEqual({
      kind: 'not',
      condition: ref('troll-antagonized'),
    });
    expect(parse('active-interaction and combat-interaction')).toEqual({
      kind: 'and',
      conditions: [ref('active-interaction'), ref('combat-interaction')],
    });
    expect(parse('stat.attack>10')).toEqual({
      kind: 'comparison',
      left: { path: ['stat', 'attack'] },
      operator: '>',
      right: { value: 10, places: 0 },
    });
  });

  it('parses has as a live inventory-count predicate, defaulting count to 1', () => {
    expect(parse('has lockpick')).toEqual({
      kind: 'has',
      item: 'lockpick',
      count: 1,
    });
    expect(parse('has 5 cooked-shrimp')).toEqual({
      kind: 'has',
      item: 'cooked-shrimp',
      count: 5,
    });
  });

  it('parses a hyphenated id starting with has- as a plain reference, not the has predicate', () => {
    expect(parse('has-shrimp')).toEqual(ref('has-shrimp'));
  });

  const weigh = (value: number, written: string): boolean => {
    const parsed = parse(`stat.attack ${written}`) as Extract<Condition, { kind: 'comparison' }>;
    return holds(value, parsed.operator, parsed.right);
  };

  it('weighs the engine answer at the precision the literal was written to', () => {
    expect(weigh(41 * 1.24, '= 50.84')).toBe(true);
    expect(weigh(41 * 1.24, '= 50.8')).toBe(true);
    expect(weigh(41 * 1.24, '= 50.839')).toBe(false);
    expect(weigh(50.8351, '= 50.84')).toBe(true);
    expect(weigh(50.8349, '= 50.84')).toBe(false);
  });

  it('leaves a whole number meaning the figure itself, decimals and all', () => {
    expect(weigh(41, '= 41')).toBe(true);
    expect(weigh(41.4, '= 41')).toBe(false);
    expect(weigh(9.7, '< 10')).toBe(true);
  });

  it('leaves every operator agreeing on which side of the literal a value fell', () => {
    const derived: Record<ComparisonOperator, (fell: ComparisonOperator) => boolean> = {
      '<': (fell) => fell === '<',
      '=': (fell) => fell === '=',
      '>': (fell) => fell === '>',
      '<=': (fell) => fell !== '>',
      '>=': (fell) => fell !== '<',
      '!=': (fell) => fell !== '=',
    };
    expect(Object.keys(derived).sort()).toEqual([...comparison.forms].sort());

    for (const literal of ['50.84', '50.8', '41', '0.5'])
      for (const value of [41 * 1.24, 50.835, 50.8349, 41, 41.4, 0.4999, 0.5]) {
        const fell = (['<', '=', '>'] as const).filter((operator) => weigh(value, `${operator} ${literal}`));
        expect(fell).toHaveLength(1);
        for (const [operator, agrees] of Object.entries(derived)) expect(weigh(value, `${operator} ${literal}`)).toBe(agrees(fell[0]));
      }
  });

  it('prints a literal back with the decimals it was written to', () => {
    for (const source of ['stat.attack = 50.84', 'stat.attack = 50.80', 'stat.attack >= 41', 'resource.health < -0.25']) expect(condition.print(parse(source))).toBe(source);
  });
});

describe('the authored / derived boundary', () => {
  const gold = () => parseOne('# item gold\nexamine: Small bright coins.\ncurrency', item);

  it('leaves an unauthored title absent, defaulting it only in hydration', () => {
    expect(gold().title).toBeUndefined();
    expect(hydrate(item, gold()).title).toBe('Gold');
  });

  it('resolves a default that reads another default, with nothing ordering them', () => {
    const chained: SectionSchema<{ id: string; a: string; b: string }> = {
      kind: 'chained',
      fields: {
        a: { parser: text, default: (self) => `${self.b}!` },
        b: { parser: text, default: (self) => self.id.toUpperCase() },
      },
    };
    expect(hydrateSection({ id: 'x' }, chained).a).toBe('X!');
    expect(hydrateSection({ id: 'x', a: 'authored' }, chained).a).toBe('authored');
  });

  it('leaves an unauthored examine absent rather than inventing an English sentence for it', () => {
    expect(hydrate(item, parseOne('# item mystery-box', item)).examine).toBeUndefined();
  });

  it('reads a default against the language its module declared', () => {
    expect(hydrate(item, parseOne('# item mystery-box', item), { language: 'es' }).title).toBe('mystery-box');
    expect(hydrate(item, parseOne('# item mystery-box', item), { language: 'en' }).title).toBe('Mystery Box');
  });

  it('lets an authored field win over its default', () => {
    expect(hydrate(item, gold()).examine).toBe('Small bright coins.');
  });

  it('throws a DslError on a circular default instead of looping forever', () => {
    const cyclic: SectionSchema<{ id: string; a: string; b: string }> = {
      kind: 'cyclic',
      fields: {
        a: { parser: text, default: (self) => self.b },
        b: { parser: text, default: (self) => self.a },
      },
    };
    const view = hydrateSection({ id: 'x' }, cyclic);
    expect(() => view.a).toThrow(/circular default/);
  });
});

describe('tag-clause micro-grammar', () => {
  const clause = (source: string) => tagClause.parse(new Cursor(source));

  it('picks the clause shape by syntax, never by keyword lookup', () => {
    expect(clause('mainhand')).toEqual({ kind: 'keyword', value: 'mainhand' });
    expect(clause('+3 regeneration')).toEqual({
      kind: 'stat-bonus',
      statId: 'regeneration',
      amount: point(3),
      percent: false,
    });
    expect(clause('+2% attack')).toEqual({
      kind: 'stat-bonus',
      statId: 'attack',
      amount: 2,
      percent: true,
    });
    expect(clause('1m40s')).toEqual({ kind: 'duration', seconds: 100 });
  });

  it('threads an absolute source span into errors', () => {
    const source = '# item broken\nexamine: ok\n+ bad';
    let error: unknown;
    try {
      parseModule(source);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(DslError);
    expect((error as DslError).span?.start).toBe(source.indexOf('+ bad'));
  });
});

describe('a sub-parser must consume the whole line, like the section engine does', () => {
  const load =
    (...lines: string[]) =>
    () =>
      loadModule(lines.join('\n'));

  it('refuses trailing garbage after an action field', () => {
    expect(load('# item coin', '# entity gull', 'peck:', '  requires: has coin typo', '  say: hi')).toThrow(/unexpected content after an action field: "typo"/);
    expect(load('# item coin', '# entity gull', 'peck:', '  give: coin typo')).toThrow(/unexpected content after a result: "typo"/);
    expect(load('# stat attack', '# entity gull', 'peck:', '  accuracy: attack typo', '  say: hi')).toThrow(/unexpected content after an action field/);
    expect(load('# entity gull', 'peck:', '  time: 1e3', '  say: hi')).toThrow(/unexpected content after an action field: "e3"/);
    expect(load('# entity gull', 'peck:', '  attempts: 3 times', '  say: hi')).toThrow(/unexpected content after an action field: "times"/);
  });

  it('refuses trailing garbage in a dialogue condition or effect', () => {
    const dialogue = (...body: string[]) => load('# flag lit', '# item coin', '# entity miki', '# dialogue chat', 'owner = miki', 'node a:', ...body);
    expect(dialogue('  when: lit typo', '  Hi.')).toThrow(/unexpected content after a node when/);
    expect(dialogue('  Hi.', '  -> go (when lit typo)')).toThrow(/unexpected content after a choice when/);
    expect(dialogue('  give: 1 coin typo', '  Hi.')).toThrow(/unexpected content after a result: "typo"/);
  });

  it('refuses trailing garbage in a test assertion', () => {
    expect(load('# flag lit', '# test t', 'assert: lit typo')).toThrow(/unexpected content after an assert condition/);
  });

  it('still accepts every field written correctly', () => {
    expect(load('# flag a', '# flag b', '# item coin', '# stat attack', '# entity gull', 'peck:', '  requires: a and not b', '  time: 1.5', '  accuracy: attack', '  attempts: 3', '  give: 1 coin, say: Hi')).not.toThrow();
  });
});

describe('a value that reads as a mistake is refused rather than reinterpreted', () => {
  const load =
    (...lines: string[]) =>
    () =>
      loadModule(lines.join('\n'));

  it('takes a sign on add:, which used to fall through to +1', () => {
    const results = loadModule('# flag counter\n# entity gull\npeck:\n  add: counter -3').entities.get('gull')!.actions[0].results;
    expect(results).toEqual([{ kind: 'add', variable: 'counter', amount: -3 }]);
  });

  it('refuses a count of zero, which is a line that does nothing', () => {
    expect(load('# item straw', '# entity gull', 'peck:', '  give: 0 straw')).toThrow(/a count of 0 does nothing: straw/);
    expect(load('# item straw', '# item hay', '# recipe bale', 'in: 0 straw', 'out: hay')).toThrow(/a count of 0 does nothing/);
  });

  it('refuses burnt: outputs that nothing can ever reach', () => {
    expect(load('# item dough', '# item bread', '# item ash', '# recipe bake', 'in: dough', 'out: bread', 'burnt: ash')).toThrow(/burnt: needs an accuracy: stat/);
  });
});

describe('a field name that is one letter off is a typo, not an action label', () => {
  it('refuses the near-miss and names the field it read as intended', () => {
    expect(() => parseOne('# location den\nflag: say: oops', location)).toThrow(/unknown location field: flag, one letter from flags/);
    expect(() => parseOne('# location den\nexamin: say: oops', location)).toThrow(/one letter from examine/);
    expect(() => parseOne('# location den\nentites: shrine', location)).toThrow(/one letter from entities/);
    expect(() => parseOne('# location den\nstartin: say: oops', location)).toThrow(/one letter from starting/);
    expect(() => parseOne('# location den\n-flag: ', location)).toThrow(/one letter from flags/);
  });

  it('leaves an action label that is merely short or unfamiliar alone', () => {
    const den = parseOne('# location den\neat: say: You eat.\npick lock: say: Click.\nrest: say: You rest.', location);
    expect(den.actions?.map((action) => action.label)).toEqual(['eat', 'pick lock', 'rest']);
  });
});

interface WalkableField {
  kind: string;
  name: string;
  keyword: string;
  parser: object;
  positional: boolean;
  sectionTakesClauses: boolean;
}

function schemaFields(): WalkableField[] {
  return sections().flatMap((each) => {
    const schema = each.schema;
    if (schema === undefined) return [];
    return Object.entries(schema.fields).map(([name, field]) => ({
      kind: schema.kind,
      name,
      keyword: field.keyword ?? name,
      parser: field.parser as object,
      positional: isPositionalField(schema, name),
      sectionTakesClauses: schema.clauses !== undefined,
    }));
  });
}

const fieldName = (field: WalkableField): string => `${field.kind}.${field.name}`;
const takesABlock = (field: WalkableField): boolean => 'parseBlock' in field.parser;

type Outcome = { read: true; value: string } | { read: false; refusal: string };

const attempt = (parse: () => unknown): Outcome => {
  try {
    return { read: true, value: JSON.stringify(parse()) };
  } catch (error) {
    return {
      read: false,
      refusal: error instanceof Error ? error.message : String(error),
    };
  }
};

const parseProbe = (source: string): Outcome => attempt(() => parseModule(source)[0].value);

const inlineSection = (field: WalkableField, op: string, authored: string): Outcome => parseProbe(`# ${field.kind} probe\n${op}${field.keyword}: ${authored}\n`);
const blockSection = (field: WalkableField, op: string, authored: string): Outcome => parseProbe(`# ${field.kind} probe\n${op}${field.keyword}:\n  ${authored}\n`);

const asOneLine = (authored: string): RawLine => ({
  text: authored,
  span: { start: 0, end: authored.length },
  children: [],
});
const inlineField = (field: WalkableField, authored: string): Outcome => attempt(() => parseWhole(field.parser as Parser<unknown>, authored, 0, 'a list item'));
const blockField = (field: WalkableField, authored: string): Outcome => attempt(() => (field.parser as ListParser<unknown>).parseBlock([asOneLine(authored)]));

const disagree = (a: Outcome, b: Outcome): boolean => a.read !== b.read || (a.read && b.read && a.value !== b.value);

const AUTHORED = ['a', 'a b', 'a b c', '1 a', '2 a b', 'a 2.5', 'a b: c', 'a, b', '+2 a', '+2x added a', 'drain: 5 health', 'drain: 5 health b'];

const OPS = ['', '+', '-'];

describe('a field that takes a block reads one exactly where it reads the same text inline', () => {
  const fields = schemaFields();
  const blockCapable = fields.filter(takesABlock);
  const oneToALine = blockCapable.filter((field) => isList(field.parser));

  it('derives its subjects by the predicate the section engine decides a block by', () => {
    const addressable = fields.filter((field) => !field.positional);
    const declaresBlock = addressable.filter(takesABlock).map(fieldName);
    const engineReadsBlock = addressable
      .filter((field) => {
        const outcome = blockSection(field, '', 'a');
        return outcome.read || !outcome.refusal.includes('cannot be written as a block');
      })
      .map(fieldName);

    expect(declaresBlock).toEqual(engineReadsBlock);
    expect(declaresBlock).toContain('location.adjacent');
  });

  it('reads a block line and the same text handed to the whole parser identically', () => {
    expect(oneToALine.length).toBeGreaterThan(0);
    const disagreements = oneToALine.flatMap((field) => AUTHORED.filter((authored) => disagree(inlineField(field, authored), blockField(field, authored))).map((authored) => `${fieldName(field)}: ${JSON.stringify(authored)}`));
    expect(disagreements).toEqual([]);
  });

  it('never reads through a section a block that section refuses inline, in the bare, + and - forms', () => {
    const readOnlyAsABlock = oneToALine.flatMap((field) =>
      OPS.flatMap((op) =>
        AUTHORED.filter((authored) => {
          const inline = inlineSection(field, op, authored);
          const block = blockSection(field, op, authored);
          return (block.read && !inline.read) || (inline.read && block.read && inline.value !== block.value);
        }).map((authored) => `${fieldName(field)} ${op}${field.keyword}: ${JSON.stringify(authored)}`),
      ),
    );
    expect(readOnlyAsABlock).toEqual([]);
  });

  it('reads inline past the field parser only where the section absorbs a clause', () => {
    const inlineReadsMore = oneToALine.flatMap((field) => OPS.flatMap((op) => AUTHORED.filter((authored) => inlineSection(field, op, authored).read && !blockSection(field, op, authored).read).map(() => field)));
    expect(inlineReadsMore.filter((field) => !field.sectionTakesClauses).map(fieldName)).toEqual([]);
  });

  it('refuses a block line carrying an indented block of its own, on every field a block can address', () => {
    const swallowed = oneToALine
      .filter((field) => !field.positional)
      .filter((field) => {
        const accepted = AUTHORED.find((authored) => blockSection(field, '', authored).read);
        return (
          accepted !== undefined &&
          parseProbe(`# ${field.kind} probe
${field.keyword}:
  ${accepted}
    ${accepted}
`).read
        );
      })
      .map(fieldName);
    expect(swallowed).toEqual([]);
  });

  it('reads at least one authored text on every field a block can address', () => {
    const silent = oneToALine.filter((field) => !field.positional && !AUTHORED.some((authored) => blockSection(field, '', authored).read)).map(fieldName);
    expect(silent).toEqual([]);
  });
});

describe('a block-form line carrying more than its parser read', () => {
  const bay =
    (...lines: string[]) =>
    () =>
      parseModule(['# location bay', ...lines].join('\n'));

  it('refuses the leftover the loader used to drop, on each field the finding measured', () => {
    expect(bay('entities:', '  miki oven')).toThrow(/unexpected content after a list item: "oven"/);
    expect(bay('flags:', '  alert typo')).toThrow(/unexpected content after a list item: "typo"/);
    expect(bay('adjacent:', '  beach whille unlocked')).toThrow(/unexpected content after a list item: "whille unlocked"/);
    expect(() => parseModule('# action brawl\non success:\n  xp: brawling 2.5')).toThrow(/unexpected content after a result: "\.5"/);
  });

  it('refuses a while one letter off rather than dropping the condition it gates', () => {
    expect(bay('adjacent:', '  beach while unlocked')).not.toThrow();
    expect(bay('adjacent:', '  beach whille unlocked')).toThrow(DslError);
  });
});

describe('a keyword written over a body already there', () => {
  const bay =
    (...lines: string[]) =>
    () =>
      parseModule(['# location bay', ...lines].join('\n'))[0]!.value as { starting?: boolean };

  it('is taken back by -, and written by the bare word', () => {
    expect(bay('-starting')().starting).toBe(false);
    expect(bay('starting')().starting).toBe(true);
    expect(bay('x: 1')().starting).toBeUndefined();
  });

  it('refuses +, because a bare word already writes one that is not there', () => {
    expect(bay('+starting')).toThrow(/a bare starting already writes starting when it is not there/);
  });

  it('leaves a bare field alone that only begins the way a taken-back keyword does', () => {
    expect(bay('-startling')).toThrow(DslError);
    expect(() => parseModule('# stat pull\nbase: -5')).not.toThrow();
  });
});
