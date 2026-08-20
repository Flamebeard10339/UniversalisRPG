import { endJourney } from './actionEnd';
import { RuntimeError } from './error';
import { Action } from '../content/sections/entity';
import { DISCOVERED, Location } from '../content/sections/location';
import { actionFirstUnit, actionVisible, ArmResult, armAction, armCraft, armFightAction, armJourney, craft, describeCondition, encounterView, EncounterView, equip, evaluateCondition, GameState, initResources, recipeCraftable, requiresMet, resolve, statValue, talk, unequip, useAction, useFight, walkTo } from './runtime';
import { createGameState, type Journey } from './state';
import { itemCopies, Growth, grownItems } from './itemInstance';
import { grow } from './growth';
import { planeReports, type PlaneFocus, type PlaneReport } from './planeReport';
import { actionAddress } from '../content/sections/action';
import { parseOwnerRef, TRAVEL_PAIR } from './actions';
import { relocateTo, spreadDiscovery } from './effects';
import { reachable } from './journey';
import { playerCadence } from './encounter';
import { armedAction } from './roster';
import { hasPool } from './stats';
import { PLAYER } from './state';
import { declaredId } from '../content/sections/entity';
import { isTwoSided } from '../grammar/action';
import { standing } from './population';
import { truthy } from './conditions';
import { answerModal, Modal, modalFocus, pruneModals, publishModal } from './modals';
import { dialogueFrame, openModal, openModalNamed, topModal } from './modalStack';
import { carriedEntries, wornRows, type CarriedEntry, type WornRow } from './carried';
import { Registry } from '../content/registry';
import { type ParsedSave } from '../content/sections/save';
import { DEFAULT_LANGUAGE } from '../grammar/section';
import { ResourceDisplay } from '../content/sections/resource';
import { compareSave, initialState, loadSave, pruneStateForRegistry, serializeSave } from './save';
import type { PruneWarning } from './pruning';
import { Directive, parseUseChoiceId, useChoiceId } from '../content/sections/test';
import { printDirective } from '../content/serialize';
import { Answer, AnswerTable, Localized, Localizer, localizerOf } from './localized';
import { skillLevel, xpForLevel } from './skills';
import { fromMilliUnits, msToSeconds, secondsToMs } from './units';
import { say } from './said';

export type PlayChoiceKind = 'talk' | 'action' | 'travel' | 'craft';

export interface PlayChoice {
  id: Answer;
  kind: PlayChoiceKind;
  label: Localized;
  detail?: Localized;
  leadsTo?: Answer;
  legs?: number;
}

export interface PlayAction {
  label: Localized;
  progress: number;
  attempts: number;
  targeted: boolean;
  completion: number;
}

export interface CountedRow {
  id: Answer;
  title: Localized;
  value: number;
}

export interface SkillRow extends CountedRow {
  level: number;
  earned: number;
  span: number;
}

export interface PlayStatus {
  location: { id: Answer; title: Localized; description?: Localized };
  entities: Array<{ id: Answer; title: Localized; examine?: Localized }>;
  choices: PlayChoice[];
  time: number;
  resources: Array<{ id: Answer; title: Localized; current: number; max: number; display: ResourceDisplay }>;
  encounter: EncounterView | null;
  modals: Modal[];
  inventory: AnswerTable<number>;
  grown: AnswerTable<Answer>;
  carried: CarriedEntry[];
  planes: PlaneReport[];
  focus: PlaneFocus | null;
  equipment: WornRow[];
  xp: SkillRow[];
  stats: CountedRow[];
  flags: AnswerTable<boolean | number>;
  discovered: Array<{ id: Answer; title: Localized; x: number; y: number; z: number; adjacent: Array<{ to: Answer; open: boolean }> }>;
  journey: Journey | null;
  player: { name: Answer; race: Answer };
  action: PlayAction | null;
}

export interface PlayView extends PlayStatus {
  said: Localized[];
}

export interface PlaySession {
  readonly registry: Registry;
}

interface SessionInternals {
  registry: Registry;
  state: GameState;
  logCursor: number;
}

const INTERNALS = new WeakMap<PlaySession, SessionInternals>();

function own(session: PlaySession): SessionInternals {
  const internals = INTERNALS.get(session);
  if (!internals) throw new RuntimeError('this is not a session startSession handed out, so it plays nothing');
  return internals;
}

export const sessionLocalizer = (session: PlaySession): Localizer => localizerOf(session.registry, stateOf(session));

function stateOf(session: PlaySession): GameState {
  return own(session).state;
}

function sessionOver(registry: Registry, state: GameState): PlaySession {
  const internals: SessionInternals = { registry, state, logCursor: state.log.length };
  const session: PlaySession = { get registry() { return internals.registry; } };
  INTERNALS.set(session, internals);
  return session;
}

type Actable = { actions?: Action[] };

function actionAvailable(action: Action, state: GameState): boolean {
  if (isTwoSided(action)) return false;
  return requiresMet(action, state) && actionVisible(action, state);
}

function availableActions(owner: Actable, state: GameState): Action[] {
  return (owner.actions ?? []).filter((action) => actionAvailable(action, state));
}

function movesTo(action: Action): string | undefined {
  const onlyMovement = action.results.every((r) => r.kind === 'relocate' || r.kind === 'say');
  const noBranches = !action.onSuccess && !action.onFailure && !action.onUnfinished;
  if (!onlyMovement || !noBranches) return undefined;
  const relocate = action.results.find((r) => r.kind === 'relocate');
  return relocate?.kind === 'relocate' ? relocate.location : undefined;
}

function isFreeTravelAction(action: Action, target: string): boolean {
  return movesTo(action) === target;
}

function entityAliasesTravelTo(location: Location, target: string, registry: Registry, state: GameState): boolean {
  return standingHere(registry, state, location).some((entityId) => {
    const entity = registry.entities.get(entityId);
    if (!entity) return false;
    return availableActions(entity, state).some((action) => isFreeTravelAction(action, target));
  });
}

const standingHere = (registry: Registry, state: GameState, location: Location): string[] => standing(state, registry, location).map((entry) => entry.entity);

function fightChoices(registry: Registry, state: GameState, location: Location): PlayChoice[] {
  const choices: PlayChoice[] = [];
  const player = registry.player;
  if (!player) return choices;
  const localizer = localizerOf(registry, state);
  for (const entityId of standingHere(registry, state, location)) {
    const entity = registry.entities.get(entityId);
    if (!entity) continue;
    for (const action of player.actions) {
      const id = declaredId(action);
      if (id === undefined || !isTwoSided(action) || !action.depletes) continue;
      if (!requiresMet(action, state) || !actionVisible(action, state)) continue;
      if (action.depletes.side === 'their' && !hasPool(state, registry, entityId, action.depletes.id)) continue;
      choices.push({ id: `fight:${id}:${entityId}`, kind: 'action', label: localizer.actionLabel('action', id, action), detail: localizer.title('entity', entityId) });
    }
  }
  return choices;
}

function canTalk(entityId: string, registry: Registry, state: GameState): boolean {
  const dialogue = registry.dialoguesByOwner.get(entityId);
  if (!dialogue) return false;
  return dialogue.nodes.some((node) => node.when && evaluateCondition(node.when, state));
}

function locationChoices(session: PlaySession): PlayChoice[] {
  const { registry } = session;
  const state = stateOf(session);
  const location = registry.locations.get(state.location);
  if (!location) return [];
  const localizer = localizerOf(registry, state);
  const choices: PlayChoice[] = [];

  for (const entityId of standingHere(registry, state, location)) {
    const entity = registry.entities.get(entityId);
    if (!entity) continue;
    if (canTalk(entityId, registry, state)) {
      choices.push({ id: `talk:${entityId}`, kind: 'talk', label: localizer.engine('engine.talk.to', { entity: localizer.title('entity', entityId) }) });
    }
    for (const action of availableActions(entity, state)) {
      const slug = actionAddress(action);
      choices.push({ id: useChoiceId({ kind: 'use', obj: 'entity', objId: entityId, actionId: slug }), kind: 'action', label: localizer.actionLabel('entity', entityId, action), detail: localizer.title('entity', entityId), leadsTo: movesTo(action) });
    }
  }

  choices.push(...fightChoices(registry, state, location));

  for (const action of availableActions(location, state)) {
    const slug = actionAddress(action);
    choices.push({ id: useChoiceId({ kind: 'use', obj: 'location', objId: location.id, actionId: slug }), kind: 'action', label: localizer.actionLabel('location', location.id, action), detail: localizer.title('location', location.id) });
  }

  for (const [itemId] of itemCopies(state)) {
    const item = registry.items.get(itemId);
    if (!item) continue;
    for (const action of availableActions(item, state)) {
      const slug = actionAddress(action);
      choices.push({ id: useChoiceId({ kind: 'use', obj: 'item', objId: itemId, actionId: slug }), kind: 'action', label: localizer.actionLabel('item', itemId, action), detail: localizer.title('item', itemId) });
    }
  }

  for (const recipe of registry.recipes.values()) {
    if (!recipeCraftable(recipe, registry, state)) continue;
    const station = recipe.requiresCapability
      ? standingHere(registry, state, location).find((entityId) => registry.entities.get(entityId)?.capabilities.includes(recipe.requiresCapability!))
      : undefined;
    const detail = station === undefined ? undefined : localizer.title('entity', station);
    choices.push({ id: `craft:${recipe.id}`, kind: 'craft', label: craftLabel(localizer, recipe.id), detail });
  }

  for (const edge of location.adjacent) {
    if (edge.condition && !evaluateCondition(edge.condition, state)) continue;
    if (entityAliasesTravelTo(location, edge.target, registry, state)) continue;
    choices.push({ id: `travel:${edge.target}`, kind: 'travel', label: travelLabel(localizer, edge.target), leadsTo: edge.target, legs: 1 });
  }

  return choices;
}

function journeyChoices(session: PlaySession, local: PlayChoice[]): PlayChoice[] {
  const { registry } = session;
  const state = stateOf(session);
  const localizer = localizerOf(registry, state);
  const already = new Set(local.flatMap((choice) => (choice.leadsTo === undefined ? [] : [choice.leadsTo])));
  const choices: PlayChoice[] = [];

  for (const [target, legs] of reachable(state.location, registry, state)) {
    if (already.has(target)) continue;
    choices.push({ id: `travel:${target}`, kind: 'travel', label: travelLabel(localizer, target), leadsTo: target, legs });
  }

  return choices;
}

const travelLabel = (localizer: Localizer, target: string): Localized => localizer.engine('engine.travel.to', { destination: localizer.title('location', target) });

const craftLabel = (localizer: Localizer, recipe: string): Localized => localizer.engine('engine.craft.label', { recipe: localizer.title('recipe', recipe) });

function computeChoices(session: PlaySession): PlayChoice[] {
  if (stateOf(session).modals.length > 0) return [];
  const local = locationChoices(session);
  return [...local, ...journeyChoices(session, local)];
}

export function choiceToDirective(choice: PlayChoice): Directive {
  switch (choice.kind) {
    case 'talk':
      return { kind: 'talk', entity: choice.id.slice('talk:'.length) };
    case 'action': {
      const fight = /^fight:([a-z0-9.-]+):([a-z0-9.-]+)$/.exec(choice.id);
      if (fight) return { kind: 'use-on', action: fight[1], target: fight[2] };
      const use = parseUseChoiceId(choice.id);
      if (!use) throw new RuntimeError(`malformed action choice id: ${choice.id}`);
      return use;
    }
    case 'travel':
      return { kind: 'travel', location: choice.id.slice('travel:'.length) };
    case 'craft':
      return { kind: 'craft', recipe: choice.id.slice('craft:'.length) };
  }
}

export function startSession(registry: Registry, language: string = DEFAULT_LANGUAGE): PlaySession {
  const state = initialState(registry, language);
  if (!state.location) throw new RuntimeError('no # location is marked starting, so a new game has nowhere to begin');
  spreadDiscovery(state, registry);
  return sessionOver(registry, state);
}

export function adoptRegistry(session: PlaySession, registry: Registry): void {
  const internals = own(session);
  const { state } = internals;
  internals.registry = registry;
  const warnings = pruneStateForRegistry(state, registry);
  for (const warning of warnings) state.log.push(warning.message);
  internals.logCursor = Math.max(0, state.log.length - warnings.length);
  initResources(state, registry);
  spreadDiscovery(state, registry);
}

export function serializeSession(session: PlaySession): string {
  return serializeSave(stateOf(session), session.registry);
}

export function loadSaved(session: PlaySession, saved: ParsedSave): PruneWarning[] {
  const internals = own(session);
  const { registry } = internals;
  const next = createGameState('', internals.state.language);
  const warnings = loadSave(next, saved, registry);
  spreadDiscovery(next, registry);
  standable(registry, next);
  Object.assign(internals.state, next);
  internals.logCursor = Math.max(0, internals.state.log.length - warnings.length);
  return warnings;
}

function standable(registry: Registry, state: GameState): void {
  try {
    sessionStatus(sessionOver(registry, state));
  } catch (error) {
    if (error instanceof RuntimeError) throw error;
    throw new RuntimeError(`this save loads but cannot be played: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export const SAID_HEAD_KEPT = 40;
export const SAID_TAIL_KEPT = 40;

function elideMiddle(localizer: Localizer, said: Localized[]): Localized[] {
  const dropped = said.length - SAID_HEAD_KEPT - SAID_TAIL_KEPT;
  if (dropped <= 0) return said;
  return [...said.slice(0, SAID_HEAD_KEPT), localizer.engine('engine.said.elided', { dropped }), ...said.slice(said.length - SAID_TAIL_KEPT)];
}

export function view(session: PlaySession): PlayView {
  const status = sessionStatus(session);
  const internals = own(session);

  const drained = internals.state.log.splice(0);
  const said = elideMiddle(localizerOf(session.registry, internals.state), drained.slice(internals.logCursor));
  internals.logCursor = 0;

  return { ...status, said };
}

export function sessionStatus(session: PlaySession): PlayStatus {
  const { registry } = session;
  const state = stateOf(session);
  const location = registry.locations.get(state.location);
  if (!location) throw new RuntimeError(`unknown location: ${state.location}`);

  const localizer = localizerOf(registry, state);
  const entities: PlayStatus['entities'] = [];
  for (const entityId of standingHere(registry, state, location)) {
    const entity = registry.entities.get(entityId);
    if (entity) entities.push({ id: entity.id, title: localizer.title('entity', entity.id), examine: entity.examine === undefined ? undefined : localizer.content('entity', entity.id, 'examine') });
  }

  return {
    location: { id: location.id, title: localizer.title('location', location.id), description: location.examine === undefined ? undefined : localizer.content('location', location.id, 'examine') },
    entities,
    choices: computeChoices(session),
    time: msToSeconds(state.time),
    resources: publishResources(state, registry),
    encounter: encounterView(state, registry),
    modals: state.modals.map((frame) => publishModal(frame, state, registry)),
    inventory: Object.fromEntries([...itemCopies(state)].flatMap(([id, { stack }]) => (stack > 0 ? [[id, stack] as const] : []))),
    grown: grownItems(state),
    carried: carriedEntries(state, registry),
    planes: planeReports(registry, state),
    focus: modalFocus(state),
    equipment: wornRows(state, registry),
    xp: [...registry.skills.keys()].map((id) => skillRow(id, state.xp[id] ?? 0, localizer)),
    stats: [...registry.stats.values()].map((stat) => ({ id: stat.id, title: localizer.title('stat', stat.id), value: statValue(stat.id, state, registry) })),
    flags: { ...state.flags },
    discovered: publishDiscovered(state, registry),
    journey: state.journey ? { to: state.journey.to, legs: [...state.journey.legs] } : null,
    player: { ...state.player },
    action: publishAction(state, registry),
  };
}

function skillRow(id: string, value: number, localizer: Localizer): SkillRow {
  const level = skillLevel(value);
  const foot = xpForLevel(level);
  return { id, title: localizer.title('skill', id), value, level, earned: value - foot, span: xpForLevel(level + 1) - foot };
}

export function carriedListing(session: PlaySession): CarriedEntry[] {
  return carriedEntries(stateOf(session), session.registry);
}

function publishDiscovered(state: GameState, registry: Registry): PlayStatus['discovered'] {
  const localizer = localizerOf(registry, state);
  const found = [...registry.locations.values()].filter((each) => truthy(state.flags[`${each.id}.${DISCOVERED}`]));
  const known = new Set(found.map((each) => each.id));
  return found.map((each) => ({
    id: each.id,
    title: localizer.title('location', each.id),
    x: each.x,
    y: each.y,
    z: each.z,
    adjacent: each.adjacent
      .filter((edge) => known.has(edge.target))
      .map((edge) => ({ to: edge.target, open: !edge.condition || evaluateCondition(edge.condition, state) })),
  }));
}

function publishResources(state: GameState, registry: Registry): PlayStatus['resources'] {
  const localizer = localizerOf(registry, state);
  return [...registry.resources.values()]
    .filter((resource) => hasPool(state, registry, PLAYER, resource.id))
    .map((resource) => ({
      id: resource.id,
      title: localizer.title('resource', resource.id),
      current: fromMilliUnits(state.resources[resource.id] ?? 0),
      max: statValue(resource.max, state, registry),
      display: resource.display,
    }));
}

function actionUnderWay(localizer: Localizer, obj: string, objId: string, action: Action): Localized {
  if (obj === 'travel') return travelLabel(localizer, objId.slice(objId.indexOf(TRAVEL_PAIR) + 1));
  if (obj === 'recipe') return craftLabel(localizer, objId);
  return localizer.actionLabel(obj, objId, action);
}

function publishAction(state: GameState, registry: Registry): PlayAction | null {
  const active = state.activeAction;
  if (!active) return null;
  const { obj, objId } = parseOwnerRef(active.ownerRef);
  const cycle = actionFirstUnit(obj, objId, active.actionSlug, registry, state);
  const clock = playerCadence(active);
  const localizer = localizerOf(registry, state);
  const action = armedAction(state, registry);
  return {
    label: actionUnderWay(localizer, obj, objId, action),
    progress: cycle > 0 ? Math.min(1, Math.max(0, clock.progress / cycle)) : 1,
    attempts: clock.attemptsMade,
    targeted: Boolean(action.depletes),
    completion: fromMilliUnits(active.implicitTarget),
  };
}

export function apply(session: PlaySession, choiceId: string): PlayView {
  const choice = computeChoices(session).find((c) => c.id === choiceId);
  if (!choice) throw new RuntimeError(`unavailable choice: ${JSON.stringify(choiceId)}`);
  applyDirective(session, choiceToDirective(choice));
  return view(session);
}

function arm(directive: Directive, registry: Registry, state: GameState): ArmResult | null {
  switch (directive.kind) {
    case 'craft':
      return armCraft(directive.recipe, registry, state);
    case 'use':
      return armAction(directive.obj, directive.objId, directive.actionId, registry, state);
    case 'use-on':
      return armFightAction(directive.action, directive.target, registry, state);
    case 'travel':
      return state.location ? armJourney(directive.location, registry, state) : null;
    case 'run':
    case 'talk':
    case 'choose':
    case 'goto':
    case 'begin':
    case 'assert':
    case 'expect':
    case 'load':
    case 'cancel':
    case 'wait':
    case 'equip':
    case 'unequip':
    case 'feed':
    case 'slot':
    case 'allocate':
    case 'apply':
    case 'refuse':
    case 'open-modal':
    case 'submit-modal':
      return null;
    default: {
      const unreached: never = directive;
      return unreached;
    }
  }
}

export function beginAction(session: PlaySession, choiceId: string): PlayView {
  const choice = computeChoices(session).find((c) => c.id === choiceId);
  if (!choice) throw new RuntimeError(`unavailable choice: ${JSON.stringify(choiceId)}`);
  const directive = choiceToDirective(choice);
  const { registry } = session;
  const state = stateOf(session);

  const armed = arm(directive, registry, state);
  if (armed === null) {
    applyDirective(session, directive);
    return view(session);
  }
  if (armed.armed && armed.firstUnit === 0) resolve(state, registry, state.time);
  return view(session);
}

export function wait(session: PlaySession, seconds: number): PlayView {
  applyDirective(session, { kind: 'wait', seconds });
  return view(session);
}

export function cancelAction(session: PlaySession): PlayView {
  applyDirective(session, { kind: 'cancel' });
  return view(session);
}

export function submitModal(session: PlaySession, answers: Record<string, string>): PlayView {
  answerModal(stateOf(session), session.registry, answers);
  pruneModals(stateOf(session), session.registry);
  return view(session);
}

function choiceIdFor(inner: Extract<Directive, { kind: 'use' | 'use-on' | 'travel' | 'craft' }>): string {
  switch (inner.kind) {
    case 'use':
      return useChoiceId(inner);
    case 'use-on':
      return `fight:${inner.action}:${inner.target}`;
    case 'travel':
      return `travel:${inner.location}`;
    case 'craft':
      return `craft:${inner.recipe}`;
    default: {
      const unreached: never = inner;
      return unreached;
    }
  }
}

export function applyDirective(session: PlaySession, directive: Directive): { failure?: string } {
  const outcome = performDirective(session, directive);
  pruneModals(stateOf(session), session.registry);
  return outcome;
}

function performDirective(session: PlaySession, directive: Directive): { failure?: string } {
  const { registry } = session;
  const state = stateOf(session);

  switch (directive.kind) {
    case 'run':
      throw new RuntimeError('run: is handled by runTest, not applyDirective');
    case 'talk': {
      const cursor = talk(directive.entity, registry, state);
      if (cursor) openModal(state, dialogueFrame(cursor));
      return {};
    }
    case 'choose': {
      if (topModal(state)?.name !== 'dialogue') throw new RuntimeError('choose with no active dialogue');
      answerModal(state, registry, { choice: directive.text });
      return {};
    }
    case 'open-modal':
      openModalNamed(state, directive.modal);
      return {};
    case 'submit-modal':
      answerModal(state, registry, { [directive.key]: directive.value });
      return {};
    case 'use':
      useAction(directive.obj, directive.objId, directive.actionId, registry, state);
      return {};
    case 'use-on':
      useFight(directive.action, directive.target, registry, state);
      return {};
    case 'travel': {
      const refused = walkTo(directive.location, registry, state);
      return refused ? { failure: refused } : {};
    }
    case 'goto': {
      if (!registry.locations.has(directive.location)) throw new RuntimeError(`unknown location: ${directive.location}`);
      endJourney(state);
      relocateTo(state, registry, directive.location);
      return {};
    }
    case 'craft':
      craft(directive.recipe, registry, state);
      return {};
    case 'begin':
      beginAction(session, choiceIdFor(directive.inner));
      return {};
    case 'assert':
      if (!evaluateCondition(directive.condition, state)) return { failure: describeCondition(directive.condition) };
      return {};
    case 'expect': {
      const saved = registry.saves.get(directive.save);
      if (!saved) throw new RuntimeError(`unknown save: ${directive.save}`);
      const diffs = compareSave(state, saved, registry);
      if (diffs.length > 0) return { failure: `save mismatch ${directive.save}: ${diffs.join('; ')}` };
      return {};
    }
    case 'load': {
      const saved = registry.saves.get(directive.save);
      if (!saved) throw new RuntimeError(`unknown save: ${directive.save}`);
      loadSaved(session, saved);
      return {};
    }
    case 'cancel':
      endJourney(state);
      return {};
    case 'wait':
      resolve(state, registry, state.time + secondsToMs(directive.seconds));
      return {};
    case 'equip':
      equip(state, registry, directive.item);
      return {};
    case 'unequip':
      unequip(state, directive.slot);
      return {};
    case 'feed':
    case 'slot':
    case 'allocate':
    case 'apply':
      return grew(session, state, grow(state, registry, directive));
    case 'refuse': {
      const growth = grow(state, registry, directive.inner);
      grew(session, state, growth);
      return growth.ok ? { failure: `${printDirective(directive.inner)} was not refused` } : {};
    }
    default: {
      const unreached: never = directive;
      return unreached;
    }
  }
}

function grew(session: PlaySession, state: GameState, growth: Growth): { failure?: string } {
  if (growth.ok) return {};
  const refused = say(sessionLocalizer(session), growth.refused);
  state.log.push(refused);
  return { failure: refused };
}

export interface TestResult {
  passed: boolean;
  failure?: string;
}

export function runTest(testId: string, registry: Registry, state: GameState, stack: readonly string[] = []): TestResult {
  if (stack.includes(testId)) throw new RuntimeError(`cyclic test run: ${[...stack, testId].join(' -> ')}`);
  const test = registry.tests.get(testId);
  if (!test) throw new RuntimeError(`unknown test: ${testId}`);

  const session = sessionOver(registry, state);

  for (const directive of test.directives) {
    if (directive.kind === 'run') {
      const result = runTest(directive.test, registry, state, [...stack, testId]);
      if (!result.passed) return result;
      continue;
    }
    const result = applyDirective(session, directive);
    if (result.failure) return { passed: false, failure: result.failure };
  }

  const open = topModal(state);
  if (open) return { passed: false, failure: `modal left open: ${open.name}` };

  return { passed: true };
}

export function runSessionTest(session: PlaySession, testId: string): TestResult {
  return runTest(testId, session.registry, stateOf(session));
}
