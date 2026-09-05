import { DslError } from '../grammar/parser';
import { Variable } from './sections/variable';

const REFUSED_BELOW = {
  'contest-spread': {
    least: 1,
    why: 'it divides the stat gap in every opposed roll',
  },
  'default-action-duration': {
    least: 0,
    why: 'an action cannot take less than no time',
  },
  'travel-seconds': {
    least: 0,
    why: 'walking a road cannot take less than no time',
  },
  'inventory-slots': {
    least: 0,
    why: 'a pack cannot hold fewer things than none, and zero is how a world says it holds any number',
  },
  'map-grid': {
    least: 1,
    why: 'a grid of nothing draws every place on top of every other',
  },
  'engagement-seconds': {
    least: 0,
    why: 'a thing cannot find you before you got there, and zero is how a world says it pounces',
  },
  'min-damage': {
    least: 1,
    why: 'a blow that lands takes something off, and a fight where neither side can is one nobody walks out of',
  },
} as const satisfies Readonly<Record<string, { least: number; why: string }>>;

export type TuningId = keyof typeof REFUSED_BELOW;

export const TRAVEL_SECONDS: TuningId = 'travel-seconds';
export const MIN_DAMAGE: TuningId = 'min-damage';
export const CONTEST_SPREAD: TuningId = 'contest-spread';
export const DEFAULT_ACTION_DURATION: TuningId = 'default-action-duration';
export const INVENTORY_SLOTS: TuningId = 'inventory-slots';
export const ENGAGEMENT_SECONDS: TuningId = 'engagement-seconds';
export const MAP_GRID: TuningId = 'map-grid';

export function validateTuningVariable(variable: Variable): void {
  const refused = (REFUSED_BELOW as Readonly<Record<string, { least: number; why: string }>>)[variable.id];
  if (!refused || variable.value === undefined || variable.value >= refused.least) return;
  throw new DslError(`# variable ${variable.id} must be at least ${refused.least}, got ${variable.value} — ${refused.why}`);
}

export function validateTuning(variables: ReadonlyMap<string, Variable>): void {
  for (const variable of variables.values()) validateTuningVariable(variable);
}
