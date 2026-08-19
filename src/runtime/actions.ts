import { RuntimeError } from './error';
import { ActionResult } from '../grammar/actionResult';
import { evaluateCondition } from './conditions';
import { Action } from '../content/entity';
import { actionAddress, ActionDeclaration } from '../content/action';
import { humanizeEn } from '../grammar/values';
import { Location } from '../content/location';
import { Registry } from '../content/registry';
import { copiesOf } from './itemInstance';
import { BASE_LANGUAGE, localizerFor, type Localized, type Localizer } from './localized';
import { type ActiveAction, GameState } from './state';
import { travelSecondsPerUnit } from './tuning';

export function findActionOwner(obj: string, objId: string, registry: Registry): unknown {
  switch (obj) {
    case 'entity':
      return registry.entities.get(objId);
    case 'action': {
      const declared = registry.actions.get(objId);
      return declared ? { actions: [declared] } : undefined;
    }
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
export const TRAVEL_PAIR = '>';

export const travelPair = (origin: string, dest: string): string => `${origin}${TRAVEL_PAIR}${dest}`;

// What addresses a compiled travel, which is an id and not its label: the label
// is display text that no surface draws — a walk under way is said by
// `engine.travel.to` — and a save holds this. `humanizeEn` fills the label from
// it exactly as a `# action` with no `title:` is filled, so the two are visibly
// not the same string and a caller reaching for the wrong one does not arm.
export const TRAVEL_ADDRESS = 'travel';

// The two ends of a pair, and what is said about either of them being gone.
// Asked rather than thrown wherever the answer reaches a player.
export function travelEndProblem(localizer: Localizer, originId: string, destId: string, registry: Registry): Localized | null {
  if (!registry.locations.has(originId)) return localizer.engine('engine.travel.unknown-origin', { location: localizer.identifier(originId) });
  if (!registry.locations.has(destId)) return localizer.engine('engine.travel.unknown-destination', { location: localizer.identifier(destId) });
  return null;
}

// Shaped as a one-attempt fight so a journey spans like any other action. The
// origin comes from the ownerRef: state.location holds it until relocate fires.
export function travelAction(originId: string, destId: string, registry: Registry): ActionDeclaration {
  const problem = travelEndProblem(localizerFor(registry, BASE_LANGUAGE), originId, destId, registry);
  if (problem) throw new RuntimeError(problem);
  return {
    id: TRAVEL_ADDRESS,
    label: humanizeEn(TRAVEL_ADDRESS),
    generatedLabel: true,
    results: [{ kind: 'relocate', location: destId }],
    time: locationDistance(registry.locations.get(originId)!, registry.locations.get(destId)!) * travelSecondsPerUnit(registry),
  };
}

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

// Reads authored fields only, so it cannot flip partway and strand a planned batch.
export function resolvesPerAttempt(action: Action): boolean {
  return action.accuracy !== undefined || action.depletes !== undefined;
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
  // What the stack can pay for, which is what the action may actually run.
  completions: number;
  // An input the player does not have at all, however it is spelled.
  short?: string;
  // An input the player has only out of its stack — grown, worn, or both. It
  // affords the cost, so the action is offered and the recipe is craftable, and
  // it is refused at the moment of spending because neither is ever taken. Which
  // of the two is named, because the sentence refusing it says why.
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

// Deliberately shallow. A `stop` nested inside a selector is reached by
// `samplesPerApplication`, which applies such a group one repetition at a time
// and breaks the moment one stops — so the cap here would be a second guard over
// the same case, and no test can tell the two readings apart.
export function stopsOnOutcome(action: Action, outcome: FightOutcome): boolean {
  return outcomeResults(action, outcome).some((result) => result.kind === 'stop');
}

// A `stop` caps the batch at one completion, or a batched span stops nothing.
export function fightBatch(action: Action, count: number, outcome: FightOutcome): { results: ActionResult[]; count: number } {
  const results = outcomeResults(action, outcome);
  return { results, count: stopsOnOutcome(action, outcome) ? Math.min(count, 1) : count };
}
