import { BUNDLE } from '../../grammar/actionResult';
import { Condition, condition, everyCondition, printReference, referencesOf } from '../../grammar/condition';
import { DslError } from '../../grammar/parser';
import { firstCycle } from '../cycle';
import { section } from './define';

export interface Flag {
  id: string;
  bundle: boolean;
  is?: Condition;
}

export const STANDS_FOR =
  'the flag stands whenever this holds, rather than waiting for something to set it — which is how a condition worth naming is written once and asked for by name wherever it is wanted, and `set:` and `unset:` have nothing to do with it. A flag standing for a condition may name another that does, and a ring of them is refused when the world loads';

export const flag = section<Flag, 'bundle'>()({
  kind: 'flag',
  ids: 'owned',
  vocabulary: 'declared',
  map: 'flags',
  fields: {
    is: { parser: condition, standsWithout: true, note: STANDS_FOR },
  },
  keywords: [BUNDLE],
  validate: (value) =>
    value.bundle && value.is !== undefined
      ? `is a ${BUNDLE} and also stands for a condition, and a ${BUNDLE} holds what a line moved into it rather than a standing test: take one of the two out`
      : undefined,
});

export const standsFor = (flags: ReadonlyMap<string, Flag>, key: string): Condition | undefined => flags.get(key)?.is;

const named = (held: Condition): readonly string[] => everyCondition(held).flatMap((each) => referencesOf(each).map(printReference));

export function flagRing(flags: ReadonlyMap<string, Flag>): DslError | null {
  const standing = [...flags.values()].filter((each) => each.is !== undefined).map((each) => each.id);
  const ring = firstCycle(standing, (id) => named(flags.get(id)!.is!).filter((next) => flags.get(next)?.is !== undefined));
  if (ring === null) return null;
  return new DslError(`# flag ${ring[0]} stands for a condition that comes back round to itself — ${ring.join(' -> ')} — so it could never be read: a flag standing for a condition may not name one that names it`, undefined, {
    kind: 'flag',
    id: ring[0]!,
  });
}
