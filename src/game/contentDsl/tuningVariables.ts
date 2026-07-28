import { DslError } from './parser';
import { Variable } from './variable';

export const TRAVEL_SECONDS_PER_UNIT = 'travel-seconds-per-unit';
export const MIN_DAMAGE = 'min-damage';
export const CONTEST_SPREAD = 'contest-spread';

export function validateTuning(variables: ReadonlyMap<string, Variable>): void {
  const spread = variables.get(CONTEST_SPREAD)?.value;
  if (spread !== undefined && spread <= 0) {
    throw new DslError(`# variable ${CONTEST_SPREAD} must be positive, got ${spread} — it divides the stat gap in every opposed roll`);
  }
}
