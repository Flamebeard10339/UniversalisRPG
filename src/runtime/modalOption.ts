import type { Answer, Localized } from './localized';

export interface ChoiceCell {
  readonly under: Answer;
  readonly heading: Localized;
  readonly title: Localized;
  readonly price: number;
  readonly count: number;
}

export interface ModalChoice {
  readonly value: Answer;
  readonly shown: Localized;
  readonly on?: Answer;
  readonly held?: Answer;
  readonly subject?: Localized;
  readonly cell?: ChoiceCell;
}

export interface ModalOption {
  key: Answer;
  label: Localized;
  values: readonly ModalChoice[] | null;
  standing?: Answer;
  takesMore?: boolean;
}

export const answeredBy = (choice: ModalChoice): readonly Answer[] => (choice.held === undefined ? [choice.value] : [choice.value, choice.held]);

export const offersAnswer = (option: ModalOption, value: string): boolean => (option.values ?? []).some((choice) => (answeredBy(choice) as readonly string[]).includes(value));

export interface NumberedChoice {
  readonly at: number;
  readonly choice: ModalChoice;
}

export interface ChoicePart {
  readonly under: Answer;
  readonly heading: Localized;
  readonly choices: readonly NumberedChoice[];
}

export function partsOf(option: ModalOption): { parts: readonly ChoicePart[]; loose: readonly NumberedChoice[] } {
  const parts: Array<{ under: Answer; heading: Localized; choices: NumberedChoice[] }> = [];
  const loose: NumberedChoice[] = [];
  (option.values ?? []).forEach((choice, at) => {
    const cell = choice.cell;
    if (!cell) {
      loose.push({ at, choice });
      return;
    }
    const held = parts.find((part) => part.under === cell.under);
    if (held) held.choices.push({ at, choice });
    else parts.push({ under: cell.under, heading: cell.heading, choices: [{ at, choice }] });
  });
  return { parts, loose };
}

export const partStanding = (parts: readonly ChoicePart[], picked: Answer | null, offered?: Answer): Answer | null =>
  parts.find((part) => part.under === picked)?.under ?? parts.find((part) => part.under === offered)?.under ?? parts[0]?.under ?? null;
