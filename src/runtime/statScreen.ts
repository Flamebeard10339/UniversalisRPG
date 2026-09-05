import { listedToPlayer } from '../content/sections';
import { amounts, signed } from './figures';
import { listedScreen } from './listedScreen';
import { type Localized, localizerOf } from './localized';
import type { StatShare } from './statShare';
import type { ModalFrame } from './state';

export type StatFrame = Extract<ModalFrame, { name: 'stat-breakdown' }>;

export const statScreen = listedScreen({
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

export function madeOf(shares: readonly StatShare[]): Array<{ title: Localized; worth: string }> {
  return shares.map((share) => {
    const said = amounts(share.added, share.increased);
    return { title: share.title, worth: (said.length > 0 ? said : [signed(0)]).join(' ') };
  });
}
