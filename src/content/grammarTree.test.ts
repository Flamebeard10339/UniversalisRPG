import { describe, expect, it } from 'vitest';
import { actionBody } from '../grammar/action';
import { condition } from '../grammar/condition';
import { offeringAt } from './completion';
import { gathered, shownIn } from './offerGroups';
import { globalSectionKinds, sectionFor, sectionKinds } from './sections';
import { WRITTEN_WHOLE_NOTE } from './merge';
import { grammarLines, headingOf, namedGrammars, PART, RULES, standingAt, treeOf } from './grammarTree';

// A pointer names the line it points at, and where that line stands when it is under another heading.
const REFERS = /…indented under it, what `(?<form>[^`]+)`(?: under `(?<kind>[^`]+)`)? holds$/;

const heads = (page: readonly string[], kind: string): boolean => page.some((line) => line.startsWith(`# ${kind} <id>`));

describe('the grammar tree', () => {
  it.each(sectionKinds())('%s is written out once, however deep its blocks reach', (kind) => {
    const tree = treeOf(kind);
    expect(heads(tree, kind), tree[0]).toBe(true);
    expect(tree.length).toBeLessThan(200);
  });

  // A shape that writes a line into a body somewhere else is half a shape: the heading above it is what says
  // which body, and no module in the corpus writes one, so the page is the only place an author can meet it.
  // The subjects are read off the page — every shape whose hole is a whole line — so a second such shape is
  // held to this for having been written.
  it('shows a shape that writes over a body under the heading that says which body', () => {
    const page = grammarLines();
    const indent = (line: string): number => line.length - line.trimStart().length;
    const over = page.flatMap((line, at) => (line.includes('<line>') ? [{ line, at }] : []));
    expect(over.length).toBeGreaterThan(0);
    for (const { line, at } of over) {
      const heading = page.slice(0, at).reverse().find((earlier) => earlier.trimStart().startsWith('# '));
      expect(heading, `nothing above ${JSON.stringify(line)} says which body it is written into`).toBeDefined();
      expect(indent(line), `${JSON.stringify(line)} does not stand under ${JSON.stringify(heading)}`).toBeGreaterThan(indent(heading!));
    }
  });

  // What a second body at an id already written does, said where an author reads it: which kinds a heading
  // may address from another module, and which kinds keep nothing of the body already there. Both are read
  // off the kinds themselves, so a kind that changes either says so on the page with no edit here.
  it('says under which heading a second body is written, and which kinds keep nothing of the first', () => {
    const addressed = grammarLines().find((line) => line.trimStart().startsWith('# <kind> <module>.<id>'));
    expect(addressed).toBeDefined();
    for (const kind of sectionKinds()) expect(addressed!.includes(`# ${kind} `), kind).toBe(globalSectionKinds().includes(kind));
    expect(globalSectionKinds().length).toBeGreaterThan(0);
    for (const kind of sectionKinds()) expect(treeOf(kind)[0]!.includes(WRITTEN_WHOLE_NOTE), kind).toBe(sectionFor(kind)!.bodyOver === 'whole');
  });

  it.each(sectionKinds())('%s points only back at a block it has already written out', (kind) => {
    const tree = treeOf(kind);
    for (const [at, line] of tree.entries()) {
      const form = REFERS.exec(line)?.groups?.form;
      if (form === undefined) continue;
      expect(tree.slice(0, at).some((earlier) => earlier.trim().startsWith(form)), `${kind}: nothing above ${JSON.stringify(line)} opens ${form}`).toBe(true);
    }
  });

  // The whole answer, not the kind's own tree: what holds of every kind is said once above them all, and an author reads the page rather than one heading out of it.
  it.each(sectionKinds())('%s shows every shape the page offers at the top of it', (kind) => {
    const opening = `# ${kind} probe\n`;
    const tree = grammarLines([kind]).join('\n');
    // How the page gathers a shape under a keyword is the page's own rule, so the offers are put through
    // it rather than through a second copy of it here — a copy passes while the page shows nothing.
    for (const family of gathered(offeringAt(opening, opening.length, []).offers)) {
      for (const group of family.groups) {
        if (group.head !== null) expect(tree.includes(group.head), `# ${kind} gathers under ${group.head}, and its tree does not show it`).toBe(true);
        for (const offer of [...(group.opens === null ? [] : [group.opens]), ...group.offers]) {
          expect(tree.includes(shownIn(group, offer)), `# ${kind} offers ${offer.form}, and its tree does not show it`).toBe(true);
        }
      }
    }
  });

  it('says so where no such kind is named', () => {
    expect(treeOf('nonsense')).toEqual(['# nonsense — no such kind']);
  });

  // The block an author writes under one kind is the block they write under every other, and how far the action reaches is the one thing it cannot show them. Every kind that nests actions is asked here, so a fourth of them arrives noted or not at all.
  describe('an action nested under a kind', () => {
    const owners = sectionKinds().filter((kind) => sectionFor(kind)!.nestsActions);

    it('is nested by more than one kind, which is why the reach has to be said at all', () => {
      expect(owners.length).toBeGreaterThan(1);
    });

    it.each(owners)('%s says how one of its actions is addressed and how far it reaches', (kind) => {
      const bearing = treeOf(kind).filter((line) => line.includes(`\`${kind}.<${kind}>.<action>\``));

      expect(bearing.length).toBeGreaterThan(0);
      for (const line of bearing) expect(line).toContain(' and offered ');
      // Every shape an action is written on is on one of those lines, however the page gathered them.
      for (const written of actionBody.grammar) {
        expect(bearing.some((line) => line.includes(written.form)), `# ${kind}: nothing bearing the address shows ${written.form}`).toBe(true);
      }
    });

    it('reaches somewhere different under each kind, which is what an author cannot read off the block', () => {
      const reach = (kind: string): string => treeOf(kind).find((line) => line.includes(' and offered '))!.split(' and offered ')[1]!;

      expect(new Set(owners.map(reach)).size).toBe(owners.length);
    });
  });

  // A quest stage is a name other content reads and a condition of its own, and neither is anything the word `stage` says.
  describe('a quest stage', () => {
    const lineOf = (form: string): string => treeOf('quest').find((line) => line.trim().startsWith(form))!;

    it('says the flag its name declares', () => {
      expect(lineOf('stage <name>:')).toContain('`<quest>.<stage>`');
    });

    it('points at the condition grammar where it says it is done, rather than spelling it out there', () => {
      const said = lineOf('done when:');
      expect(said).toContain('<condition>');
      expect(condition.forms.filter((form) => said.includes(form))).toEqual([]);
    });
  });

  it('holds the fields of a kind whose grammar it writes itself', () => {
    expect(sectionFor('droptable')!.schema).toBeUndefined();
    expect(treeOf('droptable').join('\n')).toContain('one of');
  });

  // The whole answer, which the terminal's oracle and the command an authoring player types are
  // both asking for: every kind named, each heading once, and the rules said once above the lot.
  describe('the whole answer', () => {
    it('heads every kind it was asked for, and every kind there is when it was asked for none', () => {
      const whole = grammarLines();
      for (const kind of sectionKinds()) expect(heads(whole, kind), kind).toBe(true);
      const two = sectionKinds().slice(0, 2);
      const asked = grammarLines(two);
      for (const kind of sectionKinds()) expect(heads(asked, kind), kind).toBe(two.includes(kind));
    });

    // A grammar with a name of its own is written out above the kinds and pointed at from every line
    // that takes one, so the page says it once however many kinds take it. Its subjects are whatever
    // the kinds' own lines name, so a grammar named next month is held to this without an edit here.
    describe('a grammar the page names', () => {
      const named = namedGrammars(sectionKinds()).map((each) => each.called!);

      it('is one the kinds point at, or there is nothing here to prove', () => {
        expect(named.length).toBeGreaterThan(0);
      });

      // A heading stands at the left margin and a pointer back at it is indented, which is how the one
      // place the grammar is opened is told from the lines that only send a reader to it.
      it.each(named)('%s is opened in one place, however many kinds take one', (called) => {
        expect(grammarLines().filter((line) => line === `${PART}${headingOf(called)}`)).toHaveLength(1);
      });
    });

    // The same claim the kinds' own trees are held to, asked of the page they are read on: a pointer
    // that resolves under one heading and dangles on the whole answer is the page an author meets.
    it('points only back at something it has already written out', () => {
      const page = grammarLines();
      // A part is opened under the marker that says it is not a line anyone writes; a keyword opens itself.
      const opens = (line: string, form: string): boolean => {
        const bare = line.trim();
        return (bare.startsWith(PART) ? bare.slice(PART.length) : bare).startsWith(form);
      };
      for (const [at, line] of page.entries()) {
        const said = REFERS.exec(line)?.groups;
        if (said === undefined) continue;
        const above = page.slice(0, at);
        // Both halves have to stand above: the line the pointer names, and the heading it says to find it under.
        for (const named of [said.form!, ...(said.kind === undefined ? [] : [said.kind])]) {
          expect(above.some((earlier) => opens(earlier, named)), `nothing above ${JSON.stringify(line)} opens ${named}`).toBe(true);
        }
      }
    });

    // The page an agent reads start to end. A line that writes a shape out is grammar and has one home;
    // a part heading labels the group under it and says where a grammar written elsewhere stands, and
    // carries none. So the claim is about the first sort, and it is the whole of what one home means here.
    const shapesOf = (kinds: readonly string[]): string[] =>
      grammarLines(kinds)
        .map((line) => line.trim())
        .filter((line) => line !== '' && !line.startsWith(PART) && !line.startsWith('# '));

    // Narrowed as well as whole: a page asked for two kinds is the page an author is handed, and it
    // opens what those two point at rather than what all of them do.
    it.each([sectionKinds(), ['quest', 'dialogue'], ['item'], ['entity']])('writes every shape out once, asked for %s', (...asked) => {
      const shapes = shapesOf(asked.flat());
      expect([...new Set(shapes.filter((line, at) => shapes.indexOf(line) !== at))]).toEqual([]);
    });

    it.each([1, sectionKinds().length])('says each rule once over %i kind(s)', (count) => {
      const answer = grammarLines(sectionKinds().slice(0, count));
      for (const rule of RULES) expect(answer.filter((line) => line === rule), rule).toHaveLength(1);
    });
  });

  // What an author is handed where a line of theirs was refused. Every kind is asked, because a
  // kind whose refusal names nothing leaves whoever met it with the same nothing they started with.
  describe('what stands where a line was refused', () => {
    const REFUSED = 'zzz-nothing-takes-this: x';
    const written = (...lines: string[]): string => lines.join('\n');

    it.each(sectionKinds())('%s names something that could stand where a line it will not take stood', (kind) => {
      expect(standingAt(written(`# ${kind} probe`, REFUSED, ''), 2).length).toBeGreaterThan(0);
    });

    // Asked of the forms and not of the page, since a note may say the name of a form that stands elsewhere — the quest's own `never ends` says what it is instead of, and that is not the same as offering it.
    const formsAt = (text: string, line: number): string[] => standingAt(text, line).map((each) => each.split('   — ')[0]!.trim());

    it('answers for the block a line sits in rather than the section it sits under', () => {
      expect(formsAt(written('# quest a.b', 'title: T', 'stage one:', `  ${REFUSED}`, ''), 4)).toContain('complete');
      expect(formsAt(written('# quest a.b', 'title: T', REFUSED, ''), 3)).not.toContain('complete');
    });
  });
});
