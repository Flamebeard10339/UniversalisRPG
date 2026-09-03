import { RuntimeError } from './error';
import { ActionResult, itemCost } from '../grammar/actionResult';
import { actionResultLists } from '../grammar/action';
import { evaluateCondition } from './conditions';
import { Action } from '../content/sections/entity';
import { actionAddress } from '../content/sections/action';
import { Registry } from '../content/registry';
import { actionOwnerAsStood } from './actionLookup';
import { copiesOf, spendable } from './itemInstance';
import { guiseDrops } from '../content/sections/guise';
import { isElsewhere } from './population';
import { guiseWorn } from './wearing';
import { BASE_LANGUAGE, localizerFor } from './localized';
import { type ActiveAction, GameState, parseOwnerRef } from './state';

export function findActiveAction(state: GameState, registry: Registry): Action {
  const active = state.activeAction!;
  const say = localizerFor(registry, BASE_LANGUAGE);
  const { obj, objId } = parseOwnerRef(active.ownerRef);
  const owner = actionOwnerAsStood(obj, objId, registry, state);
  if (!owner) throw new RuntimeError(say.engine('engine.action.stale.owner', { kind: say.identifier(obj), id: say.identifier(objId) }));
  const action = owner.actions?.find((each) => actionAddress(each) === active.actionSlug);
  if (!action) throw new RuntimeError(say.engine('engine.action.stale.action', { action: say.identifier(active.actionSlug), owner: say.identifier(active.ownerRef) }));
  return action;
}

export type FightOutcome = 'completion' | 'unfinished';

export function leavesHere(action: Action): boolean {
  return actionResultLists(action).some((list) => list.some((result) => result.kind === 'relocate'));
}

export function resolvesPerAttempt(action: Action): boolean {
  return action.accuracy !== undefined || action.depletes !== undefined;
}

export function ownerIsElsewhere(obj: string, id: string, state: GameState, registry: Registry): boolean {
  if (obj === 'location') return registry.locations.has(id) && id !== state.location;
  if (obj !== 'entity') return false;
  const here = registry.locations.get(state.location);
  return here !== undefined && isElsewhere(state, registry, here, id);
}

function ownerNoLongerOffers(obj: string, id: string, action: Action, state: GameState, registry: Registry): boolean {
  return obj === 'entity' && guiseDrops(guiseWorn(state, registry, state.location, id), action);
}

export function actionStillValid(action: Action, active: ActiveAction, state: GameState, registry: Registry): boolean {
  const { obj, objId } = parseOwnerRef(active.ownerRef);
  if (ownerIsElsewhere(obj, objId, state, registry)) return false;
  if (ownerNoLongerOffers(obj, objId, action, state, registry)) return false;
  if (!requiresMet(action, state, registry)) return false;
  if (!actionVisible(action, state, registry)) return false;
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
  unspendable?: string;
}

export function inputLimit(action: Action, state: GameState): InputLimit {
  return costLimit(itemCost(action.results), state);
}

export function costLimit(cost: ReadonlyMap<string, number>, state: GameState): InputLimit {
  let completions = Infinity;
  let short: string | undefined;
  let unspendable: string | undefined;
  for (const [item, need] of cost) {
    if (need <= 0) continue;
    const copies = copiesOf(state, item);
    if (copies.stack + copies.grown + copies.worn < need) short ??= item;
    else if (spendable(copies) < need) unspendable ??= item;
    completions = Math.min(completions, Math.floor(spendable(copies) / need));
  }
  return { completions, short, unspendable };
}

export function outcomeResults(action: Action, outcome: FightOutcome): ActionResult[] {
  return outcome === 'completion' ? [...action.results, ...(action.onSuccess ?? [])] : (action.onAttemptsExhausted ?? []);
}

export function stopsOnOutcome(action: Action, outcome: FightOutcome): boolean {
  return outcomeResults(action, outcome).some((result) => result.kind === 'stop');
}

export function fightBatch(action: Action, count: number, outcome: FightOutcome): { results: ActionResult[]; count: number } {
  const results = outcomeResults(action, outcome);
  return { results, count: stopsOnOutcome(action, outcome) ? Math.min(count, 1) : count };
}
