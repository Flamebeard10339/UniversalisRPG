import { RuntimeError } from './error';
import { carriedFrame } from './carried';
import { samePlane } from './planeScreen';
import { type DialogueCursor, GameState, type ModalFrame } from './state';

export type ModalName = ModalFrame['name'];

// What a member of the union is, as against what its screen does. Both
// questions here are answered from a frame and nothing else — which frame a
// bare `open modal: <name>` makes, and when two frames are the same screen —
// so they are declared beneath the result line that opens one. modals.ts binds
// the same names to the screens that draw them and sits above every one of
// them, which is why the answer could not live there.
interface FrameKind<F extends ModalFrame> {
  // The frame a bare `open modal: <name>` makes, or null for a modal that
  // carries a payload no result line can spell.
  open(): F | null;
  // Two frames are the same screen when they differ only in how much of them
  // has been answered.
  same?(a: F, b: F): boolean;
}

export function dialogueFrame(cursor: DialogueCursor): ModalFrame {
  return { name: 'dialogue', answers: {}, cursor };
}

const FRAMES: { [K in ModalName]: FrameKind<Extract<ModalFrame, { name: K }>> } = {
  'character-creation': { open: () => ({ name: 'character-creation', answers: {} }) },
  'carried-items': { open: () => carriedFrame() },
  'item-plane': { open: () => null, same: samePlane },
  dialogue: {
    open: () => null,
    same: (a, b) => a.cursor.dialogue === b.cursor.dialogue && a.cursor.node === b.cursor.node && a.cursor.resumeIndex === b.cursor.resumeIndex,
  },
};

// Nothing here refuses a name the engine does not define: a save may carry one,
// and closing it is pruneModals's job rather than every reader's.
function kindOf(name: string): FrameKind<ModalFrame> | undefined {
  return FRAMES[name as ModalName] as FrameKind<ModalFrame> | undefined;
}

// The one cast that opens the modal stack for writing: everything outside this
// module holds it as readonly, which is what leaves raising, taking down and
// pruning a screen with a single implementation each.
function stack(state: GameState): ModalFrame[] {
  return state.modals as ModalFrame[];
}

// Two frames are the same screen when they differ only in how much of them has
// been answered. Reopening what is already up is a no-op, which is what makes
// the count of `open modal:` applications — batched, scaled or reached once per
// repetition from inside a wrapper — not the count of screens raised.
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

// The two writes modals.ts makes: a screen comes down when its last option is
// answered, and pruning keeps the frames a registry still holds up.
export function popModal(state: GameState): void {
  stack(state).pop();
}

export function keepModals(state: GameState, kept: readonly ModalFrame[]): void {
  stack(state).splice(0, state.modals.length, ...kept);
}
