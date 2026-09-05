import { listedToPlayer } from '../content/sections';
import { amounts, signed } from './figures';
import { LEAVE, listedScreen } from './listedScreen';
import { type Localized, localizerOf } from './localized';
import type { StatShare } from './statShare';
import type { ModalFrame } from './state';

export { LEAVE };

export type StatFrame = Extract<ModalFrame, { name: 'stat-breakdown' }>;

const screen = listedScreen({
  name: 'stat-breakdown',
  field: 'stat',
  which: 'engine.stat.which',
  reading: 'engine.stat.reading',
  close: 'engine.stat.close',
  choices: (registry, state) => {
    const localizer = localizerOf(registry, state);
    return listedToPlayer(registry.stats.values()).map((stat) => ({ value: stat.id, shown: localizer.title('stat', stat.id) }));
  },
  known: (registry, chosen) => registry.stats.has(chosen),
});

export const statFrame = screen.frame;
export const statFocus = screen.focus;
export const statOptions = screen.options;
export const statSubmit = screen.submit;
export const sameStat = screen.same;
export const holdsStat = screen.holds;
export const statStale = screen.stale;

export function madeOf(shares: readonly StatShare[]): Array<{ title: Localized; worth: string }> {
  return shares.map((share) => {
    const said = amounts(share.added, share.increased);
    return { title: share.title, worth: (said.length > 0 ? said : [signed(0)]).join(' ') };
  });
}
