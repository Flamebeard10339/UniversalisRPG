import { deleteLine, kindsOffered, offeredBy, SHOW_LINE, stage, type Section, type Standing, type SurfaceId } from './authoringSurface';
import type { Editing } from './editorMemory';

// What each control on the editing page does, decided here rather than inside a
// render: a decision inside one is a decision no test in this suite can reach.
// Every one of them is either a move of where the author is or a line the REPL
// types, and there is nothing else it could be — this file is the whole of the
// page's reach, and it holds no registry, no module text and no store.

export const sectionKey = (section: Pick<Section, 'kind' | 'address'>): string => `${section.kind} ${section.address}`;

export interface EditControls {
  surface(id: SurfaceId): void;
  kind(id: string | null): void;
  open(key: string | null): void;
  text(draft: string): void;
  cursor(at: number): void;
  scroll(at: number): void;
  stage(): void;
  unstage(): void;
  copy(): void;
}

// What the page holds: the one list, where the player is standing, where the
// author is, and the controls built over them. Handed over whole to a driving
// agent, so what it is told is what a finger would move.
export interface EditHeld {
  sections: readonly Section[];
  standing: Standing;
  editing: Editing;
  controls: EditControls;
}

// The three things a control can do that are not a move: send a line, say
// something on the tool's channel, and hand the author the module's bytes.
export interface EditActs {
  send(line: string): void;
  note(text: string): void;
  hand(): void;
  move(next: Editing): void;
}

// The rows the page is drawing: the surface's own slice of the one list, and
// the kind filter over it where the surface has one. Assembled once, so what a
// driving agent is told is what a finger can reach.
export const rowsIn = (held: Pick<EditHeld, 'sections' | 'standing' | 'editing'>): Section[] => {
  const offered = offeredBy(held.sections, held.standing, held.editing.surface);
  const kind = held.editing.surface === 'global' ? held.editing.kind : null;
  return kind === null ? offered : offered.filter((section) => section.kind === kind);
};

// Every kind the surface has something of, which is what its filter offers.
export const kindsIn = (held: Pick<EditHeld, 'sections' | 'standing' | 'editing'>): string[] => kindsOffered(offeredBy(held.sections, held.standing, held.editing.surface));

export const openedIn = (sections: readonly Section[], editing: Editing): Section | null =>
  sections.find((section) => sectionKey(section) === editing.open) ?? null;

// What is in the field: the draft where there is one, and the section as it
// stands where there is not. A section opened and not typed into is not a
// draft, so switching to it and back changes nothing.
export const draftIn = (sections: readonly Section[], editing: Editing): string => editing.draft ?? openedIn(sections, editing)?.text ?? '';

export function editControls(held: { sections: readonly Section[]; editing: Editing }, act: EditActs): EditControls {
  const { sections, editing } = held;

  return {
    surface: (surface) => act.move({ ...editing, surface, open: null, draft: null, cursor: 0, scroll: 0 }),
    kind: (kind) => act.move({ ...editing, kind, open: null, draft: null, cursor: 0 }),
    // Opening a section drops the draft with it: what is in the field belongs
    // to the section that was open, and carrying it across would put one
    // section's text under another's name.
    open: (open) => act.move({ ...editing, open, draft: null, cursor: 0 }),
    text: (text) => act.move({ ...editing, draft: text }),
    cursor: (at) => act.move({ ...editing, cursor: at }),
    scroll: (at) => act.move({ ...editing, scroll: at }),
    stage: () => {
      const staged = stage(draftIn(sections, editing));
      if ('refused' in staged) return act.note(staged.refused);
      act.send(staged.line);
    },
    unstage: () => {
      const section = openedIn(sections, editing);
      if (section) act.send(deleteLine(section));
    },
    // The one route out. It serializes nothing: what is handed over is the
    // module's own bytes as the store holds them, and printing them is the same
    // command that would have printed them anyway — a clipboard a browser
    // refuses is still a column an author can select out of.
    copy: () => {
      act.send(SHOW_LINE);
      act.hand();
    },
  };
}
