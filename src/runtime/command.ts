import { DslError } from '../grammar/parser';
import { formatModuleDiagnostic, loadUniverseWithDiagnostics } from '../content/registry';
import { type ModuleSource } from '../content/universe';
import {
  deleteLocalSection,
  LOCAL_CHANGES_MODULE_ID,
  listLocalSections,
  localSectionHeadings,
  renderLocalChangesModule,
  upsertLocalSection,
} from '../content/localChanges';
import { isGrowthDirective, parseDirectiveLine, type Directive } from '../content/test';
import { printDirective } from '../content/serialize';
import { resolveCarried, resolveDirective } from '../content/typed';
import { type ParsedSave } from '../content/saveSection';
import { describeCondition, RuntimeError } from './runtime';
import { wornCopySlot } from './itemInstance';
import { type Answer, type Localized, type Localizer } from './localized';
import { type Modal, type ModalOption } from './modals';
import { anId, say, says, type Said } from './said';
import {
  DEV_SLOT,
  autosave,
  devSnapshot,
  enterDev,
  leaveDev,
  liveSlot,
  saveNow,
  saveReport,
  setAutosaveSeconds,
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
} from './session';

export type MessageTone = 'plain' | 'ok' | 'warn' | 'error';

// c4: whose words a message is. A driver renders both, so it has to be able to
// tell them apart at the moment it draws one, which a brand alone cannot do —
// `Localized` is erased and nothing survives to be asked.
export type MessageWords = 'player' | 'tool';

// What the engine says to the player. Every one comes from a key, so every one
// arrives in the language being played.
export interface PlayerMessage {
  readonly kind: 'message';
  readonly words: 'player';
  readonly tone: MessageTone;
  readonly text: Localized;
  readonly detail?: readonly Localized[];
}

// What the authoring tool says to whoever is driving it: a parser diagnostic, a
// staging report, a test verdict. These are the tool's own words, in the
// language the tool is written in, and they are not keyed because the engine
// does not own them — a `DslError` is `src/grammar`'s and a load diagnostic is
// `src/content`'s, both below the layer that declares the brand.
export interface ToolMessage {
  readonly kind: 'message';
  readonly words: 'tool';
  readonly tone: MessageTone;
  readonly text: string;
  readonly detail?: readonly string[];
}

// What a command did, in the engine's own words. A driver decides how each of
// these looks; nothing here carries a glyph, a bar, a number list or a clock
// suffix, because the same result is rendered by a terminal and by a screen.
export type CommandOutput =
  | PlayerMessage
  | ToolMessage
  | { kind: 'view'; view: PlayView; reread: boolean }
  | { kind: 'status'; status: PlayStatus }
  | { kind: 'choices'; choices: PlayChoice[] }
  // The tool's own words too, and they say so the way `ToolMessage` does: the
  // command table's English, the DSL a module is written in, and the DSL a
  // recorder just wrote. Without the discriminant these three were the arms
  // that carried raw text and nothing said whose it was.
  | { kind: 'help'; words: 'tool'; entries: CommandHelp[] }
  | { kind: 'source'; words: 'tool'; lines: string[] }
  | { kind: 'authored'; words: 'tool'; blocks: string[][] };

export interface CommandResult {
  view?: PlayView;
  output: CommandOutput[];
  quit: boolean;
  // The colon-form directives just performed, in order; empty for read-only commands.
  recorded: Answer[];
  // Set when the command armed something for a driver to advance in real time.
  live?: LiveRun;
}

// `startSave` is taken before the first command, so a replay starts where this did.
export interface Recorder {
  history: string[];
  startSave: string;
}

export interface AuthoringContext {
  baseSources: ModuleSource[];
  dependencies: string[];
  localSource: ModuleSource;
  writeLocalChanges?: (text: string) => void;
  // The counterpart: what the local module says wherever it is kept, read at
  // the moment of asking rather than remembered, so a process that wrote it
  // after this session started is the one being read.
  readLocalChanges?: () => string;
}

// Sim-seconds per real-second in live mode, which `/speed` turns and the live
// clock reads. Mutable because it is a dial the player holds.
export interface LiveSettings {
  speed: number;
  // Whether this driver can advance a run in real time and let the player stop
  // it. A driver that cannot resolves a choice instead of arming it.
  driving: boolean;
}

export interface CommandContext {
  readonly session: PlaySession;
  view: PlayView;
  readonly recorder: Recorder;
  readonly live: LiveSettings;
  readonly authoring?: AuthoringContext;
  // Where this driver keeps slots, when it keeps any. Absent is a driver with
  // nowhere to write, which refuses the same way one with nowhere to author
  // does; exporting and importing need none of it and work either way.
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

export interface SectionArg {
  kind: string;
  id: string;
  body: string;
}

// The argument shapes a command takes. A driver holding one of these dispatches
// through `runCommand` without going near the line parser.
interface ArgTypes {
  none: undefined;
  number: number;
  id: string;
  directive: Directive;
  section: SectionArg;
  local: LocalOp;
  choice: number;
}

export type ArgKind = keyof ArgTypes;

// How the parser recognises a line as this command: by its leading token, by
// being empty, by parsing as a directive, or by being a choice number.
export type CommandMatch = 'name' | 'blank' | 'directive' | 'choice';

export interface CommandHelp {
  name: string;
  aliases: readonly string[];
  argHint: string;
  summary: string;
}

// Why a line names no command, and whose words say so. A `Said` where the
// refusal is the player's — a number that indexes no choice the view published
// — and the tool's own English where it names a command only the tool has.
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
  // Whether this is a power only a developer's session may reach. The table
  // does not act on it — the CLI is not the game and has every command
  // unconditionally — so this is the mark a driver that *is* the game reads to
  // know what to refuse, and adding the next dev power is marking it.
  readonly dev: boolean;
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
  dev?: boolean;
  parse(rest: string, ctx: CommandContext): ArgTypes[K] | CommandProblem;
  run(ctx: CommandContext, arg: ArgTypes[K]): CommandResult;
}): CommandSpec {
  return { aliases: [], match: 'name', argHint: '', dev: false, ...spec };
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

function noted(tone: MessageTone, text: string, detail?: string[]): CommandResult {
  return { output: [note(tone, text, detail)], quit: false, recorded: [] };
}

// A number that indexes no choice the view published, whether it was typed or
// dispatched. One sentence in one place, because a driver reaching this by a
// keystroke and a driver reaching it by a line are refusing the same thing.
function invalidChoice(answer: string): Said {
  return says('engine.command.invalid-choice', { choice: anId(JSON.stringify(answer)) });
}

// A line that named no command, in whichever words said why.
function refusedLine(ctx: CommandContext, problem: string | Said): CommandResult {
  return typeof problem === 'string' ? noted('error', problem) : said('error', say(sessionLocalizer(ctx.session), problem));
}

function shown(next: PlayView, before: CommandOutput[] = []): CommandResult {
  return { view: next, output: [...before, { kind: 'view', view: next, reread: false }], quit: false, recorded: [] };
}

// Every route out of the engine that stops a command rather than the process:
// one message, and the session left where it was. It lands in the tool's arm
// because a `RuntimeError` is raised where the engine has been handed something
// it cannot mean — an id nothing declares, a line that does not parse, a save
// whose shape is wrong — and a bug has no translation. What a player is owed
// instead of a crash is a `Said`, and that takes the other arm.
function refused(error: unknown): CommandResult {
  if (error instanceof RuntimeError) return noted('error', error.message);
  throw error;
}

function nothing(): undefined {
  return undefined;
}

// --- the recorded spelling of what was done -------------------------------

// One printer under the recorded spelling and the authored one, so a line a
// session records is a line the load path reads back and widening Directive
// costs one exhaustive case rather than two that can disagree. What is left
// here is which kinds may reach it: these three are authored and never done,
// so recording one is a bug rather than a spelling to invent.
export function canonicalDirective(directive: Directive): string {
  if (directive.kind === 'run' || directive.kind === 'expect' || directive.kind === 'assert') {
    throw new RuntimeError(`canonicalDirective: ${directive.kind}: is authored, not recorded`);
  }
  return printDirective(directive);
}

// A session records what happened rather than what was typed: a growth the
// plane refused is recorded as the refusal, so a test recorded from live play
// replays the outcome the player saw instead of asserting the opposite of it.
function recordedOutcome(directive: Directive, outcome: { failure?: string }): string {
  if (outcome.failure === undefined || !isGrowthDirective(directive)) return canonicalDirective(directive);
  return canonicalDirective({ kind: 'refuse', inner: directive });
}

// One mapping, so a numbered choice and its typed equivalent record identically.
function recordedForChoice(choice: PlayChoice): string {
  return canonicalDirective(choiceToDirective(choice));
}

function formatElapsed(seconds: number): string {
  return Number(seconds.toFixed(3)).toString();
}

// --- the handlers several spellings share ---------------------------------

// The one place PASSED/FAILED is decided, so both entry points cannot drift.
function runNamedTest(ctx: CommandContext, testId: string): CommandResult {
  try {
    const result = runSessionTest(ctx.session, testId);
    // A `# test` replays whatever it was written with, and its first line is a
    // `load:` whenever `/create-test` wrote it, so this session may be any game
    // at all now. Nothing here can say which, and a standing that cannot be
    // said is one that has to go.
    if (ctx.save) ctx.save.synced = null;
    const next = view(ctx.session);
    const verdict = result.passed ? `Test '${testId}' PASSED` : `Test '${testId}' FAILED: ${result.failure}`;
    return shown(next, [note('plain', verdict)]);
  } catch (error) {
    return refused(error);
  }
}

// The one route onto the inventory screen, so the row a GUI draws and the line a
// player types are the same dispatch. Naming an item selects it by answering the
// screen's own first question, which is what leaves the route two recorded lines
// a `# test` replays rather than a gesture only one driver has.
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

// c16: a player is refused in the words they would have met the thing by. A
// slot's spelling is the runtime's own — it names whichever copy the slot holds
// and nothing else spells one that way — so an empty slot is reported as an
// empty slot rather than printed back at whoever typed it.
function nothingIsNamed(localizer: Localizer, id: string): Localized {
  const slot = wornCopySlot(id);
  return slot === undefined
    ? localizer.engine('engine.growth.no-copy', { item: localizer.identifier(id) })
    : localizer.engine('engine.growth.no-worn', { slot: localizer.identifier(slot) });
}

function runDirective(ctx: CommandContext, directive: Directive): CommandResult {
  if (directive.kind === 'run') return runNamedTest(ctx, directive.test);

  if (directive.kind === 'assert' || directive.kind === 'expect') {
    const label = directive.kind === 'expect' ? directive.save : describeCondition(directive.condition);
    try {
      const result = applyDirective(ctx.session, directive);
      return result.failure ? noted('warn', result.failure) : noted('ok', `${label} matches`);
    } catch (error) {
      return refused(error);
    }
  }

  try {
    const outcome = applyDirective(ctx.session, directive);
    // A payload becoming this session by any route other than `importPayload`,
    // which is the one route that can say which slot it came from. A `load:`
    // addresses a `# save` by id, so what the session is now came out of the
    // content and out of no slot. `runNamedTest` above answers the same
    // question for the same reason, and the walk in play-cli.test.ts over
    // `COMMANDS` is what says those two are the whole of it.
    if (directive.kind === 'load' && ctx.save) ctx.save.synced = null;
    const next = view(ctx.session);
    return { ...shown(next), recorded: [recordedOutcome(directive, outcome)] };
  } catch (error) {
    return refused(error);
  }
}

// --- local DSL authoring --------------------------------------------------

function commandBodyLines(body: string): string[] {
  if (body.trim() === '') return [];
  return body
    .split('|')
    .map((line) => line.replace(/^[ \t]/, '').trimEnd())
    .filter((line) => line.trim() !== '');
}

function localSectionSource(section: SectionArg): string {
  return [`# ${section.kind} ${section.id}`, ...commandBodyLines(section.body)].join('\n') + '\n';
}

function localDiagnosticsFor(authoring: AuthoringContext, diagnostics: ReturnType<typeof loadUniverseWithDiagnostics>['diagnostics']): string[] {
  return diagnostics
    .filter((diagnostic) => diagnostic.sourceName === authoring.localSource.name || diagnostic.moduleId === LOCAL_CHANGES_MODULE_ID)
    .map((diagnostic) => formatModuleDiagnostic(diagnostic));
}

// The one path a local module reaches a live session by: load its text beside
// the base sources, refuse on any diagnostic without touching anything, and
// otherwise adopt the registry that came out whole. `persist` is what a caller
// puts in front of the adopt when the text is its own to keep; a caller reading
// text that is already on disk passes none.
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
  adoptRegistry(ctx.session, loaded.registry);

  try {
    return shown(view(ctx.session), [note('plain', staged)]);
  } catch (error) {
    if (error instanceof RuntimeError) {
      return { output: [note('plain', staged), note('error', error.message)], quit: false, recorded: [] };
    }
    throw error;
  }
}

function commitLocalChanges(ctx: CommandContext, authoring: AuthoringContext, text: string, staged: string): CommandResult {
  return adoptLocalChanges(ctx, authoring, text, staged, authoring.writeLocalChanges);
}

export const UNAVAILABLE = 'local authoring is unavailable.';

export const UNREADABLE = 'local changes cannot be re-read here.';

// Said whatever the file turned out to say, so that reloading is not a way to
// learn whether an author has just written. A driver may call it every turn.
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

// The local module's text, and a refusal in its own name when the text is what
// is wrong. The order is the point: a `DslError` off the file and one off the
// line just typed reach the same catch and read identically there, so the file
// is parsed before the argument is and only the file's failure can name the
// file — and name `/local clear`, which reads nothing and is the way out.
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

function runSectionEdit(ctx: CommandContext, section: SectionArg): CommandResult {
  const authoring = ctx.authoring;
  if (!authoring) return noted('error', UNAVAILABLE);
  try {
    const source = localSourceNow(authoring);
    if (!source.read) return source.refusal;
    const edit = upsertLocalSection(source.text, authoring.dependencies, localSectionSource(section));
    const verb = edit.replaced ? 'Replaced' : 'Staged';
    return commitLocalChanges(ctx, authoring, edit.text, `${verb} # ${edit.section.kind} ${edit.section.id} in ${LOCAL_CHANGES_MODULE_ID}.`);
  } catch (error) {
    if (error instanceof DslError) return noted('error', error.message);
    return refused(error);
  }
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
      // Unparsed on purpose, and the only command that is: looking at the text
      // is how a file nothing else will touch gets read.
      case 'show':
        return { output: [{ kind: 'source', words: 'tool', lines: localChangesNow(authoring).trimEnd().split('\n') }], quit: false, recorded: [] };
      // Unread, which is what makes it the way out of a file nothing else can
      // read and the way out of a header no other command rewrites: what it
      // writes is the module a first launch finds, so nothing of the one being
      // cleared survives it and the state it is taken from always moves.
      case 'clear':
        return commitLocalChanges(ctx, authoring, renderLocalChangesModule(authoring.dependencies), `Cleared ${LOCAL_CHANGES_MODULE_ID}.`);
      case 'delete': {
        const source = localSourceNow(authoring);
        if (!source.read) return source.refusal;
        const next = deleteLocalSection(source.text, authoring.dependencies, op.kind, op.id);
        if (!next.deleted) return noted('error', `no local # ${op.kind} ${op.id} is staged.`);
        return commitLocalChanges(ctx, authoring, next.text, `Deleted local # ${op.kind} ${op.id}.`);
      }
    }
  } catch (error) {
    if (error instanceof DslError) return noted('error', error.message);
    return refused(error);
  }
}

// --- the recorder's own commands ------------------------------------------

function savedGameFromSerialized(serialized: string): ParsedSave | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const { version, ...diff } = parsed as { version: number } & Record<string, unknown>;
  return { version, diff };
}

// Never throws: a failure comes back as an error message.
function buildCreateTest(ctx: CommandContext, id: string, opts: { valid: boolean }): CommandResult {
  const { recorder, session } = ctx;
  if (recorder.history.length === 0) return noted('error', 'nothing recorded yet');

  const startSaveId = `${id}-start`;
  const endSaveId = `${id}-end`;
  const first = recorder.history[0];
  const usesStartSave = !(first.startsWith('load:') || first.startsWith('load '));

  // Taken before anything is written, because a recorder given no start save is
  // a driver that never took one, and half an emission is worse than none.
  const startSave = usesStartSave ? savedGameFromSerialized(recorder.startSave) : null;
  if (usesStartSave && !startSave) return noted('error', 'no start save was taken when this session began');

  const idTaken =
    session.registry.tests.has(id) ||
    (usesStartSave && session.registry.saves.has(startSaveId)) ||
    (opts.valid && session.registry.saves.has(endSaveId));
  if (idTaken) return noted('error', `test '${id}' already exists`);

  const lines = [...recorder.history];
  if (usesStartSave) lines.unshift(`load: ${startSaveId}`);
  if (opts.valid) lines.push(`expect: ${endSaveId}`);

  const directives: Directive[] = [];
  for (const directiveLine of lines) {
    const directive = parseDirectiveLine(directiveLine);
    if (!directive) return noted('error', `internal: recorded line does not parse: ${directiveLine}`);
    directives.push(directive);
  }

  const endSaveSerialized = opts.valid ? serializeSession(session) : undefined;
  const endSave = endSaveSerialized === undefined ? null : savedGameFromSerialized(endSaveSerialized);

  if (startSave) session.registry.saves.set(startSaveId, startSave);
  if (endSave) session.registry.saves.set(endSaveId, endSave);
  session.registry.tests.set(id, { id, directives });

  const blocks: string[][] = [];
  if (usesStartSave) blocks.push([`# save ${startSaveId}`, recorder.startSave]);
  if (endSaveSerialized !== undefined) blocks.push([`# save ${endSaveId}`, endSaveSerialized]);
  blocks.push([`# test ${id}`, ...lines]);

  return {
    output: [note('plain', `Created test '${id}' (${recorder.history.length} steps).`), { kind: 'authored', words: 'tool', blocks }],
    quit: false,
    recorded: [],
  };
}

// --- the save slots -------------------------------------------------------

export const NO_SAVES = 'this session has nowhere to keep slots.';

// Everything a slot command does can raise: an unreadable slot, a cadence
// somebody hand-edited, a snapshot that is gone. One catch, so the answer is a
// message in every one of those cases and a crash in none of them (c7).
function withSaves(ctx: CommandContext, run: (save: SaveContext) => CommandResult): CommandResult {
  if (!ctx.save) return noted('error', NO_SAVES);
  try {
    return run(ctx.save);
  } catch (error) {
    return refused(error);
  }
}

// The one route a payload becomes this session, whether it came off a slot or
// off the end of a typed line. `loadSaved` adopts nothing until the whole of it
// stands — including that it can be drawn — so a payload refused here leaves the
// session where it was and the view below it cannot be the one that fails.
//
// `from` names the slot this payload came out of, and nothing when it came from
// somewhere that is not a slot. Required rather than defaulted, because a load
// is exactly the event that changes which slot's game this session is: answered
// here once, it is what stops an imported payload inheriting the standing of the
// session it replaced and being autosaved over a player's slot, and a caller
// added next month cannot leave the question unanswered.
function importPayload(ctx: CommandContext, payload: string, done: string, from: string | null): CommandResult {
  const saved = savedGameFromSerialized(payload);
  if (!saved) return noted('error', `that is not a # save body: ${JSON.stringify(payload.slice(0, 60))}`);
  try {
    loadSaved(ctx.session, saved);
  } catch (error) {
    return refused(error);
  }
  if (ctx.save) ctx.save.synced = from;
  return shown(view(ctx.session), [note('ok', done)]);
}

const loaded = (result: CommandResult): boolean => !result.output.some((each) => each.kind === 'message' && each.tone === 'error');

const SLOT_COLUMN = 14;

function slotAge(save: SaveContext, writtenAt: number | null): string {
  return writtenAt === null ? 'unreadable' : `written ${formatElapsed((save.now() - writtenAt) / 1000)}s ago`;
}

// c13 read out: every line of it comes off `saveReport`, so a surface drawing
// the same answer asks the same question rather than keeping a copy.
function slotStanding(save: SaveContext): string[] {
  const report = saveReport(save);
  return [
    `writing ${report.slot}, dev mode ${report.dev ? 'on' : 'off'}${WHY_NOT[report.writes]}`,
    `autosave ${report.autosaveSeconds === null ? `— ${UNREADABLE_CADENCE}` : report.autosaveSeconds === 0 ? 'never' : `every ${report.autosaveSeconds}s`}`,
    ...report.slots.map((slot) => `${slot.name.padEnd(SLOT_COLUMN)} ${slotAge(save, slot.writtenAt)}`),
  ];
}

const NOT_ADOPTED = 'this session did not come out of that slot, so autosave will not write it: /restore to pick it up or /save to replace it';

const UNREADABLE_SLOT = 'that slot holds bytes nothing here can read, so autosave leaves them alone: look at the file, or /save to replace it';

const UNREADABLE_CADENCE = 'the slot the cadence lives in does not hold one, so nothing is saved on a cadence: /autosave <s> sets it again';

// One sentence per answer the session gives, so the terminal renders what it
// was told rather than working it out a second time.
const WHY_NOT: Record<SlotWrites, string> = { yes: '', 'not-ours': ` — ${NOT_ADOPTED}`, unreadable: ` — ${UNREADABLE_SLOT}` };

// Checked after a command that changed the world and on every live tick, which
// is the whole of what makes the cadence real seconds rather than turns. Two
// things it has to say out loud: a cadence slot nobody can read, and a slot the
// cadence came due on that this session is not entitled to replace — silence
// there would be a game quietly not being saved.
function autosaved(ctx: CommandContext): ToolMessage | null {
  if (!ctx.save) return null;
  try {
    const outcome = autosave(ctx.save, () => serializeSession(ctx.session));
    if (outcome.kind === 'held') return note('warn', `autosave held: slot ${outcome.slot} — ${NOT_ADOPTED}`);
    if (outcome.kind === 'unreadable') return note('warn', `autosave held: slot ${outcome.slot} — ${UNREADABLE_SLOT}`);
    return null;
  } catch (error) {
    if (error instanceof RuntimeError) return note('error', `autosave: ${error.message}`);
    throw error;
  }
}

// The mirror of leaving: the session goes to whatever the dev slot holds, so it
// is what the slot it is about to write holds and an author picks up where they
// left off. Nothing there is the ordinary case — the session carries on and
// takes the empty slot. Something there that will not load costs the pick-up
// and nothing else: the mode is on, the slot is withheld, and `/save` is what
// takes it deliberately.
function devOn(ctx: CommandContext, save: SaveContext): CommandResult {
  const authoring = enterDev(save, serializeSession(ctx.session));
  if (authoring === null) return noted('ok', `Dev mode on, writing slot ${liveSlot(save)}.`);

  const result = importPayload(ctx, authoring, `Dev mode on, slot ${DEV_SLOT} picked up.`, DEV_SLOT);
  if (loaded(result)) return result;
  return { ...result, output: [...result.output, note('warn', `Dev mode is on, but slot ${DEV_SLOT} could not be picked up, so this session is left as it is and will not be written there. /save takes it.`)] };
}

// Everything done in dev goes with the mode: the session goes back to what it
// was when dev was entered, and back to being the game of whatever slot it was
// then. No slot is put back, because none of them moved — nothing in dev writes
// the player's slot, which is c10, so it still holds exactly what it held on the
// way in and a compensating write here could only ever fail and strand somebody.
// A snapshot this build cannot read costs the session, which stays where it is
// and is no slot's game, so what dev built cannot reach the slot a player opens
// next; the dev slot is an author's work and is still there to `/restore` from.
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

// --- argument parsers -----------------------------------------------------

function requireId(name: string): (rest: string) => string | CommandProblem {
  return (rest) => (rest === '' ? { problem: `${name} requires an id` } : rest);
}

// A directive spelling: the slash form is sugar over a colon-form line, so both
// reach the same handler and record identically.
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

// The one option a driver is waiting on: the first unanswered of the topmost
// modal, since the ones beneath it are covered over until that is cleared.
export function askedOption(modals: readonly Modal[]): ModalOption | undefined {
  return modals[modals.length - 1]?.options[0];
}

// A number picks one of a listed value, and nothing else a modal is shown
// answers it: an option taking free text is answered by the directive itself,
// so no line is ever consumed as a field it was not typed as.
function numberedModalAnswer(current: PlayView, trimmed: string): string | null {
  const asking = askedOption(current.modals);
  if (!asking?.values) return null;
  const index = Number(trimmed);
  if (!Number.isInteger(index) || index < 1 || index > asking.values.length) return null;
  return `submit-modal: ${asking.key}=${asking.values[index - 1].value}`;
}

// --- the table ------------------------------------------------------------

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
      // A slot's spelling is the runtime's own and names no item, so it reaches
      // the screen unresolved: the load path resolves what an author could have
      // written, and a slot is not something anyone writes.
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
    summary: 'advance simulated time by <s> seconds',
    parse: directiveFrom('/wait', (rest) => `wait: ${rest}`),
    run: runDirective,
  }),
  define({
    name: '/goto',
    arg: 'directive',
    argHint: '<location>',
    dev: true,
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
    name: '/state',
    arg: 'none',
    summary: 'show location, elapsed sim-time, flags, inventory, xp',
    parse: nothing,
    run: (ctx) => ({ output: [{ kind: 'status', status: sessionStatus(ctx.session) }], quit: false, recorded: [] }),
  }),
  define({
    name: '/test',
    arg: 'id',
    argHint: '<id>',
    summary: 'run a # test by id and report PASSED/FAILED',
    parse: requireId('/test'),
    run: runNamedTest,
  }),
  define({
    name: '/load',
    arg: 'directive',
    argHint: '<id>',
    summary: 'load a # save by id',
    parse: directiveFrom('/load', (rest) => `load: ${rest}`),
    run: runDirective,
  }),
  define({
    name: '/expect',
    arg: 'directive',
    argHint: '<id>',
    summary: 'assert current state matches a # save by id',
    parse: directiveFrom('/expect', (rest) => `expect: ${rest}`),
    run: runDirective,
  }),
  define({
    name: '/assert',
    arg: 'directive',
    argHint: '<c>',
    summary: 'assert a condition against current state',
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
    name: '/dsl',
    arg: 'section',
    argHint: '<kind> <id> [body]',
    summary: 'stage or replace one local DSL section; use | for new lines',
    parse: (rest) => {
      const match = /^(?<kind>[a-z][a-z0-9-]*)(?:[ \t]+(?<id>[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*))?(?:[ \t]+(?<body>.*))?$/.exec(rest)?.groups;
      if (!match?.kind || !match.id) return { problem: '/dsl requires <kind> <id> [body]' };
      return { kind: match.kind, id: match.id, body: match.body ?? '' };
    },
    run: runSectionEdit,
  }),
  define({
    name: '/local',
    arg: 'local',
    argHint: '[show | delete <kind> <id> | clear]',
    summary: 'list, print, delete or clear staged local changes',
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
    parse: nothing,
    run: runReload,
  }),
  define({
    name: '/export',
    arg: 'none',
    summary: 'print the current save as a # save body',
    parse: nothing,
    // The bytes `serializeSession` returns and no others: what this prints
    // pastes into `/dsl save <id>` and comes back through `/import` unchanged,
    // which is only true while there is one serialization to print.
    run: (ctx) => ({ output: [{ kind: 'source', words: 'tool', lines: [serializeSession(ctx.session)] }], quit: false, recorded: [] }),
  }),
  define({
    name: '/import',
    arg: 'id',
    argHint: '<body>',
    summary: 'load a # save body printed by /export',
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
    arg: 'number',
    argHint: '<s>',
    summary: 'set the autosave cadence in seconds; 0 never',
    parse: (rest) => {
      const seconds = Number(rest);
      if (rest === '' || !Number.isFinite(seconds) || seconds < 0) return { problem: `/autosave requires seconds, 0 for never, got ${JSON.stringify(rest)}` };
      return seconds;
    },
    run: (ctx, seconds) =>
      withSaves(ctx, (save) => {
        setAutosaveSeconds(save, seconds);
        return noted('ok', seconds === 0 ? 'Autosave off.' : `Autosave every ${seconds}s.`);
      }),
  }),
  define({
    name: '/dev',
    arg: 'id',
    argHint: 'on | off',
    summary: 'author against a slot of its own, and come back to this session on the way out',
    parse: (rest) => (rest === 'on' || rest === 'off' ? rest : { problem: '/dev requires on or off' }),
    run: (ctx, mode) => withSaves(ctx, (save) => (mode === 'on' ? devOn(ctx, save) : devOff(ctx, save))),
  }),
  define({
    name: '/create-test',
    arg: 'id',
    argHint: '<id>',
    summary: 'emit a # test from what you just did in this session',
    parse: requireId('/create-test'),
    run: (ctx, id) => buildCreateTest(ctx, id, { valid: false }),
  }),
  define({
    name: '/create-valid-test',
    arg: 'id',
    argHint: '<id>',
    summary: 'same, plus a # save + expect: regression assertion',
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

// Every token that names a dev-only power, aliases included, read off the table
// rather than written down: a driver that is the game refuses these while the
// session is the player's, and the set it refuses cannot fall behind the marks.
export const DEV_TOKENS: readonly string[] = [...BY_TOKEN].filter(([, spec]) => spec.dev).map(([token]) => token);

// Which dev-only command a line names, and nothing when it names none. The
// leading token, which is how the parser recognises a named command, so a line
// this answers for is a line that would have reached that command.
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

// Help is this table read out, so a command added above is documented by that
// edit and no other.
export function helpEntries(): CommandHelp[] {
  return COMMANDS.map((spec) => ({ name: spec.name, aliases: spec.aliases, argHint: spec.argHint, summary: spec.summary }));
}

export function findCommand(token: string): CommandSpec | undefined {
  return BY_TOKEN.get(token);
}

// --- parse and dispatch ---------------------------------------------------

export interface ParsedCommand {
  spec: CommandSpec;
  arg: ArgTypes[ArgKind];
}

export function isChoiceLine(current: PlayView, line: string): number | null {
  const trimmed = line.trim();
  if (trimmed === '') return null;
  const index = Number(trimmed);
  if (!Number.isInteger(index) || index < 1 || index > current.choices.length) return null;
  return index;
}

function against(spec: CommandSpec, rest: string, ctx: CommandContext): ParsedCommand | CommandProblem {
  const arg = spec.parse(rest, ctx);
  return isProblem(arg) ? arg : { spec, arg };
}

export function parseLine(ctx: CommandContext, line: string): ParsedCommand | CommandProblem {
  const trimmed = line.trim();
  if (trimmed === '') return against(BLANK, '', ctx);

  if (trimmed.startsWith('/')) {
    const token = /^\S+/.exec(trimmed)![0];
    const spec = findCommand(token);
    if (!spec) return { problem: `unknown command: ${trimmed}` };
    const rest = trimmed.slice(token.length).trim();
    // The argument a command declares is the whole argument it takes, so a line
    // carrying one it does not names no command rather than quietly performing
    // this one: `/quit junk` is a typo, not a way to end the session.
    if (rest !== '' && spec.arg === 'none') return { problem: `unknown command: ${trimmed}` };
    return against(spec, rest, ctx);
  }

  // A number answers the modal being shown before it answers the world, which
  // is withdrawn while one is open.
  const answer = numberedModalAnswer(ctx.view, trimmed);
  const directive = parseDirective(answer ?? trimmed, ctx);
  if (isProblem(directive)) return directive;
  if (directive) return { spec: DIRECTIVE, arg: directive };

  return against(CHOICE, trimmed, ctx);
}

// Applies what a command's result says happened: the recorder gains its lines
// and the context's view moves to the one the command produced.
function settle(ctx: CommandContext, result: CommandResult): CommandResult {
  ctx.recorder.history.push(...result.recorded);
  if (result.view) ctx.view = result.view;
  // What a command recorded is what it changed, which is the table's own answer
  // to "did the world move" and so the one this reads rather than a second one.
  if (result.recorded.length === 0) return result;
  const problem = autosaved(ctx);
  return problem ? { ...result, output: [...result.output, problem] } : result;
}

export function runCommand(ctx: CommandContext, spec: CommandSpec, arg: ArgTypes[ArgKind]): CommandResult {
  return settle(ctx, spec.run(ctx, arg));
}

// What a driver with a typed line calls: parse it, then dispatch what came out.
export function runLine(ctx: CommandContext, line: string): CommandResult {
  const parsed = parseLine(ctx, line);
  if (isProblem(parsed)) return refusedLine(ctx, parsed.problem);
  return runCommand(ctx, parsed.spec, parsed.arg);
}

// --- the live clock -------------------------------------------------------

// How often a driver is expected to hand a run its elapsed milliseconds. Each
// tick rounds its own span to whole milliseconds, so two drivers ticking at
// different cadences reach different states over the same wall-clock span;
// sharing the figure is what makes them the same run.
export const LIVE_TICK_MS = 100;

// Elapsed real milliseconds, handed to whoever is advancing a run. Starting a
// ticker hands back the way to stop it, so nothing else has to hold a timer id.
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

// Elapsed is the distance between two readings of the clock, never the
// interval that was asked for. A backgrounded tab fires late and a busy
// terminal fires later still, and a run paid the nominal figure falls behind
// the wall clock. Both drivers read this rather than each keeping a lastTick
// of its own, which is what makes "the same elapsed span" one rule and not two
// that happen to agree.
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
}

// One tick's answer: how far the action got, what it is whittling down, and
// whether it is still going. Every number, no rendering.
export interface LiveProgress {
  label: Localized;
  active: boolean;
  time: number;
  progress: number;
  pools: LivePool[];
  // Set only when the run's own completion countdown is what there is to report.
  implicit: { attempts: number; completion: number } | null;
  view: PlayView;
}

export interface LiveRun {
  tick(elapsedMs: number): LiveProgress;
  end(cancelled: boolean): CommandResult;
}

// What a finished run reports, however it finished: no progress to make, no
// target to narrate, and the world as the last tick left it.
function finished(label: Localized, current: PlayView): LiveProgress {
  return { label, active: false, time: current.time, progress: 1, pools: [], implicit: null, view: current };
}

function livePools(status: PlayStatus): LivePool[] {
  if (!status.encounter) return [];
  return [
    ...status.resources.filter((resource) => resource.display === 'full').map((resource) => ({ title: resource.title, current: resource.current, max: resource.max })),
    ...status.encounter.foes.map((foe) => ({ title: foe.title, current: foe.current, max: foe.max })),
  ];
}

// `previous` names the action being driven, which is gone from the view the
// tick that finishes it hands back; `armed` is the label it was begun under,
// for the tick that finds it gone from both.
function tickOnce(ctx: CommandContext, previous: PlayView, elapsedMs: number, armed: Localized): LiveProgress {
  const label = previous.action?.label ?? armed;
  const next = wait(ctx.session, (elapsedMs / 1000) * ctx.live.speed);
  ctx.view = next;

  const action = next.action;
  if (!action) return finished(label, next);

  // Report the run's own countdown only when there is no real target to narrate.
  const counting = action.attempts > 0 || action.completion < 1;
  return {
    label,
    active: true,
    time: next.time,
    progress: action.progress,
    pools: livePools(next),
    implicit: !action.targeted && counting ? { attempts: action.attempts, completion: action.completion } : null,
    view: next,
  };
}

function applyChoice(ctx: CommandContext, index: number): CommandResult {
  const choice = ctx.view.choices[index - 1];
  if (!choice) return refusedLine(ctx, invalidChoice(String(index)));
  try {
    return { ...shown(apply(ctx.session, choice.id)), recorded: [recordedForChoice(choice)] };
  } catch (error) {
    return refused(error);
  }
}

// Arms the same choice instead of resolving it, and hands back a run the driver
// advances with elapsed milliseconds. An instant action arms nothing, which is
// not a failure: beginning it is doing it, and it records as itself.
function driveChoice(ctx: CommandContext, index: number): CommandResult {
  const choice = ctx.view.choices[index - 1];
  if (!choice) return refusedLine(ctx, invalidChoice(String(index)));

  let opening: PlayView;
  try {
    opening = beginAction(ctx.session, choice.id);
  } catch (error) {
    return refused(error);
  }
  if (!opening.action) return { ...shown(opening), recorded: [recordedForChoice(choice)] };

  const started = opening.time;
  const armed = opening.action.label;
  let latest = opening;
  // A run ends once, whichever way it ends. The driver that owns the timer and
  // the keypress cannot make both arrive first, so the run refuses the second
  // rather than recording the wait twice or advancing the world after the
  // player stopped it.
  let over: LiveProgress | null = null;
  let closed: CommandResult | null = null;

  const live: LiveRun = {
    tick(elapsedMs) {
      if (over) return over;
      const progress = tickOnce(ctx, latest, elapsedMs, armed);
      latest = progress.view;
      // A run is the one stretch of play no command punctuates, so the cadence
      // is checked here too or a long fight saves nothing until it ends. A tick
      // has nowhere to speak and nothing to carry: a run that ticked ends with
      // a wait or a cancel to record, so `end` settles like any other command
      // and asks again there, on a session the answer is still true of.
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
      const elapsed = final.time - started;
      const recorded = [...(elapsed > 0 ? [`wait: ${formatElapsed(elapsed)}`] : []), ...(cancelled ? ['cancel'] : [])];
      output.push({ kind: 'view', view: final, reread: false });
      closed = settle(ctx, { view: final, output, quit: false, recorded });
      return closed;
    },
  };
  return { view: opening, output: [], quit: false, recorded: [`begin: ${recordedForChoice(choice).replace(': ', ' ')}`], live };
}
