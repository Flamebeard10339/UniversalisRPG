import type { PlayView } from '../runtime/session';

// scripts/viewSurfaces.test.ts asks the same question of this app that scripts/playbot.test.ts
// asks of the model: every field a live view carries must either reach some page of the app or
// be named below with why not. This file holds only the manifest — the app itself has no single
// renderer to attach it to, unlike scripts/playbot.ts's renderView or scripts/play-cli.ts's
// formatView.
export const GUI_NOT_SHOWN: ReadonlyArray<{ field: keyof PlayView; why: string }> = [
  { field: 'flags', why: 'the engine bookkeeping behind what the world says. A player learns a quest has moved by being told so, and drawing the flags would let it act on content it has not met' },
  { field: 'time', why: "LocationBanner draws it through formatClock, a wall-clock reading rather than the raw seconds this field carries, so a check for the number itself finds no trace of a field that is in fact drawn" },
];
