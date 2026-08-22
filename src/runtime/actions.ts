import { RuntimeError } from './error';
import { ActionResult } from '../grammar/actionResult';
import { evaluateCondition } from './conditions';
import { Action } from '../content/sections/entity';
import { actionAddress } from '../content/sections/action';
import { Registry } from '../content/registry';
import { findActionOwner } from './seat';
import { copiesOf } from './itemInstance';
import { BASE_LANGUAGE, localizerFor } from './localized';
import { type ActiveAction, GameState } from './state';

export function parseOwnerRef(ownerRef: string): { obj: string; objId: string } {
  const dot = ownerRef.indexOf('.');
  return { obj: ownerRef.slice(0, dot), objId: ownerRef.slice(dot + 1) };
}

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
  unspendable?: { item: string; kind: 'grown' | 'worn' };
}

export function inputLimit(action: Action, state: GameState): InputLimit {
  let completions = Infinity;
  let short: string | undefined;
  let unspendable: InputLimit['unspendable'];
  for (const [item, need] of perCompletionCost(action)) {
    if (need <= 0) continue;
    const { stack, grown, worn } = copiesOf(state, item);
    if (stack + grown + worn < need) short ??= item;
    else if (stack < need) unspendable ??= { item, kind: grown > 0 ? 'grown' : 'worn' };
    completions = Math.min(completions, Math.floor(stack / need));
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
