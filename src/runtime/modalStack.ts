import { RuntimeError } from './error';
import { carriedFrame } from './carried';
import { samePlane } from './planeScreen';
import { questFrame, sameQuest } from './questScreen';
import { type DialogueCursor, GameState, type ModalFrame } from './state';

export type ModalName = ModalFrame['name'];

interface FrameKind<F extends ModalFrame> {
  open(): F | null;
  same?(a: F, b: F): boolean;
}

export function dialogueFrame(cursor: DialogueCursor): ModalFrame {
  return { name: 'dialogue', answers: {}, cursor };
}

const FRAMES: { [K in ModalName]: FrameKind<Extract<ModalFrame, { name: K }>> } = {
  'character-creation': { open: () => ({ name: 'character-creation', answers: {} }) },
  'carried-items': { open: () => carriedFrame() },
  'item-plane': { open: () => null, same: samePlane },
  'quest-journal': { open: () => questFrame() as Extract<ModalFrame, { name: 'quest-journal' }>, same: sameQuest },
  dialogue: {
    open: () => null,
    same: (a, b) => a.cursor.dialogue === b.cursor.dialogue && a.cursor.node === b.cursor.node && a.cursor.resumeIndex === b.cursor.resumeIndex,
  },
};

function kindOf(name: string): FrameKind<ModalFrame> | undefined {
  return FRAMES[name as ModalName] as FrameKind<ModalFrame> | undefined;
}

function stack(state: GameState): ModalFrame[] {
  return state.modals as ModalFrame[];
}

function sameScreen(a: ModalFrame, b: ModalFrame): boolean {
  if (a.name !== b.name) return false;
  return kindOf(a.name)?.same?.(a, b) ?? true;
}

export function openModal(state: GameState, frame: ModalFrame): void {
  if (state.modals.some((open) => sameScreen(open, frame))) return;
  stack(state).push(frame);
}

export function openModalNamed(state: GameState, name: string): void {
  const kind = kindOf(name);
  if (!kind) throw new RuntimeError(`unknown modal: ${name}`);
  const frame = kind.open();
  if (!frame) throw new RuntimeError(`modal ${name} is not opened by name`);
  openModal(state, frame);
}

export function topModal(state: GameState): ModalFrame | null {
  return state.modals.length > 0 ? state.modals[state.modals.length - 1] : null;
}

export function popModal(state: GameState): void {
  stack(state).pop();
}

export function keepModals(state: GameState, kept: readonly ModalFrame[]): void {
  stack(state).splice(0, state.modals.length, ...kept);
}
