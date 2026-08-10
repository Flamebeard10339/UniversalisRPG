import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { RuntimeError } from '../src/runtime/runtime';
import { formatModuleDiagnostic, loadUniverseWithDiagnostics } from '../src/content/registry';
import { type ModuleSource } from '../src/content/universe';
import { initialLocalChangesModule } from '../src/content/localChanges';
import { DEFAULT_MODPORTAL_CACHE, readEntryText, readModportalCache } from './lib/modportalCache';
import { serializeSession, startSession, view, type PlayChoice, type PlayStatus, type PlayView } from '../src/runtime/session';
import {
  askedOption,
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
} from '../src/runtime/command';
import { type Modal } from '../src/runtime/runtime';

const repoRoot = path.join(import.meta.dirname, '..');
const defaultContent = 'content/tutorial-island.dsl';
const defaultLocalChanges = 'content/local-changes.dsl';

// TODO(quest-journal): quests are emergent from flags, not a DSL kind. See backlog.

// A location's examine text prints on first arrival only; /look reprints it.
const shownLocations = new Set<string>();

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

function formatView(v: PlayView, reread = false): string[] {
  if (reread) shownLocations.delete(v.location.id);
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

const TONE_PREFIX: Record<MessageTone, string> = { plain: '', ok: '✓ ', warn: '⚠ ', error: 'Error: ' };

const HELP_COLUMN = 12;

function formatHelp(entry: CommandHelp): string {
  const spelling = [entry.name, ...entry.aliases].join(', ');
  const label = entry.argHint ? `${spelling} ${entry.argHint}` : spelling;
  return `  ${label.padEnd(HELP_COLUMN)} ${entry.summary}`;
}

// How this driver is started, which is its own vocabulary rather than a command:
// a second driver has no argv and prints none of it.
const STARTUP_LINES = [
  '  <a.dsl,b.dsl> at startup loads content files, comma-separated in one argument',
  '  local=<file> at startup chooses the local DSL file',
  '  modportal=<dir> at startup loads enabled portal mod DSL from a synced cache',
];

export function formatOutput(output: CommandOutput): string[] {
  switch (output.kind) {
    case 'message':
      return [`${TONE_PREFIX[output.tone]}${output.text}`, ...(output.detail ?? []).map((line) => `  ${line}`)];
    case 'view':
      return formatView(output.view, output.reread);
    case 'status':
      return formatState(output.status);
    case 'inventory':
      return formatInventory(output.status);
    case 'choices':
      return formatChoices(output.choices);
    case 'help':
      return ['Commands:', ...output.entries.map(formatHelp), ...STARTUP_LINES];
    case 'source':
      return output.lines;
    case 'authored':
      return output.blocks.flatMap((block) => ['', ...block]);
  }
}

export function formatResult(result: CommandResult): string[] {
  return result.output.flatMap(formatOutput);
}

function progressBar(fraction: number, width = 20): string {
  const clamped = Math.min(1, Math.max(0, fraction));
  const filled = Math.round(clamped * width);
  return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}]`;
}

export function formatLive(progress: LiveProgress): string {
  const clock = `[time: ${progress.time.toFixed(1)}s]`;
  if (!progress.active) return `${progress.label}: done.  ${clock}`;
  const pools = progress.pools.map((pool) => ` ${pool.title} ${tidy(pool.current)}/${tidy(pool.max)}`).join('');
  const counting = progress.implicit ? ` hits:${progress.implicit.attempts} completion:${progress.implicit.completion.toFixed(1)}` : '';
  return `${progress.label}... ${progressBar(progress.progress)}${pools || counting}  ${clock}`;
}

const LIVE_TICK_MS = 200;

type LineResult = IteratorResult<string>;

function print(lines: string[]): void {
  if (lines.length > 0) console.log(lines.join('\n'));
}

// Ends when the action completes or the player cancels; only reached on a TTY.
//
// ANY keypress cancels, which needs three things in order: rl.pause() so readline
// stops fighting the \r-redrawn bar, setRawMode(true) so keys arrive unbuffered,
// and input.resume() — the non-obvious one, since attaching a `data` listener only
// auto-flows a stream for the FIRST listener and readline already installed one.
// Ctrl-C raises no SIGINT in raw mode, so it is honoured explicitly below.
function runLiveAction(run: LiveRun, rl: ReturnType<typeof createInterface>): Promise<void> {
  return new Promise<void>((resolvePromise) => {
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
      print(formatResult(run.end(cancelled)));
      rl.resume();
      resolvePromise();
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

    const timer = setInterval(() => {
      const now = Date.now();
      const elapsedMs = now - lastTick;
      lastTick = now;
      const progress = run.tick(elapsedMs);
      process.stdout.write(`\r\x1b[K${formatLive(progress)}`);
      if (!progress.active) finish();
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
  const session = startSession(loaded.registry);
  const recorder: Recorder = { history: [], startSave: serializeSession(session) };
  const authoring: AuthoringContext = {
    baseSources,
    dependencies,
    localSource,
    writeLocalChanges: (text) => writeLocalChanges(args.localFile, text),
  };

  let opening: PlayView;
  try {
    opening = view(session);
  } catch (err) {
    if (err instanceof RuntimeError) {
      console.error(`Error: ${err.message}`);
      return;
    }
    throw err;
  }
  const ctx: CommandContext = newContext(session, opening, { recorder, authoring, driving: liveMode });
  console.log(formatView(opening).join('\n'));
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

      const result = runLine(ctx, line);
      print(formatResult(result));
      if (result.live) await runLiveAction(result.live, rl);

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
