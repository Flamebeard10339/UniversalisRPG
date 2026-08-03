import { DslError } from '../grammar/parser';
import { Variable } from './variable';

export const TRAVEL_SECONDS_PER_UNIT = 'travel-seconds-per-unit';
export const MIN_DAMAGE = 'min-damage';
export const CONTEST_SPREAD = 'contest-spread';
export const DEFAULT_ACTION_DURATION = 'default-action-duration';

// A tuning value nobody can mean is a load error, never a clamp: a silently
// corrected sign is a typo that survives to be wondered about later.
const REFUSED_BELOW: Readonly<Record<string, { least: number; why: string }>> = {
  [CONTEST_SPREAD]: { least: 1, why: 'it divides the stat gap in every opposed roll' },
  [DEFAULT_ACTION_DURATION]: { least: 0, why: 'an action cannot take less than no time' },
};

export function validateTuningVariable(variable: Variable): void {
  const refused = REFUSED_BELOW[variable.id];
  if (!refused || variable.value === undefined || variable.value >= refused.least) return;
  throw new DslError(`# variable ${variable.id} must be at least ${refused.least}, got ${variable.value} — ${refused.why}`);
}

export function validateTuning(variables: ReadonlyMap<string, Variable>): void {
  for (const variable of variables.values()) validateTuningVariable(variable);
}
