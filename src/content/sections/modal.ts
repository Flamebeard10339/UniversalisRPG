import { Cursor, DslError, Parser } from '../../grammar/parser';
import { section } from './define';

export const MODAL_SCREENS = ['name-yourself', 'choose-race', 'carried-items', 'quest-journal'] as const;

export type ModalScreen = (typeof MODAL_SCREENS)[number];

export interface Modal {
  id: string;
  screen: ModalScreen;
}

const screenValue: Parser<ModalScreen> = {
  parse(cursor: Cursor) {
    const start = cursor.pos;
    const raw = cursor.take(/[a-z][a-z0-9-]*/);
    if (raw === null || !(MODAL_SCREENS as readonly string[]).includes(raw)) {
      throw new DslError(`a modal screen must be one of ${MODAL_SCREENS.join(', ')}, got ${JSON.stringify(raw ?? cursor.rest())}`, { start: cursor.abs(start), end: cursor.abs(cursor.pos) });
    }
    return raw as ModalScreen;
  },
  print: (value) => value,
  forms: [...MODAL_SCREENS],
  examples: [...MODAL_SCREENS],
};

export const modal = section<Modal>()({
  kind: 'modal',
  ids: 'global',
  map: 'modals',
  fields: {
    screen: { parser: screenValue },
  },
  validate: (value) => (value.screen ? undefined : 'requires a screen:'),
});
