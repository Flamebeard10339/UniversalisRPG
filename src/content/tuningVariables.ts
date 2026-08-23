import { DslError } from '../grammar/parser';
import { Variable } from './sections/variable';

export const TRAVEL_SECONDS_PER_UNIT = 'travel-seconds-per-unit';
export const MIN_DAMAGE = 'min-damage';
export const CONTEST_SPREAD = 'contest-spread';
export const DEFAULT_ACTION_DURATION = 'default-action-duration';
export const INVENTORY_SLOTS = 'inventory-slots';

const REFUSED_BELOW: Readonly<Record<string, { least: number; why: string }>> = {
  [CONTEST_SPREAD]: {
    least: 1,
    why: 'it divides the stat gap in every opposed roll',
  },
  [DEFAULT_ACTION_DURATION]: {
    least: 0,
    why: 'an action cannot take less than no time',
  },
  [INVENTORY_SLOTS]: {
    least: 0,
    why: 'a pack cannot hold fewer things than none, and zero is how a world says it holds any number',
  },
};

export function validateTuningVariable(variable: Variable): void {
  const refused = REFUSED_BELOW[variable.id];
  if (!refused || variable.value === undefined || variable.value >= refused.least) return;
  throw new DslError(`# variable ${variable.id} must be at least ${refused.least}, got ${variable.value} — ${refused.why}`);
}

export function validateTuning(variables: ReadonlyMap<string, Variable>): void {
  for (const variable of variables.values()) validateTuningVariable(variable);
}
