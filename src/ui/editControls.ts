import { applied, offeringAt, type Offering } from '../content/completion';
import type { PlayView } from '../runtime/session';
import { deleteLine, emptied, kindsOffered, offeredBy, openingLine, removeLine, searching, SHOW_LINE, stage, type Section, type Standing, type SurfaceId } from './authoringSurface';
import { gotoLine } from './devMode';
import { stepIn, stepOut } from './editIndent';
import type { Editing } from './editorMemory';

export const sectionKey = (section: Pick<Section, 'kind' | 'address'>): string => `${section.kind} ${section.address}`;

export interface EditControls {
  surface(id: SurfaceId): void;
  kind(id: string | null): void;
  search(query: string): void;
  open(key: string | null): void;
  add(): void;
  text(draft: string, at: number): void;
  cursor(at: number): void;
  take(form: string): void;
  stepIn(): void;
  stepOut(): void;
  scroll(at: number): void;
  split(at: number): void;
  stage(): void;
  unstage(): void;
  copy(): void;
  stand(place: string): void;
}

export interface EditHeld {
  sections: readonly Section[];
  standing: Standing;
  places: PlayView['locations'];
  editing: Editing;
  controls: EditControls;
}

export interface EditActs {
  send(line: string): void;
  note(text: string): void;
  hand(): void;
  move(next: Editing): void;
}

export const rowsIn = (held: Pick<EditHeld, 'sections' | 'standing' | 'editing'>): Section[] => {
  const offered = offeredBy(held.sections, held.standing, held.editing.surface);
  const kind = held.editing.surface === 'global' ? held.editing.kind : null;
  const search = searching(held.editing.query);
  return offered.filter((section) => (kind === null || section.kind === kind) && search.holds(section));
};

export const kindsIn = (held: Pick<EditHeld, 'sections' | 'standing' | 'editing'>): string[] => kindsOffered(offeredBy(held.sections, held.standing, held.editing.surface));

export const openedIn = (sections: readonly Section[], editing: Editing): Section | null =>
  sections.find((section) => sectionKey(section) === editing.open) ?? null;

export const draftIn = (sections: readonly Section[], editing: Editing): string => editing.draft ?? openedIn(sections, editing)?.text ?? '';

export const offeringIn = (held: Pick<EditHeld, 'sections' | 'editing'>): Offering => offeringAt(draftIn(held.sections, held.editing), held.editing.cursor, held.sections);

export function editControls(held: { sections: readonly Section[]; editing: Editing }, act: EditActs): EditControls {
  const { sections, editing } = held;
  const shut = (): Editing => ({ ...editing, open: null, draft: null, cursor: 0 });

  return {
    surface: (surface) => act.move({ ...editing, surface, open: null, draft: null, cursor: 0, scroll: 0 }),
    kind: (kind) => act.move({ ...editing, kind, open: null, draft: null, cursor: 0 }),
    search: (query) => act.move({ ...editing, query, scroll: 0 }),
    open: (open) => act.move({ ...editing, open, draft: null, cursor: 0 }),
    add: () => {
      const opening = openingLine(editing.surface === 'global' ? editing.kind : null);
      act.move({ ...editing, open: null, draft: opening, cursor: opening.length });
    },
    text: (text, at) => act.move({ ...editing, draft: text, cursor: at }),
    cursor: (at) => act.move({ ...editing, cursor: at }),
    take: (form) => {
      const offering = offeringIn(held);
      const offer = offering.offers.find((each) => each.form === form);
      if (offer === undefined) return;
      const taken = applied(draftIn(sections, editing), offering, offer);
      act.move({ ...editing, draft: taken.text, cursor: taken.cursor });
    },
    stepIn: () => {
      const stepped = stepIn(draftIn(sections, editing), editing.cursor);
      act.move({ ...editing, draft: stepped.text, cursor: stepped.cursor });
    },
    stepOut: () => {
      const stepped = stepOut(draftIn(sections, editing), editing.cursor);
      act.move({ ...editing, draft: stepped.text, cursor: stepped.cursor });
    },
    scroll: (at) => act.move({ ...editing, scroll: at }),
    split: (at) => act.move({ ...editing, split: at }),
    stage: () => {
      const section = openedIn(sections, editing);
      const draft = draftIn(sections, editing);
      if (section !== null && emptied(draft)) {
        act.send(section.staged ? deleteLine(section) : removeLine(section));
        return act.move(shut());
      }
      const staged = stage(draft);
      if ('refused' in staged) return act.note(staged.refused);
      act.send(staged.line);
    },
    unstage: () => {
      const section = openedIn(sections, editing);
      if (section === null) return;
      act.send(deleteLine(section));
      act.move(shut());
    },
    copy: () => {
      act.send(SHOW_LINE);
      act.hand();
    },
    stand: (place) => act.send(gotoLine(place)),
  };
}
