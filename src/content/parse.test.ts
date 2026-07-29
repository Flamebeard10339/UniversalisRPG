import { describe, expect, it } from 'vitest';
import { condition } from '../grammar/condition';
import { entitySchema } from './entity';
import { itemSchema } from './item';
import { locationSchema } from './location';
import { loadModule } from './registry';
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

  it('rejects a labelled tags: with a message naming it as a bare field, not a tag-clause parse error', () => {
    expect(() => parseOne('# item cooked-shrimp\nexamine: A simple meal.\ntags: food', itemSchema)).toThrow("item field tags must be written bare, without a 'tags:' label");
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
    const loft = parseOne('# location loft\nx: 0, y: 0, z: 1\nentities: stairs-down, window', locationSchema);
    expect(loft).toEqual({ id: 'loft', x: 0, y: 0, z: 1, entities: ['stairs-down', 'window'] });
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
      entities: ['miki', 'stairs-up', 'front-door', 'dresser', 'bookshelf', 'painting', 'mirror'],
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
    expect(stairs.actions).toEqual([
      { label: 'ascend', results: [{ kind: 'relocate', location: 'guide-house-upstairs' }, { kind: 'say', text: 'You climb the stairs.' }] },
    ]);

    const window = parseOne(['# entity window', 'look through:', '  discover: beach', '  say: Through the window, a bridge.'].join('\n'), entitySchema);
    expect(window.actions).toEqual([
      { label: 'look through', results: [{ kind: 'discover', location: 'beach' }, { kind: 'say', text: 'Through the window, a bridge.' }] },
    ]);
  });

  it('parses every result verb, accepting both set forms', () => {
    const source = ['# entity chest', 'loot:', '  set drawers-open', '  unset: sealed', '  give: 12 coins', '  take: 5 cooked-shrimp', '  xp: thieving 4', '  open modal: name-editor'].join('\n');
    expect(parseOne(source, entitySchema).actions?.[0].results).toEqual([
      { kind: 'set', variable: 'drawers-open' },
      { kind: 'unset', variable: 'sealed' },
      { kind: 'give', item: 'coins', amount: 12 },
      { kind: 'take', item: 'cooked-shrimp', amount: 5 },
      { kind: 'xp', skill: 'thieving', amount: 4 },
      { kind: 'open-modal', modal: 'name-editor' },
    ]);
  });

  it('parses add: with and without an explicit amount, defaulting to 1', () => {
    const source = ['# entity chest', 'loot:', '  add: rats-killed', '  add: coins-found 5'].join('\n');
    expect(parseOne(source, entitySchema).actions?.[0].results).toEqual([
      { kind: 'add', variable: 'rats-killed', amount: 1 },
      { kind: 'add', variable: 'coins-found', amount: 5 },
    ]);
  });

  it('defaults an entity title from its id and hydrates empty actions', () => {
    const miki = parseOne('# entity miki\nexamine: A tall man.', entitySchema);
    expect(miki.actions).toBeUndefined();
    const hydrated = hydrateSection(miki, entitySchema);
    expect(hydrated.title).toBe('Miki');
    expect(hydrated.actions).toEqual([]);
  });
});

describe('entity action modifiers', () => {
  it('parses requires, hidden if, bare tags and on success, treating require as requires', () => {
    const source = ['# entity front-door', 'pick lock:', '  requires: lockpick', '  hidden if: unlocked', '  once, 4s', '  xp: thieving 4', '  on success:', '    set: unlocked', '    say: The lock clicks.'].join('\n');
    const door = parseOne(source, entitySchema);
    expect(door.actions).toEqual([
      {
        label: 'pick lock',
        requires: ref('lockpick'),
        hiddenIf: ref('unlocked'),
        tags: [{ kind: 'keyword', value: 'once' }, { kind: 'duration', seconds: 4 }],
        results: [{ kind: 'xp', skill: 'thieving', amount: 4 }],
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
    ['on escape: say: a', 'on escape'],
    ['time: 1', 'time'],
    ['speed: quickness', 'speed'],
    ['accuracy: aim', 'accuracy'],
    ['evasion: dodge', 'evasion'],
    ['ability: might', 'ability'],
    ['target: health', 'target'],
    ['dr: armour', 'dr'],
    ['health: 3', 'health'],
    ['escape after 3', 'escape after'],
  ])('rejects %s written twice', (line, written) => {
    expect(parseOne(`# entity chest\nopen:\n  ${line}\n  say: hi`, entitySchema).actions).toHaveLength(1);
    expect(() => parseOne(`# entity chest\nopen:\n  ${line}\n  ${line}\n  say: hi`, entitySchema)).toThrow(`action ${written} is defined more than once`);
  });

  it('parses on failure inline and as a block, and rejects it defined more than once', () => {
    const inline = parseOne('# entity chest\nopen:\n  take: 5 cooked-shrimp\n  on failure: say: Not enough shrimp.', entitySchema);
    expect(inline.actions).toEqual([
      {
        label: 'open',
        results: [{ kind: 'take', item: 'cooked-shrimp', amount: 5 }],
        onFailure: [{ kind: 'say', text: 'Not enough shrimp.' }],
      },
    ]);

    const block = parseOne('# entity chest\nopen:\n  take: 5 cooked-shrimp\n  on failure:\n    say: Not enough shrimp.\n    set: chest-jammed', entitySchema);
    expect(block.actions?.[0].onFailure).toEqual([{ kind: 'say', text: 'Not enough shrimp.' }, { kind: 'set', variable: 'chest-jammed' }]);

    expect(() => parseOne('# entity chest\nopen:\n  on failure:\n    say: a\n  on failure:\n    say: b', entitySchema)).toThrow(/on failure is defined more than once/);
  });

  it('surfaces result-related errors for malformed results, not tag errors', () => {
    expect(() => parseOne('# entity chest\nopen:\n  give:', entitySchema)).toThrow(/expected an id/);
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
    expect(load('# item coin', '# entity gull', 'peck:', '  give: coin typo')).toThrow(/unexpected content after an action field/);
    expect(load('# stat attack', '# entity gull', 'peck:', '  accuracy: attack typo', '  say: hi')).toThrow(/unexpected content after an action field/);
    // The number parsers stop where they stop; what follows used to be dropped.
    expect(load('# entity gull', 'peck:', '  time: 1e3', '  say: hi')).toThrow(/unexpected content after an action field: "e3"/);
    expect(load('# entity gull', 'peck:', '  escape after 3 times', '  say: hi')).toThrow(/unexpected content after an action field: "times"/);
  });

  it('refuses trailing garbage in a dialogue condition or effect', () => {
    const dialogue = (...body: string[]) => load('# flag lit', '# item coin', '# entity miki', '# dialogue chat', 'owner = miki', 'node a:', ...body);
    expect(dialogue('  when: lit typo', '  Hi.')).toThrow(/unexpected content after a node when/);
    expect(dialogue('  Hi.', '  -> go (when lit typo)')).toThrow(/unexpected content after a choice when/);
    expect(dialogue('  give: 1 coin typo', '  Hi.')).toThrow(/unexpected content after a node effect/);
  });

  it('refuses trailing garbage in a test assertion', () => {
    expect(load('# flag lit', '# test t', 'assert: lit typo')).toThrow(/unexpected content after an assert condition/);
  });

  it('still accepts every field written correctly', () => {
    expect(load('# flag a', '# flag b', '# item coin', '# stat attack', '# entity gull', 'peck:', '  requires: a and not b', '  time: 1.5', '  accuracy: attack', '  escape after 3', '  give: 1 coin, say: Hi')).not.toThrow();
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
