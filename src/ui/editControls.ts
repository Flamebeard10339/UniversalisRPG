import { deleteLine, kindsOffered, offeredBy, SHOW_LINE, stage, type Section, type Standing, type SurfaceId } from './authoringSurface';
import type { Editing } from './editorMemory';

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

export interface EditHeld {
  sections: readonly Section[];
  standing: Standing;
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
  return kind === null ? offered : offered.filter((section) => section.kind === kind);
};

export const kindsIn = (held: Pick<EditHeld, 'sections' | 'standing' | 'editing'>): string[] => kindsOffered(offeredBy(held.sections, held.standing, held.editing.surface));

export const openedIn = (sections: readonly Section[], editing: Editing): Section | null =>
  sections.find((section) => sectionKey(section) === editing.open) ?? null;

export const draftIn = (sections: readonly Section[], editing: Editing): string => editing.draft ?? openedIn(sections, editing)?.text ?? '';

export function editControls(held: { sections: readonly Section[]; editing: Editing }, act: EditActs): EditControls {
  const { sections, editing } = held;

  return {
    surface: (surface) => act.move({ ...editing, surface, open: null, draft: null, cursor: 0, scroll: 0 }),
    kind: (kind) => act.move({ ...editing, kind, open: null, draft: null, cursor: 0 }),
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
    copy: () => {
      act.send(SHOW_LINE);
      act.hand();
    },
  };
}
