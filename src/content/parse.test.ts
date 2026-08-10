import { describe, expect, it } from 'vitest';
import { condition } from '../grammar/condition';
import { Action, entitySchema } from './entity';
import { itemSchema } from './item';
import { locationSchema } from './location';
import { loadModule, loadUniverse } from './registry';
import { parseModule } from './module';
import { Cursor, DslError } from '../grammar/parser';
import { point } from '../grammar/range';
import { SectionSchema, hydrateSection, parseSection } from '../grammar/section';
import { skillSchema } from './skill';
import { statSchema } from './stat';
import { splitSections } from '../grammar/structure';
import { variableSchema } from './variable';
import { tagClause } from '../grammar/tagClause';
import { text } from '../grammar/values';

function parseOne<H extends { id: string }, F extends keyof H = never, E extends keyof H = never>(source: string, schema: SectionSchema<H, F, E>) {
  const sections = splitSections(source);
  expect(sections).toHaveLength(1);
  return parseSection(sections[0], schema);
}

const ref = (...path: string[]) => ({ kind: 'reference' as const, reference: { path } });
const literal = (text: string) => ({ kind: 'literal' as const, text });
const interpolate = (...path: string[]) => ({ kind: 'interpolate' as const, reference: { path } });

describe('items and tag clauses', () => {
  it('parses a bare-clause list, keeping duration and stat-bonus shapes', () => {
    const shrimp = parseOne('# item cooked-shrimp\nexamine: A simple meal.\nfood, +3 regeneration, 60s', itemSchema);
    expect(shrimp.examine).toBe('A simple meal.');
    expect(shrimp.tags).toEqual([
      { kind: 'keyword', value: 'food' },
      { kind: 'stat-bonus', statId: 'regeneration', amount: point(3), percent: false },
      { kind: 'duration', seconds: 60 },
    ]);
  });

  // The counter is the resource's level here; a buff's stack count and a stat
  // join the same shape rather than growing a second multiplier.
  it('parses a counter-scaled stat bonus beside the flat and percent forms', () => {
    const blade = parseOne('# item blade\n+4-7 attack, +2 attack per rage, +10% attack per rage', itemSchema);
    expect(blade.tags).toEqual([
      { kind: 'stat-bonus', statId: 'attack', amount: { min: 4, max: 7 }, percent: false },
      { kind: 'stat-bonus', statId: 'attack', amount: point(2), percent: false, per: 'rage' },
      { kind: 'stat-bonus', statId: 'attack', amount: 10, percent: true, per: 'rage' },
    ]);
  });

  it('resolves the counter as a resource, so a bonus scaled by nothing is a load error', () => {
    const source = (counter: string) => `# stat attack\nbase: 5\n\n# resource rage\nmax: attack\ndisplay: minimal\n\n# item blade\n+2 attack per ${counter}\n`;
    expect(loadModule(source('rage')).items.get('blade')!.tags).toEqual([{ kind: 'stat-bonus', statId: 'attack', amount: point(2), percent: false, per: 'rage' }]);
    expect(() => loadModule(source('fury'))).toThrow(/resource/);
  });

  it('rejects a labelled tags: with a message naming it as a bare field, not a tag-clause parse error', () => {
    expect(() => parseOne('# item cooked-shrimp\nexamine: A simple meal.\ntags: food', itemSchema)).toThrow("item field tags must be written bare, without a 'tags:' label");
  });
});

// A hook is carried by the same things that carry `+4-7 attack`: an entity's own
// block and an equipped item. Neither block names a side, an action or a weapon.
describe('the two carriers of a hook', () => {
  const DRAIN_THEM = { kind: 'pool', resource: 'health', delta: { min: -2, max: -2 }, party: 'them' };

  it('reads on hit: on an entity as a hook rather than as an action or an on <event>: handler', () => {
    const berserker = parseOne(
      ['# entity berserker', 'uses: melee-combat', 'on hit:', '  restore: 1 rage', '  1 in 20:', '    drain: 4 health from them', 'when hit: drain: 2 health from them', 'on death: say: It falls.'].join('\n'),
      entitySchema,
    );
    expect(berserker.onHit).toEqual([
      { kind: 'pool', resource: 'rage', delta: point(1) },
      { kind: 'chance', numerator: 1, denominator: 20, results: [{ kind: 'pool', resource: 'health', delta: { min: -4, max: -4 }, party: 'them' }] },
    ]);
    expect(berserker.whenHit).toEqual([DRAIN_THEM]);
    // `on death:` is still the handler it was; `on hit:` no longer joins it as a
    // handler for an event named "hit", which is what claiming the label costs.
    expect(berserker.blocks).toEqual([{ label: 'on death', event: 'death', results: [{ kind: 'say', text: 'It falls.' }] }]);
  });

  it('reads both on an item, whose labelled blocks were actions until now', () => {
    const blade = parseOne(['# item venomous-blade', 'slot: mainhand', '+4-7 attack', 'on hit: 1 in 4: drain: 3 health from them', 'when hit: drain: 2 health from them', 'swing: say: You swing it.'].join('\n'), itemSchema);
    expect(blade.onHit).toEqual([{ kind: 'chance', numerator: 1, denominator: 4, results: [{ kind: 'pool', resource: 'health', delta: { min: -3, max: -3 }, party: 'them' }] }]);
    expect(blade.whenHit).toEqual([DRAIN_THEM]);
    expect(blade.actions?.map((action) => action.label)).toEqual(['swing']);
  });

  it('refuses a hook on a section that carries no character modifier', () => {
    expect(() => parseOne('# location camp\nx: 0, y: 0\non hit: drain: 2 health from them', locationSchema)).toThrow('write it on the `# entity` or `# item` that carries it');
  });

  it('refuses each defined more than once, the way any field of a section is', () => {
    expect(() => parseOne('# entity rat\non hit: restore: 1 rage\non hit: restore: 2 rage', entitySchema)).toThrow('entity field on hit is defined more than once');
  });

  it('names the field an author was one letter from, rather than reading the typo as an action', () => {
    expect(() => parseOne('# item blade\non hi: restore: 1 rage', itemSchema)).toThrow('unknown item field: on hi, one letter from on hit');
  });

  // A hook is a list field, so the section engine accepts `+`/`-` on it and
  // holds the operations until merge. Resolution runs first and must read them.
  it('resolves a hook written as an edit, on a carrier that has none to edit yet', () => {
    const module = '# stat attack\nbase: 5\n\n# resource rage\nmax: attack\ndisplay: minimal\n\n# entity rat\n+on hit: restore: 1 rage\n\n# item mail\n-when hit: restore: 1 rage\n';
    expect(loadModule(module).entities.get('rat')!.onHit).toEqual([{ kind: 'pool', resource: 'rage', delta: point(1) }]);
    expect(loadModule(module).items.get('mail')!.whenHit).toEqual([]);
  });

  it('appends to the hook a patch module overlays rather than replacing it', () => {
    const base = { name: 'base', text: '# info base\nversion: 1.0.0\n\n# stat attack\nbase: 5\n\n# resource rage\nmax: attack\ndisplay: minimal\n\n# entity rat\non hit: restore: 1 rage\n' };
    const patch = { name: 'patch', text: '# info patch\nversion: 1.0.0\ndependencies:\n  base\n\n# entity base.rat\n+on hit: drain: 2 base.rage from them\n' };
    expect(loadUniverse([base, patch]).entities.get('base.rat')!.onHit).toEqual([
      { kind: 'pool', resource: 'base.rage', delta: point(1) },
      { kind: 'pool', resource: 'base.rage', delta: { min: -2, max: -2 }, party: 'them' },
    ]);
  });

  // An entity answers an event by writing `on <its name>:`, and one of those
  // labels is now a hook. Refused where the name is bound.
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
    expect(section.value).toEqual({ id: 'gold', examine: 'Small bright coins.', tags: [{ kind: 'keyword', value: 'currency' }] });
  });

  it('accepts a UTF-8 BOM before the first section', () => {
    const [section] = parseModule('\uFEFF# item gold\nexamine: Small bright coins.');
    expect(section.value).toMatchObject({ id: 'gold', examine: 'Small bright coins.' });
  });

  it('accepts CRLF line endings', () => {
    const sections = parseModule('# item gold\r\nexamine: Small bright coins.\r\n# stat vigor\r\nbase: 3');
    expect(sections.map((section) => section.kind)).toEqual(['item', 'stat']);
    expect(sections[0].value).toMatchObject({ id: 'gold', examine: 'Small bright coins.' });
  });
});

describe('stat and skill', () => {
  it('leaves stat base and title absent, defaulting them in hydration', () => {
    const stat = parseOne('# stat attack', statSchema);
    expect(stat).toEqual({ id: 'attack' });
    const hydrated = hydrateSection(stat, statSchema);
    expect(hydrated.title).toBe('Attack');
    expect(hydrated.base).toEqual(point(0));
  });

  it('leaves a gathering skill stat-id undefined, since it has no default', () => {
    const skill = parseOne('# skill mining', skillSchema);
    expect(skill['stat-id']).toBeUndefined();
    expect(hydrateSection(skill, skillSchema).title).toBe('Mining');
  });
});

describe('variable', () => {
  it('parses a decimal value', () => {
    const variable = parseOne('# variable travel-seconds-per-unit\nvalue: 5', variableSchema);
    expect(variable).toEqual({ id: 'travel-seconds-per-unit', value: 5 });
  });

  it('leaves an omitted value absent so the consumer applies its own fallback', () => {
    const variable = parseOne('# variable travel-seconds-per-unit', variableSchema);
    expect(variable.value).toBeUndefined();
    expect(hydrateSection(variable, variableSchema).value).toBeUndefined();
  });
});

describe('location: schema-aware line parsing', () => {
  it('parses several fields from one line', () => {
    const loft = parseOne('# location loft\nx: 0, y: 0, z: 1\nentities: stairs-down, 3 window', locationSchema);
    expect(loft).toEqual({ id: 'loft', x: 0, y: 0, z: 1, entities: [{ entity: 'stairs-down' }, { count: 3, entity: 'window' }] });
  });

  it('keeps commas inside a free-text field while splitting a coordinate line', () => {
    const beach = parseOne("# location beach\nx: 1, y: 0\nexamine: Wow, isn't this place empty?", locationSchema);
    expect(beach.x).toBe(1);
    expect(beach.y).toBe(0);
    expect(beach.examine).toBe("Wow, isn't this place empty?");
  });

  it('parses adjacency inline and as a block, with edge conditions', () => {
    const inline = parseOne('# location beach\nx: 1, y: 0\nadjacent: guide-house, bridge', locationSchema);
    expect(inline.adjacent).toEqual([{ target: 'guide-house' }, { target: 'bridge' }]);

    const block = parseOne('# location bridge\nx: 2, y: 0\nadjacent:\n  beach\n  bank while bridge-open', locationSchema);
    expect(block.adjacent).toEqual([{ target: 'beach' }, { target: 'bank', condition: ref('bridge-open') }]);
  });

  it('parses the full corpus guide-house end to end, including the starting flag', () => {
    const source = ['# location guide-house', 'x: 0, y: 0', 'starting', 'adjacent:', '  beach while front-door.unlocked', 'entities:', '  miki, stairs-up, front-door, dresser, bookshelf, painting, mirror'].join('\n');
    expect(parseOne(source, locationSchema)).toEqual({
      id: 'guide-house',
      x: 0,
      y: 0,
      starting: true,
      adjacent: [{ target: 'beach', condition: ref('front-door', 'unlocked') }],
      entities: ['miki', 'stairs-up', 'front-door', 'dresser', 'bookshelf', 'painting', 'mirror'].map((entity) => ({ entity })),
    });
  });

  it('defaults an absent starting flag to false on hydration', () => {
    const plain = parseOne('# location plain-room\nx: 1, y: 0', locationSchema);
    expect(plain.starting).toBeUndefined();
    expect(hydrateSection(plain, locationSchema).starting).toBe(false);
  });
});

describe('parser guards', () => {
  it('makes a free-text field line-terminal (M1)', () => {
    const beach = parseOne('# location beach\nx: 1, y: 0\ntitle: Sunny, warm, x: 9', locationSchema);
    expect(beach.title).toBe('Sunny, warm, x: 9');
    expect(beach.x).toBe(1);
  });

  it('parses a relative position and rejects defining position two ways (M2)', () => {
    const dock = parseOne('# location dock\neast of bridge', locationSchema);
    expect(dock.relative).toEqual({ direction: 'east', of: 'bridge' });
    expect(dock.x).toBeUndefined();
    expect(() => parseOne('# location dock\nx: 0, y: 0\neast of bridge', locationSchema)).toThrow(/cannot both be set/);
  });

  // Both halves used to load with the block dropped and nothing said, which is
  // what the result readers each carry their own copy of this rule to prevent.
  it('rejects a field written inline and as a block, rather than keeping the inline half', () => {
    expect(() => parseOne('# entity rat\nstats: vigor 3\n  attack 4', entitySchema)).toThrow('entity field stats is written inline and as a block; give it one');
    expect(() => parseOne('# item blade\non hit: restore: 1 rage\n  restore: 5 rage', itemSchema)).toThrow('item field on hit is written inline and as a block; give it one');
  });

  it('rejects a field defined twice', () => {
    expect(() => parseOne('# location dock\nx: 0\nx: 1', locationSchema)).toThrow(/defined more than once/);
  });

  it('treats an empty value as unspecified — indistinguishable from absent (L7)', () => {
    const loc = parseOne('# location void\nx: \ny: 0', locationSchema);
    expect(loc.x).toBeUndefined();
    expect(loc.y).toBe(0);
    expect(hydrateSection(loc, locationSchema).x).toBe(0);

    const empty = parseOne('# location void\nx: 0\nentities:', locationSchema);
    const absent = parseOne('# location void\nx: 0', locationSchema);
    expect(empty).toEqual(absent);
  });
});

describe('entity actions', () => {
  it('parses an inline action and a space-labelled block action', () => {
    const stairs = parseOne('# entity stairs-up\ntitle: Stairs\nascend: relocate: guide-house-upstairs, say: You climb the stairs.', entitySchema);
    expect(stairs.blocks).toEqual([
      { label: 'ascend', results: [{ kind: 'relocate', location: 'guide-house-upstairs' }, { kind: 'say', text: 'You climb the stairs.' }] },
    ]);

    const window = parseOne(['# entity window', 'look through:', '  discover: beach', '  say: Through the window, a bridge.'].join('\n'), entitySchema);
    expect(window.blocks).toEqual([
      { label: 'look through', results: [{ kind: 'discover', location: 'beach' }, { kind: 'say', text: 'Through the window, a bridge.' }] },
    ]);
  });

  it('parses every result verb, accepting both set forms', () => {
    const source = ['# entity chest', 'loot:', '  set drawers-open', '  unset: sealed', '  give: 12 coins', '  take: 5 cooked-shrimp', '  xp: thieving 4', '  open modal: name-editor'].join('\n');
    expect(parseOne(source, entitySchema).blocks?.[0].results).toEqual([
      { kind: 'set', variable: 'drawers-open' },
      { kind: 'unset', variable: 'sealed' },
      { kind: 'give', item: 'coins', amount: point(12) },
      { kind: 'take', item: 'cooked-shrimp', amount: 5 },
      { kind: 'xp', skill: 'thieving', amount: point(4) },
      { kind: 'open-modal', modal: 'name-editor' },
    ]);
  });

  it('parses add: with and without an explicit amount, defaulting to 1', () => {
    const source = ['# entity chest', 'loot:', '  add: rats-killed', '  add: coins-found 5'].join('\n');
    expect(parseOne(source, entitySchema).blocks?.[0].results).toEqual([
      { kind: 'add', variable: 'rats-killed', amount: 1 },
      { kind: 'add', variable: 'coins-found', amount: 5 },
    ]);
  });

  it('defaults an entity title from its id and hydrates empty actions', () => {
    const miki = parseOne('# entity miki\nexamine: A tall man.', entitySchema);
    expect(miki.blocks).toBeUndefined();
    const hydrated = hydrateSection(miki, entitySchema);
    expect(hydrated.title).toBe('Miki');
    expect(hydrated.blocks).toEqual([]);
  });
});

describe('entity action modifiers', () => {
  it('parses requires, hidden if, bare tags and on success, treating require as requires', () => {
    const source = ['# entity front-door', 'pick lock:', '  requires: lockpick', '  hidden if: unlocked', '  instant', '  xp: thieving 4', '  on success:', '    set: unlocked', '    say: The lock clicks.'].join('\n');
    const door = parseOne(source, entitySchema);
    expect(door.blocks).toEqual([
      {
        label: 'pick lock',
        requires: ref('lockpick'),
        hiddenIf: ref('unlocked'),
        kind: 'instant',
        tags: [{ kind: 'keyword', value: 'instant' }],
        results: [{ kind: 'xp', skill: 'thieving', amount: point(4) }],
        onSuccess: [{ kind: 'set', variable: 'unlocked' }, { kind: 'say', text: 'The lock clicks.' }],
      },
    ]);
    expect(parseOne(source.replace('requires: lockpick', 'require: lockpick'), entitySchema)).toEqual(door);
  });

  it('rejects requires, hidden if, and on success each defined more than once', () => {
    expect(() => parseOne('# entity chest\nopen:\n  requires: a\n  require: b\n  say: hi', entitySchema)).toThrow(/requires is defined more than once/);
    expect(() => parseOne('# entity chest\nopen:\n  hidden if: a\n  hidden if: b\n  say: hi', entitySchema)).toThrow(/hidden if is defined more than once/);
    expect(() => parseOne('# entity chest\nopen:\n  on success:\n    say: a\n  on success:\n    say: b', entitySchema)).toThrow(/on success is defined more than once/);
  });

  // Every action field, not the handful that happened to have a test: the guard
  // is one shared rule, and a field added without it is what this catches.
  it.each([
    ['requires: a', 'requires'],
    ['hidden if: a', 'hidden if'],
    ['on success: say: a', 'on success'],
    ['on failure: say: a', 'on failure'],
    ['on unfinished: say: a', 'on unfinished'],
    ['time: 1', 'time'],
    ['rate: quickness', 'rate'],
    ['accuracy: aim', 'accuracy'],
    ['damage: might', 'damage'],
    ['depletes: health', 'depletes'],
    ['attempts: 3', 'attempts'],
  ])('rejects %s written twice', (line, written) => {
    expect(parseOne(`# entity chest\nopen:\n  ${line}\n  say: hi`, entitySchema).blocks).toHaveLength(1);
    expect(() => parseOne(`# entity chest\nopen:\n  ${line}\n  ${line}\n  say: hi`, entitySchema)).toThrow(`action "open": ${written} is defined more than once`);
  });

  it('no longer accepts a health: field, which the implicit target pool replaced', () => {
    expect(() => parseOne('# entity chest\nopen:\n  health: 3\n  say: hi', entitySchema)).toThrow(/unrecognized tag clause/);
  });

  it('parses on failure inline and as a block, and rejects it defined more than once', () => {
    const inline = parseOne('# entity chest\nopen:\n  take: 5 cooked-shrimp\n  on failure: say: Not enough shrimp.', entitySchema);
    expect(inline.blocks).toEqual([
      {
        label: 'open',
        results: [{ kind: 'take', item: 'cooked-shrimp', amount: 5 }],
        onFailure: [{ kind: 'say', text: 'Not enough shrimp.' }],
      },
    ]);

    const block = parseOne('# entity chest\nopen:\n  take: 5 cooked-shrimp\n  on failure:\n    say: Not enough shrimp.\n    set: chest-jammed', entitySchema);
    expect((block.blocks?.[0] as Action).onFailure).toEqual([{ kind: 'say', text: 'Not enough shrimp.' }, { kind: 'set', variable: 'chest-jammed' }]);

    expect(() => parseOne('# entity chest\nopen:\n  on failure:\n    say: a\n  on failure:\n    say: b', entitySchema)).toThrow(/on failure is defined more than once/);
  });

  it('surfaces result-related errors for malformed results, not tag errors', () => {
    expect(() => parseOne('# entity chest\nopen:\n  give:', entitySchema)).toThrow(/expected an id/);
  });
});

// A kind says what ends the action; a cadence says how fast it attempts. The
// table is the pair, and every combination it has no meaning for is a load
// error rather than a silent default the runtime has to guess at.
describe('action kinds and their cadence', () => {
  const parseAction = (...lines: string[]) => parseOne(['# entity forge', 'work:', ...lines.map((line) => `  ${line}`)].join('\n'), entitySchema).blocks![0] as Action;

  it('makes an untagged action a duration, and lifts the two written kinds off their tags', () => {
    expect(parseAction('say: hi').kind).toBeUndefined();
    expect(parseAction('instant', 'say: hi').kind).toBe('instant');
    expect(parseAction('continuous', 'time: 2', 'say: hi').kind).toBe('continuous');
  });

  it('keeps both cadence spellings, a stat rate apart from a literal one', () => {
    expect(parseAction('time: 2.5', 'say: hi')).toMatchObject({ time: 2.5 });
    expect(parseAction('rate: 15', 'say: hi')).toMatchObject({ rate: 15 });
    expect(parseAction('rate: quickness', 'say: hi')).toMatchObject({ rate: { id: 'quickness' } });
  });

  // A tag list is the one place an action takes a free-form word, so it is the
  // one place a typo has nowhere to land. `once` sat in shipped content doing
  // nothing until this rule; `4s` was the front door meaning `time: 4`.
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
      tags: [{ kind: 'keyword', value: 'continuous' }, { kind: 'stat-bonus', statId: 'attack' }],
    });
  });

  // The compiled craft is judged by the same table as an authored action, so a
  // recipe cannot express a cadence the grammar would have refused.
  it.each([['rate: 0'], ['rate: -30'], ['time: 0'], ['time: -3']])('refuses %s on a recipe, naming the recipe and its craft', (line) => {
    expect(() => loadModule(`# item ore\nexamine: Rock.\n# recipe dig\n${line}\nout: 1 ore\n`)).toThrow(/# recipe dig action "Craft Dig": (time|rate): must be positive/);
  });

  // A shared value parser says what it expected but not what it was reading;
  // an author needs the field and the action as much as the table's errors do.
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
      '  sticky',
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
            { kind: 'say', segments: [literal('What do you say I show you the ropes?')] },
            { kind: 'effect', result: { kind: 'set', variable: 'tutorial.quest-given' } },
            {
              kind: 'menu',
              choices: [
                { segments: [literal('Sounds good.')], effects: [] },
                { segments: [literal("I'd rather not.")], effects: [{ kind: 'set', variable: 'tutorial.snubbed' }], goto: 'snub' },
              ],
            },
          ],
        },
        {
          name: 'remind-mirror',
          when: ref('tutorial', 'quest-given'),
          sticky: true,
          again: [literal('The mirror is still waiting.')],
          steps: [{ kind: 'say', segments: [literal('The mirror awaits you.')] }],
        },
        { name: 'snub', steps: [{ kind: 'say', segments: [literal('Hmph. Suit yourself.')] }] },
      ],
    });
  });

  it('parses a guarded, consuming choice and a visit-count when: as a comparison', () => {
    const source = ['# dialogue troll', 'owner = bridge-troll', '', 'node toll:', '  when: toll.visits >= 5', '  Pay the toll!', '  -> Here, five shrimp.  (when has-shrimp)', '    take: 5 cooked-shrimp', '    goto paid'].join('\n');
    const [{ value }] = parseModule(source) as { value: { nodes: { when: unknown; steps: unknown[] }[] } }[];
    expect(value.nodes[0].when).toEqual({ kind: 'comparison', left: { path: ['toll', 'visits'] }, operator: '>=', right: 5 });
    expect(value.nodes[0].steps[1]).toEqual({
      kind: 'menu',
      choices: [{ segments: [literal('Here, five shrimp.')], when: ref('has-shrimp'), effects: [{ kind: 'take', item: 'cooked-shrimp', amount: 5 }], goto: 'paid' }],
    });
  });

  it('parses an interpolation, a conditional fragment, and a literal/interpolation mix', () => {
    const source = [
      '# dialogue miki',
      'owner = miki',
      '',
      'node greeting:',
      '  There you are — {player.name}, is it?',
      '  {tutorial.snubbed: You already made your choice.}',
      '  Welcome to {location.name}, {player.name}.',
    ].join('\n');

    const [{ value }] = parseModule(source) as { value: { nodes: { steps: { kind: string; segments: unknown[] }[] }[] } }[];
    const steps = value.nodes[0].steps;
    expect(steps[0].segments).toEqual([literal('There you are — '), interpolate('player', 'name'), literal(', is it?')]);
    expect(steps[1].segments).toEqual([{ kind: 'conditional', condition: ref('tutorial', 'snubbed'), text: 'You already made your choice.' }]);
    expect(steps[2].segments).toEqual([literal('Welcome to '), interpolate('location', 'name'), literal(', '), interpolate('player', 'name'), literal('.')]);
  });
});

describe('condition grammar', () => {
  const parse = (source: string) => condition.parse(new Cursor(source));

  it('parses references, dotted paths, combinators, and comparisons', () => {
    expect(parse('bridge-open')).toEqual(ref('bridge-open'));
    expect(parse('front-door.unlocked')).toEqual(ref('front-door', 'unlocked'));
    expect(parse('not troll-antagonized')).toEqual({ kind: 'not', condition: ref('troll-antagonized') });
    expect(parse('active-interaction and combat-interaction')).toEqual({ kind: 'and', conditions: [ref('active-interaction'), ref('combat-interaction')] });
    expect(parse('stat.attack>10')).toEqual({ kind: 'comparison', left: { path: ['stat', 'attack'] }, operator: '>', right: 10 });
  });

  it('parses has as a live inventory-count predicate, defaulting count to 1', () => {
    expect(parse('has lockpick')).toEqual({ kind: 'has', item: 'lockpick', count: 1 });
    expect(parse('has 5 cooked-shrimp')).toEqual({ kind: 'has', item: 'cooked-shrimp', count: 5 });
  });

  it('parses a hyphenated id starting with has- as a plain reference, not the has predicate', () => {
    expect(parse('has-shrimp')).toEqual(ref('has-shrimp'));
  });
});

describe('the authored / derived boundary', () => {
  const gold = () => parseOne('# item gold\nexamine: Small bright coins.\ncurrency', itemSchema);

  it('leaves an unauthored title absent, defaulting it only in hydration', () => {
    expect(gold().title).toBeUndefined();
    expect(hydrateSection(gold(), itemSchema).title).toBe('Gold');
  });

  it('resolves a default that reads another default, with nothing ordering them', () => {
    const mystery = parseOne('# item mystery-box', itemSchema);
    expect(mystery.title).toBeUndefined();
    expect(mystery.examine).toBeUndefined();
    const hydrated = hydrateSection(mystery, itemSchema);
    expect(hydrated.title).toBe('Mystery Box');
    expect(hydrated.examine).toBe('This is a Mystery Box.');
    expect(hydrateSection(parseOne('# item apple', itemSchema), itemSchema).examine).toBe('This is an Apple.');
  });

  it('lets an authored field win over its default', () => {
    expect(hydrateSection(gold(), itemSchema).examine).toBe('Small bright coins.');
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
    expect(clause('+3 regeneration')).toEqual({ kind: 'stat-bonus', statId: 'regeneration', amount: point(3), percent: false });
    expect(clause('+2% attack')).toEqual({ kind: 'stat-bonus', statId: 'attack', amount: 2, percent: true });
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
  const load = (...lines: string[]) => () => loadModule(lines.join('\n'));

  it('refuses trailing garbage after an action field', () => {
    expect(load('# item coin', '# entity gull', 'peck:', '  requires: has coin typo', '  say: hi')).toThrow(/unexpected content after an action field: "typo"/);
    // A results line is consumed by the result reader, which owns the demand.
    expect(load('# item coin', '# entity gull', 'peck:', '  give: coin typo')).toThrow(/unexpected content after a result: "typo"/);
    expect(load('# stat attack', '# entity gull', 'peck:', '  accuracy: attack typo', '  say: hi')).toThrow(/unexpected content after an action field/);
    // The number parsers stop where they stop; what follows used to be dropped.
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
  const load = (...lines: string[]) => () => loadModule(lines.join('\n'));

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
    expect(() => parseOne('# location den\nflag: say: oops', locationSchema)).toThrow(/unknown location field: flag, one letter from flags/);
    expect(() => parseOne('# location den\nexamin: say: oops', locationSchema)).toThrow(/one letter from examine/);
    expect(() => parseOne('# location den\nentites: shrine', locationSchema)).toThrow(/one letter from entities/);
    expect(() => parseOne('# location den\nstartin: say: oops', locationSchema)).toThrow(/one letter from starting/);
    expect(() => parseOne('# location den\n-flag: ', locationSchema)).toThrow(/one letter from flags/);
  });

  it('leaves an action label that is merely short or unfamiliar alone', () => {
    const den = parseOne('# location den\neat: say: You eat.\npick lock: say: Click.\nrest: say: You rest.', locationSchema);
    expect(den.actions?.map((action) => action.label)).toEqual(['eat', 'pick lock', 'rest']);
  });
});
