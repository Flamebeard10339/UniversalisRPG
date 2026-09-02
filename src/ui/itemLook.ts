import type { CSSProperties } from 'react';
import type { PlayStatus } from '../runtime/session';

type CarriedRow = PlayStatus['carried'][number];

export type ItemLook = 'gear' | 'wearable' | 'jewel' | 'stuff';

const GROW = 'grow';
const EQUIP = 'equip';
const UNEQUIP = 'unequip';

export function lookOf(row: Pick<CarriedRow, 'verbs' | 'sockets'>): ItemLook {
  if (row.sockets) return 'jewel';
  if (row.verbs.includes(GROW)) return 'gear';
  if (row.verbs.includes(EQUIP) || row.verbs.includes(UNEQUIP)) return 'wearable';
  return 'stuff';
}

const WASH: Record<ItemLook, string> = {
  gear: '#38bdf8',
  wearable: '#34d399',
  jewel: '#a78bfa',
  stuff: '#94a3b8',
};

const SHEER = '40';

const EDGE = '40';

export function itemStyle(look: ItemLook, grown: boolean): CSSProperties {
  const colour = WASH[look];
  return { backgroundColor: `${colour}${SHEER}`, borderColor: grown ? colour : `${colour}${EDGE}` };
}
