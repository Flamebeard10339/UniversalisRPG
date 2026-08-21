import { describe, expect, it } from 'vitest';
import { addressable, NOWHERE, searching, searchHint, STATES, type Section, type Standing } from './authoringSurface';
import { draftIn, editControls, kindsIn, openedIn, rowsIn, sectionKey, type EditActs, type EditControls } from './editControls';
import { FORGOTTEN, type Editing } from './editorMemory';
import { SHIPPED_SOURCES } from './shippedContent';

const addressed = addressable(SHIPPED_SOURCES);

const GUIDE_HOUSE: Standing = { location: 'tutorial-island.guide-house', entities: ['tutorial-island.miki'] };

const MIKI = addressed.find((section) => section.kind === 'entity' && section.address === 'tutorial-island.miki')!;

function watching(editing: Editing, sections: readonly Section[] = addressed): { controls: EditControls; sent: string[]; said: string[]; handed: number; at: Editing[] } {
  const sent: string[] = [];
  const said: string[] = [];
  const at: Editing[] = [];
  let handed = 0;
  const acts: EditActs = { send: (line) => void sent.push(line), note: (text) => void said.push(text), hand: () => void (handed += 1), move: (next) => void at.push(next) };
  return { controls: editControls({ sections, declared: sections, editing }, acts), sent, said, at, get handed() { return handed; } };
}

const opened: Editing = { ...FORGOTTEN, open: sectionKey(MIKI) };

const EXERCISED: Record<keyof EditControls, true> = {
  surface: true,
  kind: true,
  search: true,
  open: true,
  add: true,
  text: true,
  cursor: true,
  take: true,
  stepIn: true,
  stepOut: true,
  scroll: true,
  split: true,
  stage: true,
  unstage: true,
  copy: true,
  stand: true,
};

describe('what a control on the editing page does', () => {
  it('has a case for every control the page offers', () => {
    const { controls } = watching(FORGOTTEN);

    expect(Object.keys(controls).sort()).toEqual(Object.keys(EXERCISED).sort());
  });

  it('moves the author, and drops the draft with the section it belonged to', () => {
    const typed: Editing = { ...opened, draft: 'half a sentence', cursor: 9, scroll: 40 };

    const shown = watching(typed);
    shown.controls.surface('global');
    expect(shown.at[0]).toMatchObject({ surface: 'global', open: null, draft: null, cursor: 0, scroll: 0 });
    const kinded = watching(typed);
    kinded.controls.kind('item');
    expect(kinded.at[0]).toMatchObject({ kind: 'item', open: null, draft: null });
    const reopened = watching(typed);
    reopened.controls.open('entity tutorial-island.front-door');
    expect(reopened.at[0]).toMatchObject({ open: 'entity tutorial-island.front-door', draft: null, cursor: 0 });
  });

  it('keeps what was typed, where the cursor was and how far the list was scrolled', () => {
    const held = watching(opened);
    held.controls.text('# entity tutorial-island.miki\ntitle: Miki the Guide', 51);
    held.controls.cursor(12);
    held.controls.scroll(220);

    expect(held.at.map((each) => [each.draft, each.cursor, each.scroll])).toEqual([
      ['# entity tutorial-island.miki\ntitle: Miki the Guide', 51, 0],
      [null, 12, 0],
      [null, 0, 220],
    ]);
  });

  it('stages what is in the field, as the line the console types', () => {
    const held = watching({ ...opened, draft: '# entity tutorial-island.miki\ntitle: Miki the Guide' });
    held.controls.stage();

    expect(held.sent).toEqual(['/dsl entity tutorial-island.miki title: Miki the Guide']);
    expect(held.said).toEqual([]);
  });

  it('stages the section as it stands when nothing has been typed into it', () => {
    const held = watching(opened);
    held.controls.stage();

    expect(held.sent).toEqual([`/dsl entity ${MIKI.address} ${MIKI.text.split('\n').slice(1).map((line, at) => (at === 0 ? line : ` ${line}`)).join('|')}`]);
  });

  it('says why rather than sending half a section', () => {
    const held = watching({ ...opened, draft: 'title: nothing to hang this on' });
    held.controls.stage();

    expect(held.sent).toEqual([]);
    expect(held.said).toHaveLength(1);
  });

  it('unstages by the line the same table parses, and does nothing with nothing open', () => {
    const held = watching(opened);
    held.controls.unstage();
    const shut = watching(FORGOTTEN);
    shut.controls.unstage();

    expect(held.sent).toEqual([`/local delete entity ${MIKI.address}`]);
    expect(shut.sent).toEqual([]);
  });

  it('opens an empty field headed for the kind the page is filtered to', () => {
    const local = watching(FORGOTTEN);
    local.controls.add();
    const kinded = watching({ ...FORGOTTEN, surface: 'global', kind: 'item' });
    kinded.controls.add();

    expect(local.at[0]).toMatchObject({ open: null, draft: '# ', cursor: 2 });
    expect(kinded.at[0]).toMatchObject({ open: null, draft: '# item ', cursor: 7 });
    expect(local.sent).toEqual([]);
  });

  it('takes an emptied section out rather than staging nothing over it', () => {
    const shipped = watching({ ...opened, draft: '   \n' });
    shipped.controls.stage();
    const held = watching({ ...opened, draft: '' }, addressed.map((section) => (section === MIKI ? { ...section, staged: true } : section)));
    held.controls.stage();

    expect(shipped.sent).toEqual([`/dsl remove entity.${MIKI.address}`]);
    expect(held.sent).toEqual([`/local delete entity ${MIKI.address}`]);
    expect(held.at[0]).toMatchObject({ open: null, draft: null });
    expect(shipped.said).toEqual([]);
  });

  it('still refuses an empty field with no section behind it', () => {
    const held = watching({ ...FORGOTTEN, draft: '   ' });
    held.controls.stage();

    expect(held.sent).toEqual([]);
    expect(held.said).toHaveLength(1);
  });

  it('remembers how the page was divided between the list and the field', () => {
    const held = watching(opened);
    held.controls.split(0.3);

    expect(held.at[0]).toMatchObject({ split: 0.3, open: opened.open });
  });

  it('stands the author somewhere else by the same line a tapped place sends', () => {
    const held = watching(FORGOTTEN);
    held.controls.stand('tutorial-island.beach');

    expect(held.sent).toEqual(['/goto tutorial-island.beach']);
  });

  it('hands the module over and prints it, which is one command and one set of bytes', () => {
    const held = watching(FORGOTTEN);
    held.controls.copy();

    expect(held.sent).toEqual(['/local show']);
    expect(held.handed).toBe(1);
  });
});

describe('what the page draws, assembled once', () => {
  it('narrows Global by the kind chosen and leaves Local whole', () => {
    const everything = rowsIn({ sections: addressed, standing: GUIDE_HOUSE, editing: { ...FORGOTTEN, surface: 'global' } });
    const items = rowsIn({ sections: addressed, standing: GUIDE_HOUSE, editing: { ...FORGOTTEN, surface: 'global', kind: 'item' } });

    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThan(everything.length);
    expect([...new Set(items.map((section) => section.kind))]).toEqual(['item']);
    expect(rowsIn({ sections: addressed, standing: GUIDE_HOUSE, editing: { ...FORGOTTEN, surface: 'local', kind: 'item' } }).map(sectionKey)).toEqual(
      rowsIn({ sections: addressed, standing: GUIDE_HOUSE, editing: { ...FORGOTTEN, surface: 'local' } }).map(sectionKey),
    );
  });

  it('narrows by the kind and by what was searched for at once', () => {
    const held = { sections: addressed, standing: GUIDE_HOUSE, editing: { ...FORGOTTEN, surface: 'global' as const, kind: 'item' } };
    const items = rowsIn(held);
    const swords = rowsIn({ ...held, editing: { ...held.editing, query: 'sword' } });

    expect(swords.length).toBeGreaterThan(0);
    expect(swords.length).toBeLessThan(items.length);
    expect(swords.every((section) => section.kind === 'item')).toBe(true);
    expect(rowsIn({ ...held, editing: { ...held.editing, kind: null, query: 'sword' } }).length).toBeGreaterThan(swords.length);
  });

  it('offers the kinds the surface has something of and no others', () => {
    const kinds = kindsIn({ sections: addressed, standing: GUIDE_HOUSE, editing: { ...FORGOTTEN, surface: 'global' } });

    expect(kinds).toEqual([...kinds].sort());
    expect(kinds).not.toContain('location');
    expect(kinds.length).toBeGreaterThan(3);
  });

  it('puts the section in the field until something is typed, and what was typed after', () => {
    expect(draftIn(addressed, opened)).toBe(MIKI.text);
    expect(draftIn(addressed, { ...opened, draft: 'typed' })).toBe('typed');
    expect(draftIn(addressed, FORGOTTEN)).toBe('');
    expect(openedIn(addressed, { ...FORGOTTEN, open: 'entity nothing.at-all' })).toBeNull();
  });

  it('offers the place being stood in beside the things standing in it', () => {
    const rows = rowsIn({ sections: addressed, standing: GUIDE_HOUSE, editing: FORGOTTEN }).map(sectionKey);

    expect(rows).toContain(`location ${GUIDE_HOUSE.location}`);
    expect(rows.filter((row) => row.startsWith('location '))).toEqual([`location ${GUIDE_HOUSE.location}`]);
  });

  it('offers nothing local where nothing is standing', () => {
    expect(rowsIn({ sections: addressed, standing: NOWHERE, editing: FORGOTTEN })).toEqual([]);
  });
});

describe('narrowing the list by what is true of a section', () => {
  const shipped = { kind: 'item', address: 'tutorial-island.sword', text: '# item tutorial-island.sword', module: 'tutorial-island', staged: false };
  const mine = { kind: 'item', address: 'tutorial-island.sword', text: '# item tutorial-island.sword', module: 'local-changes', staged: true };
  const fresh = { kind: 'item', address: 'local-changes.torch', text: '# item local-changes.torch', module: 'local-changes', staged: true };
  const broken = { kind: 'item', address: 'local-changes.rope', text: '# item local-changes.rope\nnonsense: 3', module: 'local-changes', staged: true };
  const all = [shipped, mine, fresh, broken];
  const kept = (query: string): string[] => all.filter((each) => searching(query, all).holds(each)).map((each) => each.module + ' ' + each.address);

  it('keeps what an author has changed', () => {
    expect(kept('is:changed')).toEqual(['local-changes tutorial-island.sword', 'local-changes local-changes.torch', 'local-changes local-changes.rope']);
  });

  it('keeps only what stands over something shipped', () => {
    expect(kept('is:shadowed')).toEqual(['local-changes tutorial-island.sword']);
  });

  it('keeps what the engine will not read', () => {
    expect(kept('is:amiss')).toEqual(['local-changes local-changes.rope']);
  });

  it('narrows by a word and a state together', () => {
    expect(kept('is:changed torch')).toEqual(['local-changes local-changes.torch']);
  });

  it('says a state nothing declares is broken, rather than reading it as a word', () => {
    expect(searching('is:nonsense', all).broken).toBe(true);
  });

  it('holds nothing against a section the engine reads whole, however its lines read alone', () => {
    const search = searching('is:amiss', addressed);
    expect(addressed.filter((each) => search.holds(each))).toEqual([]);
  });

  it('widens to either side of ||', () => {
    expect(kept('is:amiss || is:shadowed')).toEqual(['local-changes tutorial-island.sword', 'local-changes local-changes.rope']);
  });

  it('narrows within a side before widening across them', () => {
    expect(kept('is:changed sword || rope')).toEqual(['local-changes tutorial-island.sword', 'local-changes local-changes.rope']);
  });

  it('leaves a single | to the pattern it is written in', () => {
    expect(kept('torch|rope')).toEqual(['local-changes local-changes.torch', 'local-changes local-changes.rope']);
  });

  it('keeps the side already written while the other one is still being typed', () => {
    expect(kept('torch ||')).toEqual(['local-changes local-changes.torch']);
  });

  it('is broken when either side is', () => {
    expect(searching('is:changed || is:nonsense', all).broken).toBe(true);
  });

  it('says every state the box takes in the box itself', () => {
    for (const state of Object.keys(STATES)) expect(searchHint('narrow it:')).toContain(`is:${state}`);
  });
});
