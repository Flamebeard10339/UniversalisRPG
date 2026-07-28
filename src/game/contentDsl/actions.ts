import { ActionResult } from './actionResult';
import { evaluateCondition } from './conditions';
import { Action } from './entity';
import { Location } from './location';
import { Registry } from './registry';
import type { ActiveAction } from './encounter';
import { GameState, RuntimeError } from './state';
import { travelSecondsPerUnit } from './tuning';

// Finding the action a reference names, and the questions asked about an action
// that need no simulated time to answer: may it run, what does it cost, which
// results does an outcome fire.

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
      // objId encodes `<origin>.<dest>` (the origin travelled from — see
      // travelAction on why it's needed); split on the first dot, since ids
      // themselves never contain one.
      const dot = objId.indexOf('.');
      return { actions: [travelAction(objId.slice(0, dot), objId.slice(dot + 1), registry)] };
    }
    default:
      return undefined;
  }
}

function locationDistance(a: Location, b: Location): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

// A journey along a travel edge, modelled as a one-attempt deterministic fight
// (health 1, no accuracy) whose single result relocates the player on
// completion. This lets travel reuse the whole resolve()/fight machinery for
// free: it becomes a spannable action like any other, so `--live` renders it as
// a real-time transition and the instant driver (agent CLI / tests) accrues its
// sim-time. The origin is encoded in the ownerRef rather than read from
// state.location because state.location stays the origin until the relocate
// fires; the distance comes from the registry's resolved coordinates, so the
// action can be rebuilt from the ownerRef alone with no state.
export function travelAction(originId: string, destId: string, registry: Registry): Action {
  const origin = registry.locations.get(originId);
  const dest = registry.locations.get(destId);
  if (!origin) throw new RuntimeError(`unknown travel origin: ${originId}`);
  if (!dest) throw new RuntimeError(`unknown travel destination: ${destId}`);
  return {
    label: `Travel to ${dest.title}`,
    results: [{ kind: 'relocate', location: destId }],
    time: locationDistance(origin, dest) * travelSecondsPerUnit(registry),
    health: 1,
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

// An action resolves attempt-by-attempt instead of in closed form when what an
// attempt does isn't knowable ahead of it: a miss chance, or damage sampled
// against a target's pool. Both are authored fields, never derived from live
// state, so this can't flip partway through a fight and strand a batch that was
// planned under the other reading.
export function resolvesPerAttempt(action: Action): boolean {
  return action.accuracy !== undefined || action.target !== undefined;
}

// Whether an action in flight may keep running — the same gate that let it
// start, re-checked rather than trusted for the action's whole life. The
// circumstances that made it legal can stop holding while it runs: the bait runs
// out, a quest flag flips, the forge goes cold.
//
// `hidden if:` is deliberately NOT part of this. It decides whether an action is
// OFFERED, which is why armAction refuses to start a hidden one; an action
// already under way is a different question, and a rat fight shouldn't abort
// mid-swing because the third rat's kill-count made the option disappear.
//
// Running out of a POOL is not here either, and cannot be: `health` is a name
// content chose, not something the engine knows. Content declares which pool is
// fatal by putting `stop` in that resource's `on empty:` block.
export function actionStillValid(action: Action, active: ActiveAction, state: GameState): boolean {
  if (!requiresMet(action, state)) return false;
  // Inputs only bound a REPEATING action — a single completion's worth was
  // already checked when it armed, and isn't consumed until it completes.
  return !active.repeating || inputLimit(action, state).completions > 0;
}

// The two conditions every "may this action run" question is built from. The
// three sites that ask compose them differently on purpose — armAction refuses
// to START a hidden action, one already under way ignores visibility (a rat
// fight must not abort mid-swing because the kill count removed it from the
// list), and the choice list additionally hides retaliations — so they stay
// separate predicates rather than collapsing into one with flags. What they must
// not do is each restate what an absent clause means, which is what this fixes.
export function requiresMet(action: Action, state: GameState): boolean {
  return !action.requires || evaluateCondition(action.requires, state);
}

export function actionVisible(action: Action, state: GameState): boolean {
  return !action.hiddenIf || !evaluateCondition(action.hiddenIf, state);
}

// One completion's worth of `take:` cost, as item → amount. Only the take side
// can bound anything — items have no stack cap in this schema (Pass 1), so the
// output side is unbounded.
export function perCompletionCost(action: Action): Map<string, number> {
  const cost = new Map<string, number>();
  for (const result of action.results) {
    if (result.kind === 'take') cost.set(result.item, (cost.get(result.item) ?? 0) + (result.amount ?? 1));
  }
  return cost;
}

// How many completions the current inventory affords, and — when that is under
// one — which item fell short, so armAction can tell the player what they need.
// Both are the same reduction over the same map, and asking for the count or the
// name used to mean writing it out again.
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

// Which of an action's result lists one fight outcome fires. `results`/
// `onSuccess` on completion, `onEscape` on escape — mutually exclusive per fight.
export function outcomeResults(action: Action, outcome: FightOutcome): ActionResult[] {
  return outcome === 'completion' ? [...action.results, ...(action.onSuccess ?? [])] : (action.onEscape ?? []);
}

// Whether the results this outcome fires ask the action to stop.
export function stopsOnOutcome(action: Action, outcome: FightOutcome): boolean {
  return outcomeResults(action, outcome).some((result) => result.kind === 'stop');
}

// `count` fights' worth of one outcome, as a single batch (count can be
// enormous) rather than one application per fight. Firing per *fight*, not per
// segment, is what keeps resolve() associative.
//
// A `stop` among the results caps the batch at one completion. Without the cap a
// batched path could not stop anything — the whole span had already happened by
// the time the one-shot verb ran, so resolve(s, 100) applied 100 completions
// where 100 stepped calls applied 1. nextBoundary independently lands the segment
// on that first completion, so time stops there too; this cap is what holds if
// the two ever disagree.
export function fightBatch(action: Action, count: number, outcome: FightOutcome): { results: ActionResult[]; count: number } {
  const results = outcomeResults(action, outcome);
  return { results, count: stopsOnOutcome(action, outcome) ? Math.min(count, 1) : count };
}
