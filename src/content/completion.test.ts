import { describe, expect, it } from 'vitest';
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
];

const at = (written: string): { text: string; cursor: number } => {
  const cursor = written.indexOf('|');
  return { text: written.slice(0, cursor) + written.slice(cursor + 1), cursor };
};

const offered = (written: string): string[] => {
  const { text, cursor } = at(written);
  return offeringAt(text, cursor, KNOWN).offers.map((offer) => offer.label);
};

const inserted = (written: string, label: string): string => {
  const { text, cursor } = at(written);
  const offering = offeringAt(text, cursor, KNOWN);
  const offer = offering.offers.find((each) => each.label === label);
  if (offer === undefined) throw new Error(`nothing offered called ${label}, only ${offering.offers.map((each) => each.label).join(', ')}`);
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
    expect(offered('# location tutorial-island.beach\nadjacent: guide-|')).toEqual(['tutorial-island.guide-house']);
  });

  it('qualifies what it inserts', () => {
    expect(inserted('# location tutorial-island.beach\nadjacent: guide-|', 'tutorial-island.guide-house')).toBe('# location tutorial-island.beach\nadjacent: tutorial-island.guide-house');
  });
});

describe('a field', () => {
  it('is offered by its keyword and its own first example', () => {
    expect(offered('# location tutorial-island.beach\nadj|')).toEqual(['adjacent: clearing']);
  });

  it('opens onto the ids it references, which the kind alone knows', () => {
    expect(offered('# location tutorial-island.beach\nentities: |')).toContain('tutorial-island.giant-rat');
    expect(offered('# location tutorial-island.beach\nentities: |')).not.toContain('tutorial-island.beach');
  });

  it('offers every shape its parser reads', () => {
    expect(offered('# location tutorial-island.beach\nadjacent: |')).toContain('adjacent: clearing while has-key');
  });

  it('drops its keyword after a comma, where a second value goes', () => {
    expect(offered('# location tutorial-island.beach\nadjacent: beach, |')).toContain('clearing while has-key');
  });
});

describe('an indented line', () => {
  it('is offered the grammar of the block it sits in', () => {
    expect(offered('# location tutorial-island.beach\nchop-wood:\n  |')).toContain('on success: give: plank');
  });

  it('reaches the ids a result names', () => {
    expect(offered('# location tutorial-island.beach\nchop-wood:\n  requires: |')).toContain('tutorial-island.quest-given');
  });

  it('is offered nothing of the section body it is nested under', () => {
    expect(offered('# location tutorial-island.beach\nchop-wood:\n  |')).not.toContain('adjacent: clearing');
  });
});

describe('an offering', () => {
  it('is empty where no kind is declared', () => {
    expect(offered('adjacent: |')).toEqual([]);
  });

  it('is empty under a kind nobody declares', () => {
    expect(offered('# nonsense probe\n|')).toEqual([]);
  });

  it.each(sections().map((each) => each.kind))('%s leaves a section that still parses wherever it is taken', (kind) => {
    const opening = `# ${kind} probe\n`;
    const offering = offeringAt(opening, opening.length, KNOWN);
    for (const offer of offering.offers) {
      const written = applied(opening, offering, offer).text;
      expect(() => sectionFor(kind)!.parse(splitSections(written)[0]!), written).not.toThrow();
    }
  });
});
