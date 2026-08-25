import { RuntimeError } from './error';
import { carriedFrame } from './carried';
import { samePlane } from './planeScreen';
import { questFrame, sameQuest } from './questScreen';
import { sameStat, statFrame } from './statScreen';
import { sameCount, sameShop, shopFrame } from './shopScreen';
import type { ModalScreen } from '../grammar/actionResult';
import { type DialogueCursor, GameState, type ModalFrame } from './state';

export type ModalName = ModalFrame['name'];

type Frame<K extends ModalName> = Extract<ModalFrame, { name: K }>;

type Same<K extends ModalName> = (a: Frame<K>, b: Frame<K>) => boolean;

export function dialogueFrame(cursor: DialogueCursor): ModalFrame {
  return { name: 'dialogue', answers: {}, cursor };
}

const OPENERS: { [K in ModalScreen]: () => Frame<K> } = {
  'name-yourself': () => ({ name: 'name-yourself', answers: {} }),
  'choose-race': () => ({ name: 'choose-race', answers: {} }),
  'carried-items': () => carriedFrame(),
  'quest-journal': () => questFrame(),
  'stat-breakdown': () => statFrame(),
};

const SAME: { [K in ModalName]: Same<K> | null } = {
  'name-yourself': null,
  'choose-race': null,
  'carried-items': null,
  'item-plane': samePlane,
  'quest-journal': sameQuest,
  'stat-breakdown': sameStat,
  shop: sameShop,
  'shop-count': sameCount,
  dialogue: (a, b) => a.cursor.dialogue === b.cursor.dialogue && a.cursor.node === b.cursor.node && a.cursor.resumeIndex === b.cursor.resumeIndex,
};

const NAMES: readonly string[] = Object.keys(SAME);

const SCREENS: readonly string[] = Object.keys(OPENERS);

function stack(state: GameState): ModalFrame[] {
  return state.modals as ModalFrame[];
}

function sameScreen(a: ModalFrame, b: ModalFrame): boolean {
  if (a.name !== b.name) return false;
  return (SAME[a.name] as ((x: ModalFrame, y: ModalFrame) => boolean) | null)?.(a, b) ?? true;
}

export function openModal(state: GameState, frame: ModalFrame): void {
  if (state.modals.some((open) => sameScreen(open, frame))) return;
  stack(state).push(frame);
}

export function openModalNamed(state: GameState, name: string): void {
  if (!NAMES.includes(name)) throw new RuntimeError(`unknown modal: ${name}`);
  if (!SCREENS.includes(name)) throw new RuntimeError(`modal ${name} is not opened by name`);
  openModal(state, (OPENERS as Record<string, () => ModalFrame>)[name]!());
}

export const openShop = (state: GameState, shop: string): void => openModal(state, shopFrame(shop));

export function topModal(state: GameState): ModalFrame | null {
  return state.modals.length > 0 ? state.modals[state.modals.length - 1] : null;
}

export function popModal(state: GameState): void {
  stack(state).pop();
}

export function keepModals(state: GameState, kept: readonly ModalFrame[]): void {
  stack(state).splice(0, state.modals.length, ...kept);
}
