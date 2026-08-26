import type { Answer, Localized } from './localized';

// A choice a screen wants read as a cell rather than as a line: which side of the screen it stands
// under and what to head that side with, what the thing is, what it goes for and how many there are.
// The figures travel as figures, so no surface has to read a price back out of a sentence and none
// of them can come to disagree about one.
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
  readonly subject?: Localized;
  readonly cell?: ChoiceCell;
}

export interface ModalOption {
  key: Answer;
  label: Localized;
  values: readonly ModalChoice[] | null;
  // The values are what this option shows, not the whole of what it takes. An answer that is none of them is left to the modal's own submit to make sense of or refuse, rather than turned away here for not being one of the words on the screen.
  takesMore?: boolean;
}

// A choice beside where it stands in the option that published it. The position is what a terminal
// numbers the choice by, so grouping the choices for a surface that draws them in groups must not
// renumber them: the answer a recording holds is the value, and the number a reader types is the
// place it came out of the engine at.
export interface NumberedChoice {
  readonly at: number;
  readonly choice: ModalChoice;
}

export interface ChoicePart {
  readonly under: Answer;
  readonly heading: Localized;
  readonly choices: readonly NumberedChoice[];
}

// The sides an option's choices stand in, in the order they are first named, beside the choices
// standing under none — the ways out, and whatever else a screen offers that is not a row. Nothing
// lists the sides: a screen grows one by writing a choice that names it, and a side its choices have
// stopped naming is not a side any more.
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

// Which side a screen is showing, given the one last picked. A side the choices have stopped naming
// is gone, so the screen falls back to the first rather than standing over nothing.
export const partStanding = (parts: readonly ChoicePart[], picked: Answer | null): Answer | null =>
  parts.find((part) => part.under === picked)?.under ?? parts[0]?.under ?? null;
