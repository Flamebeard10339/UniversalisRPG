import { RuntimeError } from './error';
import { ActionResult, itemCost } from '../grammar/actionResult';
import { evaluateCondition } from './conditions';
import { Action } from '../content/sections/entity';
import { actionAddress } from '../content/sections/action';
import { Registry } from '../content/registry';
import { findActionOwner } from './actionLookup';
import { copiesOf, spendable } from './itemInstance';
import { BASE_LANGUAGE, localizerFor } from './localized';
import { type ActiveAction, GameState, parseOwnerRef } from './state';

export function findActiveAction(active: ActiveAction, registry: Registry): Action {
  const say = localizerFor(registry, BASE_LANGUAGE);
  const { obj, objId } = parseOwnerRef(active.ownerRef);
  const owner = findActionOwner(obj, objId, registry) as { actions?: Action[] } | undefined;
  if (!owner) throw new RuntimeError(say.engine('engine.action.stale.owner', { kind: say.identifier(obj), id: say.identifier(objId) }));
  const action = owner.actions?.find((each) => actionAddress(each) === active.actionSlug);
  if (!action) throw new RuntimeError(say.engine('engine.action.stale.action', { action: say.identifier(active.actionSlug), owner: say.identifier(active.ownerRef) }));
  return action;
}

export type FightOutcome = 'completion' | 'unfinished';

export function resolvesPerAttempt(action: Action): boolean {
  return action.accuracy !== undefined || action.depletes !== undefined;
}

export function actionStillValid(action: Action, active: ActiveAction, state: GameState, registry: Registry): boolean {
  if (!requiresMet(action, state, registry)) return false;
  return !active.repeating || inputLimit(action, state).completions > 0;
}

export function requiresMet(action: Action, state: GameState, registry: Registry): boolean {
  return !action.requires || evaluateCondition(action.requires, state, registry);
}

export function actionVisible(action: Action, state: GameState, registry: Registry): boolean {
  return !action.hiddenIf || !evaluateCondition(action.hiddenIf, state, registry);
}

export interface InputLimit {
  completions: number;
  short?: string;
  unspendable?: { item: string; kind: 'grown' | 'worn' };
}

export function inputLimit(action: Action, state: GameState): InputLimit {
  return costLimit(itemCost(action.results), state);
}

// How many times over the player can pay what a list of results asks of them, and — when the answer
// is none — why. Everything that has to know before it acts reads this: an action arming, a
// dialogue node being offered, a line in a menu.
export function costLimit(cost: ReadonlyMap<string, number>, state: GameState): InputLimit {
  let completions = Infinity;
  let short: string | undefined;
  let unspendable: InputLimit['unspendable'];
  for (const [item, need] of cost) {
    if (need <= 0) continue;
    const copies = copiesOf(state, item);
    if (copies.stack + copies.grown + copies.worn < need) short ??= item;
    else if (spendable(copies) < need) unspendable ??= { item, kind: copies.grown > 0 ? 'grown' : 'worn' };
    completions = Math.min(completions, Math.floor(spendable(copies) / need));
  }
  return { completions, short, unspendable };
}

export function outcomeResults(action: Action, outcome: FightOutcome): ActionResult[] {
  return outcome === 'completion' ? [...action.results, ...(action.onSuccess ?? [])] : (action.onUnfinished ?? []);
}

export function stopsOnOutcome(action: Action, outcome: FightOutcome): boolean {
  return outcomeResults(action, outcome).some((result) => result.kind === 'stop');
}

export function fightBatch(action: Action, count: number, outcome: FightOutcome): { results: ActionResult[]; count: number } {
  const results = outcomeResults(action, outcome);
  return { results, count: stopsOnOutcome(action, outcome) ? Math.min(count, 1) : count };
}
