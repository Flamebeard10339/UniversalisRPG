import type { PlayView } from '../runtime/session';

// How a screen stands on the app: where it sits, what it does to what is behind it, and how far it
// reaches. Strategies, not measurements — a screen picks a word and this file alone decides what
// the word costs in pixels, so no component says an inset, a colour or a z-index of its own.
//
// It lives here and not on the published view because the engine tells every surface *what* a
// screen is and never how to draw one: a terminal has no scrim and no bottom of the screen to sit
// at, and `modals.test.ts` holds the view to saying nothing about how to draw a modal.
export interface Manner {
  readonly place: 'bottom' | 'centre' | 'fill';
  readonly behind: 'dim' | 'clear';
  readonly over: 'app' | 'pane';
}

// As much or as little of it as a screen cares to say.
export type Declared = Partial<Manner>;

export type Place = Manner['place'];
export type Behind = Manner['behind'];
export type Over = Manner['over'];

// What a screen gets by saying nothing: within thumb's reach, over the whole app, with everything
// behind it pushed back. What five of the six screens shipped today want.
export const DEFAULT_MANNER: Manner = { place: 'bottom', behind: 'dim', over: 'app' };

const PLACED: Record<Place, string> = {
  bottom: 'justify-end',
  centre: 'justify-center',
  fill: '',
};

const BEHIND: Record<Behind, string> = {
  dim: 'bg-scrim',
  clear: '',
};

const REACH: Record<Over, string> = {
  // Over the whole app, the bar along the bottom included, whatever page is under it.
  app: 'fixed',
  // Within the page that opened it, so the bar stays where the thumb left it.
  pane: 'absolute',
};

// Every manner there is, derived from the tables that have to resolve one rather than listed beside
// the type. A word added to `Manner` and left unresolved does not compile, and a word resolved here
// and forgotten in the type cannot exist.
export const EVERY_MANNER: readonly Manner[] = (Object.keys(PLACED) as Place[]).flatMap((place) =>
  (Object.keys(BEHIND) as Behind[]).flatMap((behind) => (Object.keys(REACH) as Over[]).map((over) => ({ place, behind, over }))),
);

// What the screen standing open is about, where the view says. The engine publishes this for the
// terminal and the app alike, and it is the one thing said about a screen that is not its name —
// which is what lets the app tell the screens apart without naming one.
type About = NonNullable<PlayView['focus']>['kind'];

// A lattice is panned and pinched, so the screen holding one takes the whole surface; a sheet at
// the bottom of the screen cannot be dragged around. Every other focus is read beside an ordinary
// question and wants nothing unusual, and a focus grown next month has to answer here.
const AROUND: Record<About, Declared> = {
  plane: { place: 'fill' },
  quest: {},
  stat: {},
};

export const declaredFor = (focus: PlayView['focus']): Declared => (focus === null ? {} : AROUND[focus.kind]);

const ROOM = 'gap-3 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-8';

const TOP = 'pt-[env(safe-area-inset-top)]';

// A screen with nothing left to answer has nothing to reach for, so a sheet that would have sat
// under the thumb is centred on what it is showing instead. Every other word the screen declared
// stands: a screen filling the surface has nowhere else to be.
export function mannerOf(declared: Declared, asksNothing: boolean): Manner {
  const held = { ...DEFAULT_MANNER, ...declared };
  return asksNothing && held.place === 'bottom' ? { ...held, place: 'centre' } : held;
}

export function layerOf(manner: Manner): string {
  const room = manner.place === 'fill' ? (manner.over === 'app' ? TOP : '') : ROOM;
  return [REACH[manner.over], 'inset-0 z-50 flex flex-col', PLACED[manner.place], room, BEHIND[manner.behind]].filter((part) => part !== '').join(' ');
}

// A screen that fills its surface leaves nothing beside it to click, so the way out it published is
// the only way out it has. Nowhere else is this asked and no screen answers it for itself: what a
// screen gets to say is whether there is a way out at all, which is a fact about what it offers.
export const clickingOffLeaves = (manner: Manner, hasWayOut: boolean): boolean => hasWayOut && manner.place !== 'fill';

// The beat a screen is answering is drawn by the screen that took it away. Nothing is behind a
// clear screen to be missed, and a screen filling the surface has replaced the beat rather than
// covered it.
export const showsTheBeat = (manner: Manner): boolean => manner.behind === 'dim' && manner.place !== 'fill';
