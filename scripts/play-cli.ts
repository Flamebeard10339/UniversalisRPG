import { sourceFiles } from './lib/dslSources';import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { withEngineLocale } from '../src/content/engineLocale';
import { type ModuleSource } from '../src/content/universe';

import { initialLocalChangesModule } from '../src/content/localChanges';
import { SHIPPED_DIRS } from '../src/content/shipped';
import { DEFAULT_MODPORTAL_CACHE, readEntryText, readModportalCache } from './lib/modportalCache';
import { fileSlots } from './lib/slotFile';
import { createSaveContext, type SaveContext } from '../src/runtime/saveSlots';
import { type Localized, type Localizer } from '../src/runtime/localized';
import { openUniverse, type OpenedUniverse } from '../src/runtime/openUniverse';
import { serializeSession, sessionLocalizer, view } from '../src/runtime/session';
import {
  createTicker,
  newContext,
  resumptionNotes,
  runLine,
  type AuthoringContext,
  type CommandContext,
  type CommandOutput,
  type CommandResult,
  type LiveProgress,
  type LiveRun,
  type Recorder,
  type Ticker,
} from '../src/runtime/command';
import {
  formatOutput as answerLines,
  formatView,
  note,
  oneLine,
  printed,
  say,
  withCount,
  type PlayerLine,
  type ReplLine,
} from './lib/replLines';

import { tidy } from '../src/runtime/figures';

export { formatView, printed, type PlayerLine, type ReplLine, type ToolLine } from './lib/replLines';

// How this terminal is started is this terminal's own footnote, and rides in under the help the
// engine hands every driver rather than inside it.
const STARTUP_LINES = [
  '<a.dsl,b.dsl> at startup loads content files, comma-separated in one argument',
  'local=<file> at startup chooses the local DSL file',
  'modportal=<dir> at startup loads enabled portal mod DSL from a synced cache',
  'saves=<dir> at startup chooses where slots are kept (saves=off keeps none)',
];

export function formatOutput(output: CommandOutput, localizer: Localizer): ReplLine[] {
  const lines = answerLines(output, localizer);
  return output.kind === 'help' ? [...lines, ...STARTUP_LINES.map((line) => note(line, 2))] : lines;
}

export function formatResult(result: CommandResult, localizer: Localizer): ReplLine[] {
  return result.output.flatMap((output) => formatOutput(output, localizer));
}

const repoRoot = path.join(import.meta.dirname, '..');
const defaultContent = SHIPPED_DIRS.join(',');
const defaultLocalChanges = 'content/local-changes.dsl';
const defaultSaves = '.saves';
const CTRL_C_BYTE = 0x03;
const EXIT_CODE_INTERRUPTED = 130;


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

// The sources are asked for rather than held, because a driver that re-expands a directory every
// turn — the playbot — authors modules into that directory while it runs, and a snapshot taken at
// startup would stage them against a dependency list that predates them.
export function fileAuthoring(read: () => readonly ModuleSource[], localFile: string): AuthoringContext {
  const dependencies = (): string[] => loadUniverseWithDiagnostics(read()).loadedModules;
  return {
    get baseSources() {
      return [...read()];
    },
    get dependencies() {
      return dependencies();
    },
    get localSource() {
      return { name: sourceName(localFile), text: readLocalChanges(localFile, dependencies()) };
    },
    writeLocalChanges: (text) => writeLocalChanges(localFile, text),
    readLocalChanges: () => readLocalChanges(localFile, dependencies()),
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
  const authoring = fileAuthoring(() => baseSources, args.localFile);
  const sources = existsSync(localPath) ? [...baseSources, authoring.localSource] : baseSources;

  const repl = openRepl(sources, { authoring, save: args.savesDir ? fileSaves(args.savesDir) : undefined, driving: liveMode });
  for (const problem of repl.opened.problems) console.error(`Problem: ${problem.message}`);
  print(resumptionNotes(repl.opened.resumed).flatMap((said) => formatOutput(said, sessionLocalizer(repl.context.session))));
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
