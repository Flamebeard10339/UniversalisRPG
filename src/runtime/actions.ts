import { ActionResult, nestedResults } from '../grammar/actionResult';
import { evaluateCondition } from './conditions';
import { Action } from '../content/entity';
import { Location } from '../content/location';
import { Registry } from '../content/registry';
import type { ActiveAction } from './encounter';
import { GameState, RuntimeError } from './state';
import { travelSecondsPerUnit } from './tuning';

export function findActionOwner(obj: string, objId: string, registry: Registry): unknown {
  switch (obj) {
    case 'entity':
      return registry.entities.get(objId);
    case 'item':
      return registry.items.get(objId);
    case 'location':
      return registry.locations.get(objId);
    case 'recipe': {
      const action = registry.recipeActions.get(objId);
      return action ? { actions: [action] } : undefined;
    }
    case 'travel': {
      const [origin, dest] = objId.split(TRAVEL_PAIR);
      return { actions: [travelAction(origin, dest, registry)] };
    }
    default:
      return undefined;
  }
}

function locationDistance(a: Location, b: Location): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

// A travel ownerRef packs both ends of the journey into one objId, and a module
// namespaces its ids with dots, so the pair is joined by a character an id
// cannot contain.
const TRAVEL_PAIR = '>';

export const travelPair = (origin: string, dest: string): string => `${origin}${TRAVEL_PAIR}${dest}`;

// Shaped as a one-attempt fight so a journey spans like any other action. The
// origin comes from the ownerRef: state.location holds it until relocate fires.
export function travelAction(originId: string, destId: string, registry: Registry): Action {
  const origin = registry.locations.get(originId);
  const dest = registry.locations.get(destId);
  if (!origin) throw new RuntimeError(`unknown travel origin: ${originId}`);
  if (!dest) throw new RuntimeError(`unknown travel destination: ${destId}`);
  return {
    label: `Travel to ${dest.title}`,
    results: [{ kind: 'relocate', location: destId }],
    time: locationDistance(origin, dest) * travelSecondsPerUnit(registry),
  };
}

export function parseOwnerRef(ownerRef: string): { obj: string; objId: string } {
  const dot = ownerRef.indexOf('.');
  return { obj: ownerRef.slice(0, dot), objId: ownerRef.slice(dot + 1) };
}

export function findActiveAction(active: ActiveAction, registry: Registry): Action {
  const { obj, objId } = parseOwnerRef(active.ownerRef);
  const owner = findActionOwner(obj, objId, registry) as { actions?: Action[] } | undefined;
  if (!owner) throw new RuntimeError(`unknown ${obj}: ${objId}`);
  const action = owner.actions?.find((a) => a.label === active.actionLabel);
  if (!action) throw new RuntimeError(`unknown action ${JSON.stringify(active.actionLabel)} on ${active.ownerRef}`);
  return action;
}

export type FightOutcome = 'completion' | 'escape';

// Reads authored fields only, so it cannot flip partway and strand a planned batch.
export function resolvesPerAttempt(action: Action): boolean {
  return action.accuracy !== undefined || action.target !== undefined;
}

// Visibility is excluded: a fight must not abort because a kill count hid it.
export function actionStillValid(action: Action, active: ActiveAction, state: GameState): boolean {
  if (!requiresMet(action, state)) return false;
  // A single completion's worth was already checked when the action armed.
  return !active.repeating || inputLimit(action, state).completions > 0;
}

export function requiresMet(action: Action, state: GameState): boolean {
  return !action.requires || evaluateCondition(action.requires, state);
}

export function actionVisible(action: Action, state: GameState): boolean {
  return !action.hiddenIf || !evaluateCondition(action.hiddenIf, state);
}

export function perCompletionCost(action: Action): Map<string, number> {
  const cost = new Map<string, number>();
  for (const result of action.results) {
    if (result.kind === 'take') cost.set(result.item, (cost.get(result.item) ?? 0) + (result.amount ?? 1));
  }
  return cost;
}

export interface InputLimit {
  completions: number;
  short?: string;
}

export function inputLimit(action: Action, state: GameState): InputLimit {
  let completions = Infinity;
  let short: string | undefined;
  for (const [item, need] of perCompletionCost(action)) {
    if (need <= 0) continue;
    const affords = Math.floor((state.inventory[item] ?? 0) / need);
    if (affords < 1 && short === undefined) short = item;
    completions = Math.min(completions, affords);
  }
  return { completions, short };
}

export function outcomeResults(action: Action, outcome: FightOutcome): ActionResult[] {
  return outcome === 'completion' ? [...action.results, ...(action.onSuccess ?? [])] : (action.onEscape ?? []);
}

// Nested, and asked as "might stop" rather than "does": a `stop` behind a chance
// still has to cap the batch at one completion, or a span that would have ended
// mid-way runs to its end before anyone notices.
function mightStop(results: readonly ActionResult[]): boolean {
  return results.some((result) => result.kind === 'stop' || nestedResults(result).some(mightStop));
}

export function stopsOnOutcome(action: Action, outcome: FightOutcome): boolean {
  return mightStop(outcomeResults(action, outcome));
}

// A `stop` caps the batch at one completion, or a batched span stops nothing.
export function fightBatch(action: Action, count: number, outcome: FightOutcome): { results: ActionResult[]; count: number } {
  const results = outcomeResults(action, outcome);
  return { results, count: stopsOnOutcome(action, outcome) ? Math.min(count, 1) : count };
}
