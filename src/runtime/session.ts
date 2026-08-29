import { endJourney } from './actionEnd';
import { RuntimeError } from './error';
import { Action } from '../content/sections/entity';
import { DISCOVERED, Location, type Direction } from '../content/sections/location';
import { TOUCHED } from '../content/sections/define';
import { actionProgress, actionStalled, actionVisible, ArmResult, armAction, armCraft, armFightAction, armJourney, craft, describeCondition, encounterView, EncounterView, equip, evaluateCondition, GameState, initResources, recipeCraftable, reachedNow, requiresMet, resolve, resolveUnderWay, settleCarried, statValue, talk, unequip, useAction, useFight, walkTo } from './runtime';
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
import { foldStat, hasPool, statBreakdown } from './stats';
import { midpoint, type Range } from '../grammar/range';
import { PLAYER, PLAYER_FIELDS, PLAYER_SHEET, templateOf, type PlayerField } from './state';
import { declaredId, Entity, isMintedAction } from '../content/sections/entity';
import { isTwoSided } from '../grammar/action';
import { standing } from './population';
import { truthy } from './conditions';
import { answerModal, awaitsAnAnswer, Modal, modalFocus, pruneModals, publishModal, type Focus } from './modals';
import { dialogueFrame, openModal, openModalNamed, openShop, topModal } from './modalStack';
import { carriedEntries, wornRows, type CarriedEntry, type WornRow } from './carried';
import { Registry } from '../content/registry';
import { listedToPlayer } from '../content/sections';
import { type ParsedSave } from '../content/sections/save';
import { DEFAULT_LANGUAGE } from '../grammar/section';
import { ResourceDisplay } from '../content/sections/resource';
import { compareSave, compareSaveOnly, initialState, loadSave, pruneStateForRegistry, serializeSave } from './save';
import type { PruneWarning } from './pruning';
import { Directive, parseUseChoiceId, printDirective, printTerminator, Terminator, useChoiceId } from '../content/sections/test';
import { Answer, AnswerTable, Localized, Localizer, localizerOf } from './localized';
import { skillLevel, xpForLevel } from './skills';
import { fromMilliUnits, msToSeconds, secondsToMs } from './units';
import { say } from './said';
import { spanStart, type SpanStart } from './span';
import { choiceWritten, chosenSetting, isSettingName, settingNamed, settingStands, standingChoice, SETTING_NAMES } from './settings';
import { grouping, offeredBy, type GroupRow } from './grouping';
import { mapGrid } from './tuning';
export type { GroupRow } from './grouping';

export type PlayChoiceKind = 'talk' | 'action' | 'travel' | 'craft' | 'shop';

export interface PlayChoice {
  id: Answer;
  kind: PlayChoiceKind;
  label: Localized;
  // The address of whatever offers this choice, of which `detail` is the words. A surface that puts
  // one thing's offers together keys on this and not on the words, because everything a player has
  // not read is called the same thing.
  of?: Answer;
  detail?: Localized;
  group?: GroupRow;
  leadsTo?: Answer;
  legs?: number;
}

export interface OfferedChoice extends PlayChoice {
  // Where the choice sits in the view's own list, which is how a player answers it. A surface that
  // draws some of the list rather than all of it would lose that by counting again, so it is carried.
  position: number;
}

// What a page of offers draws: everything on offer where the player stands, and the one step out of
// it. Anywhere further is the map's — `waysOut` is what answers that — because a room's offers are
// what can be done from it, and every place the player has ever found is not that. The cut is read
// off the choice's own `legs`, so a world that grows a district does not grow this list with it.
export function sheetOffers(status: Pick<PlayStatus, 'choices'>): OfferedChoice[] {
  return status.choices.map((choice, at) => ({ ...choice, position: at + 1 })).filter((choice) => (choice.legs ?? 0) <= 1);
}

export interface PlayAction {
  label: Localized;
  // Who the action under way is aimed at, said the way a choice says what offers it. The seat is
  // where the target is read from and the registry is asked whether it names an entity, because a
  // seat also carries addresses that are not one — a travel seats the road it is walking.
  of?: Answer;
  detail?: Localized;
  progress: number;
  // Whether it is standing still rather than advancing — something took its pace to nothing. The bar
  // holds where it stood; it has not been lost, and it moves again when whatever did it wears off.
  stalled: boolean;
  attempts: number;
  // How much of this cycle is still to be counted, or null when there is no such figure to give.
  // A renderer draws it when it is there and says nothing when it is not; deciding for itself what
  // a bare number meant is what had every driver printing a constant as though it were progress.
  completion: number | null;
}

export interface CountedRow {
  id: Answer;
  title: Localized;
  value: number;
}

// One named share of a stat, in the two channels a bonus lands on. `increased` is a percentage, and
// a share is drawn as it stands rather than resolved into the total, because *what is adding to
// this* is the question and a resolved figure has stopped answering it.
export interface StatShare {
  title: Localized;
  added: Range;
  increased: number;
}

// A stat, and everything the engine folded to reach it — where it starts and what every carrier put
// in. The shares are the same ones the number is folded from, so a row that says nothing about a
// bonus is a row the bonus did not reach.
export interface StatRow extends CountedRow {
  from: StatShare[];
  // What kind of measure this is, read off the stat's own `group:`. It is what the character sheet
  // keeps its tabs by, so which page a stat is on is a fact the world declares and not one a screen
  // holds a list of.
  group?: GroupRow;
}

export interface SkillRow extends CountedRow {
  level: number;
  earned: number;
  span: number;
}

// One row per field of the player's sheet — what the field is called, the id the state holds, and the
// words that id is read out as, which are the same string for a field the player wrote themselves. A
// field nobody has answered yet is null rather than a row of empty strings, so a sheet no character
// creation has been through publishes nothing to draw.
export interface PlayerRow {
  id: Answer;
  label: Localized;
  title: Localized;
}

export type PlayerRows = Readonly<Record<PlayerField, PlayerRow | null>>;

// One row per preference a run is played by, drawn from the declaration that names them: what it is
// called, what it is for, the word it stands at, and every word it takes with the words each is
// shown as. Every surface that lists a setting or offers one reads these rows, so the terminal and
// the settings page cannot come to differ about what may be set to what.
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

// A place the player has found, as every surface is handed it. Its own interface because the map is
// what its coordinates and roads are for, and a map that had to name a field of a field to say what
// it draws is a map that cannot be read.
export interface Place {
  id: Answer;
  title: Localized;
  x: number;
  y: number;
  z: number;
  adjacent: Array<{ to: Answer; open: boolean }>;
  // What this place hangs off, for one placed by saying which way it lies from another rather than
  // by saying where it is. Its coordinates above are already worked out; this is how they were
  // arrived at, and so what moves when the place it names moves.
  relative?: { direction: Direction; of: Answer };
}

// A shape the map draws round a group of places. Published whole rather than cut down to what has
// been found: which places a region holds is the world's fact, and which of those are on the map is
// the map's.
export interface Region {
  id: Answer;
  title: Localized;
  holds: Answer[];
}

export interface PlayStatus {
  location: { id: Answer; title: Localized; description?: Localized };
  // What stands here, and whether the view is holding its name back because nobody has read it yet.
  entities: Array<{ id: Answer; title: Localized; masked: boolean }>;
  choices: PlayChoice[];
  time: number;
  resources: Array<{ id: Answer; title: Localized; current: number; max: number; display: ResourceDisplay }>;
  encounter: EncounterView | null;
  modals: Modal[];
  inventory: AnswerTable<number>;
  grown: AnswerTable<Answer>;
  carried: CarriedEntry[];
  planes: PlaneReport[];
  focus: Focus | null;
  equipment: WornRow[];
  xp: SkillRow[];
  stats: StatRow[];
  flags: AnswerTable<boolean | number>;
  // Every place there is, split by whether the player has found it. Two lists rather than one with a
  // flag on it, because almost everything that reads them wants the found ones and nothing else; and
  // not one list plus a second saying which ids exist, because that was the same fact written twice.
  discovered: Place[];
  undiscovered: Place[];
  // How far apart one step of this world's coordinates is drawn. Published beside the places rather
  // than held by whoever is drawing them, so every surface that draws a map draws it at one size.
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

export const sessionJournal = (session: PlaySession): JournalEntry[] => journal(session.registry, stateOf(session));

// How many times something under way has come round since this world was opened. Read as the
// difference across a span, which is what a run recorded off a live session writes down in place of
// the seconds that span happened to take.
export const cyclesDone = (session: PlaySession): number => stateOf(session).cyclesDone;

function stateOf(session: PlaySession): GameState {
  return own(session).state;
}

// Every way of getting a session comes through here — a new game, a status read, a # test run —
// so the pools a state plays with are filled here rather than by each caller remembering to. A
// state that reaches play with empty resources reads as a player at zero health, which is what a
// # test drained by a plain action saw where the same script under the REPL did not.
function sessionOver(registry: Registry, state: GameState): PlaySession {
  initResources(state, registry);
  const internals: SessionInternals = { registry, state, logCursor: state.log.length };
  const session: PlaySession = { get registry() { return internals.registry; } };
  INTERNALS.set(session, internals);
  return session;
}

type Actable = { actions?: Action[] };

// What an entity, a place or a thing in the pack puts in front of the player. `hidden if:` is the
// only field that takes an action off this list: one whose `requires:` does not stand is offered,
// and turns the player away in words when they take it.
function actionAvailable(action: Action, state: GameState, registry: Registry): boolean {
  if (isTwoSided(action)) return false;
  return actionVisible(action, state, registry);
}

function availableActions(owner: Actable, state: GameState, registry: Registry): Action[] {
  return (owner.actions ?? []).filter((action) => actionAvailable(action, state, registry));
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

// A road the place itself offers is dropped only where something standing here already walks it —
// which an offer that would refuse does not, so a gated door never takes the plain way out with it.
function entityAliasesTravelTo(location: Location, target: string, registry: Registry, state: GameState, masked: ReadonlySet<string>): boolean {
  return standingHere(registry, state, location).some((entityId) => {
    const entity = registry.entities.get(entityId);
    if (!entity || masked.has(entityId)) return false;
    return availableActions(entity, state, registry).some((action) => isFreeTravelAction(action, target) && requiresMet(action, state, registry));
  });
}

// What stands here that the player has not read yet. Such a thing publishes no name and no offer
// but the one that reads it, so a room nobody has looked at is a short list of unknowns rather than
// everything it holds at once.
//
// Two things are deliberately never masked. One with no `examine:` mints no offer that could lift
// the mask, so masking it would leave it standing with nothing a player could ever do; and a foe in
// the fight under way has been met, whatever anybody has read.
//
// And a run may turn the whole of it off, which is how an author sees a room as it is written rather
// than clicking through a list of question marks to find out what they wrote. It is a setting rather
// than a fact about dev mode because it is saved, replayed and reachable from a `# test` that way,
// and because the rule about what is held back has one home and this is it.
function maskedHere(registry: Registry, state: GameState, location: Location): ReadonlySet<string> {
  if (settingStands(state.settings, 'masking') !== true) return new Set();
  const fighting = new Set(Object.keys(state.activeAction?.actors ?? {}).map(templateOf));
  const masked = new Set<string>();
  for (const entityId of standingHere(registry, state, location)) {
    if (truthy(state.flags[`${entityId}.${TOUCHED}`]) || fighting.has(entityId)) continue;
    if (registry.entities.get(entityId)?.actions.some(isMintedAction)) masked.add(entityId);
  }
  return masked;
}

const standingHere = (registry: Registry, state: GameState, location: Location): string[] => standing(state, registry, location).map((entry) => entry.entity);

// Whoever is standing here that opens this shop. A shop is reached through the thing keeping it, so a shop nobody here keeps is not reachable from here at all.
export function shopkeeperHere(registry: Registry, state: GameState, shopId: string): string | undefined {
  const location = registry.locations.get(state.location);
  if (!location) return undefined;
  return standingHere(registry, state, location).find((entityId) => registry.entities.get(entityId)?.shop === shopId);
}

function fightChoices(entityId: string, registry: Registry, state: GameState, localizer: Localizer): PlayChoice[] {
  const player = registry.player;
  if (!player) return [];
  const choices: PlayChoice[] = [];
  for (const action of player.actions) {
    const id = declaredId(action);
    if (id === undefined || !isTwoSided(action) || !action.depletes) continue;
    if (!actionVisible(action, state, registry)) continue;
    if (action.depletes.side === 'their' && !hasPool(state, registry, entityId, action.depletes.id)) continue;
    choices.push({ id: `fight:${id}:${entityId}`, kind: 'action', label: localizer.actionLabel('action', id, action), ...offeredBy(registry, localizer, 'entity', entityId) });
  }
  return choices;
}

interface Offered {
  choice: PlayChoice;
  minted: boolean;
}

// Everything one entity offers, gathered into the run a player reads as that entity's: talking to
// it, its shop, what it can be asked to do, and what the player can open on it. Every one of them
// carries the entity as `choice.of`, which is the key a surface groups by.
//
// Masked, that run is the one offer that reads the thing, drawn under a placeholder — its name, its
// words and everything else it could be asked for are what looking at it buys.
function entityOffers(entity: Entity, entityId: string, registry: Registry, state: GameState, localizer: Localizer, masked: boolean): Offered[] {
  const source = offeredBy(registry, localizer, 'entity', entityId, masked);
  const offers: Offered[] = [];
  if (!masked && reachedNow(registry, state, entityId) !== null) {
    offers.push({ choice: { id: `talk:${entityId}`, kind: 'talk', label: localizer.engine('engine.talk.to', { entity: source.detail }), ...source }, minted: false });
  }
  if (!masked && entity.shop !== undefined && registry.shops.has(entity.shop)) {
    offers.push({ choice: { id: `shop:${entity.shop}`, kind: 'shop', label: localizer.engine('engine.shop.label', { entity: source.detail }), ...source }, minted: false });
  }
  for (const action of availableActions(entity, state, registry)) {
    if (masked && !isMintedAction(action)) continue;
    const slug = actionAddress(action);
    offers.push({
      choice: { id: useChoiceId({ kind: 'use', obj: 'entity', objId: entityId, actionId: slug }), kind: 'action', label: localizer.actionLabel('entity', entityId, action), ...source, leadsTo: movesTo(action) },
      minted: isMintedAction(action),
    });
  }
  if (!masked) for (const choice of fightChoices(entityId, registry, state, localizer)) offers.push({ choice, minted: false });
  return offers;
}

// What an entity mints stands second among the offers it makes, so examine sits in one place
// whether the thing is fought, traded with, or only has words about itself. This list is what
// every surface draws, so none of them sorts and none of them can drift from the others.
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
  const masked = maskedHere(registry, state, location);
  const choices: PlayChoice[] = [];

  for (const entityId of standingHere(registry, state, location)) {
    const entity = registry.entities.get(entityId);
    if (!entity) continue;
    choices.push(...mintedSecond(entityOffers(entity, entityId, registry, state, localizer, masked.has(entityId))));
  }

  for (const action of availableActions(location, state, registry)) {
    const slug = actionAddress(action);
    choices.push({ id: useChoiceId({ kind: 'use', obj: 'location', objId: location.id, actionId: slug }), kind: 'action', label: localizer.actionLabel('location', location.id, action), ...offeredBy(registry, localizer, 'location', location.id) });
  }

  for (const [itemId] of itemCopies(state)) {
    const item = registry.items.get(itemId);
    if (!item) continue;
    for (const action of availableActions(item, state, registry)) {
      const slug = actionAddress(action);
      choices.push({ id: useChoiceId({ kind: 'use', obj: 'item', objId: itemId, actionId: slug }), kind: 'action', label: localizer.actionLabel('item', itemId, action), ...offeredBy(registry, localizer, 'item', itemId) });
    }
  }

  for (const recipe of listedToPlayer(registry.recipes.values())) {
    if (!recipeCraftable(recipe, registry, state)) continue;
    const station = recipe.requiresCapability
      ? standingHere(registry, state, location).find((entityId) => registry.entities.get(entityId)?.capabilities.includes(recipe.requiresCapability!))
      : undefined;
    if (station !== undefined && masked.has(station)) continue;
    const source = station === undefined ? {} : offeredBy(registry, localizer, 'entity', station);
    choices.push({ id: `craft:${recipe.id}`, kind: 'craft', label: craftLabel(localizer, recipe.id), ...source });
  }

  for (const edge of effectiveAdjacent(registry, location.id)) {
    if (edge.condition && !evaluateCondition(edge.condition, state, registry)) continue;
    if (entityAliasesTravelTo(location, edge.target, registry, state, masked)) continue;
    choices.push({ id: `travel:${edge.target}`, kind: 'travel', label: travelLabel(localizer, edge.target), leadsTo: edge.target, legs: 1 });
  }

  return choices;
}

// Reading a room: every mask standing in it lifted at once, which costs a player nothing but the
// looking. A driver that is not a person takes it on arrival — the playbot, so its turns go on the
// quest, and a proof walking the shipped world, which asks what a room offers a reader.
export function readRoom(session: PlaySession): void {
  for (const choice of unreadHere(sessionStatus(session))) {
    if (computeChoices(session).some((each) => each.id === choice.id)) applyDirective(session, choiceToDirective(choice));
  }
}

// Every offer a masked thing here is making, which is the look that reads it and nothing else. It
// is a fact about the published view rather than about the session, so a driver holding only a view
// reads a room by the same answer the engine masked it by. Nothing is offered while an action is
// under way or a screen is open, because taking one of these would drop what is already going on.
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
    case 'shop':
      return { kind: 'shop', shop: choice.id.slice('shop:'.length) };
  }
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

export function sessionStatus(session: PlaySession): PlayStatus {
  const { registry } = session;
  const state = stateOf(session);
  const location = registry.locations.get(state.location);
  if (!location) throw new RuntimeError(`unknown location: ${state.location}`);

  const localizer = localizerOf(registry, state);
  const masked = maskedHere(registry, state, location);
  const entities: PlayStatus['entities'] = [];
  for (const entityId of standingHere(registry, state, location)) {
    const entity = registry.entities.get(entityId);
    if (entity) entities.push({ id: entity.id, masked: masked.has(entity.id), title: offeredBy(registry, localizer, 'entity', entity.id, masked.has(entity.id)).detail });
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
    xp: listedToPlayer(registry.skills.values()).map(({ id }) => skillRow(id, state.xp[id] ?? 0, localizer)),
    stats: listedToPlayer(registry.stats.values()).map((stat) => statRow(stat.id, state, registry, localizer)),
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

// Every place, split by whether it has been found. A found place's roads run only to other found
// places — a road to somewhere nobody has heard of is not a road anybody can be told about — while a
// place nobody has found carries all of its roads, since what an author is looking at when they ask
// for the whole floor is the map as it is written.
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

function statRow(statId: string, state: GameState, registry: Registry, localizer: Localizer): StatRow {
  const breakdown = statBreakdown(statId, state, registry);
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

// `implicitTarget` counts down from full, and only for an action with nothing of anyone's to
// deplete: a targeted one drains a pool instead and leaves this standing at full for as long as it
// runs. Full is also where every cycle starts, so full is the absence of a reading rather than a
// reading of nothing counted, and telling those two apart is the whole of this.
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
    stalled: actionStalled(state, registry),
    attempts: clock.attemptsMade,
    completion: stillToCount(action, active),
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
    case 'slot':
    case 'allocate':
    case 'unallocate':
    case 'apply':
    case 'refuse':
    case 'until':
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

export interface DirectiveOutcome {
  failure?: string;
  // What loading dropped, addressed to whoever asked for the load — never to the player, who did
  // not write these ids and cannot act on them. `pruneStateForRegistry` has always returned this;
  // the only question was which way out it took.
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
    // What a player thought, and where in the app they went. The engine has no opinion about either
    // and no pages to move between, so a run recorded through the app replays through a terminal.
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
      beginAction(session, choiceIdFor(directive.inner));
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
      const diffs = directive.kind === 'expect' ? compareSave(state, saved, registry) : compareSaveOnly(state, saved);
      if (diffs.length > 0) return { failure: `save mismatch ${directive.save}: ${diffs.join('; ')}` };
      return {};
    }
    case 'load': {
      const saved = registry.saves.get(directive.save);
      if (!saved) throw new RuntimeError(`unknown save: ${directive.save}`);
      return { pruned: loadSaved(session, saved) };
    }
    case 'cancel':
      endJourney(state, localizerOf(registry, state).engine('engine.stopped.called-off'));
      return {};
    case 'wait':
      resolve(state, registry, state.time + secondsToMs(directive.seconds));
      return {};
    case 'wait-out':
      return waitedOut(state, registry, directive.until);
    case 'until': {
      // One directive, one span: what the inner directive does on the way to being under way is
      // part of what the player was away for, and it happens before the loop is ever entered.
      const start = spanStart(state);
      const started = performDirective(session, directive.inner);
      return started.failure ? started : waitedOut(state, registry, directive.until, start);
    }
    case 'equip':
      equip(state, registry, directive.item);
      return {};
    case 'unequip':
      unequip(state, registry, directive.slot);
      return {};
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

// A refusal is what a player is told they cannot do, whichever way the engine says it — an outcome
// that failed or a RuntimeError thrown out of the middle of one. runLine already makes no
// distinction, so a recording taken through the app and a test replaying it agree about which
// lines bounced. Null is a line that took.
function refusalFrom(session: PlaySession, directive: Directive): string | null {
  try {
    return applyDirective(session, directive).failure ?? null;
  } catch (error) {
    if (error instanceof RuntimeError) return error.message;
    throw error;
  }
}

// The directives a test runs, with `run:` expanded where it stands. Anything that drives a `# test`
// steps this one list — the suite, the REPL, and the app's replay — so none of them can come to
// differ about what a test is made of, and a cycle is refused once rather than in each of them.
export function testSteps(testId: string, registry: Registry, stack: readonly string[] = []): Directive[] {
  if (stack.includes(testId)) throw new RuntimeError(`cyclic test run: ${[...stack, testId].join(' -> ')}`);
  const test = registry.tests.get(testId);
  if (!test) throw new RuntimeError(`unknown test: ${testId}`);
  return test.directives.flatMap((directive) => (directive.kind === 'run' ? testSteps(directive.test, registry, [...stack, testId]) : [directive]));
}

export interface Replayed {
  // What actually ran, which is every step up to and including the one that parted from the record.
  readonly walked: readonly Directive[];
  // Where the replay and the record first disagreed, or null where they never did. A line the
  // record marks `refused` and which refuses again agrees; one that now takes does not, and that is
  // how an author sees a fix land.
  readonly failure: string | null;
}

// Walk `steps[from..upTo)` against a session as it stands, stopping at the first place the world
// stopped answering the way the record says it does. A driver watching a run steps a little at a
// time and hands back the range it has not walked yet; a driver scrubbing backwards starts a
// session over and walks from nothing, which is why the engine never has to undo anything.
// `refused` is read off the whole record rather than off the range, so a range ending between a
// line and its mark still knows the mark is there.
export function walkTest(session: PlaySession, steps: readonly Directive[], upTo: number = steps.length, from = 0): Replayed {
  const walked: Directive[] = [];

  for (const [at, directive] of steps.entries()) {
    if (at < from) continue;
    if (at >= upTo) break;
    // Settled by the step it is about, one line above.
    if (directive.kind === 'refused') {
      walked.push(directive);
      continue;
    }

    const refusal = refusalFrom(session, directive);
    const claimed = steps[at + 1]?.kind === 'refused';
    walked.push(directive);

    if (refusal !== null && !claimed) return { walked, failure: refusal };
    if (refusal === null && claimed) return { walked, failure: `refused: ${printDirective(directive)} was not refused` };
  }

  return { walked, failure: null };
}

export interface TestRun {
  readonly result: TestResult;
  // What the route is made of, beside how much of it the walk reached. They are the same length or
  // the walk stopped short, and a walk that stopped short left the state somewhere the route does
  // not end — which is the difference between a stale sheet and a body nothing should be recorded
  // from, and the verdict alone cannot tell them apart.
  readonly steps: readonly Directive[];
  readonly walked: readonly Directive[];
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
  return { result, steps, walked };
}

export function runTest(testId: string, registry: Registry, state: GameState, stack: readonly string[] = []): TestResult {
  return replayTest(testId, registry, state, stack).result;
}

export function runSessionTest(session: PlaySession, testId: string): TestResult {
  return runTest(testId, session.registry, stateOf(session));
}
