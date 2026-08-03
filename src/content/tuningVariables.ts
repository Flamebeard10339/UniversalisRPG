import { DslError } from '../grammar/parser';
import { Variable } from './variable';

export const TRAVEL_SECONDS_PER_UNIT = 'travel-seconds-per-unit';
export const MIN_DAMAGE = 'min-damage';
export const CONTEST_SPREAD = 'contest-spread';
export const DEFAULT_ACTION_DURATION = 'default-action-duration';

export function validateTuningVariable(variable: Variable): void {
  if (variable.id !== CONTEST_SPREAD || variable.value === undefined || variable.value > 0) return;
  throw new DslError(`# variable ${CONTEST_SPREAD} must be positive, got ${variable.value} — it divides the stat gap in every opposed roll`);
}

export function validateTuning(variables: ReadonlyMap<string, Variable>): void {
  for (const variable of variables.values()) validateTuningVariable(variable);
}
