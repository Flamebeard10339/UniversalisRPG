import { describe, expect, it } from 'vitest';
import { addressable, NOWHERE, type Section, type Standing } from './authoringSurface';
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
  return { controls: editControls({ sections, editing }, acts), sent, said, at, get handed() { return handed; } };
}

const opened: Editing = { ...FORGOTTEN, open: sectionKey(MIKI) };

const EXERCISED: Record<keyof EditControls, true> = {
  surface: true,
  kind: true,
  open: true,
  text: true,
  cursor: true,
  scroll: true,
  stage: true,
  unstage: true,
  copy: true,
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
    held.controls.text('# entity tutorial-island.miki\ntitle: Miki the Guide');
    held.controls.cursor(12);
    held.controls.scroll(220);

    expect(held.at.map((each) => [each.draft, each.cursor, each.scroll])).toEqual([
      ['# entity tutorial-island.miki\ntitle: Miki the Guide', 0, 0],
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

  it('offers nothing local where nothing is standing', () => {
    expect(rowsIn({ sections: addressed, standing: NOWHERE, editing: FORGOTTEN })).toEqual([]);
  });
});
