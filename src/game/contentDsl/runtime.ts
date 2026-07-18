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

export class RuntimeError extends Error {}

// A spannable/repeating action currently in flight. `progress` is seconds
// already elapsed toward the *next* completion — not an absolute deadline —
// so a mid-flight speed change just changes how the remaining progress maps
// to a completion instant, instead of requiring the deadline to be rewritten.
export interface ActiveAction {
  ownerRef: string; // "<obj>.<objId>", e.g. "entity.oven"
  actionLabel: string;
  progress: number;
  repeating: boolean;
}

// A timed stat modifier (from eating food, etc). `kind: 'added'` sums flat
// onto the stat's base; `kind: 'increased'` sums as a fraction multiplied
// across the total (see statValue below) — the same two-bucket stacking
// legacy stat modifiers used.
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
}

export function createGameState(location = ''): GameState {
  return { flags: {}, inventory: {}, location, visits: {}, xp: {}, log: [], time: 0, activeAction: null, activeBuffs: {} };
}

// THE single seam through which simulated time advances. Live drivers (a
// wall-clock loop, an offline-catch-up calculation) will later inject real
// elapsed seconds here, and timed-buff expiry will later plug in here too —
// the pure runtime itself never reads a real clock; it only ever moves
// forward when something calls this.
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

// References are flat dotted keys by convention, not nested lookups (see grammar.md
// "References") — the one exception the engine itself maintains is `<node-name>.visits`.
function resolveReference(reference: Reference, state: GameState): boolean | number | undefined {
  const { path } = reference;
  if (path.length === 1 && path[0] === 'time') return state.time;
  if (path.length === 2 && path[1] === 'visits') return state.visits[path[0]] ?? 0;
  return state.flags[path.join('.')];
}

function truthy(value: boolean | number | undefined): boolean {
  return value !== undefined && value !== false && value !== 0;
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

// base + Σ(added modifiers), then × (1 + Σ(increased modifiers)) — mirrors
// the legacy engine's stat-modifier stacking rule (src/game/characterStats.ts),
// re-expressed on the contentDsl schema. An active buff is just another
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

function actionDuration(action: Action, state: GameState, registry: Registry): number {
  const speed = action.speedStat ? statValue(action.speedStat, state, registry) : 1;
  return (action.time ?? 0) / speed;
}

// How many completions' worth of input the current inventory can afford.
// Items have no finite stack/inventory cap in this schema (Pass 1), so only
// the `take:` side can ever bound a repeating action — the output side is
// treated as unbounded rather than inventing a cap the schema doesn't have.
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

// Applies one action's `results` as though it completed `count` times, in a
// single batch — never by looping `count` times (count can be enormous).
// Numeric verbs (give/take/xp/add) scale by count; one-shot log-like verbs
// (say, set, unset, relocate, discover, open-modal) fire at most once per
// batch, so a large K never spams the log with repeated identical lines.
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

function applyActionCompletions(action: Action, count: number, state: GameState): void {
  if (count <= 0) return;
  for (const result of action.results) applyResultBatch(result, count, state);
  // onSuccess batches per completion exactly like results — numeric verbs
  // (give/take/xp/add) scale by count, log-like verbs fire once. Firing it
  // once per *segment* instead would break associativity: the live driver
  // (many small resolve() calls) would fire it far more often than the REPL
  // (one big call) — the exact REPL/live divergence resolve() exists to prevent.
  for (const result of action.onSuccess ?? []) applyResultBatch(result, count, state);
}

const EPSILON = 1e-9;

// The earliest instant in [state.time, toTime] at which something discrete
// needs to happen: a buff expiring, a repeating action running out of
// input, or a non-repeating action completing. Returns toTime if nothing
// discrete happens before it — that's what lets resolve() cross a huge span
// of idle time in a single step.
function nextBoundary(state: GameState, registry: Registry, toTime: number): number {
  let boundary = toTime;
  for (const buff of Object.values(state.activeBuffs)) {
    if (buff.expiresAt < boundary) boundary = buff.expiresAt;
  }
  if (state.activeAction) {
    const action = findActiveAction(state.activeAction, registry);
    const duration = actionDuration(action, state, registry);
    if (state.activeAction.repeating) {
      const limit = inputLimit(action, state);
      if (Number.isFinite(limit)) {
        const runway = limit * duration - state.activeAction.progress;
        const limitInstant = state.time + Math.max(0, runway);
        if (limitInstant < boundary) boundary = limitInstant;
      }
    } else {
      const completionInstant = state.time + Math.max(0, duration - state.activeAction.progress);
      if (completionInstant < boundary) boundary = completionInstant;
    }
  }
  return boundary;
}

// Advances state.time to segEnd, applying a repeating action's completions
// in closed form (one floor() division for the whole segment, however many
// completions that represents) instead of looping per completion. A
// non-repeating action just accrues progress here; its completion fires as
// a boundary event (see applyDueBoundaries) once progress reaches duration.
function resolveSegment(state: GameState, registry: Registry, segEnd: number): void {
  if (!state.activeAction) {
    advanceTime(state, segEnd - state.time);
    return;
  }

  const action = findActiveAction(state.activeAction, registry);
  const segLen = segEnd - state.time;

  if (state.activeAction.repeating) {
    const duration = actionDuration(action, state, registry);
    if (duration <= 0) {
      throw new RuntimeError(`repeating action ${state.activeAction.ownerRef}.${state.activeAction.actionLabel} resolved a non-positive duration (${duration}) — give it a positive time: or a positive speed stat`);
    }
    const completions = Math.floor((state.activeAction.progress + segLen) / duration);
    applyActionCompletions(action, completions, state);
    state.activeAction.progress = state.activeAction.progress + segLen - completions * duration;
  } else {
    state.activeAction.progress += segLen;
  }
  advanceTime(state, segLen);
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
      if (state.activeAction.repeating) {
        if (inputLimit(action, state) <= 0) {
          state.activeAction = null;
          changed = true;
        }
      } else {
        const duration = actionDuration(action, state, registry);
        if (state.activeAction.progress + EPSILON >= duration) {
          applyActionCompletions(action, 1, state);
          state.activeAction = null;
          changed = true;
        }
      }
    }

    if (!changed) return;
  }
}

// THE single seam every driver (REPL, session, a future live loop) calls
// through to advance simulated time. The invariant that makes this safe to
// call at any granularity: resolve(resolve(s, t1), t2) for t1 <= t2 is
// bit-for-bit identical to resolve(s, t2) — one big jump equals any sequence
// of smaller steps summing to the same target. It walks forward in SEGMENTS
// bounded by the next discrete event, never in fixed dt steps, so a
// segment's completions are always computed in closed form.
//
// `random` is accepted but unused in Pass 1 — every action here is
// deterministic (no `chance:`). A later pass adding chance-based actions
// would draw from it only at a discrete completion instant (never per fixed
// step, and never inside the closed-form batch math above, since a
// chance-gated completion can't be batched — each one becomes its own
// boundary).
export function resolve(state: GameState, registry: Registry, toTime: number, random?: () => number): void {
  void random;
  if (toTime < state.time) throw new RuntimeError(`resolve: toTime (${toTime}) must be >= state.time (${state.time})`);
  applyDueBoundaries(state, registry, state.time);
  while (state.time < toTime) {
    const segEnd = nextBoundary(state, registry, toTime);
    resolveSegment(state, registry, segEnd);
    applyDueBoundaries(state, registry, segEnd);
  }
}

// The inert `food, +N <stat>, <duration>` item tags become live here: an
// item action that consumes (take:s) the very item it's defined on is what
// "eating" means in this schema, and — if the item carries the `food`
// keyword tag — grants each of its stat-bonus tags as a timed buff whose
// clock starts the moment eating completes.
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

  // Same "take: implies affordability" gate as before, checked once up
  // front for a single completion's worth — this only gates whether the
  // action is allowed to *start* at all. A repeating action running out of
  // input mid-flight is handled inside resolve()'s K-limiting math instead,
  // not here, and doesn't fire onFailure — it just quietly ends.
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
  const duration = actionDuration(action, state, registry);
  if (repeating && duration <= 0) {
    throw new RuntimeError(`repeating action ${obj}.${objId}.${actionId} needs a positive time: after speed scaling`);
  }

  state.activeAction = { ownerRef: `${obj}.${objId}`, actionLabel: actionId, progress: 0, repeating };
  resolve(state, registry, state.time + duration);

  if (obj === 'item' && !repeating && required.has(objId)) {
    const item = registry.items.get(objId);
    if (item) grantFoodBuff(item, state);
  }
}

export function recipeCraftable(recipe: Recipe, registry: Registry, state: GameState): boolean {
  for (const input of recipe.in) if ((state.inventory[input.item] ?? 0) < (input.amount ?? 1)) return false;
  if (recipe.station) {
    const loc = registry.locations.get(state.location);
    if (!loc || !loc.entities.includes(recipe.station)) return false;
  }
  return true;
}

export function craft(recipeId: string, registry: Registry, state: GameState): void {
  const recipe = registry.recipes.get(recipeId);
  if (!recipe) throw new RuntimeError(`unknown recipe: ${recipeId}`);
  if (!recipeCraftable(recipe, registry, state)) throw new RuntimeError(`recipe not craftable: ${recipeId}`);
  for (const input of recipe.in) applyResult({ kind: 'take', item: input.item, amount: input.amount }, state);
  for (const output of recipe.out) applyResult({ kind: 'give', item: output.item, amount: output.amount }, state);
  if (recipe.skill) applyResult({ kind: 'xp', skill: recipe.skill.skill, amount: recipe.skill.amount }, state);
  if (recipe.say) state.log.push(recipe.say);
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
