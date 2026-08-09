import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { DslError } from '../src/grammar/parser';
import { describeCondition, RuntimeError } from '../src/runtime/runtime';
import { formatModuleDiagnostic, loadUniverseWithDiagnostics } from '../src/content/registry';
import { type ModuleSource } from '../src/content/universe';
import {
  clearLocalSections,
  deleteLocalSection,
  initialLocalChangesModule,
  LOCAL_CHANGES_MODULE_ID,
  localSectionHeadings,
  upsertLocalSection,
} from '../src/content/localChanges';
import { DEFAULT_MODPORTAL_CACHE, readEntryText, readModportalCache } from './lib/modportalCache';
import {
  adoptRegistry,
  apply,
  applyDirective,
  beginAction,
  choiceToDirective,
  runSessionTest,
  serializeSession,
  sessionStatus,
  startSession,
  view,
  wait,
  type PlayChoice,
  type PlaySession,
  type PlayStatus,
  type PlayView,
} from '../src/runtime/session';
import { type Modal, type ModalOption } from '../src/runtime/runtime';
import { type ParsedSave } from '../src/content/saveSection';
import { parseDirectiveLine, type Directive } from '../src/content/test';
import { resolveDirective } from '../src/content/typed';

const repoRoot = path.join(import.meta.dirname, '..');
const defaultContent = 'content/tutorial-island.dsl';
const defaultLocalChanges = 'content/local-changes.dsl';

export interface CommandResult {
  view?: PlayView;
  output: string[];
  quit: boolean;
  // The colon-form directive just performed; undefined for read-only commands.
  recorded?: string;
}

const HELP_LINES = [
  'Commands:',
  '  <N>          choose option N',
  '  /look        re-read the current location description',
  '  /inventory   show your inventory and skill xp',
  '  /wait <s>    advance simulated time by <s> seconds',
  '  /speed <n>   set the live-mode time multiplier (default 1)',
  '  /state       show location, elapsed sim-time, flags, inventory, xp',
  '  /test <id>   run a # test by id and report PASSED/FAILED',
  '  /load <id>   load a # save by id',
  '  /expect <id> assert current state matches a # save by id',
  '  /assert <c>  assert a condition against current state',
  '  /cancel      cancel the in-flight spannable action, if any',
  '  submit-modal: <key>=<value>  answer one option of the open modal',
  '  <directive>  any raw directive line (talk:/use:/travel:/craft:/begin:/…)',
  '  /dsl <kind> <id> [body] stage or replace one local DSL section; use | for new lines',
  '  /local       list local changes',
  '  /local show  print the local-changes DSL module',
  '  /local delete <kind> <id> delete one staged section',
  '  /local clear delete all staged sections',
  '  <a.dsl,b.dsl> at startup loads content files, comma-separated in one argument',
  '  local=<file> at startup chooses the local DSL file',
  '  modportal=<dir> at startup loads enabled portal mod DSL from a synced cache',
  '  /create-test <id>       emit a # test from what you just did in this session',
  '  /create-valid-test <id> same, plus a # save + expect: regression assertion',
  '  /help        show this help',
  '  /quit, /q    show final state and exit',
];

// TODO(quest-journal): quests are emergent from flags, not a DSL kind. See backlog.

// A location's examine text prints on first arrival only; /look reprints it.
const shownLocations = new Set<string>();

// REPL-wide dial set by /speed: sim-seconds per real-second in live mode.
let speedMultiplier = 1;

function formatChoices(choices: PlayChoice[]): string[] {
  return choices.map((choice, index) => {
    // Lead with the thing acted on: the playtest found the verb-first form harder to scan.
    const label = choice.detail ? `${choice.detail}: ${choice.label}` : choice.label;
    return `  ${index + 1}) ${label}`;
  });
}

// `minimal` pools collapse to one row of 8-stage glyphs, for an always-moving readout.
const MINIMAL_STAGES = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
const BAR_WIDTH = 10;

function fillRatio(current: number, max: number): number {
  return max > 0 ? Math.min(1, Math.max(0, current / max)) : 0;
}

function tidy(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function fullBar(current: number, max: number): string {
  const filled = Math.round(fillRatio(current, max) * BAR_WIDTH);
  return `${'█'.repeat(filled)}${'░'.repeat(BAR_WIDTH - filled)} ${tidy(current)}/${tidy(max)}`;
}

function minimalGlyph(current: number, max: number): string {
  const stage = Math.min(MINIMAL_STAGES.length - 1, Math.floor(fillRatio(current, max) * MINIMAL_STAGES.length));
  return MINIMAL_STAGES[stage];
}

function formatResources(resources: PlayView['resources']): string[] {
  const lines: string[] = [];
  for (const r of resources) if (r.display === 'full') lines.push(`${r.title}: ${fullBar(r.current, r.max)}`);
  const minimal = resources.filter((r) => r.display === 'minimal');
  if (minimal.length > 0) lines.push(minimal.map((r) => `${r.title} ${minimalGlyph(r.current, r.max)}`).join('   '));
  return lines;
}

// A cadence is already a fraction, so the same glyph renderer takes it against 1.
function formatEncounter(encounter: PlayView['encounter']): string[] {
  if (!encounter) return [];
  const lines = encounter.foes.map((foe) => `${foe.title}: ${fullBar(foe.current, foe.max)}`);
  const meters = [`Your swing ${minimalGlyph(encounter.cadence, 1)}`];
  for (const foe of encounter.foes) {
    if (foe.cadence !== null) meters.push(`${foe.title} ${minimalGlyph(foe.cadence, 1)}`);
  }
  return [...lines, meters.join('   ')];
}

// Rendered from the published name and options alone, so a modal this driver
// has never heard of prints the same way the ones it has do. The option being
// asked for is the top modal's first; a listed value is answerable by number.
function formatModals(modals: Modal[]): string[] {
  const lines: string[] = [];
  for (const modal of modals) lines.push(`[${modal.name}] ${modal.options.map((option) => option.key).join(', ') || '(answered)'}`);

  const asking = askedOption(modals);
  if (!asking) return lines;
  lines.push(`${asking.label}:`);
  if (asking.values) asking.values.forEach((value, index) => lines.push(`  ${index + 1}) ${value}`));
  else lines.push(`  submit-modal: ${asking.key}=<text>`);
  return lines;
}

// The one option the driver is waiting on: the first unanswered of the topmost
// modal, since the ones beneath it are covered over until that is cleared.
function askedOption(modals: Modal[]): ModalOption | undefined {
  return modals[modals.length - 1]?.options[0];
}

function formatView(v: PlayView): string[] {
  const lines: string[] = [];
  for (const said of v.said) lines.push(said);
  lines.push(`${v.location.title} (${v.location.id})`);
  if (!shownLocations.has(v.location.id)) {
    shownLocations.add(v.location.id);
    if (v.location.description) lines.push(v.location.description);
  }
  if (v.entities.length > 0) lines.push(`Here: ${v.entities.map((entity) => entity.title).join(', ')}`);
  lines.push(...formatResources(v.resources));
  lines.push(...formatEncounter(v.encounter));
  lines.push(...formatModals(v.modals));
  lines.push(...formatChoices(v.choices));
  lines.push(`[time: ${v.time}s]`);
  return lines;
}

function formatInventory(status: PlayStatus): string[] {
  const lines = [`Inventory: ${JSON.stringify(status.inventory)}`, `XP: ${JSON.stringify(status.xp)}`];
  if (Object.keys(status.equipment).length > 0) {
    lines.push(`Equipped: ${JSON.stringify(status.equipment)}`);
  }
  return lines;
}

function formatState(status: PlayStatus): string[] {
  return [
    `Location: ${status.location.id}`,
    `Elapsed simulated time: ${status.time}s`,
    `Flags: ${JSON.stringify(status.flags)}`,
    ...formatInventory(status),
    ...formatResources(status.resources),
    ...formatEncounter(status.encounter),
  ];
}

// The one place PASSED/FAILED prints, so both entry points cannot drift.
function runTestCommand(session: PlaySession, testId: string): CommandResult {
  try {
    const result = runSessionTest(session, testId);
    const next = view(session);
    const message = result.passed ? `Test '${testId}' PASSED` : `Test '${testId}' FAILED: ${result.failure}`;
    return { view: next, output: [message, ...formatView(next)], quit: false };
  } catch (err) {
    if (err instanceof RuntimeError) return { output: [`Error: ${err.message}`], quit: false };
    throw err;
  }
}

function beginInnerText(inner: Extract<Directive, { kind: 'use' | 'travel' | 'craft' }>): string {
  return canonicalDirective(inner).replace(': ', ' ');
}

function canonicalDirective(directive: Directive): string {
  switch (directive.kind) {
    case 'talk':
      return `talk: ${directive.entity}`;
    case 'choose':
      return `choose: ${directive.text}`;
    case 'use':
      return `use: ${directive.obj}.${directive.objId}.${directive.actionId}`;
    case 'travel':
      return `travel: ${directive.location}`;
    case 'craft':
      return `craft: ${directive.recipe}`;
    case 'begin':
      return `begin: ${beginInnerText(directive.inner)}`;
    case 'load':
      return `load: ${directive.save}`;
    case 'cancel':
      return 'cancel';
    case 'wait':
      return `wait: ${directive.seconds}`;
    case 'equip':
      return `equip: ${directive.item}`;
    case 'unequip':
      return `unequip: ${directive.slot}`;
    case 'submit-modal':
      return `submit-modal: ${directive.key}=${directive.value}`;
    // Exhaustive, so widening Directive is a type error here rather than a
    // throw at the moment a player picks the new kind. These three are
    // authored, never recorded, so they never reach this.
    case 'run':
    case 'expect':
    case 'assert':
      throw new RuntimeError(`canonicalDirective: ${directive.kind}: is authored, not recorded`);
  }
}

// One mapping, so a numbered choice and its typed equivalent record identically.
function recordedForChoice(choice: PlayChoice): string {
  return canonicalDirective(choiceToDirective(choice));
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
}

function savedGameFromSerialized(serialized: string): ParsedSave {
  const { version, ...diff } = JSON.parse(serialized) as { version: number } & Record<string, unknown>;
  return { version, diff };
}

function saveBlock(id: string, serialized: string): string[] {
  return [`# save ${id}`, serialized];
}

// Never throws: a failure comes back as an `Error: …` output line.
function buildCreateTest(session: PlaySession, recorder: Recorder, id: string, opts: { valid: boolean }): { output: string[] } {
  if (recorder.history.length === 0) {
    return { output: [`Error: nothing recorded yet`] };
  }

  const startSaveId = `${id}-start`;
  const endSaveId = `${id}-end`;
  const first = recorder.history[0];
  const usesStartSave = !(first.startsWith('load:') || first.startsWith('load '));

  const idTaken =
    session.registry.tests.has(id) ||
    (usesStartSave && session.registry.saves.has(startSaveId)) ||
    (opts.valid && session.registry.saves.has(endSaveId));
  if (idTaken) {
    return { output: [`Error: test '${id}' already exists`] };
  }

  const lines = [...recorder.history];
  if (usesStartSave) lines.unshift(`load: ${startSaveId}`);
  if (opts.valid) lines.push(`expect: ${endSaveId}`);

  const directives: Directive[] = [];
  for (const directiveLine of lines) {
    const directive = parseDirectiveLine(directiveLine);
    if (!directive) return { output: [`Error: internal: recorded line does not parse: ${directiveLine}`] };
    directives.push(directive);
  }

  const endSaveSerialized = opts.valid ? serializeSession(session) : undefined;

  if (usesStartSave) session.registry.saves.set(startSaveId, savedGameFromSerialized(recorder.startSave));
  if (endSaveSerialized !== undefined) session.registry.saves.set(endSaveId, savedGameFromSerialized(endSaveSerialized));
  session.registry.tests.set(id, { id, directives });

  const output: string[] = [`Created test '${id}' (${recorder.history.length} steps).`, ''];
  if (usesStartSave) output.push(...saveBlock(startSaveId, recorder.startSave), '');
  if (endSaveSerialized !== undefined) output.push(...saveBlock(endSaveId, endSaveSerialized), '');
  output.push(`# test ${id}`, ...lines);
  return { output };
}

function commandBodyLines(body: string): string[] {
  if (body.trim() === '') return [];
  return body
    .split('|')
    .map((line) => line.replace(/^[ \t]/, '').trimEnd())
    .filter((line) => line.trim() !== '');
}

function localSectionSource(kind: string, id: string, body: string): string {
  return [`# ${kind} ${id}`, ...commandBodyLines(body)].join('\n') + '\n';
}

function localDiagnosticsFor(authoring: AuthoringContext, diagnostics: ReturnType<typeof loadUniverseWithDiagnostics>['diagnostics']): string[] {
  return diagnostics
    .filter((diagnostic) => diagnostic.sourceName === authoring.localSource.name || diagnostic.moduleId === LOCAL_CHANGES_MODULE_ID)
    .map((diagnostic) => formatModuleDiagnostic(diagnostic));
}

function commitLocalChanges(session: PlaySession, authoring: AuthoringContext, text: string, message: string): CommandResult {
  const loaded = loadUniverseWithDiagnostics([...authoring.baseSources, { ...authoring.localSource, text }]);
  const localStatus = loaded.modules.find((module) => module.sourceName === authoring.localSource.name || module.moduleId === LOCAL_CHANGES_MODULE_ID);
  const diagnostics = localDiagnosticsFor(authoring, loaded.diagnostics);
  if (diagnostics.length > 0 || localStatus?.loaded !== true) {
    return { output: ['Error: local changes did not load.', ...diagnostics.map((diagnostic) => `  ${diagnostic}`)], quit: false };
  }

  try {
    authoring.writeLocalChanges?.(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { output: [`Error: could not write local changes: ${detail}`], quit: false };
  }

  authoring.localSource.text = text;
  adoptRegistry(session, loaded.registry);

  try {
    const next = view(session);
    return { view: next, output: [message, ...formatView(next)], quit: false };
  } catch (error) {
    if (error instanceof RuntimeError) return { output: [message, `Error: ${error.message}`], quit: false };
    throw error;
  }
}

function handleDslCommand(session: PlaySession, trimmed: string, authoring: AuthoringContext | undefined): CommandResult {
  if (!authoring) return { output: ['Error: local authoring is unavailable.'], quit: false };
  const rest = trimmed.slice('/dsl'.length).trim();
  const match = /^(?<kind>[a-z][a-z0-9-]*)(?:[ \t]+(?<id>[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*))?(?:[ \t]+(?<body>.*))?$/.exec(rest)?.groups;
  if (!match?.kind || !match.id) return { output: ['Error: /dsl requires <kind> <id> [body]'], quit: false };

  try {
    const edit = upsertLocalSection(authoring.localSource.text, authoring.dependencies, localSectionSource(match.kind, match.id, match.body ?? ''));
    const verb = edit.replaced ? 'Replaced' : 'Staged';
    return commitLocalChanges(session, authoring, edit.text, `${verb} # ${edit.section.kind} ${edit.section.id} in ${LOCAL_CHANGES_MODULE_ID}.`);
  } catch (error) {
    if (error instanceof DslError) return { output: [`Error: ${error.message}`], quit: false };
    throw error;
  }
}

function localModuleLines(authoring: AuthoringContext): string[] {
  return authoring.localSource.text.trimEnd().split('\n');
}

function handleLocalCommand(session: PlaySession, trimmed: string, authoring: AuthoringContext | undefined): CommandResult {
  if (!authoring) return { output: ['Error: local authoring is unavailable.'], quit: false };
  const rest = trimmed.slice('/local'.length).trim();

  if (rest === '' || rest === 'list') {
    try {
      const headings = localSectionHeadings(authoring.localSource.text);
      return { output: headings.length > 0 ? headings : ['No local changes staged.'], quit: false };
    } catch (error) {
      if (error instanceof DslError) return { output: [`Error: ${error.message}`], quit: false };
      throw error;
    }
  }

  if (rest === 'show' || rest === 'export') return { output: localModuleLines(authoring), quit: false };

  if (rest === 'clear') {
    return commitLocalChanges(session, authoring, clearLocalSections(authoring.dependencies), `Cleared ${LOCAL_CHANGES_MODULE_ID}.`);
  }

  const remove = /^delete[ \t]+(?<kind>[a-z][a-z0-9-]*)[ \t]+(?<id>[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*)$/.exec(rest)?.groups;
  if (remove) {
    try {
      const next = deleteLocalSection(authoring.localSource.text, authoring.dependencies, remove.kind, remove.id);
      if (!next.deleted) return { output: [`Error: no local # ${remove.kind} ${remove.id} is staged.`], quit: false };
      return commitLocalChanges(session, authoring, next.text, `Deleted local # ${remove.kind} ${remove.id}.`);
    } catch (error) {
      if (error instanceof DslError) return { output: [`Error: ${error.message}`], quit: false };
      throw error;
    }
  }

  return { output: [`Error: unknown /local command: ${rest}`], quit: false };
}

function beginInnerForChoice(choice: PlayChoice): string {
  return recordedForChoice(choice).replace(': ', ' ');
}

function formatElapsed(seconds: number): string {
  return Number(seconds.toFixed(3)).toString();
}

// A number picks one of a listed value, and nothing else a modal is shown
// answers it: an option taking free text is answered by the directive itself,
// so no line is ever consumed as a field it was not typed as.
function numberedModalAnswer(currentView: PlayView, trimmed: string): string | null {
  const asking = askedOption(currentView.modals);
  if (!asking?.values) return null;
  const index = Number(trimmed);
  if (!Number.isInteger(index) || index < 1 || index > asking.values.length) return null;
  return `submit-modal: ${asking.key}=${asking.values[index - 1]}`;
}

function handleGameplayCommand(session: PlaySession, currentView: PlayView, line: string): CommandResult {
  const trimmed = line.trim();

  if (trimmed === '') {
    return { output: formatChoices(currentView.choices), quit: false };
  }

  if (trimmed === '/help') {
    return { output: HELP_LINES, quit: false };
  }

  if (trimmed === '/state') {
    return { output: formatState(sessionStatus(session)), quit: false };
  }

  if (trimmed === '/inventory' || trimmed === '/inv') {
    return { output: formatInventory(sessionStatus(session)), quit: false };
  }

  if (trimmed === '/look') {
    // Drop the location so formatView reprints its description and re-adds it.
    shownLocations.delete(currentView.location.id);
    return { view: currentView, output: formatView(currentView), quit: false };
  }

  if (trimmed === '/quit' || trimmed === '/q') {
    return { output: formatState(sessionStatus(session)), quit: true };
  }

  if (trimmed.startsWith('/speed')) {
    const rest = trimmed.slice('/speed'.length).trim();
    const multiplier = Number(rest);
    if (rest === '' || Number.isNaN(multiplier) || multiplier <= 0) {
      return { output: [`Error: /speed requires a positive number, got ${JSON.stringify(rest)}`], quit: false };
    }
    speedMultiplier = multiplier;
    return { output: [`Speed set to ${multiplier}x.`], quit: false };
  }

  if (trimmed.startsWith('/test')) {
    const testId = trimmed.slice('/test'.length).trim();
    if (testId === '') return { output: [`Error: /test requires an id`], quit: false };
    return runTestCommand(session, testId);
  }

  let toParse = trimmed;
  if (trimmed === '/cancel') toParse = 'cancel';
  else if (trimmed.startsWith('/load')) toParse = `load: ${trimmed.slice('/load'.length).trim()}`;
  else if (trimmed.startsWith('/expect')) toParse = `expect: ${trimmed.slice('/expect'.length).trim()}`;
  else if (trimmed.startsWith('/assert')) toParse = `assert: ${trimmed.slice('/assert'.length).trim()}`;
  else if (trimmed.startsWith('/wait')) toParse = `wait: ${trimmed.slice('/wait'.length).trim()}`;
  else toParse = numberedModalAnswer(currentView, trimmed) ?? toParse;

  let directive: Directive | null;
  try {
    const typed = parseDirectiveLine(toParse);
    directive = typed && resolveDirective(typed, session.registry);
  } catch (err) {
    if (err instanceof RuntimeError || err instanceof DslError) return { output: [`Error: ${err.message}`], quit: false };
    throw err;
  }

  if (directive) {
    if (directive.kind === 'run') {
      return runTestCommand(session, directive.test);
    }

    if (directive.kind === 'assert' || directive.kind === 'expect') {
      const label = directive.kind === 'expect' ? directive.save : describeCondition(directive.condition);
      try {
        const result = applyDirective(session, directive);
        if (result.failure) return { output: [`⚠ ${result.failure}`], quit: false };
        return { output: [`✓ ${label} matches`], quit: false };
      } catch (err) {
        if (err instanceof RuntimeError) return { output: [`Error: ${err.message}`], quit: false };
        throw err;
      }
    }

    try {
      applyDirective(session, directive);
      const next = view(session);
      return { view: next, output: formatView(next), quit: false, recorded: canonicalDirective(directive) };
    } catch (err) {
      if (err instanceof RuntimeError) return { output: [`Error: ${err.message}`], quit: false };
      throw err;
    }
  }

  if (trimmed.startsWith('/')) {
    return { output: [`Error: unknown command: ${trimmed}`], quit: false };
  }

  const index = Number(trimmed);
  if (!Number.isInteger(index) || index < 1 || index > currentView.choices.length) {
    return { output: [`Error: invalid choice: ${JSON.stringify(trimmed)}`], quit: false };
  }
  const choice = currentView.choices[index - 1];
  try {
    const next = apply(session, choice.id);
    return { view: next, output: formatView(next), quit: false, recorded: recordedForChoice(choice) };
  } catch (err) {
    if (err instanceof RuntimeError) return { output: [`Error: ${err.message}`], quit: false };
    throw err;
  }
}

// The one place a result reaches the recorder, so the two paths cannot drift.
export function handleCommand(
  session: PlaySession,
  currentView: PlayView,
  line: string,
  recorder: Recorder = { history: [], startSave: '' },
  authoring?: AuthoringContext,
): CommandResult {
  const trimmed = line.trim();

  if (trimmed === '/dsl' || trimmed.startsWith('/dsl ')) {
    return handleDslCommand(session, trimmed, authoring);
  }

  if (trimmed === '/local' || trimmed.startsWith('/local ')) {
    return handleLocalCommand(session, trimmed, authoring);
  }

  if (trimmed.startsWith('/create-valid-test')) {
    const id = trimmed.slice('/create-valid-test'.length).trim();
    if (id === '') return { output: [`Error: /create-valid-test requires an id`], quit: false };
    return { ...buildCreateTest(session, recorder, id, { valid: true }), quit: false };
  }

  if (trimmed.startsWith('/create-test')) {
    const id = trimmed.slice('/create-test'.length).trim();
    if (id === '') return { output: [`Error: /create-test requires an id`], quit: false };
    return { ...buildCreateTest(session, recorder, id, { valid: false }), quit: false };
  }

  const result = handleGameplayCommand(session, currentView, line);
  if (result.recorded !== undefined) recorder.history.push(result.recorded);
  return result;
}

function progressBar(fraction: number, width = 20): string {
  const clamped = Math.min(1, Math.max(0, fraction));
  const filled = Math.round(clamped * width);
  return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}]`;
}

export interface LiveTickResult {
  active: boolean;
  line: string;
  view: PlayView;
}

function liveCombatDetail(status: PlayStatus): string {
  if (!status.encounter) return '';
  const mine = status.resources.filter((r) => r.display === 'full');
  const parts = [
    ...mine.map((r) => ` ${r.title} ${tidy(r.current)}/${tidy(r.max)}`),
    ...status.encounter.foes.map((foe) => ` ${foe.title} ${tidy(foe.current)}/${tidy(foe.max)}`),
  ];
  return parts.join('');
}

// `previous` names the action being driven, which is gone from the view the
// tick that finishes it hands back.
export function liveTick(session: PlaySession, previous: PlayView, elapsedMs: number, multiplier: number): LiveTickResult {
  const label = previous.action?.label ?? 'action';
  const next = wait(session, (elapsedMs / 1000) * multiplier);

  const action = next.action;
  if (!action) {
    return { active: false, line: `${label}: done.  [time: ${next.time.toFixed(1)}s]`, view: next };
  }
  // Show implicit target progress only when there's no real target to narrate.
  const showImplicitTarget = action.attempts > 0 || action.completion < 1;
  const detail = liveCombatDetail(next) || (!action.targeted && showImplicitTarget ? ` hits:${action.attempts} completion:${action.completion.toFixed(1)}` : '');
  const line = `${label}... ${progressBar(action.progress)}${detail}  [time: ${next.time.toFixed(1)}s]`;
  return { active: true, line, view: next };
}

const LIVE_TICK_MS = 200;

type LineResult = IteratorResult<string>;

// Ends when the action completes or the player cancels; only reached on a TTY.
//
// ANY keypress cancels, which needs three things in order: rl.pause() so readline
// stops fighting the \r-redrawn bar, setRawMode(true) so keys arrive unbuffered,
// and input.resume() — the non-obvious one, since attaching a `data` listener only
// auto-flows a stream for the FIRST listener and readline already installed one.
// Ctrl-C raises no SIGINT in raw mode, so it is honoured explicitly below.
function runLiveAction(session: PlaySession, rl: ReturnType<typeof createInterface>, opening: PlayView): Promise<{ cancelled: boolean }> {
  return new Promise<{ cancelled: boolean }>((resolvePromise) => {
    const input = process.stdin;
    const isTTY = Boolean(input.isTTY);
    const wasRaw = Boolean(input.isRaw);
    rl.pause();
    if (isTTY) input.setRawMode(true);
    input.resume();
    process.stdout.write('(press any key to stop)\n');

    let lastTick = Date.now();
    let settled = false;
    let cancelled = false;

    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      input.off('data', onData);
      input.off('end', onEnd);
      if (isTTY) input.setRawMode(wasRaw);
      process.stdout.write('\n');
      if (cancelled) {
        // Cancels through the same applyDirective path a typed `/cancel` takes.
        applyDirective(session, { kind: 'cancel' });
        console.log('Stopped.');
      }
      console.log(formatView(view(session)).join('\n'));
      rl.resume();
      resolvePromise({ cancelled });
    };

    const onData = (chunk: Buffer): void => {
      if (isTTY && chunk.length === 1 && chunk[0] === 0x03) {
        // Ctrl-C: raw mode swallowed the usual SIGINT.
        input.setRawMode(false);
        rl.close();
        process.exit(130);
      }
      cancelled = true;
      finish();
    };
    const onEnd = (): void => {
      cancelled = true;
      finish();
    };

    input.on('data', onData);
    input.on('end', onEnd);

    let latest = opening;
    const timer = setInterval(() => {
      const now = Date.now();
      const elapsedMs = now - lastTick;
      lastTick = now;
      const tick = liveTick(session, latest, elapsedMs, speedMultiplier);
      latest = tick.view;
      process.stdout.write(`\r\x1b[K${tick.line}`);
      if (!tick.active) finish();
    }, LIVE_TICK_MS);
  });
}

interface CliArgs {
  files: string[];
  liveRequested: boolean;
  localFile: string;
  modportalDir?: string;
}

function splitContentArg(arg: string | undefined): string[] {
  return (arg ?? defaultContent).split(',').map((file) => file.trim()).filter(Boolean);
}

function parseCliArgs(rawArgs: string[]): CliArgs {
  const positional: string[] = [];
  let localFile = defaultLocalChanges;
  let modportalDir: string | undefined = DEFAULT_MODPORTAL_CACHE;
  let liveRequested = false;

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--live') {
      liveRequested = true;
      continue;
    }
    if (arg === '--local' || arg === '--changes') {
      localFile = rawArgs[++i] ?? defaultLocalChanges;
      continue;
    }
    if (arg.startsWith('--local=')) {
      localFile = arg.slice('--local='.length);
      continue;
    }
    if (arg.startsWith('--changes=')) {
      localFile = arg.slice('--changes='.length);
      continue;
    }
    if (arg.startsWith('local=')) {
      localFile = arg.slice('local='.length);
      continue;
    }
    if (arg === '--no-modportal' || arg === 'modportal=off') {
      modportalDir = undefined;
      continue;
    }
    if (arg === '--modportal') {
      modportalDir = rawArgs[++i] ?? DEFAULT_MODPORTAL_CACHE;
      continue;
    }
    if (arg.startsWith('--modportal=')) {
      const value = arg.slice('--modportal='.length);
      modportalDir = value === 'off' ? undefined : value;
      continue;
    }
    if (arg.startsWith('modportal=')) {
      const value = arg.slice('modportal='.length);
      modportalDir = value === 'off' ? undefined : value;
      continue;
    }
    positional.push(arg);
  }

  // One positional, comma-separated. A second one used to become the local file,
  // which `/dsl` then rewrote as `local-changes` — silently, over real content.
  if (positional.length > 1) {
    console.error(`Load several content files as one comma-separated argument, not ${positional.length} separate ones. Use local=<file> to choose where local changes are written.`);
    process.exit(1);
  }
  return { files: splitContentArg(positional[0]), liveRequested, localFile, modportalDir };
}

function repoPath(file: string): string {
  return path.resolve(repoRoot, file);
}

function sourceName(file: string): string {
  return path.basename(file).replace(/\.[^.]*$/, '');
}

// One file is one module: its `# info` names it, and its filename is the
// fallback id for a file that declares none.
function loadContent(files: string[]): ModuleSource[] {
  return files.map((file) => ({
    name: sourceName(file),
    text: readFileSync(repoPath(file), 'utf8'),
  }));
}

function writeLocalChanges(file: string, text: string): void {
  const target = repoPath(file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text, 'utf8');
}

export interface ModportalLoadResult {
  sources: ModuleSource[];
  warnings: string[];
}

export function loadModportalSources(dir: string): ModportalLoadResult {
  const root = repoPath(dir);
  const { manifest, warnings } = readModportalCache(root);
  const sources: ModuleSource[] = [];
  for (const entry of manifest.entries) {
    const { text, warning } = readEntryText(root, entry);
    if (text === undefined) warnings.push(warning!);
    else sources.push({ name: entry.moduleId, text, enabled: entry.enabled });
  }
  return { sources, warnings };
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  // Nobody to press a key on a non-TTY run, and a repeating action would tick
  // forever, so --live falls back to the instant path.
  const liveMode = args.liveRequested && Boolean(process.stdin.isTTY);
  const localPath = repoPath(args.localFile);
  const files = args.files.filter((file) => repoPath(file) !== localPath);
  const modportal = args.modportalDir ? loadModportalSources(args.modportalDir) : { sources: [], warnings: [] };
  for (const warning of modportal.warnings) console.error(warning);
  const baseSources = [...loadContent(files), ...modportal.sources];
  const baseLoaded = loadUniverseWithDiagnostics(baseSources);
  const dependencies = baseLoaded.loadedModules;
  const localText = existsSync(localPath) ? readFileSync(localPath, 'utf8') : initialLocalChangesModule(dependencies);
  const localSource: ModuleSource = { name: sourceName(args.localFile), text: localText };
  const sources = existsSync(localPath) ? [...baseSources, localSource] : baseSources;
  const loaded = loadUniverseWithDiagnostics(sources);
  for (const each of loaded.diagnostics) console.error(`Disabled module: ${formatModuleDiagnostic(each)}`);
  const registry = loaded.registry;
  const session = startSession(registry);
  const recorder: Recorder = { history: [], startSave: serializeSession(session) };
  const authoring: AuthoringContext = {
    baseSources,
    dependencies,
    localSource,
    writeLocalChanges: (text) => writeLocalChanges(args.localFile, text),
  };

  let current: PlayView;
  try {
    current = view(session);
  } catch (err) {
    if (err instanceof RuntimeError) {
      console.error(`Error: ${err.message}`);
      return;
    }
    throw err;
  }
  console.log(formatView(current).join('\n'));
  console.log('\nType /help for commands (/state and /inventory show your progress).');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const it = rl[Symbol.asyncIterator]();
  try {
    process.stdout.write('> ');
    let pendingLine: Promise<LineResult> | null = null;
    for (;;) {
      if (!pendingLine) pendingLine = it.next();
      const { value: line, done } = await pendingLine;
      pendingLine = null;
      if (done) break;

      console.log('');

      const trimmed = line.trim();
      const index = Number(trimmed);
      const isNumericChoice = trimmed !== '' && Number.isInteger(index) && index >= 1 && index <= current.choices.length;

      let quit = false;
      if (liveMode && isNumericChoice) {
        const choice = current.choices[index - 1];
        try {
          const next = beginAction(session, choice.id);
          if (next.action) {
            recorder.history.push(`begin: ${beginInnerForChoice(choice)}`);
            const t0 = next.time;
            const { cancelled } = await runLiveAction(session, rl, next);
            current = view(session);
            const elapsed = current.time - t0;
            if (elapsed > 0) recorder.history.push(`wait: ${formatElapsed(elapsed)}`);
            if (cancelled) recorder.history.push('cancel');
          } else {
            console.log(formatView(next).join('\n'));
            current = next;
            recorder.history.push(recordedForChoice(choice));
          }
        } catch (err) {
          if (err instanceof RuntimeError) console.log(`Error: ${err.message}`);
          else throw err;
        }
      } else {
        const result = handleCommand(session, current, line, recorder, authoring);
        if (result.output.length > 0) console.log(result.output.join('\n'));
        if (result.view) current = result.view;
        quit = result.quit;
      }

      if (quit) break;
      process.stdout.write('> ');
    }
  } finally {
    rl.close();
  }
}

const isEntryPoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  main();
}
