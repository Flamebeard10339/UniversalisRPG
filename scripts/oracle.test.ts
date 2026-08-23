import { describe, expect, it } from 'vitest';
import { offeringAt } from '../src/content/completion';
import { sectionFor, sectionKinds } from '../src/content/sections';
import { literalOf } from '../src/content/completion';
import { splitSections, type RawLine } from '../src/grammar/structure';
import { amissLines, atLines, offeringLines, parseArgs, reading, takenLines, treeOf } from './oracle';

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
    { kind: 'flag', address: 'core.quest-given' },
    { kind: 'location', address: 'core.beach' },
  ];

  it('says everything the engine has to say about the draft before saying anything about a line of it', () => {
    const draft = ['# location core.beach', 'entities: core.giant-rt', 'xppp: 3'].join('\n');
    const read = amissLines(draft, [{ kind: 'entity', address: 'core.giant-rat' }]).join('\n');

    expect(read).toContain('2 line(s)');
    expect(read).toContain('one letter from core.giant-rat');
    expect(read).toContain('will not read this line');
  });

  it('says so where there is nothing to say', () => {
    expect(amissLines('# location core.beach\ntitle: The Beach', KNOWN)[0]).toContain('nothing here is refused');
  });

  it('writes an answer out where it is first met and points back at it after', () => {
    const draft = ['# location core.beach', 'adjacent: core.beach while quest-given', 'adjacent: core.beach while quest-given'].join('\n');
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
    const said = takenLines(reading('glade.dsl', ['# location glade', 'x: 12, y: 4', 'starting'].join('\n'), WORLD)).join('\n');

    expect(amissLines(['# location glade', 'x: 12, y: 4', 'starting'].join('\n'), [])[0]).toBe('nothing here is refused and every id it names is declared');
    expect(said).toContain('a new game begins in exactly one place');
    expect(said).toContain('# info glade standing on everything already loaded');
  });

  it('says so plainly where the world takes it', () => {
    expect(takenLines(reading('glade.dsl', ['# location glade', 'x: 12, y: 4'].join('\n'), WORLD))[0]).toBe('the engine takes this file into the world, read as # info glade standing on everything already loaded, since the file declares no module of its own');
  });

  it('leaves a draft that declares its own module alone, and stands it beside the world under that name', () => {
    const draft = ['# info hermitage', 'version: 0.0.1', 'dependencies:', '  island', '', '# location glade', 'x: 12, y: 4', 'entities: no-such-thing'].join('\n');

    expect(takenLines(reading('anything.dsl', draft, WORLD)).join('\n')).toContain('read as the module it declares');
    expect(takenLines(reading('anything.dsl', draft, WORLD)).join('\n')).toContain('hermitage');
  });
});

// An author reaches for --at to edit a module as readily as to write a new one, and a module is which module it is by the id its own # info names, so where the file sits says nothing about which of the three this is.
describe('which module a draft is', () => {
  const WORLD = [{ name: 'island.dsl', text: ['# info island', 'version: 1.0.0', '', '# location shore', 'x: 0, y: 0', 'starting', '', '# item rope', 'title: Rope'].join('\n') }];
  const EDITED = ['# info island', 'version: 1.0.1', '', '# location shore', 'x: 0, y: 0', 'starting', '', '# item lantern', 'title: Lantern'].join('\n');
  const FRESH = ['# info hermitage', 'version: 0.0.1', 'dependencies:', '  island', '', '# item lantern', 'title: Lantern'].join('\n');
  const UNDECLARED = ['# item lantern', 'title: Lantern'].join('\n');
  const declares = (read: { known: readonly { address: string }[] }, address: string): boolean => read.known.some((each) => each.address === address);

  // Two copies of one module is exactly what the engine refuses, so a draft standing beside the module it is a version of answers about a world that could never be loaded.
  it('takes the place of the module whose id it declares, rather than standing beside it', () => {
    const read = reading('anywhere/at/all.dsl', EDITED, WORLD);

    expect(read.stood).toBe(true);
    expect(takenLines(read).join('\n')).not.toContain('two modules declare');
    expect(declares(read, 'island.lantern')).toBe(true);
    expect(declares(read, 'island.rope')).toBe(false);
  });

  it('is told by the id the draft declares and not by the path it was read from', () => {
    for (const file of ['island.dsl', 'content/island.dsl', './content/island.dsl', 'C:\\scratch\\untitled-3.dsl']) {
      expect(reading(file, EDITED, WORLD).read).toBe('read as the module it declares, in place of the island that already ships');
    }
  });

  it('stands beside the world where nothing loaded declares its id', () => {
    const read = reading('anywhere/at/all.dsl', FRESH, WORLD);

    expect(read.read).toBe('read as the module it declares');
    expect(read.stood).toBe(true);
    expect(declares(read, 'island.rope')).toBe(true);
    expect(declares(read, 'hermitage.lantern')).toBe(true);
  });

  it('is a module of its own, taking nothing out of the world, where it declares no # info', () => {
    const read = reading('untitled.dsl', UNDECLARED, WORLD);

    expect(read.read).toBe('read as # info untitled standing on everything already loaded, since the file declares no module of its own');
    expect(read.stood).toBe(true);
    expect(declares(read, 'island.rope')).toBe(true);
  });
});

describe('a draft is answered against the world it declares, not only the one already loaded', () => {
  const WORLD = [{ name: 'island', text: ['# info island', 'version: 1.0.0', '', '# location shore', 'x: 0, y: 0', 'starting'].join('\n') }];
  const DRAFT = ['# info hermitage', 'version: 0.0.1', 'dependencies:', '  island', '', '# item lamp', 'title: Lamp', '', '# entity hermit', 'examine: A hermit.', 'hand it over:', '  instant', '  give: 1 lamp'].join('\n');

  it('counts what the draft itself declares as declared, so an id it mints is not reported undeclared', () => {
    const read = reading('hermitage.dsl', DRAFT, WORLD);

    expect(read.stood).toBe(true);
    expect(amissLines(DRAFT, read.known, read.stood)[0]).toBe('nothing here is refused and every id it names is declared');
  });

  it('still names an id nothing declares, in the draft or out of it', () => {
    const typo = DRAFT.replace('give: 1 lamp', 'give: 1 lampp');
    const read = reading('hermitage.dsl', typo, WORLD);

    expect(read.stood).toBe(false);
    expect(takenLines(read).join('\n')).toContain('lampp');
  });

  // The one refusal that keeps a draft out is also what empties the world of everything the draft declares, so reporting both leaves the real error buried under its own consequences.
  it('says nothing about undeclared ids while the draft is out of the world, since none of what it declares is in it', () => {
    const typo = DRAFT.replace('give: 1 lamp', 'give: 1 lampp');
    const read = reading('hermitage.dsl', typo, WORLD);
    const said = amissLines(typo, read.known, read.stood).join('\n');

    expect(said).not.toContain('nothing declares lamp as');
    expect(said).not.toContain('nothing declares hermit as');
  });
});

// A comment is whatever the engine drops, and the engine drops it wherever it is written — before the first heading, indented inside a block, at any depth. What it does not drop is a `//` with content in front of it, which is a line like any other and gets the answer any line gets.
describe('which lines of a draft are answered for', () => {
  const KNOWN = [{ kind: 'location', address: 'core.beach' }];
  const DRAFT = [
    '// a note before anything is declared',
    '# location core.beach',
    'title: The Beach // not a comment, and not dropped',
    'adjacent:',
    '  // a note indented inside a block',
    '  core.beach',
  ].join('\n');

  const readByTheEngine = (text: string): Set<string> => {
    const kept = new Set<string>();
    const mark = (lines: readonly RawLine[]): void => {
      for (const line of lines) {
        kept.add(line.text);
        mark(line.children);
      }
    };
    for (const section of splitSections(text)) mark(section.body);
    return kept;
  };

  it('answers for every line the engine reads and passes over every line it drops', () => {
    const walk = offeringLines(DRAFT, KNOWN);
    const kept = readByTheEngine(DRAFT);

    for (const line of DRAFT.split('\n')) {
      const written = line.trim();
      if (written === '' || written.startsWith('#')) continue;
      expect(walk.includes(line), `${JSON.stringify(line)} is ${kept.has(written) ? 'read by the engine and not answered for' : 'dropped by the engine and answered for anyway'}`).toBe(kept.has(written));
    }
    expect(walk).toContain('# location core.beach');
  });

  it('leaves no breadcrumb or reading behind for a line it passes over', () => {
    const walk = offeringLines(DRAFT, KNOWN).join('\n');

    expect(walk).not.toContain('a note before anything is declared');
    expect(walk).not.toContain('a note indented inside a block');
    expect(walk).not.toContain('reads as ?');
  });

  it('answers for every line where the engine will not split the file at all', () => {
    const broken = ['title: The Beach', '# location core.beach'].join('\n');

    expect(() => splitSections(broken)).toThrow();
    expect(offeringLines(broken, KNOWN)).toContain('title: The Beach');
  });
});

describe('the short answer and the walk', () => {
  const WORLD = [{ name: 'island', text: ['# info island', 'version: 1.0.0', '', '# location shore', 'x: 0, y: 0', 'starting'].join('\n') }];
  const DRAFT = ['// a note', '# location glade', 'x: 12, y: 4', 'entities: no-such-thing'].join('\n');

  it('stops after the whole-file verdict, and says where the rest of the answer is', () => {
    const short = atLines('glade.dsl', DRAFT, WORLD, false);

    expect(short.join('\n')).toContain('no-such-thing');
    expect(short.join('\n')).toContain('the engine will not take this file');
    expect(short.some((line) => line.includes('reads as'))).toBe(false);
    expect(short[short.length - 1]).toContain('--walk');
  });

  it('walks on from exactly where the short answer stopped', () => {
    const short = atLines('glade.dsl', DRAFT, WORLD, false);
    const full = atLines('glade.dsl', DRAFT, WORLD, true);
    const said = short.slice(0, -1);

    expect(full.slice(0, said.length)).toEqual(said);
    expect(full.length).toBeGreaterThan(short.length);
    expect(full.slice(said.length)).toEqual(offeringLines(DRAFT, reading('glade.dsl', DRAFT, WORLD).known));
  });
});

describe('what the oracle is asked for', () => {
  it('reads a draft, a walk and a list of kinds off the arguments', () => {
    expect(parseArgs(['--at', 'draft.dsl'])).toEqual({ at: 'draft.dsl', walk: false, kinds: [] });
    expect(parseArgs(['--at=draft.dsl', '--walk'])).toEqual({ at: 'draft.dsl', walk: true, kinds: [] });
    expect(parseArgs(['item', 'location'])).toEqual({ at: null, walk: false, kinds: ['item', 'location'] });
  });

  it('will not read a flag as the draft it was asked for, and will not pass one off as a kind', () => {
    expect(() => parseArgs(['--at', '--walk'])).toThrow('--at wants a draft file after it');
    expect(() => parseArgs(['--at', '--help'])).toThrow('--at wants a draft file after it');
    expect(() => parseArgs(['--at'])).toThrow('--at wants a draft file after it');
    expect(() => parseArgs(['--nonsense'])).toThrow('unknown flag --nonsense');
  });
});
