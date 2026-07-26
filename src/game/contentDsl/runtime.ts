import { ActionResult } from './actionResult';
import { Condition, Reference } from './condition';
import { Choice, Dialogue, DialogueNode, TextSegment } from './dialogue';
import { Action, Entity, entitySchema } from './entity';
import { Item, itemSchema } from './item';
import { Location, locationSchema } from './location';
import { parseModule } from './module';
import { Recipe, recipeSchema } from './recipe';
import { scopeEntity } from './scope';
import { Authored, hydrateSection } from './section';
import { Skill, skillSchema } from './skill';
import { Stat, statSchema } from './stat';
import { TagClause } from './tagClause';
import { Test } from './test';
import { humanize } from './values';

export class RuntimeError extends Error {}

// A repeating/spannable action in flight: a sequence of attempts against one
// target with `healthRemaining` (a "fight"). `progress` is seconds elapsed
// toward the *next attempt*, not an absolute deadline, so a mid-flight speed
// change re-maps the remaining progress instead of rewriting a deadline.
// `attemptsMade`/`healthRemaining` let a split mid-fight resume exactly.
export interface ActiveAction {
  ownerRef: string; // "<obj>.<objId>", e.g. "entity.oven"
  actionLabel: string;
  progress: number;
  repeating: boolean;
  healthRemaining: number;
  attemptsMade: number;
}

// A timed stat modifier (from eating food, etc). `added` sums flat onto the
// stat's base; `increased` sums as a fraction applied multiplicatively (see
// statValue).
export interface ActiveBuff {
  statId: string;
  amount: number;
  kind: 'added' | 'increased';
  expiresAt: number;
}

export interface GameState {
  flags: Record<string, boolean | number>;
  inventory: Record<string, number>;
  location: string;
  visits: Record<string, number>;
  xp: Record<string, number>;
  log: string[];
  time: number;
  activeAction: ActiveAction | null;
  activeBuffs: Record<string, ActiveBuff>;
  // Deterministic PRNG cursor (LCG state), advanced only when resolving an
  // attempt of an `accuracy` action — deterministic actions never draw. Living
  // in state (not a parameter) counts draws in attempt order regardless of how
  // a caller splits a resolve() span; see the associativity invariant on
  // resolve().
  rng: number;
  player: { name: string; race: string };
  // Set by `open-modal`, cleared once the driver (session/play-cli) collects
  // whatever the modal needed and calls back in (e.g. submitModal).
  pendingModal?: string;
}

// Nonzero seed: an LCG degenerates only at a genuine fixed point, which this
// seed/multiplier/increment combination avoids.
const DEFAULT_RNG_SEED = 20260718;

export function createGameState(location = ''): GameState {
  return { flags: {}, inventory: {}, location, visits: {}, xp: {}, log: [], time: 0, activeAction: null, activeBuffs: {}, rng: DEFAULT_RNG_SEED, player: { name: '', race: '' } };
}

// A small LCG (same shape as glibc's rand()): advances state.rng and returns a
// value in [0, 1).
const RNG_MULTIPLIER = 1103515245;
const RNG_INCREMENT = 12345;
const RNG_MODULUS = 2147483648; // 2^31

function nextRandom(state: GameState): number {
  state.rng = (state.rng * RNG_MULTIPLIER + RNG_INCREMENT) % RNG_MODULUS;
  return state.rng / RNG_MODULUS;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// The single seam through which simulated time advances: the pure runtime
// never reads a real clock, it only moves forward when something calls this.
export function advanceTime(state: GameState, seconds: number): void {
  if (seconds < 0) throw new RuntimeError(`advanceTime: seconds must be non-negative, got ${seconds}`);
  state.time += seconds;
}

export interface Registry {
  entities: Map<string, Entity>;
  locations: Map<string, Location>;
  items: Map<string, Item>;
  stats: Map<string, Stat>;
  skills: Map<string, Skill>;
  recipes: Map<string, Recipe>;
  // Each recipe's compiled Action form (see recipeAction), built once at load
  // and looked up by findActionOwner('recipe', ...).
  recipeActions: Map<string, Action>;
  dialogues: Map<string, Dialogue>;
  dialoguesByOwner: Map<string, Dialogue>;
  tests: Map<string, Test>;
}

export function loadModule(source: string): Registry {
  const registry: Registry = {
    entities: new Map(),
    locations: new Map(),
    items: new Map(),
    stats: new Map(),
    skills: new Map(),
    recipes: new Map(),
    recipeActions: new Map(),
    dialogues: new Map(),
    dialoguesByOwner: new Map(),
    tests: new Map(),
  };

  for (const section of parseModule(source)) {
    switch (section.kind) {
      case 'entity': {
        const entity = scopeEntity(hydrateSection(section.value as Authored<Entity>, entitySchema));
        registry.entities.set(entity.id, entity);
        break;
      }
      case 'location': {
        const location = hydrateSection(section.value as Authored<Location>, locationSchema);
        registry.locations.set(location.id, location);
        break;
      }
      case 'item': {
        const item = hydrateSection(section.value as Authored<Item>, itemSchema);
        registry.items.set(item.id, item);
        break;
      }
      case 'stat': {
        const stat = hydrateSection(section.value as Authored<Stat>, statSchema);
        registry.stats.set(stat.id, stat);
        break;
      }
      case 'skill': {
        const skill = hydrateSection(section.value as Authored<Skill>, skillSchema);
        registry.skills.set(skill.id, skill);
        break;
      }
      case 'recipe': {
        const recipe = hydrateSection(section.value as Authored<Recipe>, recipeSchema);
        registry.recipes.set(recipe.id, recipe);
        registry.recipeActions.set(recipe.id, recipeAction(recipe));
        break;
      }
      case 'dialogue': {
        const dialogue = section.value as Dialogue;
        registry.dialogues.set(dialogue.id, dialogue);
        if (dialogue.owner) registry.dialoguesByOwner.set(dialogue.owner, dialogue);
        break;
      }
      case 'test': {
        const test = section.value as Test;
        registry.tests.set(test.id, test);
        break;
      }
    }
  }
  return registry;
}

// References are flat dotted keys, not nested lookups (grammar.md "References");
// the one exception the engine maintains is `<node-name>.visits`.
function resolveReference(reference: Reference, state: GameState): boolean | number | string | undefined {
  const { path } = reference;
  if (path.length === 1 && path[0] === 'time') return state.time;
  if (path.length === 2 && path[1] === 'visits') return state.visits[path[0]] ?? 0;
  if (path.length === 2 && path[0] === 'player') return state.player[path[1] as 'name' | 'race'];
  return state.flags[path.join('.')];
}

function truthy(value: boolean | number | string | undefined): boolean {
  return value !== undefined && value !== false && value !== 0 && value !== '';
}

export function evaluateCondition(condition: Condition, state: GameState): boolean {
  switch (condition.kind) {
    case 'reference':
      return truthy(resolveReference(condition.reference, state));
    case 'comparison': {
      const left = resolveReference(condition.left, state);
      const value = typeof left === 'number' ? left : Number(left ?? 0);
      switch (condition.operator) {
        case '>':
          return value > condition.right;
        case '<':
          return value < condition.right;
        case '>=':
          return value >= condition.right;
        case '<=':
          return value <= condition.right;
        case '=':
          return value === condition.right;
      }
      break;
    }
    case 'not':
      return !evaluateCondition(condition.condition, state);
    case 'and':
      return condition.conditions.every((c) => evaluateCondition(c, state));
    case 'or':
      return condition.conditions.some((c) => evaluateCondition(c, state));
    case 'has':
      return (state.inventory[condition.item] ?? 0) >= condition.count;
  }
}

export function describeCondition(condition: Condition): string {
  switch (condition.kind) {
    case 'reference':
      return condition.reference.path.join('.');
    case 'comparison':
      return `${condition.left.path.join('.')} ${condition.operator} ${condition.right}`;
    case 'not':
      return `not ${describeCondition(condition.condition)}`;
    case 'and':
      return condition.conditions.map(describeCondition).join(' and ');
    case 'or':
      return condition.conditions.map(describeCondition).join(' or ');
    case 'has':
      return condition.count === 1 ? `has ${condition.item}` : `has ${condition.count} ${condition.item}`;
  }
}

export function applyResult(result: ActionResult, state: GameState): void {
  switch (result.kind) {
    case 'say':
      state.log.push(result.text);
      break;
    case 'set':
      state.flags[result.variable] = true;
      break;
    case 'unset':
      delete state.flags[result.variable];
      break;
    case 'add': {
      const current = state.flags[result.variable];
      const base = typeof current === 'number' ? current : 0;
      state.flags[result.variable] = base + result.amount;
      break;
    }
    case 'give':
      state.inventory[result.item] = (state.inventory[result.item] ?? 0) + (result.amount ?? 1);
      break;
    case 'take':
      state.inventory[result.item] = Math.max(0, (state.inventory[result.item] ?? 0) - (result.amount ?? 1));
      break;
    case 'xp':
      state.xp[result.skill] = (state.xp[result.skill] ?? 0) + result.amount;
      break;
    case 'relocate':
      state.location = result.location;
      break;
    case 'discover':
      state.flags[`${result.location}.discovered`] = true;
      break;
    case 'open-modal':
      state.log.push(`modal:${result.modal}`);
      state.pendingModal = result.modal;
      break;
  }
}

export function renderSegments(segments: TextSegment[], state: GameState): string {
  return segments
    .map((segment) => {
      switch (segment.kind) {
        case 'literal':
          return segment.text;
        case 'interpolate':
          return String(resolveReference(segment.reference, state) ?? '');
        case 'conditional':
          return evaluateCondition(segment.condition, state) ? segment.text : '';
      }
    })
    .join('');
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
function runSteps(dialogue: Dialogue, node: DialogueNode, state: GameState, start: number, replay: boolean): DialogueSession {
  for (let i = start; i < node.steps.length; i++) {
    const step = node.steps[i];
    switch (step.kind) {
      case 'say':
        if (replay) state.log.push(renderSegments(step.segments, state));
        break;
      case 'effect':
        if (replay) applyResult(step.result, state);
        break;
      case 'goto':
        return enterNode(dialogue, findNode(dialogue, step.target), state);
      case 'menu':
        return { dialogue, node, resumeIndex: i + 1, replay, choices: step.choices };
    }
  }
  return { dialogue, node, resumeIndex: node.steps.length, replay, choices: null };
}

// On a revisit, only a `sticky` node replays its beats and effects; otherwise
// they fire once and later visits show `again` instead.
function enterNode(dialogue: Dialogue, node: DialogueNode, state: GameState): DialogueSession {
  const visit = (state.visits[node.name] = (state.visits[node.name] ?? 0) + 1);
  const replay = visit === 1 || node.sticky === true;
  if (!replay && node.again) state.log.push(renderSegments(node.again, state));
  return runSteps(dialogue, node, state, 0, replay);
}

export function talk(entityId: string, registry: Registry, state: GameState): DialogueSession {
  const dialogue = registry.dialoguesByOwner.get(entityId);
  if (!dialogue) throw new RuntimeError(`no dialogue owned by entity: ${entityId}`);

  let chosen: DialogueNode | undefined;
  for (const node of dialogue.nodes) {
    if (node.when && evaluateCondition(node.when, state)) chosen = node;
  }
  if (!chosen) throw new RuntimeError(`no reachable node in dialogue: ${dialogue.id}`);
  return enterNode(dialogue, chosen, state);
}

export function choose(text: string, session: DialogueSession, state: GameState): DialogueSession {
  if (!session.choices) throw new RuntimeError('no active menu to choose from');
  const match = session.choices.find((c) => (!c.when || evaluateCondition(c.when, state)) && renderSegments(c.segments, state) === text);
  if (!match) throw new RuntimeError(`no choice matches: ${JSON.stringify(text)}`);

  for (const effect of match.effects) applyResult(effect, state);
  if (match.goto) return enterNode(session.dialogue, findNode(session.dialogue, match.goto), state);
  return runSteps(session.dialogue, session.node, state, session.resumeIndex, session.replay);
}

function findActionOwner(obj: string, objId: string, registry: Registry): unknown {
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
    default:
      return undefined;
  }
}

function parseOwnerRef(ownerRef: string): { obj: string; objId: string } {
  const dot = ownerRef.indexOf('.');
  return { obj: ownerRef.slice(0, dot), objId: ownerRef.slice(dot + 1) };
}

function findActiveAction(active: ActiveAction, registry: Registry): Action {
  const { obj, objId } = parseOwnerRef(active.ownerRef);
  const owner = findActionOwner(obj, objId, registry) as { actions?: Action[] } | undefined;
  if (!owner) throw new RuntimeError(`unknown ${obj}: ${objId}`);
  const action = owner.actions?.find((a) => a.label === active.actionLabel);
  if (!action) throw new RuntimeError(`unknown action ${JSON.stringify(active.actionLabel)} on ${active.ownerRef}`);
  return action;
}

// base + Σ(added), then × (1 + Σ(increased)). An active buff is just another
// modifier source alongside the stat's own base.
export function statValue(statId: string, state: GameState, registry: Registry): number {
  const base = registry.stats.get(statId)?.base ?? 0;
  let added = 0;
  let increased = 0;
  for (const buff of Object.values(state.activeBuffs)) {
    if (buff.statId !== statId) continue;
    if (buff.kind === 'added') added += buff.amount;
    else increased += buff.amount;
  }
  return (base + added) * (1 + increased);
}

function attemptDuration(action: Action, state: GameState, registry: Registry): number {
  const speed = action.speed ? statValue(action.speed, state, registry) : 1;
  return (action.time ?? 0) / speed;
}

type FightOutcome = 'completion' | 'escape';

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

// How many completions the current inventory can afford. Only the `take:` side
// can bound a repeating action — items have no stack cap in this schema (Pass
// 1), so the output side is treated as unbounded.
function inputLimit(action: Action, state: GameState): number {
  const perCompletion = new Map<string, number>();
  for (const result of action.results) {
    if (result.kind === 'take') perCompletion.set(result.item, (perCompletion.get(result.item) ?? 0) + (result.amount ?? 1));
  }
  let limit = Infinity;
  for (const [item, need] of perCompletion) {
    if (need <= 0) continue;
    limit = Math.min(limit, Math.floor((state.inventory[item] ?? 0) / need));
  }
  return limit;
}

// Applies one action's `results` as if it completed `count` times, in a single
// batch (count can be enormous). Numeric verbs (give/take/xp/add) scale by
// count; one-shot verbs (say/set/unset/relocate/discover/open-modal) fire once.
function applyResultBatch(result: ActionResult, count: number, state: GameState): void {
  switch (result.kind) {
    case 'give':
      state.inventory[result.item] = (state.inventory[result.item] ?? 0) + (result.amount ?? 1) * count;
      return;
    case 'take':
      state.inventory[result.item] = Math.max(0, (state.inventory[result.item] ?? 0) - (result.amount ?? 1) * count);
      return;
    case 'xp':
      state.xp[result.skill] = (state.xp[result.skill] ?? 0) + result.amount * count;
      return;
    case 'add': {
      const current = state.flags[result.variable];
      const base = typeof current === 'number' ? current : 0;
      state.flags[result.variable] = base + result.amount * count;
      return;
    }
    default:
      applyResult(result, state);
  }
}

// Applies `count` fights' worth of one outcome, batched (see applyResultBatch),
// never per fight. `results`/`onSuccess` fire on completion, `onEscape` on
// escape (mutually exclusive per fight). Firing per *fight*, not per segment,
// is what keeps resolve() associative.
function applyFightBatch(action: Action, count: number, outcome: FightOutcome, state: GameState): void {
  if (count <= 0) return;
  if (outcome === 'completion') {
    for (const result of action.results) applyResultBatch(result, count, state);
    for (const result of action.onSuccess ?? []) applyResultBatch(result, count, state);
  } else {
    for (const result of action.onEscape ?? []) applyResultBatch(result, count, state);
  }
}

const EPSILON = 1e-9;

// The earliest instant in [state.time, toTime] at which something discrete
// must happen (a buff expiring, a repeating action running out of input, a
// non-repeating action completing), or toTime if nothing does — what lets
// resolve() cross a huge idle span in one step.
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
    if (!action.accuracy) {
      const { duration, attemptsToResolve } = fightPlan(action, state, registry);
      const remainingAttempts = attemptsToResolve - state.activeAction.attemptsMade;
      if (state.activeAction.repeating) {
        const limit = inputLimit(action, state);
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
  return boundary;
}

// Advances state.time to segEnd for a deterministic action (no accuracy —
// outcome and fight length known in closed form). Whole fights this segment
// covers are applied as one batch; the remainder is carried as
// attemptsMade/healthRemaining/progress for the fight still in flight.
function resolveDeterministicSegment(state: GameState, registry: Registry, action: Action, segEnd: number): void {
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
    applyFightBatch(action, fights, outcome, state);
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

// Advances state.time to segEnd for a stochastic action (accuracy) by
// simulating attempt-by-attempt, drawing nextRandom(state) once per attempt.
// A fight's length is random, so this can't be batched; O(attempts) is bounded
// by segment length and input affordability. Draws happen in strict attempt
// order off state.rng, which keeps this path associative (see resolve()).
function resolveStochasticSegment(state: GameState, registry: Registry, action: Action, segEnd: number): void {
  const active = state.activeAction!;

  for (;;) {
    const { duration, abilityAmount, escapeAfter } = fightParams(action, state, registry);
    if (duration <= 0) {
      throw new RuntimeError(`action ${active.ownerRef}.${active.actionLabel} resolved a non-positive attempt duration (${duration}) — give it a positive time: or a positive speed stat`);
    }
    if (active.repeating && inputLimit(action, state) <= 0) {
      state.activeAction = null;
      return;
    }

    const timeForNextAttempt = duration - active.progress;
    if (state.time + timeForNextAttempt > segEnd) {
      // The next attempt wouldn't finish within this segment — accrue
      // partial progress up to segEnd and stop; a later resolve() call picks
      // up exactly here.
      const elapsed = segEnd - state.time;
      active.progress += elapsed;
      advanceTime(state, elapsed);
      return;
    }

    advanceTime(state, timeForNextAttempt);
    active.progress = 0;
    active.attemptsMade++;
    const accuracyValue = clamp01(statValue(action.accuracy!, state, registry));
    const hit = nextRandom(state) < accuracyValue;
    if (hit) active.healthRemaining -= abilityAmount;

    // Outcome is decided per attempt, not via the deterministic plan: health
    // exhaustion means completion; running out of attempts first means escape.
    let fightOutcome: FightOutcome | null = null;
    if (active.healthRemaining <= EPSILON) fightOutcome = 'completion';
    else if (active.attemptsMade >= escapeAfter) fightOutcome = 'escape';

    if (fightOutcome) {
      applyFightBatch(action, 1, fightOutcome, state);
      if (active.repeating) {
        active.healthRemaining = action.health ?? 1;
        active.attemptsMade = 0;
      } else {
        state.activeAction = null;
        return;
      }
    }

    if (state.time >= segEnd) return;
  }
}

function resolveSegment(state: GameState, registry: Registry, segEnd: number): void {
  if (!state.activeAction) {
    advanceTime(state, segEnd - state.time);
    return;
  }

  const action = findActiveAction(state.activeAction, registry);
  if (action.accuracy) {
    resolveStochasticSegment(state, registry, action, segEnd);
    return;
  }

  resolveDeterministicSegment(state, registry, action, segEnd);
  advanceTime(state, segEnd - state.time);
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
      // A stochastic action fires and rearms itself inside
      // resolveStochasticSegment — nothing due here for it.
      if (!action.accuracy) {
        if (state.activeAction.repeating) {
          if (inputLimit(action, state) <= 0) {
            state.activeAction = null;
            changed = true;
          }
        } else {
          const { duration, attemptsToResolve, outcome } = fightPlan(action, state, registry);
          // duration <= 0 means every attempt is instantaneous — fire
          // immediately regardless of attemptsMade. This is the only place a
          // zero-`time:` action fires: its toTime === state.time in useAction,
          // so resolveSegment's closed form never runs to advance attemptsMade.
          if (state.activeAction.attemptsMade >= attemptsToResolve || duration <= 0) {
            applyFightBatch(action, 1, outcome, state);
            state.activeAction = null;
            changed = true;
          }
        }
      }
    }

    if (!changed) return;
  }
}

// THE single seam every driver (REPL, session, a future live loop) calls to
// advance simulated time. Core invariant (proved in resolve.test.ts):
// resolve(resolve(s, t1), t2) === resolve(s, t2) for t1 <= t2 — one big jump
// equals any sequence of smaller steps to the same target. It walks forward in
// segments bounded by the next discrete event, never fixed dt steps, so a
// deterministic segment resolves in closed form. Randomness (accuracy actions)
// is drawn only from state.rng at attempt boundaries, in strict attempt order,
// so splitting the call can't change which draw powers which attempt.
export function resolve(state: GameState, registry: Registry, toTime: number): void {
  if (toTime < state.time) throw new RuntimeError(`resolve: toTime (${toTime}) must be >= state.time (${state.time})`);
  applyDueBoundaries(state, registry, state.time);
  while (state.time < toTime) {
    const segEnd = nextBoundary(state, registry, toTime);
    resolveSegment(state, registry, segEnd);
    applyDueBoundaries(state, registry, segEnd);
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
    state.activeBuffs[`${item.id}:${tag.statId}`] = {
      statId: tag.statId,
      amount: tag.percent ? tag.amount / 100 : tag.amount,
      kind: tag.percent ? 'increased' : 'added',
      expiresAt: state.time + duration,
    };
  }
}

export function useAction(obj: string, objId: string, actionId: string, registry: Registry, state: GameState): void {
  const target = findActionOwner(obj, objId, registry) as { actions?: Action[] } | undefined;
  if (!target) throw new RuntimeError(`unknown ${obj}: ${objId}`);

  const action = target.actions?.find((a) => a.label === actionId);
  if (!action) throw new RuntimeError(`unknown action ${JSON.stringify(actionId)} on ${obj}.${objId}`);
  if (action.requires && !evaluateCondition(action.requires, state)) throw new RuntimeError(`action requires unmet: ${obj}.${objId}.${actionId}`);
  if (action.hiddenIf && evaluateCondition(action.hiddenIf, state)) throw new RuntimeError(`action hidden: ${obj}.${objId}.${actionId}`);

  // take: implies affordability — checked once up front for one completion's
  // worth; this only gates whether the action may START. A repeating action
  // running out of input mid-flight is handled in resolve()'s limiting math,
  // not here, and ends quietly without firing onFailure.
  const required = new Map<string, number>();
  for (const r of action.results) if (r.kind === 'take') required.set(r.item, (required.get(r.item) ?? 0) + (r.amount ?? 1));
  let shortfall: string | undefined;
  for (const [item, need] of required) if ((state.inventory[item] ?? 0) < need) { shortfall = item; break; }
  if (shortfall !== undefined) {
    if (action.onFailure) for (const result of action.onFailure) applyResult(result, state);
    else state.log.push(`You don't have enough ${registry.items.get(shortfall)?.title ?? shortfall}.`);
    return;
  }

  const repeating = action.repeating === true;
  const duration = attemptDuration(action, state, registry);
  if (repeating && duration <= 0) {
    throw new RuntimeError(`repeating action ${obj}.${objId}.${actionId} needs a positive time: after speed scaling`);
  }

  state.activeAction = { ownerRef: `${obj}.${objId}`, actionLabel: actionId, progress: 0, repeating, healthRemaining: action.health ?? 1, attemptsMade: 0 };
  // Resolve exactly the first natural unit of play: one full fight when it's
  // closed-form (deterministic), or just the first attempt when it isn't
  // (stochastic — fight length is random, so there's no fixed span to jump to).
  const firstUnit = action.accuracy ? duration : fightPlan(action, state, registry).attemptsToResolve * duration;
  resolve(state, registry, state.time + firstUnit);

  if (obj === 'item' && !repeating && required.has(objId)) {
    const item = registry.items.get(objId);
    if (item) grantFoodBuff(item, state);
  }
}

// Compiles a recipe into an Action so a craft runs through the same
// resolve()/fight machinery as a repeating entity action: a single-attempt
// (health: 1) fight whose "target" is the input stack. Called once per recipe
// at load (see the `recipe` case above).
function recipeAction(recipe: Recipe): Action {
  const takes: ActionResult[] = recipe.in.map((q) => ({ kind: 'take', item: q.item, amount: q.amount }));
  const gives: ActionResult[] = recipe.out.map((q) => ({ kind: 'give', item: q.item, amount: q.amount }));
  const results: ActionResult[] = [...takes, ...gives];
  if (recipe.skill) results.push({ kind: 'xp', skill: recipe.skill.skill, amount: recipe.skill.amount });
  if (recipe.say) results.push({ kind: 'say', text: recipe.say });

  const time = recipe.time ?? 0;
  const action: Action = {
    label: `Craft ${humanize(recipe.id)}`,
    results,
    time,
    speed: recipe.speed,
    accuracy: recipe.accuracy,
    health: 1,
    repeating: time > 0,
  };

  if (recipe.accuracy) {
    // A craft is a single-attempt fight: a miss fails the whole craft to
    // `burnt` instead of retrying. The fail path consumes the SAME inputs as
    // success, so inputLimit (which reads only `results`) still bounds a
    // repeating burn-capable craft.
    action.escapeAfter = 1;
    const burnt: ActionResult[] = recipe.burnt.map((q) => ({ kind: 'give', item: q.item, amount: q.amount }));
    action.onEscape = [...takes, ...burnt];
  }

  return action;
}

export function recipeCraftable(recipe: Recipe, registry: Registry, state: GameState): boolean {
  for (const input of recipe.in) if ((state.inventory[input.item] ?? 0) < (input.amount ?? 1)) return false;
  if (recipe.requiresCapability) {
    const loc = registry.locations.get(state.location);
    if (!loc) return false;
    const provided = loc.entities.some((entityId) => registry.entities.get(entityId)?.capabilities.includes(recipe.requiresCapability!));
    if (!provided) return false;
  }
  return true;
}

// Mirrors useAction (arm, resolve the first unit) but skips its take gate —
// recipeCraftable already gates inputs and capability.
export function craft(recipeId: string, registry: Registry, state: GameState): void {
  const recipe = registry.recipes.get(recipeId);
  if (!recipe) throw new RuntimeError(`unknown recipe: ${recipeId}`);
  if (!recipeCraftable(recipe, registry, state)) throw new RuntimeError(`recipe not craftable: ${recipeId}`);

  const action = registry.recipeActions.get(recipeId)!;
  const repeating = action.repeating === true;
  const duration = attemptDuration(action, state, registry);
  if (repeating && duration <= 0) {
    throw new RuntimeError(`repeating recipe ${recipeId} needs a positive time: after speed scaling`);
  }

  state.activeAction = { ownerRef: `recipe.${recipeId}`, actionLabel: action.label, progress: 0, repeating, healthRemaining: action.health ?? 1, attemptsMade: 0 };
  const firstUnit = action.accuracy ? duration : fightPlan(action, state, registry).attemptsToResolve * duration;
  resolve(state, registry, state.time + firstUnit);
}

export interface TestResult {
  passed: boolean;
  failure?: string;
}

export function runTest(testId: string, registry: Registry, state: GameState, stack: readonly string[] = []): TestResult {
  if (stack.includes(testId)) throw new RuntimeError(`cyclic test run: ${[...stack, testId].join(' -> ')}`);
  const test = registry.tests.get(testId);
  if (!test) throw new RuntimeError(`unknown test: ${testId}`);

  let session: DialogueSession | null = null;

  for (const directive of test.directives) {
    switch (directive.kind) {
      case 'run': {
        const result = runTest(directive.test, registry, state, [...stack, testId]);
        if (!result.passed) return result;
        break;
      }
      case 'talk':
        session = talk(directive.entity, registry, state);
        break;
      case 'choose':
        if (!session) throw new RuntimeError('choose with no active dialogue');
        session = choose(directive.text, session, state);
        break;
      case 'use':
        useAction(directive.obj, directive.objId, directive.actionId, registry, state);
        break;
      case 'travel':
        if (!registry.locations.has(directive.location)) throw new RuntimeError(`unknown location: ${directive.location}`);
        state.location = directive.location;
        break;
      case 'craft':
        craft(directive.recipe, registry, state);
        break;
      case 'expect':
        if (!evaluateCondition(directive.condition, state)) return { passed: false, failure: describeCondition(directive.condition) };
        break;
      case 'wait':
        resolve(state, registry, state.time + directive.seconds);
        break;
    }
  }
  return { passed: true };
}
