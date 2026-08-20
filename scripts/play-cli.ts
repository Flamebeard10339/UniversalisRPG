import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { withEngineLocale } from '../src/content/engineLocale';
import { type ModuleSource } from '../src/content/universe';
import { initialLocalChangesModule } from '../src/content/localChanges';
import { DEFAULT_MODPORTAL_CACHE, readEntryText, readModportalCache } from './lib/modportalCache';
import { fileSlots } from './lib/slotFile';
import { createSaveContext, type SaveContext } from '../src/runtime/saveSlots';
import { type Localized, type Localizer } from '../src/runtime/localized';
import { openUniverse, type OpenedUniverse } from '../src/runtime/openUniverse';
import { serializeSession, sessionLocalizer, view, type PlayChoice, type PlayStatus, type PlayView } from '../src/runtime/session';
import {
  askedOption,
  createTicker,
  newContext,
  runLine,
  type AuthoringContext,
  type CommandContext,
  type CommandHelp,
  type CommandOutput,
  type CommandResult,
  type LiveProgress,
  type LiveRun,
  type MessageTone,
  type Recorder,
  type Ticker,
} from '../src/runtime/command';
import { formatPlane } from './planeView';

const repoRoot = path.join(import.meta.dirname, '..');
const defaultContent = 'content/tutorial-island.dsl';
const defaultLocalChanges = 'content/local-changes.dsl';
const defaultSaves = '.saves';

// TODO(quest-journal): quests are emergent from flags, not a DSL kind. See backlog.

// c5: whose words a line is, carried to the terminal rather than dropped where
// it is composed. The split is the one `CommandOutput` makes at the arm above —
// what a command says to the player comes from a key, and what the authoring
// tool says is a `DslError`'s or a load diagnostic's, both from below the layer
// that declares the brand. `indent` and `tone` are laid on at the print: a
// column is not a word, and a tone is a glyph for the same reason the GUI's
// stop control is one.
export interface PlayerLine {
  readonly words: 'player';
  readonly tone: MessageTone;
  readonly indent: number;
  readonly text: Localized;
}

export interface ToolLine {
  readonly words: 'tool';
  readonly tone: MessageTone;
  readonly indent: number;
  readonly text: string;
}

export type ReplLine = PlayerLine | ToolLine;

const say = (text: Localized, indent = 0, tone: MessageTone = 'plain'): PlayerLine => ({ words: 'player', tone, indent, text });

const note = (text: string, indent = 0, tone: MessageTone = 'plain'): ToolLine => ({ words: 'tool', tone, indent, text });

const TONE_GLYPH: Record<MessageTone, string> = { plain: '', ok: '✓ ', warn: '⚠ ', error: '✗ ' };

export const printed = (line: ReplLine): string => `${' '.repeat(line.indent)}${TONE_GLYPH[line.tone]}${line.text}`;

// Several words the localizer produced, laid out on one line. The separator is
// spacing rather than a word, which is the whole of why this reaches for
// `identifier`: it is the one seam in this file where a line is assembled out
// of more than one of them.
const oneLine = (localizer: Localizer, parts: readonly Localized[], gap: string): Localized => localizer.identifier(parts.join(gap));

// A location's examine text prints on first arrival only; /look reprints it.
const shownLocations = new Set<string>();

function formatChoices(choices: PlayChoice[], localizer: Localizer): PlayerLine[] {
  return choices.map((choice, index) => {
    // Lead with the thing acted on: the playtest found the verb-first form harder to scan.
    const numbered = choice.detail
      ? localizer.engine('engine.repl.choice.owned', { index: index + 1, owner: choice.detail, choice: choice.label })
      : localizer.engine('engine.repl.choice', { index: index + 1, choice: choice.label });
    return say(numbered, 2);
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

const pool = (localizer: Localizer, resource: Localized, meter: string): Localized => localizer.engine('engine.repl.pool', { resource, meter: localizer.identifier(meter) });

function formatResources(resources: PlayView['resources'], localizer: Localizer): PlayerLine[] {
  const lines: PlayerLine[] = [];
  for (const r of resources) if (r.display === 'full') lines.push(say(pool(localizer, r.title, fullBar(r.current, r.max))));
  const minimal = resources.filter((r) => r.display === 'minimal');
  if (minimal.length > 0) lines.push(say(oneLine(localizer, minimal.map((r) => pool(localizer, r.title, minimalGlyph(r.current, r.max))), '   ')));
  return lines;
}

// A cadence is already a fraction, so the same glyph renderer takes it against 1.
function formatEncounter(encounter: PlayView['encounter'], localizer: Localizer): PlayerLine[] {
  if (!encounter) return [];
  const lines = encounter.foes.map((foe) => say(pool(localizer, foe.title, fullBar(foe.current, foe.max))));
  const meters = [localizer.engine('engine.repl.swing', { meter: localizer.identifier(minimalGlyph(encounter.cadence, 1)) })];
  for (const foe of encounter.foes) {
    if (foe.cadence !== null) meters.push(pool(localizer, foe.title, minimalGlyph(foe.cadence, 1)));
  }
  return [...lines, say(oneLine(localizer, meters, '   '))];
}

// What the screen has in hand, drawn above the question it belongs to. The plane
// is looked up in the ones the view publishes and the focus is what says which,
// so a screen this driver has never heard of draws its subject too and no modal
// name is read to decide it (c10).
function formatFocus(v: PlayView, localizer: Localizer): PlayerLine[] {
  const focus = v.focus;
  if (!focus) return [];
  const plane = v.planes.find((each) => each.instance === focus.instance);
  if (!plane) return [];
  const blank = localizer.identifier('');
  return [blank, ...formatPlane(plane, v.equipment.some((row) => row.item === plane.instance), focus.hex, localizer), blank].map((line) => say(line));
}

// Rendered from the published name and options alone, so a modal this driver
// has never heard of prints the same way the ones it has do. The option being
// asked for is the top modal's first; a listed value is answerable by number.
//
// The banner and the free-text prompt spell the screen's own id and the keys a
// `submit-modal:` answers it by, which the engine publishes no words for and
// no language moves: they address the screen rather than describe it, and are
// this driver's own vocabulary the way `formatHelp`'s table is (c10).
function formatModals(v: PlayView, localizer: Localizer): ReplLine[] {
  const lines: ReplLine[] = [];
  for (const modal of v.modals) {
    const options = modal.options.map((option) => option.key).join(', ');
    const modalId = localizer.identifier(modal.name);
    lines.push(
      note(
        options === ''
          ? localizer.engine('engine.repl.modal.answered', { modal: modalId })
          : localizer.engine('engine.repl.modal', { modal: modalId, options: localizer.identifier(options) }),
      ),
    );
  }
  lines.push(...formatFocus(v, localizer));

  const asking = askedOption(v.modals);
  if (!asking) return lines;
  lines.push(say(localizer.engine('engine.repl.modal.asking', { option: asking.label })));
  if (asking.values) asking.values.forEach((choice, index) => lines.push(say(localizer.engine('engine.repl.choice', { index: index + 1, choice: choice.shown }), 2)));
  else lines.push(note(localizer.engine('engine.repl.modal.free', { option: localizer.identifier(asking.key) }), 2));
  return lines;
}

function formatView(v: PlayView, localizer: Localizer, reread = false): ReplLine[] {
  if (reread) shownLocations.delete(v.location.id);
  const lines: ReplLine[] = [];
  for (const said of v.said) lines.push(say(said));
  lines.push(say(localizer.engine('engine.repl.place', { location: v.location.title, id: localizer.identifier(v.location.id) })));
  if (!shownLocations.has(v.location.id)) {
    shownLocations.add(v.location.id);
    if (v.location.description) lines.push(say(v.location.description));
  }
  if (v.entities.length > 0) lines.push(say(localizer.engine('engine.repl.here', { entities: oneLine(localizer, v.entities.map((entity) => entity.title), ', ') })));
  lines.push(...formatResources(v.resources, localizer));
  lines.push(...formatEncounter(v.encounter, localizer));
  lines.push(...formatModals(v, localizer));
  lines.push(...formatChoices(v.choices, localizer));
  lines.push(say(localizer.engine('engine.repl.clock', { time: v.time })));
  return lines;
}

// A dictionary the record is shown whole, under the key that names it. The
// parameter is the last segment of that key, so the pattern and the value it
// takes cannot drift apart in a translation.
type DumpKey = 'engine.repl.state.flags' | 'engine.repl.state.inventory' | 'engine.repl.state.grown' | 'engine.repl.state.xp' | 'engine.repl.state.equipped';

const dumped = (localizer: Localizer, key: DumpKey, held: unknown): ToolLine =>
  note(localizer.engine(key, { [key.split('.').pop()!]: localizer.identifier(JSON.stringify(held)) }));

function formatInventory(status: PlayStatus, localizer: Localizer): ToolLine[] {
  const lines = [dumped(localizer, 'engine.repl.state.inventory', status.inventory)];
  // Named on their own line rather than folded into the stack counts: a grown
  // copy is not interchangeable with its stack, and the id here is the handle a
  // player equips it by.
  if (Object.keys(status.grown).length > 0) lines.push(dumped(localizer, 'engine.repl.state.grown', status.grown));
  lines.push(dumped(localizer, 'engine.repl.state.xp', Object.fromEntries(status.xp.map((row) => [row.id, row.value]))));
  // What is worn, and not which slots there are: the view publishes a row per
  // declared slot so a page can draw an empty one, and a readout of what the
  // state holds says nothing about a slot the state holds nothing in.
  const filled = status.equipment.flatMap((row) => (row.item === null ? [] : [[row.slot, row.item] as const]));
  if (filled.length > 0) lines.push(dumped(localizer, 'engine.repl.state.equipped', Object.fromEntries(filled)));
  return lines;
}

// The record behind the game rather than the game: every line but the pools is
// a dictionary keyed by the ids the engine stores under, printed for whoever is
// driving this session and answering to no screen (c10). They are tool lines,
// and that is the whole of their exemption from the rule that a driver draws no
// id it has no words for — the pools below them are the same words a player
// reads anywhere else and stay on the player's channel.
function formatState(status: PlayStatus, localizer: Localizer): ReplLine[] {
  return [
    note(localizer.engine('engine.repl.state.location', { location: localizer.identifier(status.location.id) })),
    note(localizer.engine('engine.repl.state.time', { time: status.time })),
    dumped(localizer, 'engine.repl.state.flags', status.flags),
    ...formatInventory(status, localizer),
    ...formatResources(status.resources, localizer),
    ...formatEncounter(status.encounter, localizer),
  ];
}

const HELP_COLUMN = 12;

function formatHelp(entry: CommandHelp): ToolLine {
  const spelling = [entry.name, ...entry.aliases].join(', ');
  const label = entry.argHint ? [spelling, entry.argHint].join(' ') : spelling;
  return note(`${label.padEnd(HELP_COLUMN)} ${entry.summary}`, 2);
}

// How this driver is started, which is its own vocabulary rather than a command:
// a second driver has no argv and prints none of it. The tool's own words, like
// the command table above them — argv belongs to whoever runs the tool, and
// there is no player standing in front of it.
const STARTUP_LINES = [
  '<a.dsl,b.dsl> at startup loads content files, comma-separated in one argument',
  'local=<file> at startup chooses the local DSL file',
  'modportal=<dir> at startup loads enabled portal mod DSL from a synced cache',
  'saves=<dir> at startup chooses where slots are kept (saves=off keeps none)',
];

export function formatOutput(output: CommandOutput, localizer: Localizer): ReplLine[] {
  switch (output.kind) {
    case 'message':
      // The glyph marks the message its detail belongs to and is not repeated
      // down the indent: a reader counts one refusal, not one per line of it.
      return output.words === 'player'
        ? [say(output.text, 0, output.tone), ...(output.detail ?? []).map((line) => say(line, 2))]
        : [note(output.text, 0, output.tone), ...(output.detail ?? []).map((line) => note(line, 2))];
    case 'view':
      return formatView(output.view, localizer, output.reread);
    case 'status':
      return formatState(output.status, localizer);
    case 'choices':
      return formatChoices(output.choices, localizer);
    case 'help':
      return [note('Commands:'), ...output.entries.map(formatHelp), ...STARTUP_LINES.map((line) => note(line, 2))];
    case 'source':
      return output.lines.map((line) => note(line));
    case 'authored':
      return output.blocks.flatMap((block) => [note(''), ...block.map((line) => note(line))]);
    default: {
      const unreached: never = output;
      return unreached;
    }
  }
}

export function formatResult(result: CommandResult, localizer: Localizer): ReplLine[] {
  return result.output.flatMap((output) => formatOutput(output, localizer));
}

function progressBar(fraction: number, width = 20): string {
  const clamped = Math.min(1, Math.max(0, fraction));
  const filled = Math.round(clamped * width);
  return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}]`;
}

export function formatLive(progress: LiveProgress, localizer: Localizer): PlayerLine {
  const clock = localizer.engine('engine.repl.clock', { time: localizer.identifier(progress.time.toFixed(1)) });
  if (!progress.active) return say(localizer.engine('engine.repl.live.done', { action: progress.label, clock }));
  const pools = progress.pools.map((each) =>
    localizer.engine('engine.repl.live.pool', { resource: each.title, current: localizer.identifier(tidy(each.current)), max: localizer.identifier(tidy(each.max)) }),
  );
  const counting = progress.implicit
    ? [localizer.engine('engine.repl.live.counting', { attempts: progress.implicit.attempts, completion: localizer.identifier(progress.implicit.completion.toFixed(1)) })]
    : [];
  const trailing = pools.length > 0 ? pools : counting;
  return say(
    localizer.engine('engine.repl.live.running', {
      action: progress.label,
      bar: localizer.identifier(progressBar(progress.progress)),
      pools: oneLine(localizer, [localizer.identifier(''), ...trailing], ' '),
      clock,
    }),
  );
}

// What one tick puts on the terminal: whatever the world said as it passed, on
// lines of its own, and the bar under them. A say produced by a run rides on
// the view its tick hands back and is drained from every view after it, so a
// driver that does not print it here never prints it at all — run.end reads a
// view with nothing left on it.
export function formatTick(progress: LiveProgress, localizer: Localizer): PlayerLine[] {
  return [...progress.view.said.map((said) => say(said)), formatLive(progress, localizer)];
}

type LineResult = IteratorResult<string>;

function print(lines: readonly ReplLine[]): void {
  if (lines.length > 0) console.log(lines.map(printed).join('\n'));
}

// The decision half of the live loop, with the terminal kept out of it: tick
// the run, write what the tick said, and end exactly once however it ends. The
// timer and the keypress cannot both arrive first, and `settled` is the whole
// of what stops the second one from ending a run that is already over.
export function driveRun(
  run: LiveRun,
  localizer: Localizer,
  write: (text: string) => void,
  ended: (result: CommandResult) => void,
  ticker: Ticker = createTicker(),
): (cancelled: boolean) => void {
  let settled = false;
  let stopTicking: (() => void) | null = null;

  const stop = (cancelled: boolean): void => {
    if (settled) return;
    settled = true;
    stopTicking?.();
    ended(run.end(cancelled));
  };

  stopTicking = ticker((elapsedMs) => {
    const progress = run.tick(elapsedMs);
    // The said lines scroll away above the bar; the carriage return clears the
    // last line written, which is the bar, so it redraws where it was.
    write(`\r\x1b[K${formatTick(progress, localizer).map(printed).join('\n')}`);
    if (!progress.active) stop(false);
  });

  return stop;
}

// The terminal half. Ends when the action completes or the player cancels;
// only reached on a TTY.
//
// ANY keypress cancels, which needs three things in order: rl.pause() so readline
// stops fighting the redrawn bar, setRawMode(true) so keys arrive unbuffered,
// and input.resume() — the non-obvious one, since attaching a `data` listener only
// auto-flows a stream for the FIRST listener and readline already installed one.
// Ctrl-C raises no SIGINT in raw mode, so it is honoured explicitly below.
function runLiveAction(run: LiveRun, localizer: Localizer, armed: readonly Localized[], rl: ReturnType<typeof createInterface>): Promise<void> {
  return new Promise<void>((resolvePromise) => {
    const input = process.stdin;
    const isTTY = Boolean(input.isTTY);
    const wasRaw = Boolean(input.isRaw);
    rl.pause();
    if (isTTY) input.setRawMode(true);
    input.resume();
    // Arming reports no output of its own; what the world said as the action
    // began rides on the view it handed back.
    print(armed.map((said) => say(said)));
    process.stdout.write(`${localizer.engine('engine.repl.live.stop')}\n`);

    const stop = driveRun(run, localizer, (text) => void process.stdout.write(text), (result) => {
      input.off('data', onData);
      input.off('end', onEnd);
      if (isTTY) input.setRawMode(wasRaw);
      process.stdout.write('\n');
      print(formatResult(result, localizer));
      rl.resume();
      resolvePromise();
    });

    const onData = (chunk: Buffer): void => {
      if (isTTY && chunk.length === 1 && chunk[0] === 0x03) {
        // Ctrl-C: raw mode swallowed the usual SIGINT.
        input.setRawMode(false);
        rl.close();
        process.exit(130);
      }
      stop(true);
    };
    const onEnd = (): void => void stop(true);

    input.on('data', onData);
    input.on('end', onEnd);
  });
}

interface CliArgs {
  files: string[];
  liveRequested: boolean;
  localFile: string;
  modportalDir?: string;
  savesDir?: string;
}

function splitContentArg(arg: string | undefined): string[] {
  return (arg ?? defaultContent).split(',').map((file) => file.trim()).filter(Boolean);
}

function parseCliArgs(rawArgs: string[]): CliArgs {
  const positional: string[] = [];
  let localFile = defaultLocalChanges;
  let modportalDir: string | undefined = DEFAULT_MODPORTAL_CACHE;
  let savesDir: string | undefined = defaultSaves;
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
    if (arg === '--no-saves' || arg === 'saves=off') {
      savesDir = undefined;
      continue;
    }
    if (arg === '--saves') {
      savesDir = rawArgs[++i] ?? defaultSaves;
      continue;
    }
    if (arg.startsWith('--saves=')) {
      const value = arg.slice('--saves='.length);
      savesDir = value === 'off' ? undefined : value;
      continue;
    }
    if (arg.startsWith('saves=')) {
      const value = arg.slice('saves='.length);
      savesDir = value === 'off' ? undefined : value;
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
  return { files: splitContentArg(positional[0]), liveRequested, localFile, modportalDir, savesDir };
}

function repoPath(file: string): string {
  return path.resolve(repoRoot, file);
}

function sourceName(file: string): string {
  return path.basename(file).replace(/\.[^.]*$/, '');
}

// One file is one module: its `# info` names it, and its filename is the
// fallback id for a file that declares none. The engine's own English joins
// them here rather than in the default argument, so a session named on the
// command line is as playable as the one nobody named.
function loadContent(files: string[]): ModuleSource[] {
  return withEngineLocale(
    files.map((file) => ({
      name: sourceName(file),
      text: readFileSync(repoPath(file), 'utf8'),
    })),
  );
}

function writeLocalChanges(file: string, text: string): void {
  const target = repoPath(file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text, 'utf8');
}

function readLocalChanges(file: string, dependencies: readonly string[]): string {
  const target = repoPath(file);
  return existsSync(target) ? readFileSync(target, 'utf8') : initialLocalChangesModule(dependencies);
}

// The save context this driver hands the command table: one file per slot
// under a directory of its own, and the wall clock the cadence is measured on.
// The directory is not made until something is written to it, so a run that
// saves nothing leaves nothing behind and starts the same way every time.
export function fileSaves(dir: string, now: () => number = Date.now): SaveContext {
  return createSaveContext(fileSlots(repoPath(dir)), now);
}

// The authoring context this driver hands the command table: a file it can
// write and the same file read back on demand. Both close over the path rather
// than over its contents, so a session that has been running for an hour reads
// what is on disk now — including what another process put there.
export function fileAuthoring(baseSources: ModuleSource[], dependencies: string[], localFile: string): AuthoringContext {
  return {
    baseSources,
    dependencies,
    localSource: { name: sourceName(localFile), text: readLocalChanges(localFile, dependencies) },
    writeLocalChanges: (text) => writeLocalChanges(localFile, text),
    readLocalChanges: () => readLocalChanges(localFile, dependencies),
  };
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

export interface Repl {
  context: CommandContext;
  // What the door reported about the universe this session opened over, whole.
  // Written to stderr by main, because a module the loader disabled is not part
  // of the game being played and neither is a requirement it did not meet.
  opened: OpenedUniverse;
  opening: readonly ReplLine[];
}

// Everything between having the sources and taking the first line: open the
// universe through the one door, take the opening view, and build the one
// context every line afterwards goes through. Lifted out of main so that the
// drift proof drives the REPL rather than a second copy of it — a copy is what
// made the previous cross-driver comparison measure only one of the two
// drivers. `withEngineLocale` stays on this side of the door because it reads
// through node:fs and the browser gets the same file through its content glob.
export function openRepl(sources: readonly ModuleSource[], options: { authoring?: AuthoringContext; save?: SaveContext; driving?: boolean } = {}): Repl {
  const opened = openUniverse(withEngineLocale(sources), { save: options.save });
  const { session } = opened;
  const recorder: Recorder = { history: [], startSave: serializeSession(session) };
  const opening = view(session);
  return {
    context: newContext(session, opening, { recorder, authoring: options.authoring, save: options.save, driving: options.driving }),
    opened,
    opening: formatView(opening, sessionLocalizer(session)),
  };
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
  const authoring = fileAuthoring(baseSources, dependencies, args.localFile);
  const sources = existsSync(localPath) ? [...baseSources, authoring.localSource] : baseSources;

  const repl = openRepl(sources, { authoring, save: args.savesDir ? fileSaves(args.savesDir) : undefined, driving: liveMode });
  for (const problem of repl.opened.problems) console.error(`Problem: ${problem.message}`);
  const ctx = repl.context;
  const localizer = (): Localizer => sessionLocalizer(ctx.session);
  print(repl.opening);
  console.log(`\n${localizer().engine('engine.repl.opening')}`);

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

      const result = runLine(ctx, line);
      print(formatResult(result, localizer()));
      if (result.live) await runLiveAction(result.live, localizer(), result.view?.said ?? [], rl);

      if (result.quit) break;
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
