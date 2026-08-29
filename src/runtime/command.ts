import type { ModalOption } from './modalOption';
import { RuntimeError } from './error';
import { Cursor, DslError } from '../grammar/parser';
import { formatModuleDiagnostic, type Registry } from '../content/registry';
import { loadUniverseWithDiagnostics } from '../content/load';
import { type ModuleSource } from '../content/universe';
import {
  deleteLocalSection,
  LOCAL_CHANGES_MODULE_ID,
  listLocalSections,
  localSectionHeadings,
  renderLocalChangesModule,
  upsertLocalSection,
  type LocalSection,
} from '../content/localChanges';
import { grammarLines } from '../content/grammarTree';
import { namesFrom } from '../content/completion';
import { addressedSections, type AddressedSection } from '../content/sectionSource';
import { isSectionKind, sectionKinds } from '../content/sections';
import { isGrowthDirective, parseDirectiveLine, parseUsePayload, printDirective, type Directive } from '../content/sections/test';
import { resolveCarried, resolveDirective } from '../content/typed';
import { homelessId } from '../content/resolve';
import type { Resumption } from './openUniverse';
import { runAsSections, runBlocks, runStart, RUN_SECTION, startsAtSave, turnRecord, type KeptRun, type SectionAddress, type TurnOutcome } from './runLog';
import { savedGameFromSerialized } from './save';
import { type PruneWarning } from './pruning';
import { describeCondition } from './runtime';
import { grouped } from './grouping';
import { sessionJournal, type JournalEntry } from './session';
import { wornCopySlot } from './itemInstance';
import { sheetOf, type Sheet } from './map';
import { relativeValue, type Relative } from '../content/sections/location';
import { gathering, joining, pinning, placing, shifting, type Editing } from './mapEdit';
import { type Answer, type Localized, type Localizer } from './localized';
import { type Modal } from './modals';
import { ownerRef } from './state';
import { anId, say, says, type Said } from './said';
import {
  DEV_SLOT,
  autosave,
  devSnapshot,
  enterDev,
  leaveDev,
  liveSlot,
  NEVER,
  saveNow,
  saveReport,
  setAutosaveCadence,
  type Cadence,
  type SaveContext,
  type SlotWrites,
} from './saveSlots';
import {
  adoptRegistry,
  apply,
  applyDirective,
  beginAction,
  carriedListing,
  choiceToDirective,
  cyclesDone,
  loadSaved,
  runSessionTest,
  serializeSession,
  sessionLocalizer,
  sessionStatus,
  view,
  wait,
  type PlayChoice,
  type PlaySession,
  type PlayStatus,
  type PlayView,
  type SettingRow,
} from './session';

export type MessageTone = 'plain' | 'ok' | 'warn' | 'error';

export type MessageWords = 'player' | 'tool';

export interface PlayerMessage {
  readonly kind: 'message';
  readonly words: 'player';
  readonly tone: MessageTone;
  readonly text: Localized;
  readonly detail?: readonly Localized[];
}

export interface ToolMessage {
  readonly kind: 'message';
  readonly words: 'tool';
  readonly tone: MessageTone;
  readonly text: string;
  readonly detail?: readonly string[];
}

export type CommandOutput =
  | PlayerMessage
  | ToolMessage
  | { kind: 'view'; view: PlayView; reread: boolean }
  | { kind: 'status'; status: PlayStatus }
  | { kind: 'choices'; choices: PlayChoice[] }
  | { kind: 'map'; map: Sheet }
  | { kind: 'help'; words: 'tool'; entries: CommandHelp[] }
  | { kind: 'source'; words: 'tool'; lines: string[] }
  | { kind: 'authored'; words: 'tool'; blocks: string[][] };

export interface CommandResult {
  view?: PlayView;
  output: CommandOutput[];
  quit: boolean;
  recorded: Answer[];
  live?: LiveRun;
}

export interface Recorder {
  history: string[];
  startSave: string;
}

export interface AuthoringContext {
  baseSources: ModuleSource[];
  dependencies: string[];
  localSource: ModuleSource;
  writeLocalChanges?: (text: string) => void;
  readLocalChanges?: () => string;
}

export interface LiveSettings {
  speed: number;
  driving: boolean;
}

export interface CommandContext {
  readonly session: PlaySession;
  view: PlayView;
  readonly recorder: Recorder;
  readonly live: LiveSettings;
  readonly authoring?: AuthoringContext;
  readonly save?: SaveContext;
}

export function newContext(
  session: PlaySession,
  current: PlayView,
  options: { recorder?: Recorder; authoring?: AuthoringContext; save?: SaveContext; speed?: number; driving?: boolean } = {},
): CommandContext {
  return {
    session,
    view: current,
    recorder: options.recorder ?? { history: [], startSave: '' },
    live: { speed: options.speed ?? 1, driving: options.driving ?? false },
    authoring: options.authoring,
    save: options.save,
  };
}

export interface LocalDelete {
  op: 'delete';
  kind: string;
  id: string;
}

export type LocalOp = { op: 'list' } | { op: 'show' } | { op: 'clear' } | LocalDelete;

export type SettingOp = { op: 'list' } | { op: 'set'; name: string; directive: Directive };

export interface SectionArg {
  kind: string;
  id: string;
  body: string;
}

// A section somebody is asking to read rather than to write. The kind is optional because an id is
// what a view prints: an author who has just met `first-steps.guide-house` is asking about that,
// and knowing it is a `# location` is half of what they were going to read the section to find out.
// The id is optional the other way round: a kind alone is an author who cannot name anything yet,
// which is the question that has to be answerable before reading a section is worth anything.
export interface NamedSection {
  kind: string | null;
  id: string | null;
}

// Where a place is, said either way the language says it: outright, or as one step off another place.
// One command because it is one question — and because answering it one way is what takes the other
// answer away, which a second command would have had to know about this one.
export type PlacingArg = { location: string; at: { x: number; y: number; z?: number } } | { location: string; off: Relative };

export interface JoiningArg {
  from: string;
  to: string;
  road: boolean;
}

// What one `/region` says: which places it gathers or lets go, or how far the whole of it moves.
export type GatheringArg = { region: string; places: string[]; holding: boolean } | { region: string; by: { x: number; y: number } };

interface ArgTypes {
  none: undefined;
  number: number;
  id: string;
  directive: Directive;
  section: SectionArg;
  named: NamedSection;
  kinds: readonly string[];
  placing: PlacingArg;
  joining: JoiningArg;
  gathering: GatheringArg;
  local: LocalOp;
  setting: SettingOp;
  cadence: Cadence;
  choice: number;
}

export type ArgKind = keyof ArgTypes;

export type CommandMatch = 'name' | 'blank' | 'directive' | 'choice';

// 'player' is what an ordinary session may run; 'author' is the authoring workflow
// (staging DSL, saves-as-fixtures, dev mode itself); 'cheat' is a power that skips the world's
// own rules (only /goto today). DEV_TOKENS below is every 'cheat' entry, derived rather than listed.
export type CommandAudience = 'player' | 'author' | 'cheat';

export interface CommandHelp {
  name: string;
  aliases: readonly string[];
  argHint: string;
  summary: string;
}

export interface CommandProblem {
  problem: string | Said;
}

export interface CommandSpec<K extends ArgKind = ArgKind> {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly match: CommandMatch;
  readonly arg: K;
  readonly argHint: string;
  readonly summary: string;
  readonly audience: CommandAudience;
  // Whether running this stages a change to the world's content. Declared here rather than counted
  // anywhere else, so a driver that has something to say about editing — the playbot, which will
  // not let a bot fix what it has not first reported — asks the command and not a list of names.
  readonly edits: boolean;
  parse(rest: string, ctx: CommandContext): ArgTypes[K] | CommandProblem;
  run(ctx: CommandContext, arg: ArgTypes[K]): CommandResult;
}

function define<K extends ArgKind>(spec: {
  name: string;
  aliases?: readonly string[];
  match?: CommandMatch;
  arg: K;
  argHint?: string;
  summary: string;
  audience?: CommandAudience;
  edits?: boolean;
  parse(rest: string, ctx: CommandContext): ArgTypes[K] | CommandProblem;
  run(ctx: CommandContext, arg: ArgTypes[K]): CommandResult;
}): CommandSpec {
  return { aliases: [], match: 'name', argHint: '', audience: 'player', edits: false, ...spec };
}

function isProblem(value: unknown): value is CommandProblem {
  return typeof value === 'object' && value !== null && 'problem' in value;
}

function message(tone: MessageTone, text: Localized): PlayerMessage {
  return { kind: 'message', words: 'player', tone, text };
}

function note(tone: MessageTone, text: string, detail?: string[]): ToolMessage {
  return detail ? { kind: 'message', words: 'tool', tone, text, detail } : { kind: 'message', words: 'tool', tone, text };
}

function said(tone: MessageTone, text: Localized): CommandResult {
  return { output: [message(tone, text)], quit: false, recorded: [] };
}

export function noted(tone: MessageTone, text: string, detail?: string[]): CommandResult {
  return { output: [note(tone, text, detail)], quit: false, recorded: [] };
}

function invalidChoice(answer: string): Said {
  return says('engine.command.invalid-choice', { choice: anId(JSON.stringify(answer)) });
}

function refusal(ctx: CommandContext, problem: string | Said): CommandResult {
  return typeof problem === 'string' ? noted('error', problem) : said('error', say(sessionLocalizer(ctx.session), problem));
}

// The engine, not a harness, decides what a line refuses: an error-toned message is the one signal
// every driver already gets, so this is not a second validation layer beside runLine.
export const refusedLine = (result: CommandResult): boolean => result.output.some((output) => output.kind === 'message' && output.tone === 'error');

export const outcomeOf = (result: CommandResult): TurnOutcome => (refusedLine(result) ? 'refused' : 'applied');

function shown(next: PlayView, before: CommandOutput[] = []): CommandResult {
  return { view: next, output: [...before, { kind: 'view', view: next, reread: false }], quit: false, recorded: [] };
}

function refused(error: unknown): CommandResult {
  if (error instanceof RuntimeError) return noted('error', error.message);
  throw error;
}

function nothing(): undefined {
  return undefined;
}

export function canonicalDirective(directive: Directive): string {
  if (directive.kind === 'run' || directive.kind === 'expect' || directive.kind === 'expect-only' || directive.kind === 'assert') {
    throw new RuntimeError(`canonicalDirective: ${directive.kind}: is authored, not recorded`);
  }
  return printDirective(directive);
}

function recordedOutcome(directive: Directive, outcome: { failure?: string }): string {
  if (outcome.failure === undefined || !isGrowthDirective(directive)) return canonicalDirective(directive);
  return canonicalDirective({ kind: 'refuse', inner: directive });
}

function recordedForChoice(choice: PlayChoice): string {
  return canonicalDirective(choiceToDirective(choice));
}

function formatElapsed(seconds: number): string {
  return Number(seconds.toFixed(3)).toString();
}

function runNamedTest(ctx: CommandContext, testId: string): CommandResult {
  try {
    const result = runSessionTest(ctx.session, testId);
    if (ctx.save) ctx.save.synced = null;
    const next = view(ctx.session);
    const verdict = result.passed ? `Test '${testId}' PASSED` : `Test '${testId}' FAILED: ${result.failure}`;
    return shown(next, [note('plain', verdict)]);
  } catch (error) {
    return refused(error);
  }
}

function openInventory(ctx: CommandContext, id: string): CommandResult {
  const opening: Directive = { kind: 'open-modal', modal: 'carried-items' };
  if (id === '') return runDirective(ctx, opening);

  const entry = carriedListing(ctx.session).find((each) => each.id === id);
  if (!entry) return said('error', nothingIsNamed(sessionLocalizer(ctx.session), id));

  const opened = runDirective(ctx, opening);
  if (opened.recorded.length === 0) return opened;
  const selected = runDirective(ctx, { kind: 'submit-modal', key: 'item', value: entry.id });
  return { ...selected, recorded: [...opened.recorded, ...selected.recorded] };
}

// The breakdown opened on one stat, the same two lines the journal opens a quest with. A stat is
// found by the id the view publishes or by the name its own module gave it, which is how every id a
// player types is read.
function openStat(ctx: CommandContext, stat: string): CommandResult {
  const found = ctx.view.stats.find((row) => row.id === stat || row.id.endsWith(`.${stat}`));
  if (!found) return said('error', sessionLocalizer(ctx.session).engine('engine.repl.stat.unknown', { stat: sessionLocalizer(ctx.session).identifier(stat) }));

  const opened = runDirective(ctx, { kind: 'open-modal', modal: 'stat-breakdown' });
  if (opened.recorded.length === 0) return opened;
  const reading = runDirective(ctx, { kind: 'submit-modal', key: 'stat', value: found.id });
  return { ...reading, recorded: [...opened.recorded, ...reading.recorded] };
}

// The journal opened on one quest, which is the screen opened and then answered — the same two lines a recording would replay.
function openJournal(ctx: CommandContext, entries: readonly JournalEntry[], quest: string): CommandResult {
  // A journal entry prints a quest's title and never its id, so the name a reader has for one is
  // whatever half of the id they were handed — the module it is written in as readily as the id
  // inside. Which words an address answers to is the editing page's rule, asked rather than made up.
  const found = entries.find((entry) => namesFrom(entry.quest, quest));
  if (!found) return said('error', sessionLocalizer(ctx.session).engine('engine.repl.journal.unknown', { quest: sessionLocalizer(ctx.session).identifier(quest) }));

  const opened = runDirective(ctx, { kind: 'open-modal', modal: 'quest-journal' });
  if (opened.recorded.length === 0) return opened;
  const reading = runDirective(ctx, { kind: 'submit-modal', key: 'quest', value: found.quest });
  return { ...reading, recorded: [...opened.recorded, ...reading.recorded] };
}

function nothingIsNamed(localizer: Localizer, id: string): Localized {
  const slot = wornCopySlot(id);
  return slot === undefined
    ? localizer.engine('engine.growth.no-copy', { item: localizer.identifier(id) })
    : localizer.engine('engine.growth.no-worn', { slot: localizer.identifier(slot) });
}

// A prune is addressed to whoever asked for the load, in the ids the save is written in, so it
// goes out as tool words beside the view rather than into what the game is saying to the player.
function prunedNotes(pruned: readonly PruneWarning[] | undefined): ToolMessage[] {
  return (pruned ?? []).map((warning) => note('warn', warning.message));
}

function runDirective(ctx: CommandContext, directive: Directive): CommandResult {
  if (directive.kind === 'run') return runNamedTest(ctx, directive.test);

  if (directive.kind === 'assert' || directive.kind === 'expect' || directive.kind === 'expect-only') {
    const label = directive.kind === 'assert' ? describeCondition(directive.condition) : directive.save;
    try {
      const result = applyDirective(ctx.session, directive);
      return result.failure ? noted('warn', result.failure) : noted('ok', `${label} matches`);
    } catch (error) {
      return refused(error);
    }
  }

  try {
    const outcome = applyDirective(ctx.session, directive);
    if (directive.kind === 'load' && ctx.save) ctx.save.synced = null;
    const next = view(ctx.session);
    return { ...shown(next, prunedNotes(outcome.pruned)), recorded: [recordedOutcome(directive, outcome)] };
  } catch (error) {
    return refused(error);
  }
}

// A turn is one line, so a line stands for the lines it holds: `|` is where one of them ends. It is
// read once, before any command sees its arguments, which is what makes it end a token as well as a
// line — an id written up against a `|` is an id at the end of its line and nothing more.
export const LINE_BREAK = '|';

const lineBroken = (line: string): string => line.split(LINE_BREAK).join('\n');

function commandBodyLines(body: string): string[] {
  if (body.trim() === '') return [];
  return body
    .split('\n')
    .map((line) => line.replace(/^[ \t]/, '').trimEnd())
    .filter((line) => line.trim() !== '');
}

function localSectionSource(section: SectionArg): string {
  return [`# ${section.kind} ${section.id}`, ...commandBodyLines(section.body)].join('\n') + '\n';
}

function localDiagnosticsFor(authoring: AuthoringContext, diagnostics: ReturnType<typeof loadUniverseWithDiagnostics>['diagnostics']): string[] {
  const said = diagnostics.map((diagnostic) => formatModuleDiagnostic(diagnostic));
  if (said.length === 0) return [];
  const stood = new Set(loadUniverseWithDiagnostics([...authoring.baseSources, authoring.localSource]).diagnostics.map((diagnostic) => formatModuleDiagnostic(diagnostic)));
  const brought = said.filter((message) => !stood.has(message));
  return brought.length > 0 ? brought : said;
}

function adoptLocalChanges(
  ctx: CommandContext,
  authoring: AuthoringContext,
  text: string,
  staged: string,
  persist?: (text: string) => void,
): CommandResult {
  const loaded = loadUniverseWithDiagnostics([...authoring.baseSources, { ...authoring.localSource, text }]);
  const localStatus = loaded.modules.find((module) => module.sourceName === authoring.localSource.name || module.moduleId === LOCAL_CHANGES_MODULE_ID);
  const diagnostics = localDiagnosticsFor(authoring, loaded.diagnostics);
  if (diagnostics.length > 0 || localStatus?.loaded !== true) {
    return noted('error', 'local changes did not load.', diagnostics);
  }

  try {
    persist?.(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return noted('error', `could not write local changes: ${detail}`);
  }

  authoring.localSource.text = text;
  const reported = [note('plain', staged), ...prunedNotes(adoptRegistry(ctx.session, loaded.registry))];

  try {
    return shown(view(ctx.session), reported);
  } catch (error) {
    if (error instanceof RuntimeError) {
      return { output: [...reported, note('error', error.message)], quit: false, recorded: [] };
    }
    throw error;
  }
}

function commitLocalChanges(ctx: CommandContext, authoring: AuthoringContext, text: string, staged: string): CommandResult {
  return adoptLocalChanges(ctx, authoring, text, staged, authoring.writeLocalChanges);
}

export const UNAVAILABLE = 'local authoring is unavailable.';

export const UNREADABLE = 'local changes cannot be re-read here.';

const RELOADED = `Reloaded ${LOCAL_CHANGES_MODULE_ID}.`;

function localChangesNow(authoring: AuthoringContext): string {
  if (!authoring.readLocalChanges) return authoring.localSource.text;
  try {
    return authoring.readLocalChanges();
  } catch (error) {
    throw new RuntimeError(`could not read local changes: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function runReload(ctx: CommandContext): CommandResult {
  const authoring = ctx.authoring;
  if (!authoring) return noted('error', UNAVAILABLE);
  if (!authoring.readLocalChanges) return noted('error', UNREADABLE);

  let text: string;
  try {
    text = localChangesNow(authoring);
  } catch (error) {
    return refused(error);
  }
  return adoptLocalChanges(ctx, authoring, text, RELOADED);
}

function localSourceNow(authoring: AuthoringContext): { read: true; text: string } | { read: false; refusal: CommandResult } {
  const text = localChangesNow(authoring);
  try {
    listLocalSections(text);
  } catch (error) {
    if (error instanceof DslError) {
      return { read: false, refusal: noted('error', `${LOCAL_CHANGES_MODULE_ID} does not parse: ${error.message}`, ['/local clear replaces it.']) };
    }
    throw error;
  }
  return { read: true, text };
}

function nearMissNote(ctx: CommandContext, section: LocalSection): string {
  const near = ctx.session.registry.namespace.nearMisses(section.kind, section.id);
  if (near.length === 0) return '';
  return ` Nothing declared ${section.kind} ${section.id} before this, and ${near.join(' and ')} ${near.length === 1 ? 'is' : 'are'} one edit away: /local delete ${section.kind} ${section.id} takes it back.`;
}

// Sections written straight into the local changes, upserted together and adopted once. Every
// author-facing edit lands here — a section typed at `/dsl`, a run the app files when its author
// stops recording — so nothing has a load-and-adopt path of its own.
export function stageLocalSections(ctx: CommandContext, sections: readonly string[]): CommandResult {
  const authoring = ctx.authoring;
  if (!authoring) return noted('error', UNAVAILABLE);
  try {
    const source = localSourceNow(authoring);
    if (!source.read) return source.refusal;
    let text = source.text;
    const staged: string[] = [];
    for (const section of sections) {
      const edit = upsertLocalSection(text, authoring.dependencies, section);
      text = edit.text;
      staged.push(`${edit.replaced ? 'Replaced' : 'Staged'} # ${edit.section.kind} ${edit.section.id} in ${LOCAL_CHANGES_MODULE_ID}.${nearMissNote(ctx, edit.section)}`);
    }
    return commitLocalChanges(ctx, authoring, text, staged.join(' '));
  } catch (error) {
    if (error instanceof DslError) return noted('error', error.message);
    return refused(error);
  }
}

// `/place a below b` is read with the parser that reads `below b` in a `# location`, so the command
// line takes exactly what the language takes and the two cannot come to disagree about the wording.
function writtenOff(rest: string): PlacingArg | undefined {
  const match = /^(?<location>\S+)[ \t]+(?<off>.+)$/.exec(rest)?.groups;
  if (!match) return undefined;
  const cursor = new Cursor(match.off!, 0, 0);
  try {
    const off = relativeValue.parse(cursor);
    cursor.take(/[ \t]*/);
    return cursor.done ? { location: match.location!, off } : undefined;
  } catch {
    return undefined;
  }
}

const joiningFrom =
  (road: boolean) =>
  (rest: string): JoiningArg | { problem: string } => {
    const match = /^(?<from>\S+)[ 	]+(?<to>\S+)$/.exec(rest)?.groups;
    return match ? { from: match.from!, to: match.to!, road } : { problem: `${road ? '/link' : '/unlink'} requires <location> <location>` };
  };

// A section named the way a player names one: whole, or by the last part of it where that names one
// thing. The map hands whole addresses; somebody typing wants to write `market-square`.
function addressIn(ids: Iterable<string>, written: string): string {
  const known = [...ids];
  if (known.includes(written)) return written;
  const named = known.filter((id) => id.endsWith(`.${written}`));
  return named.length === 1 ? named[0]! : written;
}

const addressOf = (ctx: CommandContext, written: string): string => addressIn(ctx.session.registry.locations.keys(), written);

const regionOf = (ctx: CommandContext, written: string): string => addressIn(ctx.session.registry.regions.keys(), written);

// Every map edit takes the same road: work out the patches, stage them together, adopt once. A
// refusal writes nothing, so a move that could not carry one room of a house moves none of it.
function runMapEdit(ctx: CommandContext, edit: (registry: Registry, local: string) => Editing): CommandResult {
  const authoring = ctx.authoring;
  if (!authoring) return noted('error', UNAVAILABLE);
  const source = localSourceNow(authoring);
  if (!source.read) return source.refusal;
  const asked = edit(ctx.session.registry, source.text);
  if ('refused' in asked) return noted('error', asked.refused);
  return stageLocalSections(ctx, asked.patches.map((each) => each.text));
}

const addressed = (at: SectionAddress): string => `# ${at.kind} ${at.id}`;

// Sections taken back out of the local changes together and adopted once — the counterpart of
// stageLocalSections, and the only way anything leaves. What was filed as several sections is
// dropped as several sections, so the registry never stands over half of one.
export function dropLocalSections(ctx: CommandContext, sections: readonly SectionAddress[]): CommandResult {
  const authoring = ctx.authoring;
  if (!authoring) return noted('error', UNAVAILABLE);
  try {
    const source = localSourceNow(authoring);
    if (!source.read) return source.refusal;
    let text = source.text;
    const dropped: SectionAddress[] = [];
    for (const at of sections) {
      const next = deleteLocalSection(text, authoring.dependencies, at.kind, at.id);
      if (!next.deleted) continue;
      text = next.text;
      dropped.push(at);
    }
    if (dropped.length === 0) return noted('error', `no local ${sections.map(addressed).join(' or ')} is staged.`);
    return commitLocalChanges(ctx, authoring, text, `Deleted local ${dropped.map(addressed).join(', ')}.`);
  } catch (error) {
    if (error instanceof DslError) return noted('error', error.message);
    return refused(error);
  }
}

// What the local changes hold right now, for whatever is drawing a list of them. A file there is no
// surface for, or one nothing here can read, holds nothing to list — the refusals belong to the
// acts that edit it, and a list is not one.
export function stagedSections(ctx: CommandContext): readonly LocalSection[] {
  const authoring = ctx.authoring;
  if (!authoring) return [];
  try {
    const source = localSourceNow(authoring);
    return source.read ? listLocalSections(source.text) : [];
  } catch {
    return [];
  }
}

const runSectionEdit = (ctx: CommandContext, section: SectionArg): CommandResult => stageLocalSections(ctx, [localSectionSource(section)]);

const asSource = (lines: readonly string[]): CommandResult => ({ output: [{ kind: 'source', words: 'tool', lines: [...lines] }], quit: false, recorded: [] });

// What may be written, at the indentation it is written at. Asked with no kind it says which kinds
// there are, because the whole grammar is tens of thousands of characters and nobody asked for all
// of it at once — the kinds are the question a first ask is really putting.
function runGrammar(_ctx: CommandContext, kinds: readonly string[]): CommandResult {
  if (kinds.length === 0) return asSource(['the kinds a section may be; /grammar <kind>... writes out what any of them holds:', ...sectionKinds().map((kind) => `  # ${kind}`)]);
  return asSource(grammarLines(kinds));
}

// Past this many ids the list is longer than the answer it is standing in for, and Tulsa writes a
// hundred and twelve items: what an author does next with a list that long is pick a module out of
// it, so that is what a long one answers with instead.
const SCREENFUL = 24;

// One line per id, or — where there are more of them than a screenful and they gather into fewer
// families than there are ids — one line per family, since a family is what the next ask narrows to.
function listedRows(addresses: readonly string[]): { rows: string[]; folded: boolean } {
  const ids = [...new Set(addresses)].sort();
  const families = new Map<string, string[]>();
  for (const id of ids) families.set(id.split('.')[0]!, [...(families.get(id.split('.')[0]!) ?? []), id]);
  if (ids.length <= SCREENFUL || families.size >= ids.length) return { rows: ids.map((id) => `  ${id}`), folded: false };
  return { rows: [...families].map(([family, held]) => (held.length === 1 ? `  ${held[0]}` : `  ${family} (${held.length})`)), folded: true };
}

// What a view prints beside whatever a section offers, under either of the ids that section answers
// to. This is the half of a choice id that is not the action, so it is built the way the choice id
// was built rather than recognised by shape.
const ownerForms = (section: AddressedSection): string[] => [ownerRef(section.kind, section.address), ownerRef(section.kind, section.id)];

// Every name the engine itself writes one section under: the id its author typed inside the module,
// the address the loader files it at, and the owner a view prints. An author types one of the first
// two and a player is handed the third, so all of them have to arrive here.
const namesOf = (section: AddressedSection): string[] => [section.id, section.address, ...ownerForms(section)];

// A choice id is an action on an owner, and the owner is the section the action is written in. The
// engine composed that id out of the two, so its own reading of it is asked for rather than the id
// taken apart again by shape.
const ownerAsked = (id: string): string | null => {
  const use = parseUsePayload(id);
  return use === null ? null : ownerRef(use.obj, use.objId);
};

const wroteAs = (at: NamedSection): string => (at.kind === null ? String(at.id) : `# ${at.kind} ${at.id}`);

// An id that names nothing is nearly always an id half-remembered, and the editing page already has
// the rule for whether an address answers to a word somebody typed — it is asked here rather than
// guessed at again, so a refusal points at exactly what a completion would have offered.
function noSuchSection(at: NamedSection, loaded: readonly AddressedSection[]): CommandResult {
  const near = loaded.filter((section) => namesOf(section).some((name) => namesFrom(name, at.id!))).map((section) => section.address);
  const under = at.kind === null ? 'loaded' : `loaded as # ${at.kind}`;
  if (near.length === 0) {
    const ask = at.kind === null ? '/source <kind> lists what is loaded of a kind' : `/source ${at.kind} lists the ${new Set(loaded.map((section) => section.address)).size} there are`;
    return noted('error', `nothing loaded is written as ${wroteAs(at)}; ${ask}`);
  }
  const { rows } = listedRows(near);
  return noted('error', `nothing loaded is written as ${wroteAs(at)}`, [`${new Set(near).size} ${under} ${new Set(near).size === 1 ? 'is' : 'are'} named from ${at.id}:`, ...rows]);
}

// An id that is at once a section's own name and an action on a different section is an id whose
// reader meant one of the two, and nothing in the id says which. Both readings are named rather
// than one of them picked.
function bothWays(at: NamedSection, named: readonly AddressedSection[], owning: readonly AddressedSection[]): CommandResult {
  const rows = (sections: readonly AddressedSection[], as: string): string[] => [...new Set(sections.map((section) => `  # ${section.kind} ${section.address} — ${as}`))].sort();
  return noted('error', `${at.id} reads two ways and nothing in it says which`, [...rows(named, 'a section written under that id'), ...rows(owning, 'the section an action of that id is written in')]);
}

// A section as its author wrote it, out of the file it was written in. The world is read for
// examples far oftener than it is written to, and a printed section is not an example of anything:
// it has already lost the comments and the `@@@` notes that say what the author was reaching for.
// Asked with a kind and no id it says which of them there are, because an author who cannot name a
// section cannot read one, and until this answered nothing did.
function runSource(ctx: CommandContext, at: NamedSection): CommandResult {
  const authoring = ctx.authoring;
  if (!authoring) return noted('error', UNAVAILABLE);
  let written: AddressedSection[];
  try {
    written = [...authoring.baseSources, authoring.localSource].flatMap((module) => addressedSections(module).sections);
  } catch (error) {
    if (error instanceof DslError) return noted('error', error.message);
    throw error;
  }
  const loaded = at.kind === null ? written : written.filter((section) => section.kind === at.kind);
  if (at.id === null) {
    const { rows, folded } = listedRows(loaded.map((section) => section.address));
    if (rows.length === 0) return noted('error', `nothing loaded is written as # ${at.kind}`);
    const narrows = folded ? ', and an id naming part of one lists what it names' : '';
    return asSource([`${new Set(loaded.map((section) => section.address)).size} loaded as # ${at.kind}; /source ${at.kind} <id> writes one out as its author wrote it${narrows}:`, ...rows]);
  }
  const named = loaded.filter((section) => namesOf(section).includes(at.id!));
  const owner = ownerAsked(at.id);
  const owning = owner === null ? [] : loaded.filter((section) => ownerForms(section).includes(owner));
  if (named.length > 0 && owning.some((section) => !named.includes(section))) return bothWays(at, named, owning);
  const found = named.length > 0 ? named : owning;
  if (found.length === 0) return noSuchSection(at, loaded);
  return asSource(found.flatMap((section, index) => (index === 0 ? [] : ['']).concat(section.text.split('\n'))));
}

function runLocal(ctx: CommandContext, op: LocalOp): CommandResult {
  const authoring = ctx.authoring;
  if (!authoring) return noted('error', UNAVAILABLE);

  try {
    switch (op.op) {
      case 'list': {
        const source = localSourceNow(authoring);
        if (!source.read) return source.refusal;
        const headings = localSectionHeadings(source.text);
        return headings.length > 0
          ? { output: [{ kind: 'source', words: 'tool', lines: headings }], quit: false, recorded: [] }
          : noted('plain', 'No local changes staged.');
      }
      case 'show':
        return { output: [{ kind: 'source', words: 'tool', lines: localChangesNow(authoring).trimEnd().split('\n') }], quit: false, recorded: [] };
      case 'clear':
        return commitLocalChanges(ctx, authoring, renderLocalChangesModule(authoring.dependencies), `Cleared ${LOCAL_CHANGES_MODULE_ID}.`);
      case 'delete':
        return dropLocalSections(ctx, [{ kind: op.kind, id: op.id }]);
      default: {
        const unreached: never = op;
        return unreached;
      }
    }
  } catch (error) {
    if (error instanceof DslError) return noted('error', error.message);
    return refused(error);
  }
}

function buildCreateTest(ctx: CommandContext, id: string, opts: { valid: boolean }): CommandResult {
  const { recorder, session } = ctx;
  if (recorder.history.length === 0) return noted('error', 'nothing recorded yet');

  const { from, lines } = runStart(recorder.history, recorder.startSave);
  if (!startsAtSave(from) && savedGameFromSerialized(from.bytes) === null) return noted('error', 'no start save was taken when this session began');

  const kept: KeptRun = {
    run: { id, log: lines.map((line, index) => turnRecord(index + 1, line, 'applied', [line], null)) },
    from,
    ends: opts.valid ? serializeSession(session) : undefined,
  };
  const blocks = runBlocks(kept);

  const registryOf = (at: SectionAddress): Map<string, unknown> => (at.kind === RUN_SECTION ? session.registry.tests : session.registry.saves);
  if (blocks.some(([at]) => registryOf(at).has(at.id))) return noted('error', `test '${id}' already exists`);

  // The session that wrote a run holds it at once, so /test replays it without a reload. It lands
  // section by section off the same list that goes out as text: nothing here decides which sections
  // there are or what they are called.
  const landing: (() => void)[] = [];
  for (const [at, body] of blocks) {
    if (at.kind === RUN_SECTION) {
      const directives: Directive[] = [];
      for (const directiveLine of body) {
        const directive = parseDirectiveLine(directiveLine);
        if (!directive) return noted('error', `internal: recorded line does not parse: ${directiveLine}`);
        directives.push(directive);
      }
      landing.push(() => session.registry.tests.set(at.id, { id: at.id, directives }));
    } else {
      const saved = savedGameFromSerialized(body.join('\n'));
      if (!saved) return noted('error', `internal: recorded save does not read back: ${at.id}`);
      landing.push(() => session.registry.saves.set(at.id, saved));
    }
  }
  for (const land of landing) land();

  return {
    output: [note('plain', `Created test '${id}' (${recorder.history.length} steps).`), { kind: 'authored', words: 'tool', blocks: runAsSections(kept) }],
    quit: false,
    recorded: [],
  };
}

export const NO_SAVES = 'this session has nowhere to keep slots.';

function withSaves(ctx: CommandContext, run: (save: SaveContext) => CommandResult): CommandResult {
  if (!ctx.save) return noted('error', NO_SAVES);
  try {
    return run(ctx.save);
  } catch (error) {
    return refused(error);
  }
}

function importPayload(ctx: CommandContext, payload: string, done: string, from: string | null): CommandResult {
  const saved = savedGameFromSerialized(payload);
  if (!saved) return noted('error', `that is not a # save body: ${JSON.stringify(payload.slice(0, 60))}`);
  let pruned: readonly PruneWarning[];
  try {
    pruned = loadSaved(ctx.session, saved);
  } catch (error) {
    return refused(error);
  }
  if (ctx.save) ctx.save.synced = from;
  return shown(view(ctx.session), [note('ok', done), ...prunedNotes(pruned)]);
}

const loaded = (result: CommandResult): boolean => !result.output.some((each) => each.kind === 'message' && each.tone === 'error');

const SLOT_COLUMN = 14;

function slotAge(save: SaveContext, writtenAt: number | null): string {
  return writtenAt === null ? 'unreadable' : `written ${formatElapsed((save.now() - writtenAt) / 1000)}s ago`;
}

function slotStanding(save: SaveContext): string[] {
  const report = saveReport(save);
  return [
    `writing ${report.slot}, dev mode ${report.dev ? 'on' : 'off'}${WHY_NOT[report.writes]}`,
    `autosave ${cadenceStanding(report.autosave)}`,
    ...report.slots.map((slot) => `${slot.name.padEnd(SLOT_COLUMN)} ${slotAge(save, slot.writtenAt)}`),
  ];
}

const NOT_ADOPTED = 'this session did not come out of that slot, so autosave will not write it: /restore to pick it up or /save to replace it';

const UNREADABLE_SLOT = 'that slot holds bytes nothing here can read, so autosave leaves them alone: look at the file, or /save to replace it';

const UNREADABLE_CADENCE = `the slot the cadence lives in does not hold one, so nothing is autosaved: /autosave <s> or /autosave ${NEVER} sets it again`;

// A cadence is a least interval, so no interval at all is every action rather than none of them.
const cadenceStanding = (cadence: Cadence | null): string =>
  cadence === null ? `— ${UNREADABLE_CADENCE}` : cadence === NEVER ? NEVER : cadence === 0 ? 'after every action' : `every ${cadence}s`;

const WHY_NOT: Record<SlotWrites, string> = { yes: '', 'not-ours': ` — ${NOT_ADOPTED}`, unreadable: ` — ${UNREADABLE_SLOT}` };

// What an opening says about the game it did or did not pick back up, in one place, so no driver
// spells its own. A slot that was left alone is said in error words: it is the one thing here a
// player cannot see for themselves, because the world in front of them looks like a new game.
export function resumptionNotes(resumed: Resumption): ToolMessage[] {
  if (resumed.kind === 'new') return [];
  if (resumed.kind === 'kept') return [note('error', `slot ${resumed.slot} holds a game this build cannot open, so it was left alone and this is a new one: ${resumed.why}`, [UNREADABLE_SLOT])];
  return [note('ok', `Picked up slot ${resumed.slot}.`), ...prunedNotes(resumed.pruned)];
}

// Said only where the engine tried to write and could not. A slot it is deliberately leaving alone
// is not a failure and is not said here: that is a standing fact `saveReport.writes` answers, which
// `/slots` and `/state` read on demand, and whatever left the session unadopted — a game this build
// could not open, dev mode letting go of one — said so once at the moment it did. Repeating it under
// every action told a player who asked for nothing what an author who typed /autosave wanted to know.
function autosaved(ctx: CommandContext): ToolMessage | null {
  if (!ctx.save) return null;
  try {
    autosave(ctx.save, () => serializeSession(ctx.session));
    return null;
  } catch (error) {
    if (error instanceof RuntimeError) return note('error', `autosave: ${error.message}`);
    throw error;
  }
}

// An author's session shows a room as it is written. Set through the ordinary settings path, so it is
// saved with the dev slot, comes back with it, and can be turned on again by anyone who wants to see
// what a player sees.
function unmasked(ctx: CommandContext, result: CommandResult): CommandResult {
  applyDirective(ctx.session, { kind: 'setting', setting: 'masking', value: 'off' });
  return { ...result, view: view(ctx.session) };
}

function devOn(ctx: CommandContext, save: SaveContext): CommandResult {
  const authoring = enterDev(save, serializeSession(ctx.session));
  if (authoring === null) return unmasked(ctx, noted('ok', `Dev mode on, writing slot ${liveSlot(save)}.`));

  const result = importPayload(ctx, authoring, `Dev mode on, slot ${DEV_SLOT} picked up.`, DEV_SLOT);
  if (loaded(result)) return unmasked(ctx, result);
  return unmasked(ctx, { ...result, output: [...result.output, note('warn', `Dev mode is on, but slot ${DEV_SLOT} could not be picked up, so this session is left as it is and will not be written there. /save takes it.`)] });
}

function devOff(ctx: CommandContext, save: SaveContext): CommandResult {
  const exit = devSnapshot(save);
  if (exit.kind === 'no-snapshot') {
    leaveDev(save, null);
    return noted('ok', `Dev mode off, writing slot ${liveSlot(save)}. ${exit.why}, so this session is left as it is and will not be written to one. Slot ${DEV_SLOT} still holds what dev did.`);
  }

  const result = importPayload(ctx, exit.payload, `Dev mode off, the session before dev is back.`, exit.synced);
  const back = loaded(result);
  leaveDev(save, back ? exit.synced : null);
  if (back) return result;
  return { ...result, output: [...result.output, note('warn', `Dev mode off, but this session could not be put back to what it was before dev, so it will not be written to a slot. Slot ${DEV_SLOT} still holds what dev did.`)] };
}

// Every setting, in the words the live view already publishes them in, so the terminal and the
// settings page are reading one list rather than two.
function settingStanding(ctx: CommandContext, row: SettingRow): PlayerMessage {
  const localizer = sessionLocalizer(ctx.session);
  return {
    kind: 'message',
    words: 'player',
    tone: 'plain',
    text: localizer.engine('engine.setting.stands', { setting: row.title, value: row.choices.find((each) => each.written === row.standing)?.shown ?? localizer.identifier(row.standing) }),
    detail: [row.note, localizer.engine('engine.setting.takes', { choices: localizer.identifier(row.choices.map((each) => `${each.written} (${each.shown})`).join(', ')) })],
  };
}

function listSettings(ctx: CommandContext): CommandResult {
  return { output: ctx.view.settings.map((row) => settingStanding(ctx, row)), quit: false, recorded: [] };
}

function playBy(ctx: CommandContext, name: string, directive: Directive): CommandResult {
  const result = runDirective(ctx, directive);
  const row = result.view?.settings.find((each) => each.name === name);
  return row === undefined ? result : { ...result, output: [settingStanding(ctx, row), ...result.output] };
}

function requireId(name: string): (rest: string) => string | CommandProblem {
  return (rest) => (rest === '' ? { problem: `${name} requires an id` } : rest);
}

// Restating the shape tells somebody whose line already looks like the shape nothing at all. The
// word the line was actually read down to is the one thing they cannot see by looking at what they
// typed, so a refusal hands that back.
const readAs = (head: string, at: number): string => {
  const word = head.split(/[ \t]+/).filter((each) => each !== '')[at];
  return word === undefined ? 'nothing' : JSON.stringify(word);
};

function directiveFrom(name: string, text: (rest: string) => string): (rest: string, ctx: CommandContext) => Directive | CommandProblem {
  return (rest, ctx) => {
    const parsed = parseDirective(text(rest), ctx);
    if (isProblem(parsed)) return parsed;
    if (!parsed) return { problem: `unknown command: ${rest === '' ? name : `${name} ${rest}`}` };
    return parsed;
  };
}

function parseDirective(line: string, ctx: CommandContext): Directive | null | CommandProblem {
  try {
    const typed = parseDirectiveLine(line);
    return typed && resolveDirective(typed, ctx.session.registry);
  } catch (error) {
    if (error instanceof RuntimeError || error instanceof DslError) return { problem: error.message };
    throw error;
  }
}

export function askedOption(modals: readonly Modal[]): ModalOption | undefined {
  return modals[modals.length - 1]?.options[0];
}

function numberedModalAnswer(current: PlayView, trimmed: string): string | null {
  const asking = askedOption(current.modals);
  if (!asking?.values) return null;
  const index = Number(trimmed);
  if (!Number.isInteger(index) || index < 1 || index > asking.values.length) return null;
  return `submit-modal: ${asking.key}=${asking.values[index - 1].value}`;
}

export const COMMANDS: readonly CommandSpec[] = [
  define({
    name: '<N>',
    match: 'choice',
    arg: 'choice',
    summary: 'choose option N',
    parse: (rest, ctx) => {
      const index = isChoiceLine(ctx.view, rest);
      return index ?? { problem: invalidChoice(rest) };
    },
    run: (ctx, index) => (ctx.live.driving ? driveChoice(ctx, index) : applyChoice(ctx, index)),
  }),
  define({
    name: '<enter>',
    match: 'blank',
    arg: 'none',
    summary: 'list the current choices',
    parse: nothing,
    run: (ctx) => ({ output: [{ kind: 'choices', choices: ctx.view.choices }], quit: false, recorded: [] }),
  }),
  define({
    name: '<directive>',
    match: 'directive',
    arg: 'directive',
    summary: 'any raw directive line (talk:/use:/travel:/craft:/begin:/submit-modal:/…)',
    parse: (rest, ctx) => {
      const parsed = parseDirective(rest, ctx);
      if (isProblem(parsed)) return parsed;
      if (!parsed) return { problem: `not a directive: ${rest}` };
      return parsed;
    },
    run: runDirective,
  }),
  define({
    name: '/look',
    arg: 'none',
    summary: 're-read the current location description',
    parse: nothing,
    run: (ctx) => ({ view: ctx.view, output: [{ kind: 'view', view: ctx.view, reread: true }], quit: false, recorded: [] }),
  }),
  define({
    name: '/inventory',
    aliases: ['/inv'],
    arg: 'id',
    argHint: '[<item>]',
    summary: 'open the inventory screen, on <item> when one is named',
    parse: (rest, ctx) => {
      if (rest === '' || wornCopySlot(rest) !== undefined) return rest;
      try {
        return resolveCarried(rest, ctx.session.registry, '/inventory');
      } catch (error) {
        if (error instanceof RuntimeError || error instanceof DslError) return { problem: error.message };
        throw error;
      }
    },
    run: openInventory,
  }),
  define({
    name: '/wait',
    arg: 'directive',
    argHint: '<s>',
    summary: 'advance simulated time by <s> seconds, letting whatever moves with the clock move: buffs tick down toward expiry, and a pool refills at whatever regeneration is in effect — none, unless something has granted some; or /wait done until what is under way has finished, or /wait <n> times to stand while it comes round that many more times',
    parse: directiveFrom('/wait', (rest) => `wait: ${rest}`),
    run: runDirective,
  }),
  define({
    name: '/goto',
    arg: 'directive',
    argHint: '<location>',
    audience: 'cheat',
    summary: 'stand in a location at once, whether or not a road reaches it',
    parse: directiveFrom('/goto', (rest) => `goto: ${rest}`),
    run: runDirective,
  }),
  define({
    name: '/speed',
    arg: 'number',
    argHint: '<n>',
    summary: 'set the live-mode time multiplier (default 1)',
    parse: (rest) => {
      const multiplier = Number(rest);
      if (rest === '' || Number.isNaN(multiplier) || multiplier <= 0) {
        return { problem: `/speed requires a positive number, got ${JSON.stringify(rest)}` };
      }
      return multiplier;
    },
    run: (ctx, multiplier) => {
      ctx.live.speed = multiplier;
      return said('plain', sessionLocalizer(ctx.session).engine('engine.command.speed', { speed: multiplier }));
    },
  }),
  define({
    name: '/quests',
    aliases: ['/journal'],
    arg: 'id',
    argHint: '[<quest>]',
    summary: 'list every quest and where each stands, or open the journal on one',
    parse: (rest) => rest,
    run: (ctx, quest) => {
      const localizer = sessionLocalizer(ctx.session);
      const entries = sessionJournal(ctx.session);
      if (quest !== '') return openJournal(ctx, entries, quest);
      if (entries.length === 0) return { output: [message('plain', localizer.engine('engine.repl.journal.none'))], quit: false, recorded: [] };
      return {
        output: entries.map((entry) => ({
          kind: 'message' as const,
          words: 'player' as const,
          tone: 'plain' as const,
          text: grouped(localizer, entry.group, entry.title),
          detail: entry.lines.map((line) => (line.struck ? localizer.engine('engine.repl.journal.struck', { said: line.said }) : line.said)),
        })),
        quit: false,
        recorded: [],
      };
    },
  }),
  define({
    name: '/stat',
    arg: 'id',
    argHint: '[<stat>]',
    summary: 'list every stat and what it stands at, or open one on what is adding to it',
    parse: (rest) => rest,
    run: (ctx, stat) => {
      const localizer = sessionLocalizer(ctx.session);
      if (stat !== '') return openStat(ctx, stat);
      return {
        output: ctx.view.stats.map((row) => ({
          kind: 'message' as const,
          words: 'player' as const,
          tone: 'plain' as const,
          text: grouped(localizer, row.group, localizer.engine('engine.repl.stat', { stat: row.title, value: Number(row.value.toFixed(2)) })),
        })),
        quit: false,
        recorded: [],
      };
    },
  }),
  define({
    name: '/map',
    arg: 'none',
    summary: 'draw the map: the floor you are on, the roads across it, and every way out under the number that walks it',
    parse: nothing,
    run: (ctx) => ({ output: [{ kind: 'map', map: sheetOf(ctx.view, null, ctx.save?.dev === true ? 'every' : 'found') }], quit: false, recorded: [] }),
  }),
  define({
    name: '/state',
    arg: 'none',
    summary: "dump this session's state — where and when you are, your pools, stats and skills, what you carry and wear, and the places you have found and the roads between them",
    parse: nothing,
    run: (ctx) => ({ output: [{ kind: 'status', status: sessionStatus(ctx.session) }], quit: false, recorded: [] }),
  }),
  define({
    name: '/test',
    arg: 'id',
    argHint: '<id>',
    summary: 'run a # test by id and report PASSED/FAILED',
    audience: 'author',
    parse: requireId('/test'),
    run: runNamedTest,
  }),
  define({
    name: '/load',
    arg: 'directive',
    argHint: '<id>',
    summary: 'load a # save by id',
    audience: 'author',
    parse: directiveFrom('/load', (rest) => `load: ${rest}`),
    run: runDirective,
  }),
  define({
    name: '/expect',
    arg: 'directive',
    argHint: '<id>',
    summary: 'assert current state matches a # save by id',
    audience: 'author',
    parse: directiveFrom('/expect', (rest) => `expect: ${rest}`),
    run: runDirective,
  }),
  define({
    name: '/assert',
    arg: 'directive',
    argHint: '<c>',
    summary: 'assert a condition against current state',
    audience: 'author',
    parse: directiveFrom('/assert', (rest) => `assert: ${rest}`),
    run: runDirective,
  }),
  define({
    name: '/cancel',
    arg: 'none',
    summary: 'cancel the in-flight spannable action, if any',
    parse: nothing,
    run: (ctx) => runDirective(ctx, { kind: 'cancel' }),
  }),
  define({
    name: '/grammar',
    arg: 'kinds',
    argHint: '[<kind>...]',
    summary: 'print what may be written under a kind, at the indentation it is written at; with no kind, list the kinds',
    audience: 'author',
    parse: (rest) => {
      const asked = rest.split(/[ \t]+/).filter((each) => each !== '');
      const unknown = asked.filter((kind) => !isSectionKind(kind));
      if (unknown.length > 0) return { problem: `/grammar: no such kind: ${unknown.join(', ')}. There is ${sectionKinds().join(', ')}` };
      return asked;
    },
    run: runGrammar,
  }),
  define({
    name: '/source',
    arg: 'named',
    argHint: '<kind> | <id> | <kind> <id>',
    summary: 'print a loaded section as its author wrote it, comments and all; any id a view printed will do, an action id reading out the entity, location or item it is written in; with no kind, every section written under that id; with no id, the ids loaded of that kind',
    audience: 'author',
    parse: (rest) => {
      const match = /^(?:(?<kind>[a-z][a-z0-9-]*)[ \t]+)?(?<id>[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*)$/.exec(rest.trim())?.groups;
      if (!match) return { problem: '/source requires <kind>, <id> or <kind> <id>' };
      // One word that is a kind is asking after the kind. An id spelled the same as a kind is still
      // reachable, under the kind it is of — and a word that names nothing at all is worth more read
      // as the question somebody could not otherwise ask than as an id that is going to be refused.
      if (match.kind === undefined && isSectionKind(match.id!)) return { kind: match.id!, id: null };
      return { kind: match.kind ?? null, id: match.id! };
    },
    run: runSource,
  }),
  define({
    name: '/dsl',
    edits: true,
    arg: 'section',
    argHint: '<kind> <module>.<id> [body]',
    summary: 'stage or replace one local DSL section, under the module it belongs to; use | for new lines',
    audience: 'author',
    parse: (rest) => {
      const [head = '', ...more] = rest.split('\n');
      const match = /^(?<kind>[a-z][a-z0-9-]*)(?:[ \t]+(?<id>[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*))?(?:[ \t]+(?<body>.*))?$/.exec(head)?.groups;
      if (!match?.kind || !match.id) return { problem: `/dsl requires <kind> <module>.<id> [body]; it read ${readAs(head, 0)} as the kind and ${readAs(head, 1)} as the id` };
      // An id a module owns says which module, whether the section is one already there or one being written for the first time: that is the whole of how a section authored in a run has somewhere to go home to.
      const homeless = homelessId(match.kind, match.id);
      if (homeless !== null) return { problem: `/dsl ${match.kind} ${homeless}` };
      return { kind: match.kind, id: match.id, body: [match.body ?? '', ...more].join('\n') };
    },
    run: runSectionEdit,
  }),
  define({
    name: '/place',
    edits: true,
    arg: 'placing',
    argHint: `<location> <x> <y> [<z>] | <location> ${relativeValue.forms[0]}`,
    audience: 'author',
    summary:
      'say where a location is, outright or as one step off another; a place given coordinates stops hanging off anything, and one written off another moves with it. An id nothing declares makes the place, under the module the id names. Staged as a local change like any other edit',
    parse: (rest) => {
      const off = writtenOff(rest);
      if (off) return off;
      const match = /^(?<location>\S+)[ 	]+(?<x>-?\d+)[ 	]+(?<y>-?\d+)(?:[ 	]+(?<z>-?\d+))?$/.exec(rest)?.groups;
      if (!match) return { problem: `/place requires <location> <x> <y> [<z>] or <location> ${relativeValue.forms[0]}` };
      return { location: match.location!, at: { x: Number(match.x), y: Number(match.y), ...(match.z === undefined ? {} : { z: Number(match.z) }) } };
    },
    run: (ctx, arg) =>
      runMapEdit(ctx, (registry, local) =>
        'off' in arg
          ? pinning(registry, local, addressOf(ctx, arg.location), arg.off.direction, addressOf(ctx, arg.off.of))
          : placing(registry, local, addressOf(ctx, arg.location), arg.at),
      ),
  }),
  define({
    name: '/region',
    edits: true,
    arg: 'gathering',
    argHint: '<region> +<location>... | -<location>... | by <x> <y>',
    audience: 'author',
    summary: 'gather locations into a region, let some go, or move the whole of one; a name nothing declares yet becomes a region of your own',
    parse: (rest) => {
      const match = /^(?<region>\S+)[ 	]+(?:by[ 	]+(?<x>-?\d+)[ 	]+(?<y>-?\d+)|(?<sign>[+-])[ 	]*(?<places>\S.*))$/.exec(rest)?.groups;
      if (!match) return { problem: '/region requires <region> +<location>... or <region> -<location>... or <region> by <x> <y>' };
      if (match.x !== undefined) return { region: match.region!, by: { x: Number(match.x), y: Number(match.y) } };
      return { region: match.region!, places: match.places!.split(/[ 	]+/).filter((each) => each !== ''), holding: match.sign === '+' };
    },
    run: (ctx, arg) =>
      runMapEdit(ctx, (registry, local) =>
        'by' in arg
          ? shifting(registry, local, regionOf(ctx, arg.region), arg.by)
          : gathering(registry, local, regionOf(ctx, arg.region), arg.places.map((place) => addressOf(ctx, place)), arg.holding),
      ),
  }),
  define({
    name: '/link',
    edits: true,
    arg: 'joining',
    argHint: '<location> <location>',
    audience: 'author',
    summary: 'draw a road between two locations, or take one away with /unlink; staged as a local change like any other edit',
    parse: joiningFrom(true),
    run: (ctx, arg) => runMapEdit(ctx, (registry, local) => joining(registry, local, addressOf(ctx, arg.from), addressOf(ctx, arg.to), arg.road)),
  }),
  define({
    name: '/unlink',
    edits: true,
    arg: 'joining',
    argHint: '<location> <location>',
    audience: 'author',
    summary: 'take away a road between two locations',
    parse: joiningFrom(false),
    run: (ctx, arg) => runMapEdit(ctx, (registry, local) => joining(registry, local, addressOf(ctx, arg.from), addressOf(ctx, arg.to), arg.road)),
  }),
  define({
    name: '/local',
    arg: 'local',
    argHint: '[show | delete <kind> <id> | clear]',
    summary: 'list, print, delete or clear staged local changes',
    audience: 'author',
    parse: (rest) => {
      if (rest === '' || rest === 'list') return { op: 'list' };
      if (rest === 'show' || rest === 'export') return { op: 'show' };
      if (rest === 'clear') return { op: 'clear' };
      const remove = /^delete[ \t]+(?<kind>[a-z][a-z0-9-]*)[ \t]+(?<id>[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*)$/.exec(rest)?.groups;
      if (remove) return { op: 'delete', kind: remove.kind, id: remove.id };
      return { problem: `unknown /local command: ${rest}` };
    },
    run: runLocal,
  }),
  define({
    name: '/reload',
    arg: 'none',
    summary: 're-read the local DSL file and adopt it, or refuse the whole edit',
    audience: 'author',
    parse: nothing,
    run: runReload,
  }),
  define({
    name: '/export',
    arg: 'none',
    summary: 'print the current save as a # save body',
    audience: 'player',
    parse: nothing,
    run: (ctx) => ({ output: [{ kind: 'source', words: 'tool', lines: [serializeSession(ctx.session)] }], quit: false, recorded: [] }),
  }),
  define({
    name: '/import',
    arg: 'id',
    argHint: '<body>',
    summary: 'load a # save body printed by /export',
    audience: 'player',
    parse: (rest) => (rest === '' ? { problem: '/import requires a # save body' } : rest),
    run: (ctx, body) => importPayload(ctx, body, 'Imported.', null),
  }),
  define({
    name: '/save',
    arg: 'none',
    summary: 'write the current save to the live slot',
    parse: nothing,
    run: (ctx) => withSaves(ctx, (save) => noted('ok', `Saved to slot ${saveNow(save, serializeSession(ctx.session))}.`)),
  }),
  define({
    name: '/restore',
    arg: 'none',
    summary: 'load the live slot back',
    parse: nothing,
    run: (ctx) =>
      withSaves(ctx, (save) => {
        const name = liveSlot(save);
        const slot = save.store.read(name);
        if (!slot) return noted('error', `slot ${name} holds nothing.`);
        return importPayload(ctx, slot.payload, `Loaded slot ${name}.`, name);
      }),
  }),
  define({
    name: '/slots',
    arg: 'none',
    summary: 'report which slot is live, the cadence, and what is kept',
    parse: nothing,
    run: (ctx) => withSaves(ctx, (save) => ({ output: [{ kind: 'source', words: 'tool', lines: slotStanding(save) }], quit: false, recorded: [] })),
  }),
  define({
    name: '/autosave',
    arg: 'cadence',
    argHint: `<s|${NEVER}>`,
    summary: `set the least seconds between autosaves; 0 after every action, ${NEVER} not at all`,
    parse: (rest) => {
      if (rest === NEVER) return NEVER;
      const seconds = Number(rest);
      if (rest === '' || !Number.isFinite(seconds) || seconds < 0) return { problem: `/autosave requires seconds or ${NEVER}, got ${JSON.stringify(rest)}` };
      return seconds;
    },
    run: (ctx, cadence) =>
      withSaves(ctx, (save) => {
        setAutosaveCadence(save, cadence);
        return noted('ok', `Autosave ${cadenceStanding(cadence)}.`);
      }),
  }),
  define({
    name: '/settings',
    arg: 'setting',
    argHint: '[<setting> <value>]',
    summary: 'list what this run is played by and where each stands, or play the rest of it by another',
    parse: (rest, ctx) => {
      if (rest === '') return { op: 'list' };
      const directive = parseDirective(`setting: ${rest}`, ctx);
      if (isProblem(directive)) return directive;
      if (!directive) return { problem: `/settings takes a setting and one of the words it is played by, as in /settings hardcore on, or nothing at all to list them` };
      return { op: 'set', name: rest.split(/[ 	]+/)[0], directive };
    },
    run: (ctx, op) => (op.op === 'list' ? listSettings(ctx) : playBy(ctx, op.name, op.directive)),
  }),
  define({
    name: '/dev',
    arg: 'id',
    argHint: 'on | off',
    summary: 'author against a slot of its own, and come back to this session on the way out',
    audience: 'author',
    parse: (rest) => (rest === 'on' || rest === 'off' ? rest : { problem: '/dev requires on or off' }),
    run: (ctx, mode) => withSaves(ctx, (save) => (mode === 'on' ? devOn(ctx, save) : devOff(ctx, save))),
  }),
  define({
    name: '/create-test',
    arg: 'id',
    argHint: '<id>',
    summary: 'emit a # test from what you just did in this session',
    audience: 'author',
    parse: requireId('/create-test'),
    run: (ctx, id) => buildCreateTest(ctx, id, { valid: false }),
  }),
  define({
    name: '/create-valid-test',
    arg: 'id',
    argHint: '<id>',
    summary: 'same, plus a # save + expect: regression assertion',
    audience: 'author',
    parse: requireId('/create-valid-test'),
    run: (ctx, id) => buildCreateTest(ctx, id, { valid: true }),
  }),
  define({
    name: '/help',
    arg: 'none',
    summary: 'show this help',
    parse: nothing,
    run: () => ({ output: [{ kind: 'help', words: 'tool', entries: helpEntries() }], quit: false, recorded: [] }),
  }),
  define({
    name: '/quit',
    aliases: ['/q'],
    arg: 'none',
    summary: 'show final state and exit',
    parse: nothing,
    run: (ctx) => ({ output: [{ kind: 'status', status: sessionStatus(ctx.session) }], quit: true, recorded: [] }),
  }),
];

const BY_TOKEN = new Map<string, CommandSpec>(
  COMMANDS.filter((spec) => spec.match === 'name').flatMap((spec) => [spec.name, ...spec.aliases].map((token) => [token, spec] as const)),
);

export const DEV_TOKENS: readonly string[] = [...BY_TOKEN].filter(([, spec]) => spec.audience === 'cheat').map(([token]) => token);

export function devTokenIn(line: string): string | undefined {
  const token = line.trim().split(/[ \t]+/)[0];
  return DEV_TOKENS.includes(token) ? token : undefined;
}

function byMatch(match: CommandMatch): CommandSpec {
  const spec = COMMANDS.find((each) => each.match === match);
  if (!spec) throw new RuntimeError(`no command matches by ${match}`);
  return spec;
}

const CHOICE = byMatch('choice');
const BLANK = byMatch('blank');
const DIRECTIVE = byMatch('directive');

export function helpEntries(): CommandHelp[] {
  return COMMANDS.map((spec) => ({ name: spec.name, aliases: spec.aliases, argHint: spec.argHint, summary: spec.summary }));
}

export function findCommand(token: string): CommandSpec | undefined {
  return BY_TOKEN.get(token);
}

export interface ParsedCommand {
  spec: CommandSpec;
  arg: ArgTypes[ArgKind];
}

// A choice answers to the id it was published under as well as to where it sits in the list. A
// driver that reads the list aloud can echo the id back and never construct a position; the
// terminal keeps typing numbers, which is what a person at a keyboard wants.
export function isChoiceLine(current: PlayView, line: string): number | null {
  const trimmed = line.trim();
  if (trimmed === '') return null;
  const named = current.choices.findIndex((choice) => choice.id === trimmed);
  if (named >= 0) return named + 1;
  const index = Number(trimmed);
  if (!Number.isInteger(index) || index < 1 || index > current.choices.length) return null;
  return index;
}

function against(spec: CommandSpec, rest: string, ctx: CommandContext): ParsedCommand | CommandProblem {
  const arg = spec.parse(rest, ctx);
  return isProblem(arg) ? arg : { spec, arg };
}

export function parseLine(ctx: CommandContext, line: string): ParsedCommand | CommandProblem {
  const trimmed = lineBroken(line).trim();
  if (trimmed === '') return against(BLANK, '', ctx);

  if (trimmed.startsWith('/')) {
    const token = /^\S+/.exec(trimmed)![0];
    const spec = findCommand(token);
    if (!spec) return { problem: `unknown command: ${trimmed}` };
    const rest = trimmed.slice(token.length).replace(/^[ \t]+/, '').trimEnd();
    if (rest !== '' && spec.arg === 'none') return { problem: `unknown command: ${trimmed}` };
    return against(spec, rest, ctx);
  }

  const answer = numberedModalAnswer(ctx.view, trimmed);
  const directive = parseDirective(answer ?? trimmed, ctx);
  if (isProblem(directive)) return directive;
  if (directive) return { spec: DIRECTIVE, arg: directive };

  return against(CHOICE, trimmed, ctx);
}

function settle(ctx: CommandContext, result: CommandResult): CommandResult {
  ctx.recorder.history.push(...result.recorded);
  if (result.view) ctx.view = result.view;
  if (result.recorded.length === 0) return result;
  const problem = autosaved(ctx);
  return problem ? { ...result, output: [...result.output, problem] } : result;
}

export function runCommand(ctx: CommandContext, spec: CommandSpec, arg: ArgTypes[ArgKind]): CommandResult {
  return settle(ctx, spec.run(ctx, arg));
}

export function runLine(ctx: CommandContext, line: string): CommandResult {
  const parsed = parseLine(ctx, line);
  if (isProblem(parsed)) return refusal(ctx, parsed.problem);
  return runCommand(ctx, parsed.spec, parsed.arg);
}

export const LIVE_TICK_MS = 100;

export type Ticker = (tick: (elapsedMs: number) => void) => () => void;

export interface Clock {
  now(): number;
  every(ms: number, fire: () => void): () => void;
}

export const wallClock: Clock = {
  now: () => Date.now(),
  every: (ms, fire) => {
    const timer = setInterval(fire, ms);
    return () => clearInterval(timer);
  },
};

export function createTicker(clock: Clock = wallClock, everyMs: number = LIVE_TICK_MS): Ticker {
  return (tick) => {
    let last = clock.now();
    return clock.every(everyMs, () => {
      const now = clock.now();
      const elapsedMs = now - last;
      last = now;
      tick(elapsedMs);
    });
  };
}

export interface LivePool {
  title: Localized;
  current: number;
  max: number;
  remaining: number | null;
}

export interface LiveProgress {
  label: Localized;
  // Who is being fought, carried beside the label the same way the view carries it.
  detail?: Localized;
  active: boolean;
  time: number;
  progress: number;
  pools: LivePool[];
  implicit: { attempts: number; completion: number } | null;
  view: PlayView;
}

export interface LiveRun {
  tick(elapsedMs: number): LiveProgress;
  end(cancelled: boolean): CommandResult;
}

function finished(label: Localized, current: PlayView): LiveProgress {
  return { label, active: false, time: current.time, progress: 1, pools: [], implicit: null, view: current };
}

function livePools(status: PlayStatus): LivePool[] {
  if (!status.encounter) return [];
  return [
    ...status.resources.filter((resource) => resource.display === 'full').map((resource) => ({ title: resource.title, current: resource.current, max: resource.max, remaining: null })),
    ...status.encounter.foes.map((foe) => ({ title: foe.title, current: foe.current, max: foe.max, remaining: foe.remaining })),
  ];
}

function tickOnce(ctx: CommandContext, previous: PlayStatus, elapsedMs: number, armed: Localized): LiveProgress {
  const label = previous.action?.label ?? armed;
  const next = wait(ctx.session, (elapsedMs / 1000) * ctx.live.speed);
  ctx.view = next;

  const action = next.action;
  if (!action) return finished(label, next);

  return {
    label,
    ...(action.detail === undefined ? {} : { detail: action.detail }),
    active: true,
    time: next.time,
    progress: action.progress,
    pools: livePools(next),
    implicit: action.completion === null ? null : { attempts: action.attempts, completion: action.completion },
    view: next,
  };
}

function applyChoice(ctx: CommandContext, index: number): CommandResult {
  const choice = ctx.view.choices[index - 1];
  if (!choice) return refusal(ctx, invalidChoice(String(index)));
  try {
    return { ...shown(apply(ctx.session, choice.id)), recorded: [recordedForChoice(choice)] };
  } catch (error) {
    return refused(error);
  }
}

function driveChoice(ctx: CommandContext, index: number): CommandResult {
  const choice = ctx.view.choices[index - 1];
  if (!choice) return refusal(ctx, invalidChoice(String(index)));

  let opening: PlayView;
  try {
    opening = beginAction(ctx.session, choice.id);
  } catch (error) {
    return refused(error);
  }
  if (!opening.action) return { ...shown(opening), recorded: [recordedForChoice(choice)] };

  return { view: opening, output: [], quit: false, recorded: [`begin: ${recordedForChoice(choice).replace(': ', ' ')}`], live: liveOver(ctx, opening) };
}

// Whatever is under way, picked up on the clock again. A driver that stopped ticking to run a line
// asks for this afterwards: nothing comes back where the line ended what was going on, and the world
// is what says which of those happened rather than the driver reading the line and guessing.
export function liveAgain(ctx: CommandContext): LiveRun | null {
  const standing = sessionStatus(ctx.session);
  return standing.action === null ? null : liveOver(ctx, standing);
}

// What the player stood there for, written as a `# test` replays it. A loop that came round is
// written in how many times it did and not in how long that took: a run is a record of a path
// walked, and how many seconds a cycle costs is balance that moves under it. Nothing came round and
// nothing finished leaves only the clock, which is the one case where the seconds are the whole of
// what happened.
function stood(ctx: CommandContext, final: PlayView, started: number, startedCycles: number, cancelled: boolean): string[] {
  const cycles = cyclesDone(ctx.session) - startedCycles;
  if (final.action === null && !cancelled) return ['wait: done'];
  if (cycles > 0) return [`wait: ${cycles} times`];
  const elapsed = final.time - started;
  return elapsed > 0 ? [`wait: ${formatElapsed(elapsed)}`] : [];
}

function liveOver(ctx: CommandContext, opening: PlayStatus): LiveRun {
  const started = opening.time;
  const startedCycles = cyclesDone(ctx.session);
  const armed = opening.action!.label;
  let latest: PlayStatus = opening;
  let over: LiveProgress | null = null;
  let closed: CommandResult | null = null;

  const live: LiveRun = {
    tick(elapsedMs) {
      if (over) return over;
      const progress = tickOnce(ctx, latest, elapsedMs, armed);
      latest = progress.view;
      autosaved(ctx);
      if (!progress.active) over = progress;
      return progress;
    },
    end(cancelled) {
      if (closed) return closed;
      const label = latest.action?.label ?? armed;
      const output: CommandOutput[] = [];
      if (cancelled) {
        applyDirective(ctx.session, { kind: 'cancel' });
        output.push(message('plain', sessionLocalizer(ctx.session).engine('engine.command.stopped')));
      }
      const final = view(ctx.session);
      latest = final;
      over = finished(label, final);
      const recorded = [...stood(ctx, final, started, startedCycles, cancelled), ...(cancelled ? ['cancel'] : [])];
      output.push({ kind: 'view', view: final, reread: false });
      closed = settle(ctx, { view: final, output, quit: false, recorded });
      return closed;
    },
  };
  return live;
}
