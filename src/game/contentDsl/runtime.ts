import { ActionResult } from './actionResult';
import {
  actionStillValid,
  fightBatch,
  findActionOwner,
  findActiveAction,
  FightOutcome,
  inputLimit,
  parseOwnerRef,
  resolvesPerAttempt,
  requiresMet,
  actionVisible,
  stopsOnOutcome,
  travelAction,
} from './actions';
import { evaluateCondition, renderSegments } from './conditions';
import {
  applyResults,
  applyResultsNow,
  captureResourceRates,
  clampResources,
  EPSILON,
  initResources,
  PoolDeltas,
  requireResource,
  SECONDS_PER_MINUTE,
  Segment,
  settlePools,
} from './effects';
import { nextRandom } from './rng';
import { Choice, Dialogue, DialogueNode } from './dialogue';
import { Action } from './entity';
import { Item } from './item';
import { Registry } from './registry';
import { Recipe } from './recipe';
import { Resource } from './resource';
import { advanceTime, endAction, GameState, PLAYER, RuntimeError } from './state';
import { attemptDuration, hitChance, hitDamage, sampleStat, statValue } from './stats';
import { TagClause } from './tagClause';
import { humanize } from './values';

// The engine's public surface is this module: the resolver and the verbs live
// here, and everything the drivers also need is re-exported from wherever it
// actually lives. The one deliberate omission is the loader — loadModule and
// Registry belong to the content pipeline, and consumers import them from
// registry.ts.
export { advanceTime, createGameState, endAction, PLAYER, RuntimeError } from './state';
export type { ActiveBuff, GameState } from './state';
export { contestSpread, minDamage, travelSecondsPerUnit } from './tuning';
export { describeCondition, evaluateCondition, renderSegments } from './conditions';
export { actionVisible, requiresMet } from './actions';
export { hitChance, hitDamage, sampleStat, statRange, statValue } from './stats';
export { applyResultsNow, initResources } from './effects';

// A repeating/spannable action in flight: a sequence of attempts against one
// target with `healthRemaining` (a "fight"). `progress` is seconds elapsed
// toward the *next attempt*, not an absolute deadline, so a mid-flight speed
// change re-maps the remaining progress instead of rewriting a deadline.
// `attemptsMade`/`healthRemaining` let a split mid-fight resume exactly.
// `progress`/`attemptsMade` are the PLAYER's cadence, kept here rather than
// alongside the other actors' so the closed-form path — which has exactly one
// swinger and no encounter — is untouched by any of this. The resolver builds a
// uniform participant list over both, so the storage asymmetry never reaches the
// scheduling logic.
export interface ActiveAction extends Cadence {
  ownerRef: string; // "<obj>.<objId>", e.g. "entity.oven"
  actionLabel: string;
  repeating: boolean;
  healthRemaining: number;
  // Non-player actors taking part, keyed by entity id. Absent for a solo action
  // (cooking, travel, chopping); a `target:` action puts the entity it fights in
  // here. Their pools live with the encounter and not in state.resources because
  // they are scoped to the fight — they vanish with it, the player's persist.
  actors?: Record<string, ActorState>;
}

// One swinger's independent attack clock. `progress` is seconds elapsed toward
// the next attempt, not an absolute deadline, so a mid-flight rate change
// re-maps what remains rather than rewriting a deadline: a 2.4s swing 1.2s in
// that speeds up to 1.92s has 0.72s left, not 0.96s or 1.2s.
export interface Cadence {
  progress: number;
  attemptsMade: number;
}

// A non-player participant's sheet. Only pool levels and its clock are stored:
// its stats come from its `# entity` block and its maxima are derived live from
// those stats, exactly as the player's are. `cadence` is present only when the
// entity has a `retaliates` action to run — an inert target keeps no clock.
export interface ActorState {
  resources: Record<string, number>;
  cadence?: Cadence;
}



export interface DialogueSession {
  dialogue: Dialogue;
  node: DialogueNode;
  resumeIndex: number;
  replay: boolean;
  choices: Choice[] | null;
}

function findNode(dialogue: Dialogue, name: string): DialogueNode {
  const node = dialogue.nodes.find((n) => n.name === name);
  if (!node) throw new RuntimeError(`goto target not found: ${name} in dialogue ${dialogue.id}`);
  return node;
}

// A `menu` step hands control back for a choice; the node then resumes at the
// step after it, so a choice with no goto falls through to the rest of the node.
//
// TODO(dialogue-pacing): consecutive `say` beats between menus are all pushed to
// the log in one turn, so a multi-line node dumps everything at once with no
// "continue" beat (the playtest praised the first, gated dialogue but found the
// rest a wall of text). Two options the playtest raised: (a) treat each say beat
// as an implicit single-choice "continue" menu so the player advances line by
// line; (b) model dialogue as a first-class modal (pendingModal) so a GUI need
// not reverse-engineer pacing. Deferred as an out-of-MVP dialogue-engine change.
function runSteps(dialogue: Dialogue, node: DialogueNode, registry: Registry, state: GameState, start: number, replay: boolean): DialogueSession {
  for (let i = start; i < node.steps.length; i++) {
    const step = node.steps[i];
    switch (step.kind) {
      case 'say':
        if (replay) state.log.push(renderSegments(step.segments, state));
        break;
      case 'effect':
        if (replay) applyResultsNow(state, registry, [step.result]);
        break;
      case 'goto':
        return enterNode(dialogue, findNode(dialogue, step.target), registry, state);
      case 'menu':
        return { dialogue, node, resumeIndex: i + 1, replay, choices: step.choices };
    }
  }
  return { dialogue, node, resumeIndex: node.steps.length, replay, choices: null };
}

// On a revisit, only a `sticky` node replays its beats and effects; otherwise
// they fire once and later visits show `again` instead.
function enterNode(dialogue: Dialogue, node: DialogueNode, registry: Registry, state: GameState): DialogueSession {
  const visit = (state.visits[node.name] = (state.visits[node.name] ?? 0) + 1);
  const replay = visit === 1 || node.sticky === true;
  if (!replay && node.again) state.log.push(renderSegments(node.again, state));
  return runSteps(dialogue, node, registry, state, 0, replay);
}

export function talk(entityId: string, registry: Registry, state: GameState): DialogueSession {
  const dialogue = registry.dialoguesByOwner.get(entityId);
  if (!dialogue) throw new RuntimeError(`no dialogue owned by entity: ${entityId}`);

  let chosen: DialogueNode | undefined;
  for (const node of dialogue.nodes) {
    if (node.when && evaluateCondition(node.when, state)) chosen = node;
  }
  if (!chosen) throw new RuntimeError(`no reachable node in dialogue: ${dialogue.id}`);
  return enterNode(dialogue, chosen, registry, state);
}

export function choose(text: string, session: DialogueSession, registry: Registry, state: GameState): DialogueSession {
  if (!session.choices) throw new RuntimeError('no active menu to choose from');
  const match = session.choices.find((c) => (!c.when || evaluateCondition(c.when, state)) && renderSegments(c.segments, state) === text);
  if (!match) throw new RuntimeError(`no choice matches: ${JSON.stringify(text)}`);

  applyResultsNow(state, registry, match.effects);
  if (match.goto) return enterNode(session.dialogue, findNode(session.dialogue, match.goto), registry, state);
  return runSteps(session.dialogue, session.node, registry, state, session.resumeIndex, session.replay);
}






interface FightParams {
  duration: number; // seconds per attempt
  abilityAmount: number; // health subtracted per successful attempt
  escapeAfter: number; // raw escape-after threshold (Infinity if absent)
}

// A deterministic (no-accuracy) fight has a closed-form length and end,
// computed assuming every attempt hits. These two fields are meaningless once
// an attempt can miss, so only the deterministic path takes a DeterministicFightPlan
// — the stochastic path decides completion vs escape per attempt at runtime
// (resolveStochasticSegment) off the plain FightParams.
interface DeterministicFightPlan extends FightParams {
  attemptsToResolve: number; // attempts to end one fight
  outcome: FightOutcome; // which end the fight reaches first
}

function fightParams(action: Action, state: GameState, registry: Registry): FightParams {
  return {
    duration: attemptDuration(action, state, registry),
    abilityAmount: action.ability ? statValue(action.ability, state, registry) : 1,
    escapeAfter: action.escapeAfter ?? Infinity,
  };
}

function fightPlan(action: Action, state: GameState, registry: Registry): DeterministicFightPlan {
  const params = fightParams(action, state, registry);
  const neededForCompletion = Math.ceil((action.health ?? 1) / params.abilityAmount);
  return {
    ...params,
    attemptsToResolve: Math.min(neededForCompletion, params.escapeAfter),
    outcome: neededForCompletion <= params.escapeAfter ? 'completion' : 'escape',
  };
}



// An encounter actor's pools, each filled to that ACTOR's own max. Deliberately
// not initResources' rule: `start` is where a pool begins on a fresh game, a
// player-lifecycle concept with no meaning for something that stands up
// mid-fight. Honouring it made a `# resource health` with `start: 5` spawn every
// rat at 5 however much max-health its own sheet claimed.
// The actor keeps a clock only if it has a `retaliates` action to swing on it.
function freshActor(actorId: string, state: GameState, registry: Registry): ActorState {
  const resources: Record<string, number> = {};
  for (const resource of registry.resources.values()) {
    resources[resource.id] = statValue(resource.max, state, registry, actorId);
  }
  const swings = retaliationOf(actorId, registry) !== undefined;
  return swings ? { resources, cadence: { progress: 0, attemptsMade: 0 } } : { resources };
}

function actorInEncounter(state: GameState, actorId: string): ActorState {
  const actor = state.activeAction?.actors?.[actorId];
  if (!actor) throw new RuntimeError(`actor is not in the encounter: ${actorId}`);
  return actor;
}

// One swinger in the encounter: `self` runs `action` against `other`, on its own
// clock. `speed`/`ability`/`accuracy` read `self`; `target`/`dr` read `other`, so
// the identical action shape serves both directions and only the perspective
// flips between the player's attack and the entity's `retaliates` answer.
interface Participant {
  self: string;
  other: string;
  action: Action;
  cadence: Cadence;
}

// The player always swings; each encounter actor with a `retaliates` action
// swings alongside on its own clock. The order is fixed — player first, then
// actors in the order the encounter armed them — and it is what breaks ties when
// two cadences land on the same instant, so who goes first can never depend on
// where a caller split the span.
function participants(state: GameState, registry: Registry, action: Action): Participant[] {
  const active = state.activeAction!;
  const list: Participant[] = [{ self: PLAYER, other: parseOwnerRef(active.ownerRef).objId, action, cadence: active }];
  for (const [actorId, actor] of Object.entries(active.actors ?? {})) {
    if (!actor.cadence) continue;
    const retaliation = retaliationOf(actorId, registry);
    if (retaliation) list.push({ self: actorId, other: PLAYER, action: retaliation, cadence: actor.cadence });
  }
  return list;
}

function retaliationOf(actorId: string, registry: Registry): Action | undefined {
  return registry.entities.get(actorId)?.actions.find((candidate) => candidate.retaliates);
}

function actorTitle(actorId: string, registry: Registry): string {
  return registry.entities.get(actorId)?.title ?? humanize(actorId);
}

// One combatant as a driver needs to draw it. `cadence` is the fraction of the
// way to its next swing, which is the meter the CLI's 8-stage glyph renderer was
// built for and never had a source; it is null for a target that doesn't swing
// back and so keeps no clock.
export interface EncounterFoe {
  id: string;
  title: string;
  resource: string;
  current: number;
  max: number;
  cadence: number | null;
}

export interface EncounterView {
  cadence: number;
  foes: EncounterFoe[];
}

// The fight in flight, for display only — the read-only twin of participants().
// Everything here is derived on the spot from the encounter and the actors'
// sheets; nothing is stored for the sake of being shown, so a driver that never
// calls this costs nothing. Null unless a real fight (a `target:` action) is
// running.
export function encounterView(state: GameState, registry: Registry): EncounterView | null {
  const active = state.activeAction;
  if (!active) return null;
  const action = findActiveAction(active, registry);
  if (!action.target) return null;

  const fractionOf = (cadence: Cadence, actorId: string, swing: Action): number => {
    const duration = attemptDuration(swing, state, registry, actorId);
    return duration > 0 ? Math.min(1, cadence.progress / duration) : 1;
  };
  const resource = requireResource(registry, action.target);

  const foes: EncounterFoe[] = [];
  for (const [actorId, actor] of Object.entries(active.actors ?? {})) {
    const retaliation = retaliationOf(actorId, registry);
    foes.push({
      id: actorId,
      title: actorTitle(actorId, registry),
      resource: resource.id,
      current: actor.resources[resource.id] ?? 0,
      max: statValue(resource.max, state, registry, actorId),
      cadence: actor.cadence && retaliation ? fractionOf(actor.cadence, actorId, retaliation) : null,
    });
  }
  return { cadence: fractionOf(active, PLAYER, action), foes };
}

// Blow-by-blow narration, engine-side: a fight is the one place the player has
// to see every attempt as it lands, and there is nothing content could usefully
// say about a number the resolver has just rolled. Only a `target:` action
// narrates — a craft attempt is not a swing at anything.
//
// The player is always one side of a fight, so the two directions are two
// sentences rather than a general combat-log grammar.
function logSwing(state: GameState, registry: Registry, self: string, other: string, damage: number | null): void {
  if (self === PLAYER) {
    const title = actorTitle(other, registry);
    state.log.push(damage === null ? `You miss the ${title}.` : `You hit the ${title} for ${damage}.`);
  } else {
    const title = actorTitle(self, registry);
    state.log.push(damage === null ? `The ${title} misses you.` : `The ${title} hits you for ${damage}.`);
  }
}

function poolLevel(state: GameState, registry: Registry, actorId: string, resourceId: string): number {
  requireResource(registry, resourceId);
  if (actorId === PLAYER) return state.resources[resourceId] ?? 0;
  return actorInEncounter(state, actorId).resources[resourceId] ?? 0;
}

// A hit landing on an actor's pool; returns the level it leaves behind.
//
// The player's damage joins the segment's deltas like any other pool write (see
// Segment). An enemy's is written on the spot instead: it has no rate
// integration to net against, and the fight's completion check has to read it
// back immediately.
//
// Neither path runs the resource's `on empty`/`on full` blocks for a non-player
// actor: those are authored in the player's voice ("You slump to the floor"), and
// a felled enemy must not borrow them. Its death is the fight completing.
function damagePool(state: GameState, registry: Registry, actorId: string, resourceId: string, amount: number, deltas: PoolDeltas): number {
  const resource = requireResource(registry, resourceId);
  if (actorId === PLAYER) {
    const pending = (deltas.get(resourceId) ?? 0) - amount;
    deltas.set(resourceId, pending);
    // Where the segment is heading, so a caller sees the damage before it
    // settles; the clamped write itself happens once, at segment end.
    return Math.max(0, (state.resources[resourceId] ?? 0) + pending);
  }
  const pools = actorInEncounter(state, actorId).resources;
  const max = statValue(resource.max, state, registry, actorId);
  const level = Math.min(max, Math.max(0, (pools[resource.id] ?? 0) - amount));
  pools[resource.id] = level;
  return level;
}


// The earliest instant in [state.time, toTime] at which something discrete
// must happen (a buff expiring, a repeating action running out of input, a
// non-repeating action completing, a draining pool with `on empty` hitting 0),
// or toTime if nothing does — what lets resolve() cross a huge idle span in one
// step.
function nextBoundary(state: GameState, registry: Registry, toTime: number): number {
  let boundary = toTime;
  for (const buff of Object.values(state.activeBuffs)) {
    if (buff.expiresAt < boundary) boundary = buff.expiresAt;
  }
  if (state.activeAction) {
    const action = findActiveAction(state.activeAction, registry);
    // A stochastic action (accuracy) has no closed-form boundary — fight length
    // is random. resolveStochasticSegment simulates it attempt-by-attempt,
    // bounded only by whatever buff-expiry/toTime already gives.
    if (!resolvesPerAttempt(action)) {
      const { duration, attemptsToResolve, outcome } = fightPlan(action, state, registry);
      const remainingAttempts = attemptsToResolve - state.activeAction.attemptsMade;
      // An action that stops on its own outcome is, for boundary purposes, not
      // repeating: it ends at its first completion, so the segment must land
      // there. Otherwise the span would batch straight past the stop with the
      // action's stat modifiers snapshotted for the whole of it.
      if (state.activeAction.repeating && !stopsOnOutcome(action, outcome)) {
        const limit = inputLimit(action, state).completions;
        if (Number.isFinite(limit)) {
          // Time to finish the fight already in flight, plus (limit - 1)
          // more full fights after it — generalizes the old
          // `limit * duration - progress` to attempt-scoped progress.
          const runway = remainingAttempts * duration - state.activeAction.progress + Math.max(0, limit - 1) * attemptsToResolve * duration;
          const limitInstant = state.time + Math.max(0, runway);
          if (limitInstant < boundary) boundary = limitInstant;
        }
      } else {
        const completionInstant = state.time + Math.max(0, remainingAttempts * duration - state.activeAction.progress);
        if (completionInstant < boundary) boundary = completionInstant;
      }
    }
  }
  // A draining pool with an `on empty` handler must break the segment exactly
  // when it hits 0, so onEmpty fires once at the right instant. A pool without
  // an on-empty handler just clamps silently and needs no boundary; nor does a
  // filling pool (its rollover is closed-form and associative in-segment).
  for (const resource of registry.resources.values()) {
    if (resource.onEmpty.length === 0 || !resource.rate) continue;
    const ratePerMinute = statValue(resource.rate, state, registry);
    if (ratePerMinute >= 0) continue;
    const current = state.resources[resource.id] ?? 0;
    if (current <= EPSILON) continue;
    const drainPerSecond = -ratePerMinute / SECONDS_PER_MINUTE;
    const emptyInstant = state.time + current / drainPerSecond;
    if (emptyInstant < boundary) boundary = emptyInstant;
  }
  return boundary;
}

// Advances state.time to segEnd for a deterministic action (no accuracy —
// outcome and fight length known in closed form). Whole fights this segment
// covers are applied as one batch; the remainder is carried as
// attemptsMade/healthRemaining/progress for the fight still in flight.
function resolveDeterministicSegment(segment: Segment, action: Action, segEnd: number): void {
  const { state, registry } = segment;
  const active = state.activeAction!;
  const segLen = segEnd - state.time;
  const { duration, abilityAmount, attemptsToResolve, outcome } = fightPlan(action, state, registry);
  const health = action.health ?? 1;

  if (active.repeating && duration <= 0) {
    throw new RuntimeError(`repeating action ${active.ownerRef}.${active.actionLabel} resolved a non-positive duration (${duration}) — give it a positive time: or a positive speed stat`);
  }

  const totalAttemptTime = active.progress + segLen;
  const attemptsThisSegment = duration > 0 ? Math.floor(totalAttemptTime / duration) : 0;
  const newProgress = totalAttemptTime - attemptsThisSegment * duration;

  if (active.repeating) {
    const totalAttempts = active.attemptsMade + attemptsThisSegment;
    const fights = Math.floor(totalAttempts / attemptsToResolve);
    const remainder = totalAttempts - fights * attemptsToResolve;
    const batch = fightBatch(action, fights, outcome);
    applyResults(segment, batch.results, batch.count);
    // The batch capped itself at one completion and that completion asked to
    // stop: the action ends here rather than carrying a remainder it will never
    // swing. nextBoundary put segEnd on this instant, so time is already right.
    if (segment.stopped) {
      endAction(state);
      return;
    }
    active.attemptsMade = remainder;
    active.healthRemaining = health - remainder * abilityAmount;
    active.progress = newProgress;
  } else {
    // A non-repeating fight fires its single outcome as a boundary event
    // (applyDueBoundaries) once attemptsMade reaches attemptsToResolve —
    // clamped here, never wrapped, so that check can still see it.
    active.attemptsMade = Math.min(active.attemptsMade + attemptsThisSegment, attemptsToResolve);
    active.healthRemaining = health - active.attemptsMade * abilityAmount;
    active.progress = newProgress;
  }
}

// Resolves one participant's attempt: the hit roll, then damage against
// whatever pool it targets. Returns whether that pool is now empty.
//
// Draws happen in a fixed order — hit roll, damage roll, reduction roll — and an
// action with no accuracy stat cannot miss and draws nothing for the first. The
// count per attempt is therefore a function of state alone, which is what lets
// per-attempt randomness live under resolve()'s associativity invariant. The
// opposed roll costs nothing extra here: both sides of the contest are read
// with statValue (no draw), so it only changes what the one uniform is compared
// against. Sampling them instead would put the range roll and the contest roll
// in the same decision, which is two sources of variance for one outcome.
function resolveAttempt(participant: Participant, segment: Segment): boolean {
  const { state, registry } = segment;
  const { self, other, action, cadence } = participant;
  cadence.progress = 0;
  cadence.attemptsMade++;

  const hit =
    action.accuracy === undefined ||
    nextRandom(state) <
      hitChance(
        statValue(action.accuracy, state, registry, self),
        action.evasion ? statValue(action.evasion, state, registry, other) : 0,
        registry,
      );

  if (!action.target) {
    if (hit) state.activeAction!.healthRemaining -= fightParams(action, state, registry).abilityAmount;
    return state.activeAction!.healthRemaining <= EPSILON;
  }

  if (hit) {
    const dealt = hitDamage(
      action.ability ? sampleStat(action.ability, state, registry, self) : 1,
      action.dr ? sampleStat(action.dr, state, registry, other) : 0,
      registry,
    );
    logSwing(state, registry, self, other, dealt);
    return damagePool(state, registry, other, action.target, dealt, segment.deltas) <= EPSILON;
  }
  logSwing(state, registry, self, other, null);
  return poolLevel(state, registry, other, action.target) <= EPSILON;
}

// Advances state.time to segEnd attempt-by-attempt, which is what an action with
// a miss chance or with sampled damage requires (neither has a closed form to
// batch). Every participant swings on its own clock, so the loop is an event
// queue: jump to whichever attempt lands soonest, credit that span to EVERY
// participant's progress, and resolve just the one that came due. A 2.4s player
// and a 3.75s rat interleave naturally out of that, with no shared tick.
//
// O(attempts) is bounded by segment length and input affordability.
function resolveStochasticSegment(segment: Segment, action: Action, segEnd: number): void {
  const { state, registry } = segment;
  const active = state.activeAction!;

  for (;;) {
    if (!actionStillValid(action, active, state)) {
      endAction(state);
      return;
    }

    const roster = participants(state, registry, action);
    let next: Participant | undefined;
    let nextAt = Infinity;
    for (const participant of roster) {
      const duration = attemptDuration(participant.action, state, registry, participant.self);
      if (duration <= 0) {
        throw new RuntimeError(`action ${active.ownerRef}.${participant.action.label} resolved a non-positive attempt duration (${duration}) — give it a positive time: or a positive speed stat`);
      }
      // Elapsed progress carries in absolute seconds, so a rate raised mid-swing
      // shortens what remains of the swing already under way. Progress accrues
      // across arbitrarily many segments and can land a hair past its duration,
      // so an overdue swing is floored at "now" rather than allowed to compute
      // an instant in the past.
      const at = state.time + Math.max(0, duration - participant.cadence.progress);
      // Strictly-sooner-by-EPSILON: a genuine tie (2.4s and 3.75s cadences do
      // collide, at t=60) falls to roster order rather than to float noise.
      if (at < nextAt - EPSILON) {
        next = participant;
        nextAt = at;
      }
    }

    if (!next || nextAt > segEnd) {
      // Nothing comes due inside this segment: credit the whole span and stop.
      // A later resolve() picks up exactly here.
      const elapsed = segEnd - state.time;
      for (const participant of roster) participant.cadence.progress += elapsed;
      advanceTime(state, elapsed);
      return;
    }

    const elapsed = nextAt - state.time;
    for (const participant of roster) participant.cadence.progress += elapsed;
    advanceTime(state, elapsed);

    const depleted = resolveAttempt(next, segment);

    // Only the player's swing decides the fight: its action owns the results,
    // the escape counter and the repeat. A retaliation is only a damage source.
    if (next.self !== PLAYER) {
      // Except when it empties the pool it drains: the segment ends right here
      // so that pool settles at the instant it ran out rather than at whatever
      // distant instant the caller's span happens to end. That is what lets its
      // `on empty:` block fire on time — and whether running out is fatal to the
      // fight is the block's call, via `stop`, not the resolver's.
      if (depleted || state.time >= segEnd) return;
      continue;
    }

    let fightOutcome: FightOutcome | null = null;
    if (depleted) fightOutcome = 'completion';
    else if (active.attemptsMade >= (action.escapeAfter ?? Infinity)) fightOutcome = 'escape';

    if (fightOutcome) {
      const batch = fightBatch(action, 1, fightOutcome);
      applyResults(segment, batch.results, batch.count);
      // The outcome asked to stop, so nothing rearms and this local `active`
      // goes out of scope still holding the fight it just ended. Reading the
      // flag here is what keeps it and state.activeAction from disagreeing —
      // the next participants() would dereference the null.
      if (segment.stopped) {
        endAction(state);
        return;
      }
      if (active.repeating) {
        // A fresh target steps up: pools refilled from its own stats, clock
        // restarted, so it does not inherit the dead one's half-finished swing.
        if (action.target) active.actors![next.other] = freshActor(next.other, state, registry);
        else active.healthRemaining = action.health ?? 1;
        active.attemptsMade = 0;
      } else {
        grantActionFoodBuff(state, registry);
        endAction(state);
        return;
      }
    }

    if (state.time >= segEnd) return;
  }
}

function resolveSegment(state: GameState, registry: Registry, segEnd: number): void {
  const start = state.time;
  // Snapshot resource rates now, while the active action's modifiers are still
  // in force — the stochastic path can clear the action before we integrate.
  const snapshots = captureResourceRates(state, registry);
  const segment: Segment = { state, registry, deltas: new Map(), stopped: false };

  if (!state.activeAction) {
    advanceTime(state, segEnd - start);
  } else {
    const action = findActiveAction(state.activeAction, registry);
    if (resolvesPerAttempt(action)) {
      resolveStochasticSegment(segment, action, segEnd);
    } else {
      resolveDeterministicSegment(segment, action, segEnd);
      advanceTime(state, segEnd - state.time);
    }
  }

  // Settle over the time the segment actually consumed: a stochastic action
  // that exhausts its input mid-segment stops early, and its untouched tail
  // resolves as a later action-less segment where rates are re-snapshotted (so
  // an action's drain stops the instant the action does).
  const elapsed = state.time - start;
  if (elapsed > 0 || segment.deltas.size > 0) settlePools(state, registry, snapshots, Math.max(0, elapsed), segment.deltas);
}

// Fires whatever is due exactly at `at` and keeps re-checking until nothing
// more is due at that same instant (e.g. a buff expiring the moment an
// action also completes). Also what lets a zero-duration action fire its
// completion immediately, before resolve() has consumed any segment at all.
function applyDueBoundaries(state: GameState, registry: Registry, at: number): void {
  for (;;) {
    let changed = false;

    for (const key of Object.keys(state.activeBuffs)) {
      if (state.activeBuffs[key].expiresAt <= at) {
        delete state.activeBuffs[key];
        changed = true;
      }
    }

    if (state.activeAction) {
      const action = findActiveAction(state.activeAction, registry);
      if (!actionStillValid(action, state.activeAction, state)) {
        endAction(state);
        changed = true;
      } else if (!resolvesPerAttempt(action)) {
        // A per-attempt action fires and rearms itself inside
        // resolveStochasticSegment — nothing else is due here for it.
        if (!state.activeAction.repeating) {
          const { duration, attemptsToResolve, outcome } = fightPlan(action, state, registry);
          // duration <= 0 means every attempt is instantaneous — fire
          // immediately regardless of attemptsMade. This is the only place a
          // zero-`time:` action fires: its toTime === state.time in useAction,
          // so resolveSegment's closed form never runs to advance attemptsMade.
          if (state.activeAction.attemptsMade >= attemptsToResolve || duration <= 0) {
            const batch = fightBatch(action, 1, outcome);
            applyResultsNow(state, registry, batch.results, batch.count);
            grantActionFoodBuff(state, registry);
            endAction(state);
            changed = true;
          }
        }
      }
    }

    if (!changed) {
      // Once the boundary has settled, re-clamp pools so a max shrunk by an
      // expired buff can't leave one above its new ceiling.
      clampResources(state, registry);
      return;
    }
  }
}

// THE single seam every driver (REPL, session, a future live loop) calls to
// advance simulated time. Core invariant (proved in resolve.test.ts):
// resolve(resolve(s, t1), t2) === resolve(s, t2) for t1 <= t2 — one big jump
// equals any sequence of smaller steps to the same target. It walks forward in
// segments bounded by the next discrete event, never fixed dt steps, so a
// deterministic segment resolves in closed form. Randomness (accuracy actions)
// is drawn only from state.rng at attempt boundaries, in strict attempt order,
// so splitting the call can't change which draw powers which attempt. Resource
// pools (Pass 2) integrate per segment at a constant per-minute rate and stay
// associative the same way — with two accepted, bounded limitations: an `on
// full` handler is assumed segment-preserving (inventory/counter/say; one that
// mutated a rate-referenced stat would be non-associative), and a stochastic
// (accuracy) action whose modifier empties a pool mid-fight fires `on empty` at
// segment granularity, not the exact fractional attempt instant (deterministic
// paths are exact — nextBoundary lands the segment on the emptying instant).
export function resolve(state: GameState, registry: Registry, toTime: number): void {
  if (toTime < state.time) throw new RuntimeError(`resolve: toTime (${toTime}) must be >= state.time (${state.time})`);
  applyDueBoundaries(state, registry, state.time);
  while (state.time < toTime) {
    const segEnd = nextBoundary(state, registry, toTime);
    resolveSegment(state, registry, segEnd);
    // Boundaries are settled at the instant the segment actually reached, not
    // at the one it was aimed at: a segment can stop short (input exhausted, a
    // pool emptied), and firing at segEnd would expire buffs that still had
    // time left on them.
    applyDueBoundaries(state, registry, state.time);
  }
}

// Turns the inert `food, +N <stat>, <duration>` item tags into live buffs:
// eating (an item action that take:s the item it's defined on) grants each
// stat-bonus tag as a timed buff whose clock starts when eating completes.
function grantFoodBuff(item: Item, state: GameState): void {
  if (!item.tags.some((tag) => tag.kind === 'keyword' && tag.value === 'food')) return;

  const durationTag = item.tags.find((tag): tag is Extract<TagClause, { kind: 'duration' }> => tag.kind === 'duration');
  const duration = durationTag?.seconds ?? 0;

  for (const tag of item.tags) {
    if (tag.kind !== 'stat-bonus') continue;
    const expiresAt = state.time + duration;
    state.activeBuffs[`${item.id}:${tag.statId}`] = tag.percent
      ? { statId: tag.statId, kind: 'increased', amount: tag.amount / 100, expiresAt }
      : { statId: tag.statId, kind: 'added', amount: tag.amount, expiresAt };
  }
}

// The action in flight, if it is an item eating itself, grants that item's food
// tags — called as the action COMPLETES, which is where the buff's clock has to
// start and, more to the point, the one moment both ways of starting an action
// pass through. Hanging it off useAction instead meant a food whose eat action
// carried a `time:` buffed correctly in instant mode and not at all in --live,
// because beginAction arms directly and never returns through useAction. Every
// food in the tutorial happens to be instant, which is the only reason that
// never showed.
function grantActionFoodBuff(state: GameState, registry: Registry): void {
  const active = state.activeAction;
  if (!active) return;
  const { obj, objId } = parseOwnerRef(active.ownerRef);
  if (obj !== 'item') return;
  const item = registry.items.get(objId);
  if (!item) return;
  // Eating is the item consuming itself. A repeating action isn't a meal.
  if (active.repeating) return;
  if (!findActiveAction(active, registry).results.some((r) => r.kind === 'take' && r.item === objId)) return;
  grantFoodBuff(item, state);
}

// Result of arming a spannable action/craft: `armed: false` means a take-gate
// failure already logged its onFailure/shortfall message (nothing to resolve);
// `armed: true` means state.activeAction is now set and `firstUnit` is the
// span (from state.time) the *first* natural unit of play covers — a caller
// that wants the instant behavior of today calls resolve() with it right
// away, a live driver instead drives `wait()` toward it over real time.
type ArmResult = { armed: true; firstUnit: number } | { armed: false };

// Everything useAction did before its resolve() call: gating (requires/
// hiddenIf throw, take-affordability failure logs and returns un-armed) and
// arming state.activeAction. Extracted so a live driver can arm a spannable
// action WITHOUT resolving its first unit instantly (see actionFirstUnit for
// the side-effect-free duration probe that decides whether to do so).
// The first natural unit of play from state.time: one full fight when it's
// closed-form (deterministic), or just the first attempt when it isn't
// (stochastic — fight length is random, so there's no fixed span to jump to).
function firstUnitSpan(action: Action, state: GameState, registry: Registry): number {
  const duration = attemptDuration(action, state, registry);
  return resolvesPerAttempt(action) ? duration : fightPlan(action, state, registry).attemptsToResolve * duration;
}

export function armAction(obj: string, objId: string, actionId: string, registry: Registry, state: GameState): ArmResult {
  const target = findActionOwner(obj, objId, registry) as { actions?: Action[] } | undefined;
  if (!target) throw new RuntimeError(`unknown ${obj}: ${objId}`);

  const action = target.actions?.find((a) => a.label === actionId);
  if (!action) throw new RuntimeError(`unknown action ${JSON.stringify(actionId)} on ${obj}.${objId}`);
  if (!requiresMet(action, state)) throw new RuntimeError(`action requires unmet: ${obj}.${objId}.${actionId}`);
  if (!actionVisible(action, state)) throw new RuntimeError(`action hidden: ${obj}.${objId}.${actionId}`);

  // take: implies affordability — checked once up front for one completion's
  // worth; this only gates whether the action may START. A repeating action
  // running out of input mid-flight is handled in resolve()'s limiting math,
  // not here, and ends quietly without firing onFailure.
  const { short: shortfall } = inputLimit(action, state);
  if (shortfall !== undefined) {
    if (action.onFailure) applyResultsNow(state, registry, action.onFailure);
    else state.log.push(`You don't have enough ${registry.items.get(shortfall)?.title ?? shortfall}.`);
    return { armed: false };
  }

  const repeating = action.repeating === true;
  const duration = attemptDuration(action, state, registry);
  if (repeating && duration <= 0) {
    throw new RuntimeError(`repeating action ${obj}.${objId}.${actionId} needs a positive time: after speed scaling`);
  }

  state.activeAction = { ownerRef: `${obj}.${objId}`, actionLabel: actionId, progress: 0, repeating, healthRemaining: action.health ?? 1, attemptsMade: 0 };
  // A `target:` action opens an encounter: the thing being fought joins with its
  // own pools, filled from its own stats.
  if (action.target) state.activeAction.actors = { [objId]: freshActor(objId, state, registry) };
  return { armed: true, firstUnit: firstUnitSpan(action, state, registry) };
}

// Side-effect-free probe: the same firstUnit armAction would compute, without
// arming or mutating anything, so a driver can decide instant-vs-spannable
// before committing to arm. Returns 0 if the action can't be found — a
// caller then falls back to the instant path, which reproduces whatever
// error/behavior looking it up for real would have produced.
export function actionFirstUnit(obj: string, objId: string, actionId: string, registry: Registry, state: GameState): number {
  const target = findActionOwner(obj, objId, registry) as { actions?: Action[] } | undefined;
  const action = target?.actions?.find((a) => a.label === actionId);
  if (!action) return 0;
  return firstUnitSpan(action, state, registry);
}

// Arms and resolves the first unit in one call — the instant/agent path. The
// food-buff-on-eating side effect used to live here; it now hangs off the
// action's completion inside resolve() (grantActionFoodBuff), which is the one
// moment this path and beginAction's armed path both reach.
export function useAction(obj: string, objId: string, actionId: string, registry: Registry, state: GameState): void {
  const armed = armAction(obj, objId, actionId, registry, state);
  if (!armed.armed) return;
  resolve(state, registry, state.time + armed.firstUnit);
}

// Travel wrappers: adapt an (origin, dest) pair to the generic action machinery
// through the synthetic `travel` owner (travelAction / findActionOwner), so
// travel gains spannable/real-time behavior with no bespoke resolver. A journey
// from an unset origin (a fresh state that has never been anywhere, e.g. a test
// that travels before startSession) is a plain placement, not a journey.

// Side-effect-free probe of a journey's span; 0 for an unset origin so callers
// route it through the instant path (which just places the player).
export function travelFirstUnit(origin: string, dest: string, registry: Registry, state: GameState): number {
  if (!origin) return 0;
  const { label } = travelAction(origin, dest, registry);
  return actionFirstUnit('travel', `${origin}.${dest}`, label, registry, state);
}

// Arms the journey without resolving it, for a live driver to advance over real
// time. Only called with a real origin (a distance-0 or unset journey takes the
// instant path instead, see beginAction).
export function armTravel(origin: string, dest: string, registry: Registry, state: GameState): void {
  const { label } = travelAction(origin, dest, registry);
  armAction('travel', `${origin}.${dest}`, label, registry, state);
}

// Arms and resolves the journey in one call (instant in real time, sim-time
// accrues) — the agent-CLI / test path, mirroring useAction/craft.
export function useTravel(origin: string, dest: string, registry: Registry, state: GameState): void {
  if (!origin) {
    state.location = dest;
    return;
  }
  const { label } = travelAction(origin, dest, registry);
  useAction('travel', `${origin}.${dest}`, label, registry, state);
}

export function recipeCraftable(recipe: Recipe, registry: Registry, state: GameState): boolean {
  // Through the compiled action, not `recipe.in`: recipeAction turns those
  // inputs into the take: results the rest of the engine bounds a craft by, so
  // reading them here again would be the same list under two owners.
  const action = registry.recipeActions.get(recipe.id);
  if (!action) throw new RuntimeError(`unknown recipe: ${recipe.id}`);
  if (inputLimit(action, state).short !== undefined) return false;
  if (recipe.requiresCapability) {
    const loc = registry.locations.get(state.location);
    if (!loc) return false;
    const provided = loc.entities.some((entityId) => registry.entities.get(entityId)?.capabilities.includes(recipe.requiresCapability!));
    if (!provided) return false;
  }
  return true;
}

// A craft is a spannable action on the synthetic `recipe` owner (see
// findActionOwner), so it arms through the generic armAction — exactly like
// travel delegates through armTravel. The only craft-specific step is the
// recipeCraftable gate (inputs + station capability), which armAction's
// take-gate doesn't cover; once that passes the compiled recipe Action already
// carries `in:`→take, so armAction's own affordability check never trips
// (this ArmResult never comes back armed: false today).
export function armCraft(recipeId: string, registry: Registry, state: GameState): ArmResult {
  const recipe = registry.recipes.get(recipeId);
  if (!recipe) throw new RuntimeError(`unknown recipe: ${recipeId}`);
  if (!recipeCraftable(recipe, registry, state)) throw new RuntimeError(`recipe not craftable: ${recipeId}`);
  const action = registry.recipeActions.get(recipeId)!;
  return armAction('recipe', recipeId, action.label, registry, state);
}

// Side-effect-free probe delegating to actionFirstUnit through the `recipe`
// owner. Returns 0 if the recipe (or its compiled action) isn't found.
export function craftFirstUnit(recipeId: string, registry: Registry, state: GameState): number {
  const action = registry.recipeActions.get(recipeId);
  if (!action) return 0;
  return actionFirstUnit('recipe', recipeId, action.label, registry, state);
}

export function craft(recipeId: string, registry: Registry, state: GameState): void {
  const armed = armCraft(recipeId, registry, state);
  if (!armed.armed) return;
  resolve(state, registry, state.time + armed.firstUnit);
}
