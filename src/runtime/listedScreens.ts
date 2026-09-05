import { questScreen } from './questScreen';
import { skillScreen } from './skillScreen';
import { statScreen } from './statScreen';

export const LISTED_SCREENS = [questScreen, statScreen, skillScreen] as const;

export type ListedScreen = (typeof LISTED_SCREENS)[number];

export type PerListed<M extends keyof ListedScreen> = { [S in ListedScreen as S['name']]: S[M] };

export function fromListedScreens<T>(take: (screen: ListedScreen) => unknown): T {
  return Object.fromEntries(LISTED_SCREENS.map((screen) => [screen.name, take(screen)])) as T;
}
