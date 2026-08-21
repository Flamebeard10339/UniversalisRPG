import { describe, expect, it } from 'vitest';
import type { Parser } from '../grammar/parser';
import { splitSections } from '../grammar/structure';
import { applied, offeringAt, type Addressed } from './completion';
import { sectionFor, sections } from './sections';

const KNOWN: readonly Addressed[] = [
  { kind: 'location', address: 'tutorial-island.beach' },
  { kind: 'location', address: 'tutorial-island.guide-house' },
  { kind: 'location', address: 'combat-expansion.proving-ground' },
  { kind: 'item', address: 'tutorial-island.rusty-sword' },
  { kind: 'entity', address: 'tutorial-island.giant-rat' },
  { kind: 'flag', address: 'tutorial-island.quest-given' },
  { kind: 'skill', address: 'tutorial-island.mining' },
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
    expect(offered('# location |')).toEqual(['combat-expansion.proving-ground', 'tutorial-island.beach', 'tutorial-island.guide-house']);
  });

  it('leaves room for an id when a kind is taken', () => {
    expect(inserted('# loc|', 'location')).toBe('# location ');
  });
});

describe('a namespace', () => {
  it('opens under a trailing dot', () => {
    expect(offered('# location tutorial-island.|')).toEqual(['tutorial-island.beach', 'tutorial-island.guide-house']);
  });

  it('is reached by naming what a module calls its own', () => {
    expect(offered('# location tutorial-island.beach\nadjacent: guide-|')[0]).toBe('tutorial-island.guide-house');
  });

  it('qualifies what it inserts', () => {
    expect(inserted('# location tutorial-island.beach\nadjacent: guide-|', 'tutorial-island.guide-house')).toBe('# location tutorial-island.beach\nadjacent: tutorial-island.guide-house');
  });
});

describe('a field', () => {
  it('shows the shape it takes rather than a value someone once wrote', () => {
    expect(offered('# location tutorial-island.beach\nadj|')).toEqual(['adjacent: <location>, …', 'adjacent: <location> while <condition>, …', 'adjacent:']);
  });

  it('offers itself bare, for the block it can be written as instead', () => {
    expect(shapes('# location tutorial-island.beach\nadjacent:\n  |')).toEqual(['<location>', '<location> while <condition>']);
  });

  it('hands over what its form spells out, and stops where the author must choose', () => {
    expect(inserted('# location tutorial-island.beach\nadj|', 'adjacent: <location>, …')).toBe('# location tutorial-island.beach\nadjacent: ');
  });

  it('opens onto the ids it references, which the kind alone knows', () => {
    expect(offered('# location tutorial-island.beach\nentities: |')).toContain('tutorial-island.giant-rat');
    expect(offered('# location tutorial-island.beach\nentities: |')).not.toContain('tutorial-island.beach');
  });

  it('drops the keyword once it is written, and shows what one value of it may be', () => {
    expect(shapes('# location tutorial-island.beach\nadjacent: guide-|')).toEqual(['<location>', '<location> while <condition>']);
  });

  it('drops its keyword and its list after a comma, where one more value goes', () => {
    expect(offered('# location tutorial-island.beach\nadjacent: beach, |')).toContain('<location> while <condition>');
  });
});

describe('an indented line', () => {
  it('is offered the grammar of the block it sits in', () => {
    expect(offered('# location tutorial-island.beach\nchop-wood:\n  |')).toContain('on success: <result>, …');
  });

  it('reaches the ids a result names', () => {
    expect(offered('# location tutorial-island.beach\nchop-wood:\n  requires: |')).toContain('tutorial-island.quest-given');
  });

  it('is offered nothing of the section body it is nested under', () => {
    expect(offered('# location tutorial-island.beach\nchop-wood:\n  |')).not.toContain('adjacent: <location>, …');
  });
});

describe('a line as the engine takes it', () => {
  const taken = (written: string) => {
    const { text, cursor } = at(written);
    return offeringAt(text, cursor, KNOWN);
  };

  it('says a field one letter out in the words the engine refuses it with', () => {
    expect(taken('# location tutorial-island.beach\ntittle: The Beach|').refused).toBe('unknown location field: tittle, one letter from title');
  });

  it('holds its peace over a line the engine takes', () => {
    expect(taken('# location tutorial-island.beach\ntitle: The Beach|').refused).toBeNull();
    expect(taken('# location tutorial-island.beach\nchop-wood:|').refused).toBeNull();
  });

  it('remarks on an id nothing declares, without calling it a refusal', () => {
    const held = taken('# location tutorial-island.beach\nentities: mine.bat|');
    expect(held.undeclared).toEqual(['mine.bat']);
    expect(held.refused).toBeNull();
  });

  it('says nothing of an id something does declare', () => {
    expect(taken('# location tutorial-island.beach\nadjacent: tutorial-island.guide-house|').undeclared).toEqual([]);
  });

  it.each(sections().map((each) => each.kind))('%s refuses none of the lines it writes out', (kind) => {
    const owner = sectionFor(kind)!;
    for (const line of owner.grammar) {
      const head = `# ${kind} probe\n${line.example}`;
      const draft = line.block === undefined ? head : `${head}\n  ${line.block()[0]!.example}`;
      expect(offeringAt(draft, head.length, KNOWN).refused, draft).toBeNull();
    }
  });
});

describe('a half-written line', () => {
  const taken = (written: string) => {
    const { text, cursor } = at(written);
    return offeringAt(text, cursor, KNOWN);
  };
  const under = '# entity tutorial-island.giant-rat\nstats: attack 3\non hit:\n';

  it('is read as the shape it is on its way to being', () => {
    expect(taken(`${under}  xp: |`).filling).toEqual({ form: 'xp: <skill> <amount>', hole: 'skill', kind: 'skill' });
  });

  it('opens onto the ids that hole names, which the line alone cannot yet say', () => {
    expect(offered(`${under}  xp: |`)).toContain('tutorial-island.mining');
    expect(offered(`${under}  xp: mini|`)).toContain('tutorial-island.mining');
  });

  it('moves to the next hole once the one before it is written', () => {
    expect(taken(`${under}  xp: mining |`).filling).toEqual({ form: 'xp: <skill> <amount>', hole: 'amount', like: '4-7' });
  });

  it('is not refused while a shape it could still become is unfinished', () => {
    expect(taken(`${under}  xp: |`).refused).toBeNull();
    expect(taken(`${under}  xp: a|`).refused).toBeNull();
    expect(taken('# location tutorial-island.beach\nadjacent: |').refused).toBeNull();
  });

  it('is refused once it is whole and the engine still will not have it', () => {
    expect(taken(`${under}  xp: mining 0|`).refused).toBe('an xp amount of 0 does nothing');
    expect(taken(`${under}  xpp: mining 4|`).refused).toContain('unrecognized action result');
  });

  it('shows only the shapes whose words it has spelt out', () => {
    expect(shapes(`${under}  xp: |`)).toEqual(['xp: <skill> <amount>']);
  });

  it('remarks on an id nothing declares, however deep in a block it sits', () => {
    expect(taken(`${under}  xp: minning 4|`).undeclared).toEqual(['minning']);
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
    const declared = [...owner.grammar.map((each) => each.form), ...Object.values(owner.schema?.fields ?? {}).flatMap((spec) => [...(spec.parser as Parser<unknown>).forms, ...(((spec.parser as { element?: Parser<unknown> }).element?.forms) ?? [])])];
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
