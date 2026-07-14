import { describe, expect, it } from 'vitest';
import { Cursor, DslError } from './codec';
import { condition } from './condition';
import { itemSchema } from './item';
import { locationSchema } from './location';
import { parseModule, printModule } from './module';
import { SectionSchema, hydrateSection, parseSection, printSection } from './section';
import { skillSchema } from './skill';
import { statSchema } from './stat';
import { splitSections } from './structure';
import { tagClause } from './tagClause';
import { text } from './values';

function parseOne<H extends { id: string }, F extends keyof H = never>(source: string, schema: SectionSchema<H, F>) {
  const sections = splitSections(source);
  expect(sections).toHaveLength(1);
  return parseSection(sections[0], schema);
}

const corpus = [
  '# item gold',
  'examine: Small bright coins.',
  'currency',
  '',
  '# item cooked-shrimp',
  'examine: A simple meal that keeps you going.',
  'food, +3 regeneration, 60s',
  '',
  '# item copper-ore',
  'examine: A soft reddish ore.',
  'ore',
  '',
  '# item bones',
  'title: Bones',
  'examine: A dusty set of bones.',
].join('\n');

describe('round-trip law', () => {
  it('parses to a stable object and prints to canonical, fixed-point text', () => {
    const objects = parseModule(corpus);
    const printed = printModule(objects);
    expect(parseModule(printed)).toEqual(objects);
    expect(printModule(parseModule(printed))).toBe(printed);
  });

  it('prints already-canonical items back byte-for-byte', () => {
    for (const source of [
      '# item gold\nexamine: Small bright coins.\ncurrency',
      '# item copper-ore\nexamine: A soft reddish ore.\nore',
      '# item bones\ntitle: Bones\nexamine: A dusty set of bones.',
    ]) {
      expect(printSection(parseOne(source, itemSchema), itemSchema)).toBe(source);
    }
  });

  it('canonicalizes 60s to 1m without changing the parsed value', () => {
    const parsed = parseOne('# item cooked-shrimp\nexamine: A simple meal that keeps you going.\nfood, +3 regeneration, 60s', itemSchema);
    expect(parsed.tags).toContainEqual({ kind: 'duration', seconds: 60 });
    const printed = printSection(parsed, itemSchema);
    expect(printed).toContain('food, +3 regeneration, 1m');
    expect(parseOne(printed, itemSchema)).toEqual(parsed);
  });
});

describe('multi-kind dispatch', () => {
  const mixed = ['# item gold', 'examine: Small bright coins.', 'currency', '', '# stat health', 'base: 10', '', '# skill mining'].join('\n');

  it('dispatches each section by heading kind and round-trips the module', () => {
    const parsed = parseModule(mixed);
    expect(parsed.map((section) => section.kind)).toEqual(['item', 'stat', 'skill']);
    const printed = printModule(parsed);
    expect(printed).toBe(mixed);
    expect(parseModule(printed)).toEqual(parsed);
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

describe('stat and skill', () => {
  it('defaults stat base to 0 and title from id, without authoring either', () => {
    const stat = parseOne('# stat attack', statSchema);
    expect(stat).toEqual({ id: 'attack' });
    const hydrated = hydrateSection(stat, statSchema);
    expect(hydrated.title).toBe('Attack');
    expect(hydrated.base).toBe(0);
  });

  it('keeps an authored stat base through the round trip', () => {
    const stat = parseOne('# stat health\nbase: 10', statSchema);
    expect(stat.base).toBe(10);
    expect(printSection(stat, statSchema)).toBe('# stat health\nbase: 10');
  });

  it('leaves a gathering skill stat-id undefined, since it has no default', () => {
    const skill = parseOne('# skill mining', skillSchema);
    expect(skill['stat-id']).toBeUndefined();
    const hydrated = hydrateSection(skill, skillSchema);
    expect(hydrated['stat-id']).toBeUndefined();
    expect(hydrated.title).toBe('Mining');
    expect(printSection(skill, skillSchema)).toBe('# skill mining');
  });

  it('round-trips a combat skill that mirrors a stat', () => {
    const source = '# skill attack\nstat-id: attack';
    expect(printSection(parseOne(source, skillSchema), skillSchema)).toBe(source);
  });
});

describe('location: schema-aware line parsing', () => {
  it('parses several fields from one line, canonicalizing to one per line', () => {
    const loft = parseOne('# location loft\nx: 0, y: 0, z: 1\nentities: stairs-down, window', locationSchema);
    expect(loft).toEqual({ id: 'loft', x: 0, y: 0, z: 1, entities: ['stairs-down', 'window'] });
    const printed = printSection(loft, locationSchema);
    expect(printed).toBe('# location loft\nx: 0\ny: 0\nz: 1\nentities: stairs-down, window');
    expect(parseOne(printed, locationSchema)).toEqual(loft);
  });

  it('round-trips an already-canonical location byte-for-byte', () => {
    const source = '# location cellar\nx: 0\ny: 0\nentities: barrel, crate';
    expect(printSection(parseOne(source, locationSchema), locationSchema)).toBe(source);
  });

  it('keeps commas inside a free-text field while splitting a coordinate line', () => {
    const beach = parseOne("# location beach\nx: 1, y: 0\nexamine: Wow, isn't this place empty?", locationSchema);
    expect(beach.x).toBe(1);
    expect(beach.y).toBe(0);
    expect(beach.examine).toBe("Wow, isn't this place empty?");
  });
});

describe('adjacent edges: condition codec + block form', () => {
  const ref = (...path: string[]) => ({ kind: 'reference' as const, reference: { path } });

  it('parses an adjacency block, canonicalizing to an inline list', () => {
    const bridge = parseOne('# location bridge\nx: 2, y: 0\nadjacent:\n  beach\n  bank while bridge-open', locationSchema);
    expect(bridge.adjacent).toEqual([{ target: 'beach' }, { target: 'bank', condition: ref('bridge-open') }]);
    const printed = printSection(bridge, locationSchema);
    expect(printed).toBe('# location bridge\nx: 2\ny: 0\nadjacent: beach, bank while bridge-open');
    expect(parseOne(printed, locationSchema)).toEqual(bridge);
  });

  it('parses an inline adjacency list with no conditions', () => {
    const beach = parseOne('# location beach\nx: 1, y: 0\nadjacent: guide-house, bridge', locationSchema);
    expect(beach.adjacent).toEqual([{ target: 'guide-house' }, { target: 'bridge' }]);
  });

  it('parses a dotted entity-scoped condition on an edge', () => {
    const gh = parseOne('# location guide-house\nx: 0, y: 0\nadjacent:\n  beach while front-door.unlocked', locationSchema);
    expect(gh.adjacent).toEqual([{ target: 'beach', condition: ref('front-door', 'unlocked') }]);
  });

  it('parses an entities block, canonicalizing to inline', () => {
    const hall = parseOne('# location hall\nx: 0, y: 0\nentities:\n  miki, front-door', locationSchema);
    expect(hall.entities).toEqual(['miki', 'front-door']);
    expect(printSection(hall, locationSchema)).toBe('# location hall\nx: 0\ny: 0\nentities: miki, front-door');
  });
});

describe('starting flag', () => {
  const ref = (...path: string[]) => ({ kind: 'reference' as const, reference: { path } });

  it('parses the full corpus guide-house end to end', () => {
    const source = [
      '# location guide-house',
      'x: 0, y: 0',
      'starting',
      'adjacent:',
      '  beach while front-door.unlocked',
      'entities:',
      '  miki, stairs-up, front-door, dresser, bookshelf, painting, mirror',
    ].join('\n');
    const gh = parseOne(source, locationSchema);
    expect(gh).toEqual({
      id: 'guide-house',
      x: 0,
      y: 0,
      starting: true,
      adjacent: [{ target: 'beach', condition: ref('front-door', 'unlocked') }],
      entities: ['miki', 'stairs-up', 'front-door', 'dresser', 'bookshelf', 'painting', 'mirror'],
    });
    expect(parseOne(printSection(gh, locationSchema), locationSchema)).toEqual(gh);
  });

  it('prints the flag as a bare keyword and defaults it to false when absent', () => {
    const start = parseOne('# location start-room\nx: 0, y: 0\nstarting', locationSchema);
    expect(start.starting).toBe(true);
    expect(printSection(start, locationSchema)).toBe('# location start-room\nx: 0\ny: 0\nstarting');

    const plain = parseOne('# location plain-room\nx: 1, y: 0', locationSchema);
    expect(plain.starting).toBeUndefined();
    expect(hydrateSection(plain, locationSchema).starting).toBe(false);
  });
});

describe('greedy fields are line-terminal (M1)', () => {
  it('lets a free-text field consume the rest of its line, including a would-be field', () => {
    const beach = parseOne('# location beach\nx: 1, y: 0\ntitle: Sunny, warm, x: 9', locationSchema);
    expect(beach.title).toBe('Sunny, warm, x: 9');
    expect(beach.x).toBe(1);
  });
});

describe('position has one interpretation (M2)', () => {
  it('parses a relative position from a bare directional line', () => {
    const dock = parseOne('# location dock\neast of bridge', locationSchema);
    expect(dock.relative).toEqual({ direction: 'east', of: 'bridge' });
    expect(dock.x).toBeUndefined();
    expect(printSection(dock, locationSchema)).toBe('# location dock\neast of bridge');
  });

  it('rejects a location that defines position two ways', () => {
    expect(() => parseOne('# location dock\nx: 0, y: 0\neast of bridge', locationSchema)).toThrow(/cannot both be set/);
  });

  it('rejects a field defined twice', () => {
    expect(() => parseOne('# location dock\nx: 0\nx: 1', locationSchema)).toThrow(/defined more than once/);
  });
});

describe('empty values round-trip away (L7)', () => {
  it('treats an empty keyed value as unspecified, defaulting on hydration', () => {
    const loc = parseOne('# location void\nx: \ny: 0', locationSchema);
    expect(loc.x).toBeUndefined();
    expect(loc.y).toBe(0);
    expect(hydrateSection(loc, locationSchema).x).toBe(0);
    expect(printSection(loc, locationSchema)).toBe('# location void\ny: 0');
  });

  it('makes an empty entities block indistinguishable from an absent one', () => {
    const empty = parseOne('# location void\nx: 0\nentities:', locationSchema);
    const absent = parseOne('# location void\nx: 0', locationSchema);
    expect(empty).toEqual(absent);
    expect(printSection(empty, locationSchema)).toBe('# location void\nx: 0');
  });
});

describe('condition grammar', () => {
  const parse = (source: string) => condition.parse(new Cursor(source));
  const ref = (...path: string[]) => ({ kind: 'reference' as const, reference: { path } });

  it('parses references, dotted paths, combinators, and comparisons', () => {
    expect(parse('bridge-open')).toEqual(ref('bridge-open'));
    expect(parse('front-door.unlocked')).toEqual(ref('front-door', 'unlocked'));
    expect(parse('not troll-antagonized')).toEqual({ kind: 'not', condition: ref('troll-antagonized') });
    expect(parse('active-interaction and combat-interaction')).toEqual({ kind: 'and', conditions: [ref('active-interaction'), ref('combat-interaction')] });
    expect(parse('stat.attack>10')).toEqual({ kind: 'comparison', left: { path: ['stat', 'attack'] }, operator: '>', right: 10 });
  });

  it('round-trips every condition form', () => {
    for (const source of ['bridge-open', 'front-door.unlocked', 'not troll-antagonized', 'a and b and c', 'a or b', 'stat.attack>10']) {
      expect(condition.print(parse(source))).toBe(source);
    }
  });
});

describe('authored vs. derived boundary', () => {
  const gold = () => parseOne('# item gold\nexamine: Small bright coins.\ncurrency', itemSchema);

  it('leaves an unauthored title absent, defaulting it only in hydration', () => {
    expect(gold().title).toBeUndefined();
    expect(printSection(gold(), itemSchema)).not.toContain('title:');
    expect(hydrateSection(gold(), itemSchema).title).toBe('Gold');
  });

  it('preserves an authored title through hydration', () => {
    const bones = parseOne('# item bones\ntitle: Bones\nexamine: A dusty set of bones.', itemSchema);
    expect(bones.title).toBe('Bones');
    expect(hydrateSection(bones, itemSchema).title).toBe('Bones');
  });

  it('resolves a default that reads another default, with nothing ordering them', () => {
    const mystery = parseOne('# item mystery-box', itemSchema);
    expect(mystery.title).toBeUndefined();
    expect(mystery.examine).toBeUndefined();
    expect(printSection(mystery, itemSchema)).toBe('# item mystery-box');

    const hydrated = hydrateSection(mystery, itemSchema);
    expect(hydrated.title).toBe('Mystery Box');
    expect(hydrated.examine).toBe('This is an Mystery Box.');
  });

  it('lets an authored field win over its default', () => {
    expect(hydrateSection(gold(), itemSchema).examine).toBe('Small bright coins.');
  });

  it('throws a DslError on a circular default instead of looping forever', () => {
    const cyclic: SectionSchema<{ id: string; a: string; b: string }> = {
      kind: 'cyclic',
      fields: {
        a: { codec: text, default: (self) => self.b },
        b: { codec: text, default: (self) => self.a },
      },
    };
    const view = hydrateSection({ id: 'x' }, cyclic);
    expect(() => view.a).toThrow(DslError);
    expect(() => view.a).toThrow(/circular default/);
  });
});

describe('tag-clause micro-grammar', () => {
  const clause = (source: string) => tagClause.parse(new Cursor(source));

  it('picks the clause shape by syntax, never by keyword lookup', () => {
    expect(clause('mainhand')).toEqual({ kind: 'keyword', value: 'mainhand' });
    expect(clause('+3 regeneration')).toEqual({ kind: 'stat-bonus', statId: 'regeneration', amount: 3, percent: false });
    expect(clause('+2% attack')).toEqual({ kind: 'stat-bonus', statId: 'attack', amount: 2, percent: true });
    expect(clause('1m40s')).toEqual({ kind: 'duration', seconds: 100 });
  });

  it('round-trips every clause shape', () => {
    for (const source of ['mainhand', '+3 regeneration', '+2% attack', '1m40s', '40s']) {
      expect(tagClause.print(clause(source))).toBe(source);
    }
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
