import { endJourney } from './actionEnd';
import { RuntimeError } from './error';
import { Action } from '../content/sections/entity';
import { DISCOVERED, Location, type Direction } from '../content/sections/location';
import { TOUCHED } from '../content/sections/define';
import { actionProgress, actionVisible, ArmResult, armAction, armCraft, armFightAction, armJourney, craft, describeCondition, encounterView, EncounterView, equip, evaluateCondition, GameState, initResources, recipeCraftable, reachedNow, requiresMet, resolve, resolveUnderWay, settleCarried, UNDER_WAY_LIMIT_HOURS, UNDER_WAY_LIMIT_MS, statValue, talk, unequip, useAction, useFight, walkTo } from './runtime';
import { createGameState, type ActiveAction, type Journey } from './state';
import { itemCopies, Growth, grownItems, packRows } from './itemInstance';
import { swappedOrder } from './packOrder';
import { grow } from './growth';
import { planeReports, type PlaneReport } from './planeReport';
import { actionAddress } from '../content/sections/action';
import { ownerRef, parseOwnerRef } from './state';
import { TRAVEL_PAIR } from './actionLookup';
import { locationNamed, relocateTo, standWhereTheyAre } from './effects';
import { effectiveAdjacent, reachable } from './journey';
import { journal, standingAuthored, type JournalEntry } from './journal';
export { standingLine } from './journal';
export type { JournalEntry, JournalLine, QuestStanding } from './journal';
import { IMPLICIT_TARGET_FULL, playerCadence } from './encounter';
import { armedAction } from './roster';
import { foldStat, hasPool, statFrom, statSources, type StatSources } from './stats';
import { midpoint } from '../grammar/range';
import { PLAYER, PLAYER_FIELDS, PLAYER_SHEET, templateOf, type PlayerField } from './state';
import { heldEffects, type HeldEffect } from './buffs';
export type { HeldEffect } from './buffs';
import { declaredId, isMintedAction } from '../content/sections/entity';
import { isFight } from '../grammar/action';
import { stoodHere, type StoodHere } from './population';
import { truthy, weighing } from './conditions';
import { answerModal, awaitsAnAnswer, Modal, modalFocus, pruneModals, publishModal, WELCOME_BACK, type Focus } from './modals';
import { dialogueFrame, openModal, openModalNamed, openShop, topModal } from './modalStack';
import { heldByForce } from './perform';
import { carriedEntries, wornRows, type CarriedEntry, type WornRow } from './carried';
import { socketsInto, verbsOffered } from './carriedScreen';
import { Registry } from '../content/registry';
import { listedToPlayer } from '../content/sections';
import { type ParsedSave } from '../content/sections/save';
import { DEFAULT_LANGUAGE } from '../grammar/section';
import { ResourceDisplay } from '../content/sections/resource';
import { compareSave, compareSaveOnly, initialState, loadSave, pruneStateForRegistry, serializeSave } from './save';
import type { PruneWarning } from './pruning';
import { choiceId, Directive, isCycles, parseChoiceId, printDirective, printRounds, printTerminator, Terminator } from '../content/sections/test';
import { Answer, AnswerTable, Localized, Localizer, localizerOf } from './localized';
import { skillLevel, xpForLevel } from './skills';
import { fromMilliUnits, msToSeconds, secondsToMs } from './units';
import { say } from './said';
import { spanStart, spanSummary, type SpanStart } from './span';
import { choiceWritten, chosenSetting, isSettingName, settingNamed, settingStands, standingChoice, SETTING_NAMES } from './settings';
import { grouping, offeredBy, type GroupRow } from './grouping';
import type { StatShare } from './statShare';
export type { StatShare } from './statShare';
import { mapGrid } from './tuning';
export type { GroupRow } from './grouping';

export type PlayChoiceKind = 'talk' | 'action' | 'travel' | 'craft' | 'shop';

export interface PlayChoice {
  id: Answer;
  kind: PlayChoiceKind;
  label: Localized;
  of?: Answer;
  detail?: Localized;
  group?: GroupRow;
  leadsTo?: Answer;
  legs?: number;
}

export interface OfferedChoice extends PlayChoice {
  position: number;
}

export function sheetOffers(status: Pick<PlayStatus, 'choices'>): OfferedChoice[] {
  return status.choices.map((choice, at) => ({ ...choice, position: at + 1 })).filter((choice) => (choice.legs ?? 0) <= 1);
}

export interface PlayAction {
  label: Localized;
  of?: Answer;
  detail?: Localized;
  progress: number;
  attempts: number;
  completion: number | null;
  forced?: true;
}

export interface CountedRow {
  id: Answer;
  title: Localized;
  value: number;
}

export interface StatRow extends CountedRow {
  from: StatShare[];
  group?: GroupRow;
}

export interface SkillRow extends CountedRow {
  level: number;
  earned: number;
  span: number;
}

export interface PlayerRow {
  id: Answer;
  label: Localized;
  title: Localized;
}

export type PlayerRows = Readonly<Record<PlayerField, PlayerRow | null>>;

export interface SettingChoiceRow {
  written: Answer;
  shown: Localized;
}

export interface SettingRow {
  name: Answer;
  title: Localized;
  note: Localized;
  standing: Answer;
  choices: SettingChoiceRow[];
}

export interface Place {
  id: Answer;
  title: Localized;
  x: number;
  y: number;
  z: number;
  adjacent: Array<{ to: Answer; open: boolean }>;
  relative?: { direction: Direction; of: Answer };
}

export interface Region {
  id: Answer;
  title: Localized;
  holds: Answer[];
}

export interface PlayStatus {
  location: { id: Answer; title: Localized; description?: Localized };
  entities: Array<{ id: Answer; title: Localized; masked: boolean }>;
  choices: PlayChoice[];
  time: number;
  resources: Array<{ id: Answer; title: Localized; current: number; max: number; display: ResourceDisplay }>;
  held: HeldEffect[];
  encounter: EncounterView | null;
  modals: Modal[];
  inventory: AnswerTable<number>;
  grown: AnswerTable<Answer>;
  carried: CarriedRow[];
  planes: PlaneReport[];
  focus: Focus | null;
  equipment: WornRow[];
  xp: SkillRow[];
  stats: StatRow[];
  flags: AnswerTable<boolean | number>;
  discovered: Place[];
  undiscovered: Place[];
  mapGrid: number;
  regions: Region[];
  journey: Journey | null;
  journal: JournalEntry[];
  player: PlayerRows;
  settings: SettingRow[];
  action: PlayAction | null;
}

export interface PlayView extends PlayStatus {
  said: Localized[];
}

export interface PlaySession {
  readonly registry: Registry;
}

export const SECONDS_A_ROUTE_MAY_WALK = 120;

interface SessionInternals {
  registry: Registry;
  state: GameState;
  logCursor: number;
  watch?: (step: Step) => void;
  pass: number | null;
  seconds: number;
  walkUntil: number | null;
}

interface Step {
  readonly directive: Directive;
  readonly pass: number | null;
  readonly failure: string | null;
}

export function watchSteps(session: PlaySession, watch: (step: Step) => void): void {
  own(session).watch = watch;
}

export function walkWithin(session: PlaySession, seconds: number): void {
  own(session).seconds = seconds;
}

const INTERNALS = new WeakMap<PlaySession, SessionInternals>();

function own(session: PlaySession): SessionInternals {
  const internals = INTERNALS.get(session);
  if (!internals) throw new RuntimeError('this is not a session startSession handed out, so it plays nothing');
  return internals;
}

export const sessionLocalizer = (session: PlaySession): Localizer => localizerOf(session.registry, stateOf(session));

export const sessionJournal = (session: PlaySession): JournalEntry[] => journal(session.registry, stateOf(session));

export const cyclesDone = (session: PlaySession): number => stateOf(session).cyclesDone;

function stateOf(session: PlaySession): GameState {
  return own(session).state;
}

export function sessionOver(registry: Registry, state: GameState): PlaySession {
  initResources(state, registry);
  const internals: SessionInternals = { registry, state, logCursor: state.log.length, pass: null, seconds: SECONDS_A_ROUTE_MAY_WALK, walkUntil: null };
  const session: PlaySession = { get registry() { return internals.registry; } };
  INTERNALS.set(session, internals);
  return session;
}

type Actable = { actions?: Action[] };

function actionAvailable(action: Action, state: GameState, registry: Registry): boolean {
  if (isFight(action)) return false;
  return actionVisible(action, state, registry);
}

function availableActions(owner: Actable, state: GameState, registry: Registry): Action[] {
  return (owner.actions ?? []).filter((action) => actionAvailable(action, state, registry));
}

function movesTo(action: Action): string | undefined {
  const onlyMovement = action.results.every((r) => r.kind === 'relocate' || r.kind === 'say');
  const noBranches = !action.onSuccess && !action.onRefused && !action.onAttemptsExhausted;
  if (!onlyMovement || !noBranches) return undefined;
  const relocate = action.results.find((r) => r.kind === 'relocate');
  return relocate?.kind === 'relocate' ? relocate.location : undefined;
}

function isFreeTravelAction(action: Action, target: string): boolean {
  return movesTo(action) === target;
}

function entityAliasesTravelTo(stood: readonly StoodHere[], target: string, registry: Registry, state: GameState, masked: ReadonlySet<string>): boolean {
  return stood.some((stood) => {
    if (masked.has(stood.id)) return false;
    return availableActions(stood.offers, state, registry).some((action) => isFreeTravelAction(action, target) && requiresMet(action, state, registry));
  });
}

function maskedHere(state: GameState, here: readonly StoodHere[]): ReadonlySet<string> {
  if (settingStands(state.settings, 'masking') !== true) return new Set();
  const fighting = new Set(Object.keys(state.activeAction?.actors ?? {}).map(templateOf));
  const masked = new Set<string>();
  for (const stood of here) {
    if (truthy(state.flags[`${stood.id}.${TOUCHED}`]) || fighting.has(stood.id)) continue;
    if (stood.offers.actions.some(isMintedAction)) masked.add(stood.id);
  }
  return masked;
}

function stoodTitle(registry: Registry, localizer: Localizer, stood: StoodHere, masked: boolean): { of: Answer; detail: Localized; group?: GroupRow } {
  const source = offeredBy(registry, localizer, 'entity', stood.id, masked);
  if (masked || stood.guise?.title === undefined) return source;
  return { ...source, detail: localizer.words('guise', stood.guise.id, 'title') ?? source.detail };
}

export function shopOpen(registry: Registry, state: GameState, shopId: string | undefined): boolean {
  if (shopId === undefined) return false;
  const shop = registry.shops.get(shopId);
  return shop !== undefined && (shop.hiddenIf === undefined || !evaluateCondition(shop.hiddenIf, state, registry));
}

export function shopkeeperHere(registry: Registry, state: GameState, shopId: string): string | undefined {
  const location = registry.locations.get(state.location);
  if (!location || !shopOpen(registry, state, shopId)) return undefined;
  return stoodHere(state, registry, location).find((stood) => stood.entity.shop === shopId)?.id;
}

function fightChoices(entityId: string, registry: Registry, state: GameState, localizer: Localizer): PlayChoice[] {
  const player = registry.player;
  if (!player) return [];
  const choices: PlayChoice[] = [];
  for (const action of player.actions) {
    const id = declaredId(action);
    if (id === undefined || !isFight(action)) continue;
    if (!actionVisible(action, state, registry)) continue;
    if (action.depletes.side === 'them' && !hasPool(state, registry, entityId, action.depletes.id)) continue;
    choices.push({ id: choiceId({ kind: 'use-on', action: id, target: entityId }), kind: 'action', label: localizer.actionLabel('action', id, action), ...offeredBy(registry, localizer, 'entity', entityId) });
  }
  return choices;
}

interface Offered {
  choice: PlayChoice;
  minted: boolean;
}

function entityOffers(stood: StoodHere, registry: Registry, state: GameState, localizer: Localizer, masked: boolean): Offered[] {
  const { id: entityId, entity } = stood;
  const source = stoodTitle(registry, localizer, stood, masked);
  const offers: Offered[] = [];
  if (!masked && reachedNow(registry, state, entityId) !== null) {
    offers.push({ choice: { id: choiceId({ kind: 'talk', entity: entityId }), kind: 'talk', label: localizer.engine('engine.talk.to', { entity: source.detail }), ...source }, minted: false });
  }
  if (!masked && shopOpen(registry, state, entity.shop)) {
    offers.push({ choice: { id: choiceId({ kind: 'shop', shop: entity.shop as string }), kind: 'shop', label: localizer.engine('engine.shop.label', { entity: source.detail }), ...source }, minted: false });
  }
  for (const action of availableActions(stood.offers, state, registry)) {
    if (masked && !isMintedAction(action)) continue;
    const slug = actionAddress(action);
    offers.push({
      choice: { id: choiceId({ kind: 'use', obj: 'entity', objId: entityId, actionId: slug }), kind: 'action', label: localizer.actionLabel('entity', entityId, action), ...source, leadsTo: movesTo(action) },
      minted: isMintedAction(action),
    });
  }
  if (!masked) for (const choice of fightChoices(entityId, registry, state, localizer)) offers.push({ choice, minted: false });
  return offers;
}

function mintedSecond(offers: readonly Offered[]): PlayChoice[] {
  const at = offers.findIndex((offer) => offer.minted);
  const rest = offers.map((offer) => offer.choice);
  if (at < 0 || at === 1 || rest.length < 2) return rest;
  const [minted] = rest.splice(at, 1);
  return [rest[0]!, minted!, ...rest.slice(1)];
}

function locationChoices(session: PlaySession): PlayChoice[] {
  const { registry } = session;
  const state = stateOf(session);
  const location = registry.locations.get(state.location);
  if (!location) return [];
  const localizer = localizerOf(registry, state);
  const here = stoodHere(state, registry, location);
  const masked = maskedHere(state, here);
  const choices: PlayChoice[] = [];

  for (const stood of here) {
    choices.push(...mintedSecond(entityOffers(stood, registry, state, localizer, masked.has(stood.id))));
  }

  for (const action of availableActions(location, state, registry)) {
    const slug = actionAddress(action);
    choices.push({ id: choiceId({ kind: 'use', obj: 'location', objId: location.id, actionId: slug }), kind: 'action', label: localizer.actionLabel('location', location.id, action), ...offeredBy(registry, localizer, 'location', location.id) });
  }

  for (const [itemId] of itemCopies(state)) {
    const item = registry.items.get(itemId);
    if (!item) continue;
    for (const action of availableActions(item, state, registry)) {
      const slug = actionAddress(action);
      choices.push({ id: choiceId({ kind: 'use', obj: 'item', objId: itemId, actionId: slug }), kind: 'action', label: localizer.actionLabel('item', itemId, action), ...offeredBy(registry, localizer, 'item', itemId) });
    }
  }

  const capable = new Set(here.flatMap((stood) => stood.entity.capabilities));
  for (const recipe of listedToPlayer(registry.recipes.values())) {
    if (recipe.requiresCapability !== undefined && !capable.has(recipe.requiresCapability)) continue;
    if (!recipeCraftable(recipe, registry, state)) continue;
    const station = recipe.requiresCapability
      ? here.find((stood) => stood.entity.capabilities.includes(recipe.requiresCapability!))?.id
      : undefined;
    if (station !== undefined && masked.has(station)) continue;
    const source = station === undefined ? {} : offeredBy(registry, localizer, 'entity', station);
    choices.push({ id: choiceId({ kind: 'craft', recipe: recipe.id }), kind: 'craft', label: craftLabel(localizer, recipe.id), ...source });
  }

  for (const edge of effectiveAdjacent(registry, location.id)) {
    if (edge.condition && !evaluateCondition(edge.condition, state, registry)) continue;
    if (entityAliasesTravelTo(here, edge.target, registry, state, masked)) continue;
    choices.push({ id: choiceId({ kind: 'travel', location: edge.target }), kind: 'travel', label: travelLabel(localizer, edge.target), leadsTo: edge.target, legs: 1 });
  }

  return choices;
}

export function readRoom(session: PlaySession): void {
  for (const choice of unreadHere(sessionStatus(session))) {
    if (computeChoices(session).some((each) => each.id === choice.id)) applyDirective(session, choiceToDirective(choice));
  }
}

export function unreadHere(status: PlayStatus): PlayChoice[] {
  if (status.action !== null || status.modals.length > 0) return [];
  const masked = new Set(status.entities.filter((entity) => entity.masked).map((entity) => ownerRef('entity', entity.id)));
  return status.choices.filter((choice) => choice.of !== undefined && masked.has(choice.of));
}

function journeyChoices(session: PlaySession, local: PlayChoice[]): PlayChoice[] {
  const { registry } = session;
  const state = stateOf(session);
  const localizer = localizerOf(registry, state);
  const already = new Set(local.flatMap((choice) => (choice.leadsTo === undefined ? [] : [choice.leadsTo])));
  const choices: PlayChoice[] = [];

  for (const [target, legs] of reachable(state.location, registry, state)) {
    if (already.has(target)) continue;
    choices.push({ id: choiceId({ kind: 'travel', location: target }), kind: 'travel', label: travelLabel(localizer, target), leadsTo: target, legs });
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
  const parsed = parseChoiceId(choice.id);
  if (parsed === null) throw new RuntimeError(`malformed choice id: ${choice.id}`);
  return parsed;
}

export function startSession(registry: Registry, language: string = DEFAULT_LANGUAGE): PlaySession {
  const state = initialState(registry, language);
  if (!state.location) throw new RuntimeError('no # location is marked starting, so a new game has nowhere to begin');
  standWhereTheyAre(state, registry);
  return sessionOver(registry, state);
}

export function adoptRegistry(session: PlaySession, registry: Registry): PruneWarning[] {
  const internals = own(session);
  const { state } = internals;
  internals.registry = registry;
  const warnings = pruneStateForRegistry(state, registry);
  internals.logCursor = state.log.length;
  initResources(state, registry);
  standWhereTheyAre(state, registry);
  return warnings;
}

export function serializeSession(session: PlaySession): string {
  return serializeSave(stateOf(session), session.registry);
}

export function loadSaved(session: PlaySession, saved: ParsedSave): PruneWarning[] {
  const internals = own(session);
  const { registry } = internals;
  const next = createGameState('', internals.state.language);
  next.debug = internals.state.debug;
  const warnings = loadSave(next, saved, registry);
  standWhereTheyAre(next, registry);
  standable(registry, next);
  Object.assign(internals.state, next);
  internals.logCursor = internals.state.log.length;
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

export interface CarriedRow extends CarriedEntry {
  readonly verbs: readonly Answer[];
  readonly sockets: boolean;
}

function carriedRows(state: GameState, registry: Registry): CarriedRow[] {
  return carriedEntries(state, registry).map((entry) => ({ ...entry, verbs: verbsOffered(entry, state, registry), sockets: socketsInto(entry, state, registry) }));
}

export function sessionStatus(session: PlaySession): PlayStatus {
  const { registry } = session;
  const state = stateOf(session);
  const location = registry.locations.get(state.location);
  if (!location) throw new RuntimeError(`unknown location: ${state.location}`);

  const localizer = localizerOf(registry, state);
  const here = stoodHere(state, registry, location);
  const masked = maskedHere(state, here);
  const entities: PlayStatus['entities'] = [];
  for (const stood of here) {
    entities.push({ id: stood.id, masked: masked.has(stood.id), title: stoodTitle(registry, localizer, stood, masked.has(stood.id)).detail });
  }

  const description =
    location.examine === undefined ? undefined : (localizer.prose('location', location.id, 'examine', weighing(state, registry)) ?? localizer.content('location', location.id, 'examine'));

  return {
    location: { id: location.id, title: localizer.title('location', location.id), description },
    entities,
    choices: computeChoices(session),
    time: msToSeconds(state.time),
    resources: publishResources(state, registry),
    held: heldEffects(state, registry, PLAYER),
    encounter: encounterView(state, registry),
    modals: state.modals.map((frame) => publishModal(frame, state, registry)),
    inventory: Object.fromEntries([...itemCopies(state)].flatMap(([id, { stack }]) => (stack > 0 ? [[id, stack] as const] : []))),
    grown: grownItems(state),
    carried: carriedRows(state, registry),
    planes: planeReports(registry, state),
    focus: modalFocus(state),
    equipment: wornRows(state, registry),
    xp: listedToPlayer(registry.skills.values()).map(({ id }) => skillRow(id, state.xp[id] ?? 0, localizer)),
    stats: statRows(state, registry, localizer),
    flags: { ...state.flags },
    ...publishPlaces(state, registry),
    mapGrid: mapGrid(registry),
    regions: listedToPlayer(registry.regions.values()).map((each) => ({ id: each.id, title: localizer.title('region', each.id), holds: [...each.holds] })),
    journey: state.journey ? { to: state.journey.to, legs: [...state.journey.legs] } : null,
    journal: journal(registry, state),
    player: playerRows(state, registry),
    settings: settingRows(state, registry),
    action: publishAction(state, registry),
  };
}

export function settingRows(state: GameState, registry: Registry): SettingRow[] {
  const localizer = localizerOf(registry, state);
  return SETTING_NAMES.map((name) => {
    const setting = settingNamed(name);
    return {
      name,
      title: localizer.engine(setting.title),
      note: localizer.engine(setting.note),
      standing: standingChoice(name, settingStands(state.settings, name))?.typed ?? '',
      choices: setting.choices.map((choice) => ({ written: choice.typed, shown: localizer.engine(choice.shown) })),
    };
  });
}

function playerRows(state: GameState, registry: Registry): PlayerRows {
  const localizer = localizerOf(registry, state);
  const row = (field: PlayerField): PlayerRow | null => {
    const id = state.player[field];
    if (id === '') return null;
    const { names, asked } = PLAYER_SHEET[field];
    return { id, label: localizer.engine(asked), title: names === null ? localizer.identifier(id) : localizer.title(names, id) };
  };
  return Object.fromEntries(PLAYER_FIELDS.map((field) => [field, row(field)])) as PlayerRows;
}

function skillRow(id: string, value: number, localizer: Localizer): SkillRow {
  const level = skillLevel(value);
  const foot = xpForLevel(level);
  return { id, title: localizer.title('skill', id), value, level, earned: value - foot, span: xpForLevel(level + 1) - foot };
}

export function carriedListing(session: PlaySession): CarriedEntry[] {
  return carriedEntries(stateOf(session), session.registry);
}

function publishPlaces(state: GameState, registry: Registry): { discovered: Place[]; undiscovered: Place[] } {
  const localizer = localizerOf(registry, state);
  const every = listedToPlayer(registry.locations.values());
  const known = new Set(every.filter((each) => truthy(state.flags[`${each.id}.${DISCOVERED}`])).map((each) => each.id));
  const published = (each: Location, only: ReadonlySet<Answer> | null): Place => ({
    id: each.id,
    title: localizer.title('location', each.id),
    x: each.x,
    y: each.y,
    z: each.z,
    ...(each.relative === undefined ? {} : { relative: { direction: each.relative.direction, of: each.relative.of } }),
    adjacent: effectiveAdjacent(registry, each.id)
      .filter((edge) => only === null || only.has(edge.target))
      .map((edge) => ({ to: edge.target, open: !edge.condition || evaluateCondition(edge.condition, state, registry) })),
  });
  return {
    discovered: every.filter((each) => known.has(each.id)).map((each) => published(each, known)),
    undiscovered: every.filter((each) => !known.has(each.id)).map((each) => published(each, null)),
  };
}

function publishResources(state: GameState, registry: Registry): PlayStatus['resources'] {
  const localizer = localizerOf(registry, state);
  return listedToPlayer(registry.resources.values())
    .filter((resource) => hasPool(state, registry, PLAYER, resource.id))
    .map((resource) => ({
      id: resource.id,
      title: localizer.title('resource', resource.id),
      current: fromMilliUnits(state.resources[resource.id] ?? 0),
      max: statValue(resource.max, state, registry),
      display: resource.display,
    }));
}

function statRows(state: GameState, registry: Registry, localizer: Localizer): StatRow[] {
  const sources = statSources(state, registry);
  return listedToPlayer(registry.stats.values())
    .filter((stat) => stat.hiddenIf === undefined || !evaluateCondition(stat.hiddenIf, state, registry))
    .map((stat) => statRow(stat.id, sources, state, registry, localizer));
}

function statRow(statId: string, sources: StatSources, state: GameState, registry: Registry, localizer: Localizer): StatRow {
  const breakdown = statFrom(statId, sources, state, registry);
  return {
    id: statId,
    title: localizer.title('stat', statId),
    value: midpoint(foldStat(breakdown)),
    ...grouping(registry, localizer, 'stat', statId),
    from: [
      { title: localizer.engine('engine.stat.base'), added: breakdown.base, increased: 0 },
      ...breakdown.parts.map((part) => ({ title: localizer.content(part.source.kind, part.source.id, part.source.field), added: part.added, increased: part.increased })),
    ],
  };
}

function actionUnderWay(localizer: Localizer, obj: string, objId: string, action: Action): Localized {
  if (obj === 'travel') return travelLabel(localizer, objId.slice(objId.indexOf(TRAVEL_PAIR) + 1));
  if (obj === 'recipe') return craftLabel(localizer, objId);
  return localizer.actionLabel(obj, objId, action);
}

function stillToCount(action: Action, active: ActiveAction): number | null {
  if (action.depletes || active.implicitTarget >= IMPLICIT_TARGET_FULL) return null;
  return fromMilliUnits(active.implicitTarget);
}

function publishAction(state: GameState, registry: Registry): PlayAction | null {
  const active = state.activeAction;
  if (!active) return null;
  const { obj, objId } = parseOwnerRef(active.ownerRef);
  const clock = playerCadence(active);
  const localizer = localizerOf(registry, state);
  const action = armedAction(state, registry);
  const target = active.roster?.[PLAYER]?.target;
  const aimed = target !== undefined && registry.entities.has(target) ? offeredBy(registry, localizer, 'entity', target) : undefined;
  return {
    label: actionUnderWay(localizer, obj, objId, action),
    ...(aimed === undefined ? {} : { of: aimed.of, detail: aimed.detail }),
    progress: actionProgress(state, registry),
    attempts: clock.attemptsMade,
    completion: stillToCount(action, active),
    ...(active.forced ? { forced: true as const } : {}),
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
    case 'journal':
    case 'expect':
    case 'expect-only':
    case 'load':
    case 'cancel':
    case 'wait':
    case 'wait-out':
    case 'equip':
    case 'unequip':
    case 'swap':
    case 'setting':
    case 'debug':
    case 'slot':
    case 'allocate':
    case 'unallocate':
    case 'apply':
    case 'refuse':
    case 'until':
    case 'loop':
    case 'open-modal':
    case 'submit-modal':
    case 'shop':
    case 'note':
    case 'refused':
    case 'page':
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

export const greetingBack = (status: Pick<PlayStatus, 'modals'>): boolean => status.modals.some((modal) => modal.name === WELCOME_BACK);

export function ranWhileAway(session: PlaySession, elapsedRealMs: number, speed: number): boolean {
  const { state, registry } = own(session);
  if (state.activeAction === null && state.journey === null) return false;

  const wanted = Math.max(0, elapsedRealMs) * speed;
  const capped = wanted > UNDER_WAY_LIMIT_MS;
  const span = Math.min(wanted, UNDER_WAY_LIMIT_MS);
  if (span < 1) return false;

  const start = spanStart(state);
  const toldBefore = state.log.length;
  resolve(state, registry, state.time + Math.floor(span));
  const say = localizerOf(registry, state);
  const because = say.engine(capped ? 'engine.away.capped' : 'engine.away.ran', { hours: UNDER_WAY_LIMIT_HOURS });
  const summary = spanSummary(start, state, registry, because);
  const told = summary.length > 1 ? summary : [...summary, say.engine('engine.away.nothing')];
  state.log.splice(toldBefore, state.log.length - toldBefore, ...told);
  openModal(state, { name: 'welcome-back', answers: {} });
  return true;
}

export function cancelAction(session: PlaySession): PlayView {
  applyDirective(session, { kind: 'cancel' });
  return view(session);
}

export function submitModal(session: PlaySession, answers: Record<string, string>): PlayView {
  answerModal(stateOf(session), session.registry, answers);
  settleCarried(stateOf(session), session.registry);
  pruneModals(stateOf(session), session.registry);
  return view(session);
}

export interface DirectiveOutcome {
  failure?: string;
  pruned?: readonly PruneWarning[];
}

export function applyDirective(session: PlaySession, directive: Directive): DirectiveOutcome {
  const outcome = performDirective(session, directive);
  settleCarried(stateOf(session), session.registry);
  pruneModals(stateOf(session), session.registry);
  return outcome;
}

function performDirective(session: PlaySession, directive: Directive): DirectiveOutcome {
  const { registry } = session;
  const state = stateOf(session);

  switch (directive.kind) {
    case 'run':
      throw new RuntimeError('run: is handled by runTest, not applyDirective');
    case 'refused':
      throw new RuntimeError('refused is about the line before it, so runTest settles it and not applyDirective');
    case 'note':
    case 'page':
      return {};
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
    case 'use': {
      const refused = useAction(directive.obj, directive.objId, directive.actionId, registry, state);
      return refused ? { failure: refused } : {};
    }
    case 'use-on':
      useFight(directive.action, directive.target, registry, state);
      return {};
    case 'travel': {
      const refused = walkTo(directive.location, registry, state);
      return refused ? { failure: refused } : {};
    }
    case 'goto': {
      const going = locationNamed(registry, directive.location);
      if (!registry.locations.has(going)) throw new RuntimeError(`unknown location: ${going}`);
      endJourney(state, localizerOf(registry, state).engine('engine.stopped.called-off'));
      relocateTo(state, registry, going);
      return {};
    }
    case 'craft':
      craft(directive.recipe, registry, state);
      return {};
    case 'shop': {
      if (!registry.shops.has(directive.shop)) throw new RuntimeError(`unknown shop: ${directive.shop}`);
      if (shopkeeperHere(registry, state, directive.shop) === undefined) throw new RuntimeError(`nobody standing in ${state.location} keeps the shop ${directive.shop}`);
      openShop(state, directive.shop);
      return {};
    }
    case 'begin':
      beginAction(session, choiceId(directive.inner));
      return {};
    case 'assert':
      if (!evaluateCondition(directive.condition, state, registry)) return { failure: describeCondition(directive.condition) };
      return {};
    case 'journal': {
      const entry = journal(registry, state).find((each) => each.quest === directive.quest);
      if (!entry) throw new RuntimeError(`unknown quest: ${directive.quest}`);
      const standing = standingAuthored(entry);
      if (standing !== directive.text) return { failure: `journal ${directive.quest}: expected ${JSON.stringify(directive.text)}, the journal is standing on ${standing === null ? 'nothing' : JSON.stringify(standing)}` };
      return {};
    }
    case 'expect':
    case 'expect-only': {
      const saved = registry.saves.get(directive.save);
      if (!saved) throw new RuntimeError(`unknown save: ${directive.save}`);
      const diffs = directive.kind === 'expect' ? compareSave(state, saved, registry) : compareSaveOnly(state, saved, registry);
      if (diffs.length > 0) return { failure: `save mismatch ${directive.save}: ${diffs.join('; ')}` };
      return {};
    }
    case 'load': {
      const saved = registry.saves.get(directive.save);
      if (!saved) throw new RuntimeError(`unknown save: ${directive.save}`);
      return { pruned: loadSaved(session, saved) };
    }
    case 'cancel': {
      const held = heldByForce(state, registry);
      if (held !== undefined) return { failure: held };
      endJourney(state, localizerOf(registry, state).engine('engine.stopped.called-off'));
      return {};
    }
    case 'wait':
      resolve(state, registry, state.time + secondsToMs(directive.seconds));
      return {};
    case 'wait-out':
      return waitedOut(state, registry, directive.until);
    case 'until': {
      const start = spanStart(state);
      const started = performDirective(session, directive.inner);
      return started.failure ? started : waitedOut(state, registry, directive.until, start);
    }
    case 'loop':
      return wentRound(session, directive);
    case 'equip':
      return { failure: equip(state, registry, directive.item) };
    case 'unequip':
      return { failure: unequip(state, registry, directive.slot) };
    case 'swap':
      state.packOrder = swappedOrder(packRows(state), state.packOrder, directive.one, directive.other);
      return {};
    case 'setting': {
      if (!isSettingName(directive.setting)) throw new RuntimeError(`unknown setting: ${directive.setting} — this run is played by ${SETTING_NAMES.join(', ')}`);
      const choice = choiceWritten(directive.setting, directive.value);
      if (!choice) throw new RuntimeError(`${directive.setting} is not played ${directive.value}: it is played ${settingNamed(directive.setting).choices.map((each) => each.typed).join(' or ')}`);
      state.settings = chosenSetting(state.settings, directive.setting, choice);
      return {};
    }
    case 'debug':
      state.debug = { ...state.debug, [directive.which]: true };
      return {};
    case 'slot':
    case 'allocate':
    case 'unallocate':
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

function waitedOut(state: GameState, registry: Registry, terminator: Terminator = 'done', start?: SpanStart): { failure?: string } {
  const waited = resolveUnderWay(state, registry, terminator, start);
  if (waited.ended) return {};
  const label = terminator === 'done' ? 'wait: done' : `until ${printTerminator(terminator)}`;
  return { failure: `${label} — ${waited.reason}` };
}

function wentRound(session: PlaySession, loop: Extract<Directive, { kind: 'loop' }>): DirectiveOutcome {
  const { registry } = session;
  const state = stateOf(session);
  const heading = printRounds(loop.until);
  for (let passes = 0; ; passes++) {
    if (isCycles(loop.until) ? passes >= loop.until.times : evaluateCondition(loop.until, state, registry)) return {};
    const before = serializeSession(session);
    const held = own(session);
    const outer = held.pass;
    held.pass = passes + 1;
    const { failure } = walkTest(session, loop.body);
    held.pass = outer;
    if (failure !== null) return { failure: `${heading} — pass ${passes + 1}: ${failure}` };
    if (!isCycles(loop.until) && serializeSession(session) === before) return { failure: `${heading} — ${localizerOf(registry, state).engine('engine.stopped.round')}` };
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

const outstayed = (session: PlaySession, seconds: number): string => sessionLocalizer(session).engine('engine.stopped.outstayed', { seconds });

function refusalFrom(session: PlaySession, directive: Directive): string | null {
  try {
    return applyDirective(session, directive).failure ?? null;
  } catch (error) {
    if (error instanceof RuntimeError) return error.message;
    throw error;
  }
}

export function testSteps(testId: string, registry: Registry, stack: readonly string[] = []): Directive[] {
  if (stack.includes(testId)) throw new RuntimeError(`cyclic test run: ${[...stack, testId].join(' -> ')}`);
  const test = registry.tests.get(testId);
  if (!test) throw new RuntimeError(`unknown test: ${testId}`);
  return runsUnrolled(test.directives, registry, [...stack, testId]);
}

function runsUnrolled(directives: readonly Directive[], registry: Registry, stack: readonly string[]): Directive[] {
  return directives.flatMap((directive) => {
    if (directive.kind === 'run') return testSteps(directive.test, registry, stack);
    if (directive.kind === 'loop') return [{ ...directive, body: runsUnrolled(directive.body, registry, stack) }];
    return [directive];
  });
}

export interface Replayed {
  readonly walked: readonly Directive[];
  readonly failure: string | null;
}

export function walkTest(session: PlaySession, steps: readonly Directive[], upTo: number = steps.length, from = 0): Replayed {
  const walked: Directive[] = [];
  const held = own(session);
  const stopAt = held.walkUntil ?? Date.now() + held.seconds * 1000;
  const opened = held.walkUntil === null;
  if (opened) held.walkUntil = stopAt;

  try {
    for (const [at, directive] of steps.entries()) {
      if (at < from) continue;
      if (at >= upTo) break;
      if (Date.now() > stopAt) return { walked, failure: outstayed(session, held.seconds) };
      if (directive.kind === 'refused') {
        walked.push(directive);
        continue;
      }

      const pass = held.pass;
      const refusal = refusalFrom(session, directive);
      const claimed = steps[at + 1]?.kind === 'refused';
      walked.push(directive);
      held.watch?.({ directive, pass, failure: claimed ? null : refusal });

      if (refusal !== null && !claimed) return { walked, failure: refusal };
      if (refusal === null && claimed) return { walked, failure: `refused: ${printDirective(directive)} was not refused` };
    }

    return { walked, failure: null };
  } finally {
    if (opened) held.walkUntil = null;
  }
}

export interface TestRun {
  readonly result: TestResult;
  readonly steps: number;
  readonly walked: number;
}

export function replayTest(testId: string, registry: Registry, state: GameState, stack: readonly string[] = []): TestRun {
  const steps = testSteps(testId, registry, stack);
  const { walked, failure } = walkTest(sessionOver(registry, state), steps);
  const open = topModal(state);
  const result: TestResult =
    failure !== null
      ? { passed: false, failure }
      : open && awaitsAnAnswer(open)
        ? { passed: false, failure: `modal left open: ${open.name}` }
        : { passed: true };
  return { result, steps: steps.length, walked: walked.length };
}

export function runTest(testId: string, registry: Registry, state: GameState, stack: readonly string[] = []): TestResult {
  return replayTest(testId, registry, state, stack).result;
}

export function runSessionTest(session: PlaySession, testId: string): TestResult {
  return runTest(testId, session.registry, stateOf(session));
}
