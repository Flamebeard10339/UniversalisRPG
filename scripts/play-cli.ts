import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { withEngineLocale } from '../src/content/engineLocale';
import { type ModuleSource } from '../src/content/universe';
import { sourceFiles } from './probe';
import { initialLocalChangesModule } from '../src/content/localChanges';
import { CORPUS_DIR } from '../src/content/shipped';
import { DEFAULT_MODPORTAL_CACHE, readEntryText, readModportalCache } from './lib/modportalCache';
import { fileSlots } from './lib/slotFile';
import { createSaveContext, type SaveContext } from '../src/runtime/saveSlots';
import { type Localized, type Localizer } from '../src/runtime/localized';
import { openUniverse, type OpenedUniverse } from '../src/runtime/openUniverse';
import { type EncounterFoe } from '../src/runtime/encounter';
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

// scripts/viewSurfaces.test.ts asks the same question of this terminal that
// scripts/playbot.test.ts asks of the model: every field a live view carries must either reach a
// rendered line here or be named below with why not.
export const CLI_NOT_SHOWN: ReadonlyArray<{ field: keyof PlayView; why: string }> = [
  { field: 'carried', why: 'the same holdings /state already prints as the raw `inventory` id-count map; a friendlier per-slot listing here would say the same holdings twice' },
  { field: 'planes', why: 'the jewel plane of an item, drawn by the GUI as a diagram; this terminal opens the same modal but only ever names its screen and keys, never the plane inside it' },
  { field: 'focus', why: 'which screen is focused, which only matters once more than one screen can be open at a time; this terminal shows the one open modal already, through `formatModals`' },
];

const repoRoot = path.join(import.meta.dirname, '..');
const defaultContent = CORPUS_DIR;
const defaultLocalChanges = 'content/local-changes.dsl';
const defaultSaves = '.saves';

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

const oneLine = (localizer: Localizer, parts: readonly Localized[], gap: string): Localized => localizer.identifier(parts.join(gap));

const shownLocations = new Set<string>();

function formatChoices(choices: PlayChoice[], localizer: Localizer): PlayerLine[] {
  return choices.map((choice, index) => {
    const numbered = choice.detail
      ? localizer.engine('engine.repl.choice.owned', { index: index + 1, owner: choice.detail, choice: choice.label })
      : localizer.engine('engine.repl.choice', { index: index + 1, choice: choice.label });
    return say(numbered, 2);
  });
}

const MINIMAL_STAGES = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
const BAR_WIDTH = 10;
const CTRL_C_BYTE = 0x03;
const EXIT_CODE_INTERRUPTED = 130;

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

// A location holds a count of its kind and not a roster, so the foe standing after a kill wears the
// id of the one that fell. `×3` beside the bar is how a reader tells a fresh foe at full health from
// the one they were hitting healing itself back up. It rides in as part of the meter because a
// numeral is the same in every language the pool line is written in, and every meter a fight is
// read off — the encounter view and the live tick both — asks withCount for it.
const withCount = (meter: string, remaining: number | null): string => (remaining === null ? meter : `${meter}  ×${remaining}`);

const meterFor = (foe: EncounterFoe): string => withCount(fullBar(foe.current, foe.max), foe.remaining);

function formatEncounter(encounter: PlayView['encounter'], localizer: Localizer): PlayerLine[] {
  if (!encounter) return [];
  const lines = encounter.foes.map((foe) => say(pool(localizer, foe.title, meterFor(foe))));
  const meters = [localizer.engine('engine.repl.swing', { meter: localizer.identifier(minimalGlyph(encounter.cadence, 1)) })];
  for (const foe of encounter.foes) {
    if (foe.cadence !== null) meters.push(pool(localizer, foe.title, minimalGlyph(foe.cadence, 1)));
  }
  return [...lines, say(oneLine(localizer, meters, '   '))];
}

function formatFocus(v: PlayView, localizer: Localizer): PlayerLine[] {
  const focus = v.focus;
  if (focus?.kind !== 'plane') return [];
  const plane = v.planes.find((each) => each.instance === focus.instance);
  if (!plane) return [];
  const blank = localizer.identifier('');
  return [blank, ...formatPlane(plane, v.equipment.some((row) => row.item === plane.instance), focus.hex, localizer), blank].map((line) => say(line));
}

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

type DumpKey = 'engine.repl.state.flags' | 'engine.repl.state.inventory' | 'engine.repl.state.grown' | 'engine.repl.state.xp' | 'engine.repl.state.equipped';

const dumped = (localizer: Localizer, key: DumpKey, held: unknown): ToolLine =>
  note(localizer.engine(key, { [key.split('.').pop()!]: localizer.identifier(JSON.stringify(held)) }));

// A /state line for a field the engine locale has no sentence of its own for is labelled with
// that field's name out of PlayStatus, never with a second English word for it: the label is then
// the key an author looks the field up under, and renaming the field stops this compiling.
const field = (name: keyof PlayStatus, held: string, indent = 0): ToolLine => note(`${name}: ${held}`, indent);

function formatInventory(status: PlayStatus, localizer: Localizer): ToolLine[] {
  const lines = [dumped(localizer, 'engine.repl.state.inventory', status.inventory)];
  if (Object.keys(status.grown).length > 0) lines.push(dumped(localizer, 'engine.repl.state.grown', status.grown));
  lines.push(dumped(localizer, 'engine.repl.state.xp', Object.fromEntries(status.xp.map((row) => [row.id, row.value]))));
  // Every slot, worn or bare — a slot printed only once something is in it leaves an empty-handed
  // session with nothing to name when it wants to put something on.
  lines.push(dumped(localizer, 'engine.repl.state.equipped', Object.fromEntries(status.equipment.map((row) => [row.slot, row.item]))));
  lines.push(field('stats', JSON.stringify(Object.fromEntries(status.stats.map((row) => [row.id, row.value])))));
  return lines;
}

// Coordinates put a location on an integer lattice, but what can be walked is `adjacent`, and
// neither implies the other: two places one step apart on the grid need not be joined, and a road
// may run the width of the map. So the roads are what is drawn, with each place's coordinates
// named beside it — a grid would make its own visual neighbours a claim the world never makes.
function formatMap(status: PlayStatus): ToolLine[] {
  const found = new Set(status.discovered.map((place) => place.id));
  const roadsOf = (place: PlayStatus['discovered'][number]): string =>
    place.adjacent.map((edge) => (edge.open ? String(edge.to) : `${edge.to} (shut)`)).join(', ');
  const unfound = status.locations.flatMap((each) => (found.has(each.id) ? [] : [String(each.id)]));
  return [
    field('discovered', String(status.discovered.length)),
    ...status.discovered.map((place) => {
      const roads = roadsOf(place);
      return note(`${place.title} (${place.id}) at ${place.x},${place.y},${place.z}${roads === '' ? '' : ` -> ${roads}`}`, 2);
    }),
    field('locations', `${found.size} of ${status.locations.length} found${unfound.length === 0 ? '' : `; not yet found: ${unfound.join(', ')}`}`),
  ];
}

function formatState(status: PlayStatus, localizer: Localizer): ReplLine[] {
  return [
    note(localizer.engine('engine.repl.state.location', { location: localizer.identifier(status.location.id) })),
    note(localizer.engine('engine.repl.state.time', { time: status.time })),
    dumped(localizer, 'engine.repl.state.flags', status.flags),
    ...formatInventory(status, localizer),
    ...formatResources(status.resources, localizer),
    ...formatEncounter(status.encounter, localizer),
    ...formatMap(status),
  ];
}

const HELP_COLUMN = 12;

function formatHelp(entry: CommandHelp): ToolLine {
  const spelling = [entry.name, ...entry.aliases].join(', ');
  const label = entry.argHint ? [spelling, entry.argHint].join(' ') : spelling;
  return note(`${label.padEnd(HELP_COLUMN)} ${entry.summary}`, 2);
}

const STARTUP_LINES = [
  '<a.dsl,b.dsl> at startup loads content files, comma-separated in one argument',
  'local=<file> at startup chooses the local DSL file',
  'modportal=<dir> at startup loads enabled portal mod DSL from a synced cache',
  'saves=<dir> at startup chooses where slots are kept (saves=off keeps none)',
];

export function formatOutput(output: CommandOutput, localizer: Localizer): ReplLine[] {
  switch (output.kind) {
    case 'message':
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
    localizer.identifier(
      withCount(localizer.engine('engine.repl.live.pool', { resource: each.title, current: localizer.identifier(tidy(each.current)), max: localizer.identifier(tidy(each.max)) }), each.remaining),
    ),
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

export function formatTick(progress: LiveProgress, localizer: Localizer): PlayerLine[] {
  return [...progress.view.said.map((said) => say(said)), formatLive(progress, localizer)];
}

type LineResult = IteratorResult<string>;

function print(lines: readonly ReplLine[]): void {
  if (lines.length > 0) console.log(lines.map(printed).join('\n'));
}

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
    write(`\r\x1b[K${formatTick(progress, localizer).map(printed).join('\n')}`);
    if (!progress.active) stop(false);
  });

  return stop;
}

function runLiveAction(run: LiveRun, localizer: Localizer, armed: readonly Localized[], rl: ReturnType<typeof createInterface>): Promise<void> {
  return new Promise<void>((resolvePromise) => {
    const input = process.stdin;
    const isTTY = Boolean(input.isTTY);
    const wasRaw = Boolean(input.isRaw);
    rl.pause();
    if (isTTY) input.setRawMode(true);
    // A `data` listener auto-flows a stream only for the first one attached, and readline already attached one.
    input.resume();
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
      if (isTTY && chunk.length === 1 && chunk[0] === CTRL_C_BYTE) {
        input.setRawMode(false);
        rl.close();
        process.exit(EXIT_CODE_INTERRUPTED);
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

function loadContent(files: string[]): ModuleSource[] {
  return withEngineLocale(
    files.flatMap((file) => sourceFiles(repoPath(file))).map((file) => ({
      name: sourceName(file),
      text: readFileSync(file, 'utf8'),
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

export function fileSaves(dir: string, now: () => number = Date.now): SaveContext {
  return createSaveContext(fileSlots(repoPath(dir)), now);
}

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
  opened: OpenedUniverse;
  opening: readonly ReplLine[];
}

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
