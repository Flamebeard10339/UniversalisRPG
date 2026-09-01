import type { PlayView } from '../runtime/session';

export interface Manner {
  readonly place: 'bottom' | 'centre' | 'fill';
  readonly behind: 'dim' | 'clear';
  readonly over: 'app' | 'pane';
}

export type Declared = Partial<Manner>;

export type Place = Manner['place'];
export type Behind = Manner['behind'];
export type Over = Manner['over'];

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
  app: 'fixed',
  pane: 'absolute',
};

export const EVERY_MANNER: readonly Manner[] = (Object.keys(PLACED) as Place[]).flatMap((place) =>
  (Object.keys(BEHIND) as Behind[]).flatMap((behind) => (Object.keys(REACH) as Over[]).map((over) => ({ place, behind, over }))),
);

type About = NonNullable<PlayView['focus']>['kind'];

const AROUND: Record<About, Declared> = {
  plane: { place: 'fill' },
  quest: {},
  stat: {},
};

export const declaredFor = (focus: PlayView['focus']): Declared => (focus === null ? {} : AROUND[focus.kind]);

const ROOM = 'gap-3 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-8';

const TOP = 'pt-[env(safe-area-inset-top)]';

export function mannerOf(declared: Declared, asksNothing: boolean): Manner {
  const held = { ...DEFAULT_MANNER, ...declared };
  return asksNothing && held.place === 'bottom' ? { ...held, place: 'centre' } : held;
}

export function layerOf(manner: Manner): string {
  const room = manner.place === 'fill' ? (manner.over === 'app' ? TOP : '') : ROOM;
  return [REACH[manner.over], 'inset-0 z-50 flex flex-col', PLACED[manner.place], room, BEHIND[manner.behind]].filter((part) => part !== '').join(' ');
}

export const clickingOffLeaves = (manner: Manner, hasWayOut: boolean): boolean => hasWayOut && manner.place !== 'fill';

export const showsTheBeat = (manner: Manner): boolean => manner.behind === 'dim' && manner.place !== 'fill';
