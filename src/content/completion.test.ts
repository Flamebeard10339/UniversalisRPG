import { describe, expect, it } from 'vitest';
import { comparison, condition } from '../grammar/condition';
import type { Parser } from '../grammar/parser';
import { splitSections } from '../grammar/structure';
import { amissIn, applied, fillingWords, offeringAt, refusalsIn, type Addressed, type Amiss } from './completion';
import { EVERY_SECTION, sectionFor, sections } from './sections';

const KNOWN: readonly Addressed[] = [
  { kind: 'location', address: 'tulsa.beach' },
  { kind: 'location', address: 'tulsa.guide-house' },
  { kind: 'location', address: 'combat-expansion.proving-ground' },
  { kind: 'item', address: 'core.rusty-sword' },
  { kind: 'entity', address: 'tulsa.giant-rat' },
  { kind: 'flag', address: 'core.quest-given' },
  { kind: 'skill', address: 'core.mining' },
];

const at = (written: string): { text: string; cursor: number } => {
  const cursor = written.indexOf('|');
  return { text: written.slice(0, cursor) + written.slice(cursor + 1), cursor };
};

const offered = (written: string): string[] => {
  const { text, cursor } = at(written);
  return offeringAt(text, cursor, KNOWN).offers.map((offer) => offer.form);
};

const shapes = (written: string): string[] => {
  const { text, cursor } = at(written);
  return offeringAt(text, cursor, KNOWN).offers.filter((offer) => offer.kind === undefined).map((offer) => offer.form);
};

const inserted = (written: string, form: string): string => {
  const { text, cursor } = at(written);
  const offering = offeringAt(text, cursor, KNOWN);
  const offer = offering.offers.find((each) => each.form === form);
  if (offer === undefined) throw new Error(`nothing shaped ${form} is offered, only ${offering.offers.map((each) => each.form).join(', ')}`);
  return applied(text, offering, offer).text;
};

describe('a heading', () => {
  it('offers every kind there is', () => {
    expect(offered('# |')).toEqual(sections().map((each) => each.kind));
  });

  it('narrows to the kinds a half-written one could still name', () => {
    expect(offered('# loc|')).toEqual(['location', 'locale']);
  });

  it('names what the kind it declares already addresses', () => {
    expect(offered('# location |')).toEqual(['combat-expansion.proving-ground', 'tulsa.beach', 'tulsa.guide-house']);
  });

  it('leaves room for an id when a kind is taken', () => {
    expect(inserted('# loc|', 'location')).toBe('# location ');
  });
});

describe('a namespace', () => {
  it('opens under a trailing dot', () => {
    expect(offered('# location tulsa.|')).toEqual(['tulsa.beach', 'tulsa.guide-house']);
  });

  it('is reached by naming what a module calls its own', () => {
    expect(offered('# location tulsa.beach\nadjacent: guide-|')[0]).toBe('tulsa.guide-house');
  });

  it('qualifies what it inserts', () => {
    expect(inserted('# location tulsa.beach\nadjacent: guide-|', 'tulsa.guide-house')).toBe('# location tulsa.beach\nadjacent: tulsa.guide-house');
  });
});

describe('a field', () => {
  it('shows the shape it takes rather than a value someone once wrote', () => {
    expect(offered('# location tulsa.beach\nadj|')).toEqual(['adjacent: <location>, …', 'adjacent: <location> while <condition>, …', 'adjacent:']);
  });

  it('offers itself bare, for the block it can be written as instead', () => {
    expect(shapes('# location tulsa.beach\nadjacent:\n  |')).toEqual(['<location>', '<location> while <condition>']);
  });

  it('hands over what its form spells out, and stops where the author must choose', () => {
    expect(inserted('# location tulsa.beach\nadj|', 'adjacent: <location>, …')).toBe('# location tulsa.beach\nadjacent: ');
  });

  it('opens onto the ids it references, which the kind alone knows', () => {
    expect(offered('# location tulsa.beach\nentities: |')).toContain('tulsa.giant-rat');
    expect(offered('# location tulsa.beach\nentities: |')).not.toContain('tulsa.beach');
  });

  it('drops the keyword once it is written, and shows what one value of it may be', () => {
    expect(shapes('# location tulsa.beach\nadjacent: guide-|')).toEqual(['<location>', '<location> while <condition>']);
  });

  it('drops its keyword and its list after a comma, where one more value goes', () => {
    expect(offered('# location tulsa.beach\nadjacent: beach, |')).toContain('<location> while <condition>');
  });
});

describe('an indented line', () => {
  it('is offered the grammar of the block it sits in', () => {
    expect(offered('# location tulsa.beach\nchop-wood:\n  |')).toContain('on success: <result>, …');
  });

  it('reaches the ids a result names', () => {
    expect(offered('# location tulsa.beach\nchop-wood:\n  requires: |')).toContain('core.quest-given');
  });

  it('is offered nothing of the section body it is nested under', () => {
    expect(offered('# location tulsa.beach\nchop-wood:\n  |')).not.toContain('adjacent: <location>, …');
  });
});

describe('a line as the engine takes it', () => {
  const taken = (written: string) => {
    const { text, cursor } = at(written);
    return offeringAt(text, cursor, KNOWN);
  };

  it('says a field one letter out in the words the engine refuses it with', () => {
    expect(taken('# location tulsa.beach\ntittle: The Beach|').refused).toBe('unknown location field: tittle, one letter from title');
  });

  it('holds its peace over a line the engine takes', () => {
    expect(taken('# location tulsa.beach\ntitle: The Beach|').refused).toBeNull();
    expect(taken('# location tulsa.beach\nchop-wood:|').refused).toBeNull();
  });

  it('remarks on an id nothing declares, without calling it a refusal', () => {
    const held = taken('# location tulsa.beach\nentities: mine.bat|');
    expect(held.undeclared).toEqual([{ kind: 'entity', id: 'mine.bat' }]);
    expect(held.refused).toBeNull();
  });

  it('says nothing of an id something does declare', () => {
    expect(taken('# location tulsa.beach\nadjacent: tulsa.guide-house|').undeclared).toEqual([]);
  });

  const RECIPE = (station: string): string => `# recipe core.bread\nstation: ${station}\nout: 1 core.bread`;

  it('answers for a name no section carries, where the universe declares that kind of name at all', () => {
    const stations: readonly Addressed[] = [...KNOWN, { kind: 'item', address: 'core.bread' }, { kind: 'station', address: 'oven' }];
    expect(amissIn(RECIPE('oven'), stations).flatMap((each) => each.undeclared)).toEqual([]);
    expect(amissIn(RECIPE('forge'), stations).flatMap((each) => each.undeclared)).toEqual([{ kind: 'station', id: 'forge' }]);
  });

  it('says nothing of a kind of name the universe declares none of, rather than calling every one of them undeclared', () => {
    const known: readonly Addressed[] = [...KNOWN, { kind: 'item', address: 'core.bread' }];
    expect(amissIn(RECIPE('oven'), known).flatMap((each) => each.undeclared)).toEqual([]);
  });

  it.each(sections().map((each) => each.kind))('%s refuses none of the lines it writes out, but for one that says what it wants beside it', (kind) => {
    const owner = sectionFor(kind)!;
    for (const line of owner.grammar) {
      const head = `# ${kind} probe\n${line.example}`;
      const draft = line.block === undefined ? head : `${head}\n  ${line.block()[0]!.example}`;
      const refused = offeringAt(draft, head.length, KNOWN).refused;
      expect(refused === null || (line.note !== undefined && refused.includes(line.note)), `${draft}\n\n${refused}`).toBe(true);
    }
  });
});

describe('a half-written line', () => {
  const taken = (written: string) => {
    const { text, cursor } = at(written);
    return offeringAt(text, cursor, KNOWN);
  };
  const under = '# entity tulsa.giant-rat\nstats: attack 3\non hit:\n';

  it('is read as the shape it is on its way to being', () => {
    expect(taken(`${under}  xp: |`).filling).toEqual({ form: 'xp: <skill> <amount>', hole: 'skill', at: 4, like: 'mining', kind: 'skill' });
  });

  it('says what a hole holds and what it may name, and says only the one that is not the other', () => {
    expect(fillingWords(taken(`${under}  xp: |`).filling!)).toBe('<skill> — a # skill');
    expect(fillingWords(taken(`${under}  xp: mining |`).filling!)).toBe('<amount> — like 4-7, or a # stat');
    expect(fillingWords(taken('# droptable probe\none of:\n  |').filling!)).toBe('<weight> — like 3x, or a # stat');
  });

  it('opens onto the ids that hole names, which the line alone cannot yet say', () => {
    expect(offered(`${under}  xp: |`)).toContain('core.mining');
    expect(offered(`${under}  xp: mini|`)).toContain('core.mining');
  });

  it('moves to the next hole once the one before it is written', () => {
    expect(taken(`${under}  xp: mining |`).filling).toEqual({
      form: 'xp: <skill> <amount>',
      hole: 'amount',
      at: 11,
      like: '4-7',
      kind: 'stat',
      holds: { words: ['-', '.', 'us', 'them'], names: [{ hole: 'stat', kind: 'stat' }] },
    });
  });

  it('is not refused while a shape it could still become is unfinished', () => {
    expect(taken(`${under}  xp: |`).refused).toBeNull();
    expect(taken(`${under}  xp: a|`).refused).toBeNull();
    expect(taken('# location tulsa.beach\nadjacent: |').refused).toBeNull();
  });

  it('is refused once it is whole and the engine still will not have it', () => {
    expect(taken(`${under}  xp: mining 0|`).refused).toBe('an xp amount of 0 does nothing');
    expect(taken(`${under}  xpp: mining 4|`).refused).toContain('unrecognized action result');
  });

  const refused = (said: readonly Amiss[]): Amiss[] => said.filter((each) => each.refused !== null);

  const OVEN = '# entity tulsa.oven\nroast chestnuts:\n  continuous\n  rate: cooking-rate';

  it('is not refused for what a line below it supplies', () => {
    expect(taken(OVEN.replace('  continuous', '  continuous|')).refused).toBeNull();
    expect(refused(amissIn(OVEN, KNOWN))).toEqual([]);
  });

  it('is refused once no line below it supplies that', () => {
    const without = OVEN.split('\n').filter((line) => !line.includes('rate:')).join('\n');
    expect(taken(without.replace('  continuous', '  continuous|')).refused).toContain('needs a time: or rate:');
    expect(refused(amissIn(without, KNOWN)).map((each) => each.line)).toEqual([3]);
  });

  it('lays a complaint about the whole section on the line the engine points at, and on no other', () => {
    const said = amissIn('# action\ntitle: Fight\nrate: us.attack-rate\naccuracy: us.accuracy vs them.evasion', KNOWN);
    expect(refused(said).map((each) => [each.line, each.refused!.includes('requires an id')])).toEqual([[1, true]]);
  });

  const CHAT = ['# dialogue core.chat', 'node greet:', '  A traveller, out here?', '  goto NODE'].join('\n');

  it('says a goto names no node of this dialogue, which is a rule the section carries by itself', () => {
    expect(refused(amissIn(CHAT.replace('NODE', 'nowhere'), KNOWN)).map((each) => [each.line, each.refused])).toEqual([[1, '# dialogue core.chat: node greet goto names an unknown node: nowhere']]);
    expect(refused(amissIn(`${CHAT.replace('NODE', 'farewell')}\n\nnode farewell:\n  Safe travels.`, KNOWN))).toEqual([]);
  });

  const THREE = '# item core.torch\nnonsense: 3\nexamine: A torch.\nalso-nonsense: 4\nthird-nonsense: 5';

  it('says every line it can clear out of its own way to reach, not only the first', () => {
    expect(refusalsIn(THREE).map((each) => each.line)).toEqual([2, 4, 5]);
    expect(refused(amissIn(THREE, KNOWN)).map((each) => each.line)).toEqual([2, 4, 5]);
  });

  it('says of no line what it would not say of that line alone', () => {
    const drafts = [
      THREE,
      '# entity tulsa.oven\nroast chestnuts:\n  continuous\n  rate: cooking-rate\n  nonsense: 3\n  also-nonsense: 4',
      '# action core.swing\ntitle: Fight\nrate: us.attack-rate\naccuracy: us.accuracy vs them.evasion',
      '# entity tulsa.oven\nstations: oven\nstations:\n  hearth\n  nonsense: 3',
    ];
    for (const draft of drafts) {
      for (const said of refusalsIn(draft)) {
        const alone = draft.split('\n').filter((_, index) => index + 1 !== said.line).join('\n');
        expect(refusalsIn(alone).map((each) => each.refused), `${draft} line ${said.line}`).not.toContain(said.refused);
      }
    }
  });

  it('shows only the shapes whose words it has spelt out', () => {
    expect(shapes(`${under}  x|`)).toEqual(['xp: <skill> <amount>']);
  });

  it('stops offering a shape once its words are the ones written, which would put back what it replaced', () => {
    expect(shapes(`${under}  xp: |`)).toEqual([]);
    expect(taken(`${under}  xp: |`).filling?.form).toBe('xp: <skill> <amount>');
  });

  it('remarks on an id nothing declares, however deep in a block it sits', () => {
    expect(taken(`${under}  xp: minning 4|`).undeclared).toEqual([{ kind: 'skill', id: 'minning' }]);
  });
});

describe('an offering', () => {
  it('is empty where no kind is declared', () => {
    expect(offered('adjacent: |')).toEqual([]);
  });

  it('is empty under a kind nobody declares', () => {
    expect(offered('# nonsense probe\n|')).toEqual([]);
  });

  it.each(sections().map((each) => each.kind))('%s shows only what it declares, and writes in only what it shows', (kind) => {
    const opening = `# ${kind} probe\n`;
    const offering = offeringAt(opening, opening.length, KNOWN);
    const owner = sectionFor(kind)!;
    const declared = [...owner.grammar.map((each) => each.form), ...EVERY_SECTION.map((each) => each.form), ...Object.values(owner.schema?.fields ?? {}).flatMap((spec) => [...(spec.parser as Parser<unknown>).forms, ...(((spec.parser as { element?: Parser<unknown> }).element?.forms) ?? [])])];
    for (const offer of offering.offers) {
      expect(declared, `# ${kind} offers ${offer.form}`).toContain(offer.form);
      expect(offer.form.startsWith(offer.insert), `# ${kind} writes in ${JSON.stringify(offer.insert)} for ${offer.form}`).toBe(true);
      expect(applied(opening, offering, offer).text).toBe(opening + offer.insert);
    }
  });

  it.each(sections().map((each) => each.kind))('%s takes an id it names without unsettling the section around it', (kind) => {
    const owner = sectionFor(kind)!;
    for (const example of owner.grammar.map((each) => each.example)) {
      const opening = `# ${kind} probe\n${example}`;
      const offering = offeringAt(opening, opening.length, KNOWN);
      for (const offer of offering.offers.filter((each) => each.kind !== undefined)) {
        const written = applied(opening, offering, offer).text;
        expect(() => owner.parse(splitSections(written)[0]!), written).not.toThrow();
      }
    }
  });
});

describe('a hole with a grammar of its own', () => {
  const holds = (written: string) => {
    const { text, cursor } = at(written);
    return offeringAt(text, cursor, KNOWN).filling?.holds;
  };
  const under = '# entity tulsa.giant-rat\nstats: attack 3\non hit:\n';

  it('breaks it into the words it is written with and the things it may name', () => {
    const held = holds(`${under}  if |`)!;
    const holes = condition.forms.flatMap((form) => [...form.matchAll(/<([a-z]+)>/g)].map((each) => each[1]));
    const spelled = (form: string): string[] => form.replace(/<[^>]*>/g, ' ').split(/\s+/).filter((word) => word !== '');

    expect(held.names).toEqual([...new Set(holes.filter((hole) => sectionFor(hole) !== undefined))].map((hole) => ({ hole, kind: hole })));
    expect(held.words).toEqual([...comparison.forms, ...new Set(condition.forms.flatMap(spelled))]);
  });

  it('says the same of the same hole wherever it is written', () => {
    expect(holds('# location tulsa.beach\nadjacent: guide-house while |')).toEqual(holds(`${under}  if |`));
  });

  it('names a kind once, however many placeholders of that grammar name it', () => {
    const named = holds(`${under}  if |`)!.names.map((each) => each.kind);

    expect(named).toEqual([...new Set(named)]);
  });

  it('says nothing where the shapes beside it already say it', () => {
    expect(holds(`${under}  give: |`)).toBeUndefined();
  });

  it('says nothing of a hole that holds one thing, which its own name has already said', () => {
    expect(holds(`${under}  xp: |`)).toBeUndefined();
  });
});
