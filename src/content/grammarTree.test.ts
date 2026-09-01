import { describe, expect, it } from 'vitest';
import { actionBody } from '../grammar/action';
import { condition } from '../grammar/condition';
import { offeringAt } from './completion';
import { gathered, shownIn } from './offerGroups';
import { globalSectionKinds, sectionFor, sectionKinds } from './sections';
import { WRITTEN_WHOLE_NOTE } from './merge';
import { grammarLines, headingOf, namedGrammars, PART, RULES, standingAt, treeOf } from './grammarTree';

const REFERS = /…indented under it, what `(?<form>[^`]+)`(?: under `(?<kind>[^`]+)`)? holds$/;

const heads = (page: readonly string[], kind: string): boolean => page.some((line) => line.startsWith(`# ${kind} <id>`));

describe('the grammar tree', () => {
  it.each(sectionKinds())('%s is written out once, however deep its blocks reach', (kind) => {
    const tree = treeOf(kind);
    expect(heads(tree, kind), tree[0]).toBe(true);
    expect(tree.length).toBeLessThan(200);
  });

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

  it.each(sectionKinds())('%s shows every shape the page offers at the top of it', (kind) => {
    const opening = `# ${kind} probe\n`;
    const tree = grammarLines([kind]).join('\n');
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

  describe('an action nested under a kind', () => {
    const owners = sectionKinds().filter((kind) => sectionFor(kind)!.nestsActions);

    it('is nested by more than one kind, which is why the reach has to be said at all', () => {
      expect(owners.length).toBeGreaterThan(1);
    });

    it.each(owners)('%s says how one of its actions is addressed and how far it reaches', (kind) => {
      const bearing = treeOf(kind).filter((line) => line.includes(`\`${kind}.<${kind}>.<action>\``));

      expect(bearing.length).toBeGreaterThan(0);
      for (const line of bearing) expect(line).toContain(' and offered ');
      for (const written of actionBody.grammar) {
        expect(bearing.some((line) => line.includes(written.form)), `# ${kind}: nothing bearing the address shows ${written.form}`).toBe(true);
      }
    });

    it('reaches somewhere different under each kind, which is what an author cannot read off the block', () => {
      const reach = (kind: string): string => treeOf(kind).find((line) => line.includes(' and offered '))!.split(' and offered ')[1]!;

      expect(new Set(owners.map(reach)).size).toBe(owners.length);
    });
  });

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

  describe('the whole answer', () => {
    it('heads every kind it was asked for, and every kind there is when it was asked for none', () => {
      const whole = grammarLines();
      for (const kind of sectionKinds()) expect(heads(whole, kind), kind).toBe(true);
      const two = sectionKinds().slice(0, 2);
      const asked = grammarLines(two);
      for (const kind of sectionKinds()) expect(heads(asked, kind), kind).toBe(two.includes(kind));
    });

    describe('a grammar the page names', () => {
      const named = namedGrammars(sectionKinds()).map((each) => each.called!);

      it('is one the kinds point at, or there is nothing here to prove', () => {
        expect(named.length).toBeGreaterThan(0);
      });

      it.each(named)('%s is opened in one place, however many kinds take one', (called) => {
        expect(grammarLines().filter((line) => line === `${PART}${headingOf(called)}`)).toHaveLength(1);
      });
    });

    it('points only back at something it has already written out', () => {
      const page = grammarLines();
      const opens = (line: string, form: string): boolean => {
        const bare = line.trim();
        return (bare.startsWith(PART) ? bare.slice(PART.length) : bare).startsWith(form);
      };
      for (const [at, line] of page.entries()) {
        const said = REFERS.exec(line)?.groups;
        if (said === undefined) continue;
        const above = page.slice(0, at);
        for (const named of [said.form!, ...(said.kind === undefined ? [] : [said.kind])]) {
          expect(above.some((earlier) => opens(earlier, named)), `nothing above ${JSON.stringify(line)} opens ${named}`).toBe(true);
        }
      }
    });

    const shapesOf = (kinds: readonly string[]): string[] =>
      grammarLines(kinds)
        .map((line) => line.trim())
        .filter((line) => line !== '' && !line.startsWith(PART) && !line.startsWith('# '));

    it.each([sectionKinds(), ['quest', 'dialogue'], ['item'], ['entity']])('writes every shape out once, asked for %s', (...asked) => {
      const shapes = shapesOf(asked.flat());
      expect([...new Set(shapes.filter((line, at) => shapes.indexOf(line) !== at))]).toEqual([]);
    });

    it.each([1, sectionKinds().length])('says each rule once over %i kind(s)', (count) => {
      const answer = grammarLines(sectionKinds().slice(0, count));
      for (const rule of RULES) expect(answer.filter((line) => line === rule), rule).toHaveLength(1);
    });
  });

  describe('what stands where a line was refused', () => {
    const REFUSED = 'zzz-nothing-takes-this: x';
    const written = (...lines: string[]): string => lines.join('\n');

    it.each(sectionKinds())('%s names something that could stand where a line it will not take stood', (kind) => {
      expect(standingAt(written(`# ${kind} probe`, REFUSED, ''), 2).length).toBeGreaterThan(0);
    });

    const formsAt = (text: string, line: number): string[] => standingAt(text, line).map((each) => each.split('   — ')[0]!.trim());

    it('answers for the block a line sits in rather than the section it sits under', () => {
      expect(formsAt(written('# quest a.b', 'title: T', 'stage one:', `  ${REFUSED}`, ''), 4)).toContain('complete');
      expect(formsAt(written('# quest a.b', 'title: T', REFUSED, ''), 3)).not.toContain('complete');
    });
  });
});
