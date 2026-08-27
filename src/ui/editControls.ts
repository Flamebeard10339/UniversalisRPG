import { amissIn, applied, offeringAt, type Addressed, type Amiss, type Offering } from '../content/completion';
import { colourStanding, isColourHole } from '../grammar/colour';
import type { PlayView } from '../runtime/session';
import { deleteLine, emptied, kindsOffered, offeredBy, openingLine, removeLine, searching, SHOW_LINE, stage, STATES, type Section, type Standing, type SurfaceId } from './authoringSurface';
import { gotoLine } from './devMode';
import { stepIn, stepOut, typed } from './editIndent';
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
  fill(value: string): void;
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
  declared: readonly Addressed[];
  standing: Standing;
  places: PlayView['discovered'];
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
  const search = searching(held.editing.query, offered);
  return offered.filter((section) => (kind === null || section.kind === kind) && search.holds(section));
};

// What a row wears before it is opened, which is the state the search would find it under, so a colour and an `is:` term are one question asked twice rather than two answers to keep in step. The engine's word comes first: a change it will not take is not a change yet.
export const TONES: readonly (readonly [string, string])[] = [
  ['amiss', 'border-danger bg-panel text-danger'],
  ['changed', 'border-warning bg-panel text-warning'],
];

export const tonesIn = (sections: readonly Section[]): Map<string, string> => {
  const asked = TONES.map(([state, tone]) => [STATES[state]!(sections), tone] as const);
  return new Map(
    sections.flatMap((section) => {
      const tone = asked.find(([holds]) => holds(section))?.[1];
      return tone === undefined ? [] : [[sectionKey(section), tone] as const];
    }),
  );
};

export const kindsIn = (held: Pick<EditHeld, 'sections' | 'standing' | 'editing'>): string[] => kindsOffered(offeredBy(held.sections, held.standing, held.editing.surface));

export const openedIn = (sections: readonly Section[], editing: Editing): Section | null =>
  sections.find((section) => sectionKey(section) === editing.open) ?? null;

export const draftIn = (sections: readonly Section[], editing: Editing): string => editing.draft ?? openedIn(sections, editing)?.text ?? '';

export const offeringIn = (held: Pick<EditHeld, 'sections' | 'declared' | 'editing'>): Offering => offeringAt(draftIn(held.sections, held.editing), held.editing.cursor, held.declared);

// The colour the picker stands on, or null where the cursor is not in a hole a colour goes in. The
// hole says so itself — any field written with the colour parser fills a `<colour>` — so the picker
// is offered by the grammar rather than by a page that knows which field is which.
export function colourIn(held: Pick<EditHeld, 'sections' | 'declared' | 'editing'>): string | null {
  const offering = offeringIn(held);
  if (offering.filling === null || !isColourHole(offering.filling.hole)) return null;
  return colourStanding(draftIn(held.sections, held.editing).slice(offering.from + offering.filling.at, offering.to));
}

// Everything the engine has to say about the draft as a whole, which is what stands between it and being staged, wherever in it the cursor happens to be.
export const amissWith = (held: Pick<EditHeld, 'sections' | 'declared' | 'editing'>): Amiss[] => amissIn(draftIn(held.sections, held.editing), held.declared);

export function editControls(held: Pick<EditHeld, 'sections' | 'declared' | 'editing'>, act: EditActs): EditControls {
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
    text: (text, at) => {
      const written = typed(draftIn(sections, editing), text, at);
      act.move({ ...editing, draft: written.text, cursor: written.cursor });
    },
    cursor: (at) => act.move({ ...editing, cursor: at }),
    take: (form) => {
      const offering = offeringIn(held);
      const offer = offering.offers.find((each) => each.form === form);
      if (offer === undefined) return;
      const taken = applied(draftIn(sections, editing), offering, offer);
      act.move({ ...editing, draft: taken.text, cursor: taken.cursor });
    },
    // A value stood in the hole the cursor is in, for a hole a control can answer outright rather
    // than offer a list for. It is the same replacement `take` makes; what differs is that the words
    // came from a control instead of from the grammar.
    fill: (value) => {
      const offering = offeringIn(held);
      if (offering.filling === null) return;
      const draft = draftIn(sections, editing);
      const at = offering.from + offering.filling.at;
      act.move({ ...editing, draft: `${draft.slice(0, at)}${value}${draft.slice(offering.to)}`, cursor: at + value.length });
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
