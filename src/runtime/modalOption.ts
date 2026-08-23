import type { Answer, Localized } from './localized';

export interface ModalChoice {
  readonly value: Answer;
  readonly shown: Localized;
  readonly on?: Answer;
  readonly subject?: Localized;
}

export interface ModalOption {
  key: Answer;
  label: Localized;
  values: readonly ModalChoice[] | null;
  // The values are what this option shows, not the whole of what it takes. An answer that is none of them is left to the modal's own submit to make sense of or refuse, rather than turned away here for not being one of the words on the screen.
  takesMore?: boolean;
}
