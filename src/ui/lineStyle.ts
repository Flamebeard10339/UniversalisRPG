import type { CSSProperties } from 'react';
import type { MessageTone } from '../runtime/command';
import type { LogKind } from './transcript';

// Colour reaches a player on two channels — the fill behind a thing and the ink it is lettered in —
// and a surface says one fact on each. Which fact goes on which channel is the surface's own, and
// what is never done is saying two facts on one channel, or one fact on both.
//
// In the transcript the ink is the voice: whose words these are. Nothing there is filled, and a tone
// decorates the voice from the margin rather than taking its colour, which is what `lineStyle.test.ts`
// holds `VOICE_CLASS`, `TONE_CLASS` and `SHAPE_CLASS` to.
//
// A `# group`'s authored colour goes through `fillOf` where the fact is what kind of thing something
// is — a grid of cells read at a glance — and through `inkOf` where the fact is a standing, on a
// title that a filled background would turn into a control. The two never carry the same group.

export const VOICE_CLASS: Record<LogKind, string> = {
  said: 'text-text',
  describe: 'italic text-text-muted',
  message: 'text-accent',
  detail: 'text-text-subtle',
  // A place change is a break, not a colour: what sets it apart is the space and the rule above it.
  place: '',
};

// How much room a line takes and what sets it apart from the one above, which says nothing about
// whose words they are. The history reads small and tight so more of it is on screen at once; a
// detail is smaller still, and a place change is the one break in it — a hairline and the space
// around it, where a heading used to be.
export const SHAPE_CLASS: Record<LogKind, string> = {
  said: '',
  place: 'mt-6 border-t border-border pt-3',
  describe: '',
  message: '',
  detail: 'pl-3 text-xs',
};

// A tone decorates the voice it is spoken in rather than standing in for it: a rule down the margin,
// so `warn` and `error` are told apart without the engine's own colour being taken away from it.
export const TONE_CLASS: Record<MessageTone, string> = {
  plain: '',
  ok: 'border-l-2 border-success pl-2',
  warn: 'border-l-2 border-warning pl-2',
  error: 'border-l-2 border-danger pl-2',
};

// A group's colour is chosen to be seen, and a cell filled with it at full strength is a cell
// nothing drawn on it can be read against. The wash is the fill and the colour itself is the edge,
// so a cell says its group twice over and reads either way round.
const WASH = '2e';

export const fillOf = (group: { colour: string } | undefined): CSSProperties =>
  group === undefined ? {} : { backgroundColor: `${group.colour}${WASH}`, borderColor: group.colour };

// The same authored colour on the other channel: the lettering itself, at full strength, because
// what carries it is a title and a title is read rather than glanced at.
export const inkOf = (group: { colour: string } | undefined): CSSProperties => (group === undefined ? {} : { color: group.colour });
