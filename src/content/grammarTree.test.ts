import { describe, expect, it } from 'vitest';
import { actionBody } from '../grammar/action';
import { condition } from '../grammar/condition';
import { literalOf, offeringAt } from './completion';
import { sectionFor, sectionKinds } from './sections';
import { grammarLines, RULES, standingAt, treeOf } from './grammarTree';

const REFERS = /…indented under it, what `(?<form>.+)` holds$/;

describe('the grammar tree', () => {
  it.each(sectionKinds())('%s is written out once, however deep its blocks reach', (kind) => {
    const tree = treeOf(kind);
    expect(tree[0]).toBe(`# ${kind} <id>`);
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

  // The block an author writes under one kind is the block they write under every other, and how far the action reaches is the one thing it cannot show them. Every kind that nests actions is asked here, so a fourth of them arrives noted or not at all.
  describe('an action nested under a kind', () => {
    const owners = sectionKinds().filter((kind) => sectionFor(kind)!.nestsActions);

    it('is nested by more than one kind, which is why the reach has to be said at all', () => {
      expect(owners.length).toBeGreaterThan(1);
    });

    it.each(owners)('%s says how one of its actions is addressed and how far it reaches', (kind) => {
      const bearing = treeOf(kind).filter((line) => line.includes(`\`${kind}.<${kind}>.<action>\``));

      expect(bearing).toHaveLength(actionBody.grammar.length);
      for (const line of bearing) {
        expect(line).toContain(' and offered ');
        expect(actionBody.grammar.some((written) => line.trim().startsWith(written.form)), `# ${kind}: ${JSON.stringify(line)} is not a line an action is written on`).toBe(true);
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

    it('says the whole of the condition grammar where it says it is done, off that grammar itself', () => {
      const said = lineOf('done when:');
      for (const form of condition.forms) expect(said).toContain(form);
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
      for (const kind of sectionKinds()) expect(grammarLines(), kind).toContain(`# ${kind} <id>`);
      const two = sectionKinds().slice(0, 2);
      const asked = grammarLines(two);
      for (const kind of sectionKinds()) expect(asked.includes(`# ${kind} <id>`), kind).toBe(two.includes(kind));
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

    it('answers for the block a line sits in rather than the section it sits under', () => {
      const inStage = standingAt(written('# quest a.b', 'title: T', 'stage one:', `  ${REFUSED}`, ''), 4);
      const under = standingAt(written('# quest a.b', 'title: T', REFUSED, ''), 3);
      expect(inStage.join('\n')).toContain('complete');
      expect(under.join('\n')).not.toContain('complete');
    });
  });
});
