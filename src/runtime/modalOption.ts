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
}
