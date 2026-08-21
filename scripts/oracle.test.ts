import { describe, expect, it } from 'vitest';
import { offeringAt } from '../src/content/completion';
import { sectionFor, sectionKinds } from '../src/content/sections';
import { literalOf } from '../src/content/completion';
import { treeOf } from './oracle';

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
