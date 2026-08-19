import type { Answer, Localized } from './localized';

// What a modal screen offers, declared beneath the screens that build it and
// the module that assembles them. carriedScreen.ts and planeScreen.ts each
// return these and modals.ts collects them, so a declaration living in
// modals.ts made both screens import their own collector.
export interface ModalChoice {
  readonly value: Answer;
  readonly shown: Localized;
  // What the choice acts on, where the screen has a subject it also publishes
  // and a driver may be drawing that subject rather than this list. Absent on
  // every screen whose choices are only ever pressed as a list.
  readonly on?: Answer;
  // What the choice brings to that node, named the one way every screen names a
  // carried thing. `shown` is the whole sentence a list needs; this is the half
  // of it a driver drawing the node itself has room for.
  readonly subject?: Localized;
}

export interface ModalOption {
  key: Answer;
  label: Localized;
  // What this option will accept, or null where it takes free text.
  values: readonly ModalChoice[] | null;
}
