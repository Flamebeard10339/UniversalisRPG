import type { ModalOption } from './modalOption';
import { RuntimeError } from './error';
import { DslError } from '../grammar/parser';
import { formatModuleDiagnostic } from '../content/registry';
import { loadUniverseWithDiagnostics } from '../content/load';
import { type ModuleSource } from '../content/universe';
import {
  deleteLocalSection,
  LOCAL_CHANGES_MODULE_ID,
  listLocalSections,
  localSectionHeadings,
  renderLocalChangesModule,
  upsertLocalSection,
} from '../content/localChanges';
import { isGrowthDirective, parseDirectiveLine, type Directive } from '../content/sections/test';
import { printDirective } from '../content/serialize';
import { resolveCarried, resolveDirective } from '../content/typed';
import { type ParsedSave } from '../content/sections/save';
import { describeCondition } from './runtime';
import { wornCopySlot } from './itemInstance';
import { type Answer, type Localized, type Localizer } from './localized';
import { type Modal } from './modals';
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

export interface SectionArg {
  kind: string;
  id: string;
  body: string;
}

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

export type CommandMatch = 'name' | 'blank' | 'directive' | 'choice';

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

function invalidChoice(answer: string): Said {
  return says('engine.command.invalid-choice', { choice: anId(JSON.stringify(answer)) });
}

function refusedLine(ctx: CommandContext, problem: string | Said): CommandResult {
  return typeof problem === 'string' ? noted('error', problem) : said('error', say(sessionLocalizer(ctx.session), problem));
}

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
  if (directive.kind === 'run' || directive.kind === 'expect' || directive.kind === 'assert') {
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
    if (directive.kind === 'load' && ctx.save) ctx.save.synced = null;
    const next = view(ctx.session);
    return { ...shown(next), recorded: [recordedOutcome(directive, outcome)] };
  } catch (error) {
    return refused(error);
  }
}

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
      case 'show':
        return { output: [{ kind: 'source', words: 'tool', lines: localChangesNow(authoring).trimEnd().split('\n') }], quit: false, recorded: [] };
      case 'clear':
        return commitLocalChanges(ctx, authoring, renderLocalChangesModule(authoring.dependencies), `Cleared ${LOCAL_CHANGES_MODULE_ID}.`);
      case 'delete': {
        const source = localSourceNow(authoring);
        if (!source.read) return source.refusal;
        const next = deleteLocalSection(source.text, authoring.dependencies, op.kind, op.id);
        if (!next.deleted) return noted('error', `no local # ${op.kind} ${op.id} is staged.`);
        return commitLocalChanges(ctx, authoring, next.text, `Deleted local # ${op.kind} ${op.id}.`);
      }
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

function buildCreateTest(ctx: CommandContext, id: string, opts: { valid: boolean }): CommandResult {
  const { recorder, session } = ctx;
  if (recorder.history.length === 0) return noted('error', 'nothing recorded yet');

  const startSaveId = `${id}-start`;
  const endSaveId = `${id}-end`;
  const first = recorder.history[0];
  const usesStartSave = !(first.startsWith('load:') || first.startsWith('load '));

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

const WHY_NOT: Record<SlotWrites, string> = { yes: '', 'not-ours': ` — ${NOT_ADOPTED}`, unreadable: ` — ${UNREADABLE_SLOT}` };

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

function devOn(ctx: CommandContext, save: SaveContext): CommandResult {
  const authoring = enterDev(save, serializeSession(ctx.session));
  if (authoring === null) return noted('ok', `Dev mode on, writing slot ${liveSlot(save)}.`);

  const result = importPayload(ctx, authoring, `Dev mode on, slot ${DEV_SLOT} picked up.`, DEV_SLOT);
  if (loaded(result)) return result;
  return { ...result, output: [...result.output, note('warn', `Dev mode is on, but slot ${DEV_SLOT} could not be picked up, so this session is left as it is and will not be written there. /save takes it.`)] };
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

function requireId(name: string): (rest: string) => string | CommandProblem {
  return (rest) => (rest === '' ? { problem: `${name} requires an id` } : rest);
}

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

export const DEV_TOKENS: readonly string[] = [...BY_TOKEN].filter(([, spec]) => spec.dev).map(([token]) => token);

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
  if (isProblem(parsed)) return refusedLine(ctx, parsed.problem);
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
}

export interface LiveProgress {
  label: Localized;
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
    ...status.resources.filter((resource) => resource.display === 'full').map((resource) => ({ title: resource.title, current: resource.current, max: resource.max })),
    ...status.encounter.foes.map((foe) => ({ title: foe.title, current: foe.current, max: foe.max })),
  ];
}

function tickOnce(ctx: CommandContext, previous: PlayView, elapsedMs: number, armed: Localized): LiveProgress {
  const label = previous.action?.label ?? armed;
  const next = wait(ctx.session, (elapsedMs / 1000) * ctx.live.speed);
  ctx.view = next;

  const action = next.action;
  if (!action) return finished(label, next);

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
      const elapsed = final.time - started;
      const recorded = [...(elapsed > 0 ? [`wait: ${formatElapsed(elapsed)}`] : []), ...(cancelled ? ['cancel'] : [])];
      output.push({ kind: 'view', view: final, reread: false });
      closed = settle(ctx, { view: final, output, quit: false, recorded });
      return closed;
    },
  };
  return { view: opening, output: [], quit: false, recorded: [`begin: ${recordedForChoice(choice).replace(': ', ' ')}`], live };
}
