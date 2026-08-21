import { describe, expect, it } from 'vitest';
import { offeringAt } from '../src/content/completion';
import { sectionFor, sectionKinds } from '../src/content/sections';
import { literalOf } from '../src/content/completion';
import { amissLines, offeringLines, takenLines, treeOf } from './oracle';

const REFERS = /…indented under it, what `(?<form>.+)` holds$/;

describe('the grammar tree', () => {
  it.each(sectionKinds())('%s is written out once, however deep its blocks reach', (kind) => {
    const tree = treeOf(kind);
    expect(tree.length).toBeGreaterThan(1);
    expect(tree.length).toBeLessThan(200);
  });

  it.each(sectionKinds())('%s points only back at a block it has already written out', (kind) => {
    const tree = treeOf(kind);
    for (const [at, line] of tree.entries()) {
      const form = REFERS.exec(line)?.groups?.form;
      if (form === undefined) continue;
      expect(tree.slice(0, at).some((earlier) => earlier.trim().startsWith(form)), `${kind}: nothing above ${JSON.stringify(line)} opens ${form}`).toBe(true);
    }
  });

  it.each(sectionKinds())('%s shows every shape the page offers at the top of it', (kind) => {
    const opening = `# ${kind} probe\n`;
    const tree = treeOf(kind).join('\n');
    const shown = (form: string): boolean => {
      const head = literalOf(form).trimEnd();
      return tree.includes(form) || (head !== '' && tree.includes(head) && tree.includes(form.slice(head.length).trimStart()));
    };
    for (const offer of offeringAt(opening, opening.length, []).offers) expect(shown(offer.form), `# ${kind} offers ${offer.form}, and its tree does not show it`).toBe(true);
  });

  it('says so where no such kind is named', () => {
    expect(treeOf('nonsense')).toEqual(['# nonsense — no such kind']);
  });

  it('holds the fields of a kind whose grammar it writes itself', () => {
    expect(sectionFor('droptable')!.schema).toBeUndefined();
    expect(treeOf('droptable').join('\n')).toContain('one of');
  });
});

describe('a draft read back', () => {
  const KNOWN = [
    { kind: 'flag', address: 'tutorial-island.quest-given' },
    { kind: 'location', address: 'tutorial-island.beach' },
  ];

  it('says everything the engine has to say about the draft before saying anything about a line of it', () => {
    const draft = ['# location tutorial-island.beach', 'entities: tutorial-island.giant-rt', 'xppp: 3'].join('\n');
    const read = amissLines(draft, [{ kind: 'entity', address: 'tutorial-island.giant-rat' }]).join('\n');

    expect(read).toContain('2 line(s)');
    expect(read).toContain('one letter from tutorial-island.giant-rat');
    expect(read).toContain('will not read this line');
  });

  it('says so where there is nothing to say', () => {
    expect(amissLines('# location tutorial-island.beach\ntitle: The Beach', KNOWN)[0]).toContain('nothing here is refused');
  });

  it('writes an answer out where it is first met and points back at it after', () => {
    const draft = ['# location tutorial-island.beach', 'adjacent: tutorial-island.beach while quest-given', 'adjacent: tutorial-island.beach while quest-given'].join('\n');
    const read = offeringLines(draft, KNOWN);

    expect(read.filter((line) => line.trim() === '<operators>')).toHaveLength(1);
    expect(read.filter((line) => line.trim().endsWith(', as above')).length).toBeGreaterThan(0);
  });
});

describe('a draft handed to the engine whole', () => {
  const WORLD = [
    { name: 'island', text: ['# info island', 'version: 1.0.0', '', '# location shore', 'x: 0, y: 0', 'starting', '', '# item rope', 'title: Rope'].join('\n') },
  ];

  // A rule about two sections at once has no line of its own to be laid on, so a draft can be clean line by line and still be a draft the engine will not take.
  it('says what the world refuses about a draft that every line of is fine', () => {
    const said = takenLines('glade.dsl', ['# location glade', 'x: 12, y: 4', 'starting'].join('\n'), WORLD).join('\n');

    expect(amissLines(['# location glade', 'x: 12, y: 4', 'starting'].join('\n'), [])[0]).toBe('nothing here is refused and every id it names is declared');
    expect(said).toContain('a new game begins in exactly one place');
    expect(said).toContain('# info glade standing on everything already loaded');
  });

  it('says so plainly where the world takes it', () => {
    expect(takenLines('glade.dsl', ['# location glade', 'x: 12, y: 4'].join('\n'), WORLD)[0]).toBe('the engine takes this file into the world, read as # info glade standing on everything already loaded, since the file declares no module of its own');
  });

  it('leaves a draft that declares its own module alone, and stands it beside the world under that name', () => {
    const draft = ['# info hermitage', 'version: 0.0.1', 'dependencies:', '  island', '', '# location glade', 'x: 12, y: 4', 'entities: no-such-thing'].join('\n');

    expect(takenLines('anything.dsl', draft, WORLD).join('\n')).toContain('read as the module it declares');
    expect(takenLines('anything.dsl', draft, WORLD).join('\n')).toContain('hermitage');
  });
});
