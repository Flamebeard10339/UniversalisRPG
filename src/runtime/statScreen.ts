import type { EngineKey } from '../content/locale';
import type { Registry } from '../content/registry';
import { listedToPlayer } from '../content/sections';
import { amounts, signed } from './figures';
import type { ModalOption } from './modalOption';
import { type Answer, type Localized, localizerOf } from './localized';
import type { StatShare } from './statShare';
import type { GameState, ModalFrame } from './state';

export const LEAVE: Answer = 'close';
const LEAVE_SHOWN: EngineKey = 'engine.stat.close';

export type StatFrame = Extract<ModalFrame, { name: 'stat-breakdown' }>;

export const statFrame = (stat = ''): StatFrame => ({ name: 'stat-breakdown', answers: {}, stat });

export const statFocus = (frame: { stat: string }): { kind: 'stat'; stat: Answer } | undefined => (frame.stat === '' ? undefined : { kind: 'stat', stat: frame.stat as Answer });

export function statOptions(frame: { stat: string }, state: GameState, registry: Registry): readonly ModalOption[] {
  const localizer = localizerOf(registry, state);
  if (frame.stat !== '') return [{ key: LEAVE, label: localizer.engine('engine.stat.reading'), values: [{ value: LEAVE, shown: localizer.engine(LEAVE_SHOWN) }] }];
  const stats = listedToPlayer(registry.stats.values()).map((stat) => ({ value: stat.id as Answer, shown: localizer.title('stat', stat.id) }));
  return [{ key: 'stat', label: localizer.engine('engine.stat.which'), values: [...stats, { value: LEAVE, shown: localizer.engine(LEAVE_SHOWN) }] }];
}

export function statSubmit(frame: { stat: string; answers: Record<string, unknown> }): ModalFrame | null {
  if (frame.stat !== '') return null;
  const asked = String(frame.answers.stat ?? '');
  return asked === LEAVE || asked === '' ? null : statFrame(asked);
}

export const sameStat = (a: { stat: string }, b: { stat: string }): boolean => a.stat === b.stat;

export const holdsStat = (value: Record<string, unknown>): boolean => typeof value.stat === 'string';

export function madeOf(shares: readonly StatShare[]): Array<{ title: Localized; worth: string }> {
  return shares.map((share) => {
    const said = amounts(share.added, share.increased);
    return { title: share.title, worth: (said.length > 0 ? said : [signed(0)]).join(' ') };
  });
}

export const statStale = (frame: { stat: string }, state: GameState, registry: Registry): Localized | null =>
  frame.stat === '' || registry.stats.has(frame.stat) ? null : localizerOf(registry, state).engine('engine.modal.stale.unknown');
