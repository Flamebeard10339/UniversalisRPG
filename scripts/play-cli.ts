import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { actionFirstUnit, craftFirstUnit, loadModule, RuntimeError, type ActiveAction, type GameState } from '../src/game/contentDsl/runtime';
import { apply, beginAction, cancelAction, startSession, submitModal, view, wait, type PlayChoice, type PlaySession, type PlayView } from '../src/game/contentDsl/session';

const repoRoot = path.join(import.meta.dirname, '..');
const defaultContent = 'content/tutorial-island.dsl';

export interface CommandResult {
  view?: PlayView;
  output: string[];
  quit: boolean;
}

const HELP_LINES = [
  'Commands:',
  '  <N>          choose option N',
  '  /look        re-read the current location description',
  '  /inventory   show your inventory and skill xp',
  '  /wait <s>    advance simulated time by <s> seconds',
  '  /speed <n>   set the live-mode time multiplier (default 1)',
  '  /state       show location, elapsed sim-time, flags, inventory, xp',
  '  /help        show this help',
  '  /quit, /q    show final state and exit',
];

// TODO(quest-journal): there is no `/quests` command because quests are not a
// first-class DSL concept yet — quest progress is emergent from flags
// (`tutorial.quest-given`, `tutorial.made-bread`, …) set by dialogue nodes. The
// playtest wanted a discoverable quest journal. Building one properly means a
// `# quest` section kind (objectives + completion conditions over flags) plus a
// `/quests` renderer here; deferred as out of MVP scope.

// Locations whose full description has already been shown this run. A location's
// examine text prints only the first time the player arrives (re-printing it
// every turn was flagged as noise in the playtest); /look reprints it on demand.
const shownLocations = new Set<string>();

// --live-mode real-time multiplier: 1 sim-second per real-second by default.
// Set via /speed, read by runLiveAction/liveTick. Module-level because it's a
// REPL-session-wide dial, not per-action state.
let speedMultiplier = 1;

function formatChoices(choices: PlayChoice[]): string[] {
  return choices.map((choice, index) => {
    // Lead with the thing being acted on ("Oven: roast chestnuts") rather than
    // the bare verb — the playtest found "roast chestnuts — Oven" harder to scan.
    const label = choice.detail ? `${choice.detail}: ${choice.label}` : choice.label;
    return `  ${index + 1}) ${label}`;
  });
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
  lines.push(...formatChoices(v.choices));
  lines.push(`[time: ${v.time}s]`);
  return lines;
}

function formatInventory(state: GameState): string[] {
  const inventory = Object.fromEntries(Object.entries(state.inventory).filter(([, count]) => count > 0));
  return [`Inventory: ${JSON.stringify(inventory)}`, `XP: ${JSON.stringify(state.xp)}`];
}

function formatState(state: GameState): string[] {
  return [
    `Location: ${state.location}`,
    `Elapsed simulated time: ${state.time}s`,
    `Flags: ${JSON.stringify(state.flags)}`,
    ...formatInventory(state),
  ];
}

export function handleCommand(session: PlaySession, currentView: PlayView, line: string): CommandResult {
  const trimmed = line.trim();

  if (trimmed === '') {
    return { output: formatChoices(currentView.choices), quit: false };
  }

  if (trimmed === '/help') {
    return { output: HELP_LINES, quit: false };
  }

  if (trimmed === '/state') {
    return { output: formatState(session.state), quit: false };
  }

  if (trimmed === '/inventory' || trimmed === '/inv') {
    return { output: formatInventory(session.state), quit: false };
  }

  if (trimmed === '/look') {
    // Drop the current location from the shown-set so formatView reprints its
    // description (and re-adds it), gating it behind an explicit examine after
    // the first arrival.
    shownLocations.delete(currentView.location.id);
    return { view: currentView, output: formatView(currentView), quit: false };
  }

  if (trimmed === '/quit' || trimmed === '/q') {
    return { output: formatState(session.state), quit: true };
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

  if (trimmed.startsWith('/wait')) {
    const rest = trimmed.slice('/wait'.length).trim();
    const seconds = Number(rest);
    if (rest === '' || Number.isNaN(seconds) || seconds < 0) {
      return { output: [`Error: /wait requires a non-negative number of seconds, got ${JSON.stringify(rest)}`], quit: false };
    }
    try {
      const next = wait(session, seconds);
      return { view: next, output: formatView(next), quit: false };
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
    return { view: next, output: formatView(next), quit: false };
  } catch (err) {
    if (err instanceof RuntimeError) return { output: [`Error: ${err.message}`], quit: false };
    throw err;
  }
}

function progressBar(fraction: number, width = 20): string {
  const clamped = Math.min(1, Math.max(0, fraction));
  const filled = Math.round(clamped * width);
  return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}]`;
}

// The length of the attempt cycle activeAction.progress is counting toward,
// for the progress bar's fraction. Reuses the same side-effect-free probes
// beginAction used to decide instant-vs-spannable — exact for the common
// single-attempt-per-fight case (health/ability defaults => attemptsToResolve
// === 1, e.g. tutorial-island's "roast chestnuts"); for a multi-attempt fight
// it reports the whole fight's span rather than one attempt's, which still
// renders a readable (if coarser) bar.
function cycleDuration(session: PlaySession, active: ActiveAction): number {
  const dot = active.ownerRef.indexOf('.');
  const obj = active.ownerRef.slice(0, dot);
  const objId = active.ownerRef.slice(dot + 1);
  if (obj === 'recipe') return craftFirstUnit(objId, session.registry, session.state);
  return actionFirstUnit(obj, objId, active.actionLabel, session.registry, session.state);
}

export interface LiveTickResult {
  active: boolean;
  line: string;
}

// The pure, deterministic core of live mode: advances sim-time by
// elapsedMs/1000*multiplier via wait() (the same seam /wait and every other
// driver uses), then reports whether the action is still in flight and a
// one-line progress render. No timers/readline here — see runLiveAction for
// the real-time shell that ticks this on a wall-clock interval and reacts to
// input.
export function liveTick(session: PlaySession, elapsedMs: number, multiplier: number): LiveTickResult {
  const before = session.state.activeAction;
  const label = before?.actionLabel ?? 'action';
  const dt = (elapsedMs / 1000) * multiplier;
  wait(session, dt);

  const after = session.state.activeAction;
  if (!after) {
    return { active: false, line: `${label}: done.  [time: ${session.state.time.toFixed(1)}s]` };
  }
  const duration = cycleDuration(session, after);
  const bar = duration > 0 ? progressBar(after.progress / duration) : progressBar(1);
  // Show combat detail only once it means something: hits landed, or a target
  // with more than one hitpoint being worn down. A plain single-hit action
  // (roast, craft, most fights) would otherwise always read "attempts:0
  // health:1.0", which looks stuck — the moving bar carries the progress.
  // TODO(resource-bars): the playtest wanted every combatant's resource bars —
  // the player's health/energy and a real enemy health bar. That needs the
  // Pass-2 numeric-stats / resource-pool engine (GameState has no player HP or
  // pools yet), so richer bars are deferred until that lands.
  const showCombat = after.attemptsMade > 0 || after.healthRemaining < 1;
  const detail = showCombat ? ` hits:${after.attemptsMade} target-hp:${after.healthRemaining.toFixed(1)}` : '';
  const line = `${label}... ${bar}${detail}  [time: ${session.state.time.toFixed(1)}s]`;
  return { active: true, line };
}

const LIVE_TICK_MS = 200;

type LineResult = IteratorResult<string>;

// Real-time shell around liveTick: ticks every LIVE_TICK_MS of real time,
// converting elapsed real time to simulated seconds (scaled by
// speedMultiplier). It ends either when the action completes on its own
// (liveTick reports active: false) or when the player cancels it. Only reached
// on an interactive TTY (see the liveMode gate in main) — a piped run resolves
// spannable actions instantly instead.
//
// Cancellation is first-class and always available: ANY keypress stops the
// action immediately, no Enter required. Getting a raw keypress here needs three
// things done in order, and ALL of them matter:
//   1. rl.pause() so readline stops its own line-editing/echo (which would fight
//      the \r-redrawn progress bar). But pause() also puts the tty back into
//      cooked mode and pauses the stream, so on its own it makes single keys
//      un-deliverable — hence 2 and 3.
//   2. setRawMode(true) so the tty delivers each keystroke immediately instead
//      of buffering a whole line until Enter.
//   3. input.resume() — the non-obvious one. Attaching a 'data' listener only
//      auto-switches a stream to flowing mode for the FIRST data listener;
//      readline already installed one, so our listener would otherwise sit on a
//      paused stream and never fire. This was the bug that made keys do nothing.
// On cleanup the tty's raw state is restored to what it was before (readline
// wants it raw again for the next line) and readline is resumed. Ctrl-C won't
// raise SIGINT in raw mode, so it's honored here as an explicit quit.
function runLiveAction(session: PlaySession, rl: ReturnType<typeof createInterface>): Promise<void> {
  return new Promise((resolvePromise) => {
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
        cancelAction(session);
        console.log('Stopped.');
      }
      console.log(formatView(view(session)).join('\n'));
      rl.resume();
      resolvePromise();
    };

    const onData = (chunk: Buffer): void => {
      if (isTTY && chunk.length === 1 && chunk[0] === 0x03) {
        // Ctrl-C: restore the terminal and exit, since raw mode swallowed the
        // usual SIGINT.
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
      const tick = liveTick(session, elapsedMs, speedMultiplier);
      process.stdout.write(`\r\x1b[K${tick.line}`);
      if (!tick.active) finish();
    }, LIVE_TICK_MS);
  });
}

function loadContent(files: string[]): string {
  return files.map((file) => readFileSync(path.resolve(repoRoot, file), 'utf8')).join('\n');
}

const RACES = ['Human', 'Elf', 'Dwarf', 'Orc'];

async function nextLine(it: AsyncIterator<string>): Promise<string> {
  const result = await it.next();
  return result.done ? '' : result.value;
}

// Multiple sequential reads for one modal — handled here in the shell, not in
// the pure handleCommand, since it needs to await input mid-flow. Reads from
// the SAME async iterator the main loop drives (rl.question drops piped lines
// on Node 24; the iterator does not), so piped/agent-driven runs can answer it.
async function promptCharacterCreation(it: AsyncIterator<string>): Promise<{ name: string; race: string }> {
  process.stdout.write('Name: ');
  const rawName = (await nextLine(it)).trim();
  const name = rawName === '' ? 'Adventurer' : rawName;

  console.log('Race:');
  RACES.forEach((race, index) => console.log(`  ${index + 1}) ${race}`));
  process.stdout.write('Race: ');
  const rawRace = (await nextLine(it)).trim();
  const index = Number(rawRace);
  const race = Number.isInteger(index) && index >= 1 && index <= RACES.length ? RACES[index - 1] : 'Human';

  return { name, race };
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  // Real-time play needs an interactive terminal to render the progress bar and
  // catch the keypress that cancels an action. On a piped/non-TTY run there's no
  // one watching or able to press a key, and an infinitely-repeating action
  // would tick forever, so --live there falls back to the instant path (each
  // spannable action resolves to its natural first-unit completion at once,
  // exactly like the default agent mode).
  const liveMode = rawArgs.includes('--live') && Boolean(process.stdin.isTTY);
  const arg = rawArgs.find((a) => !a.startsWith('--'));
  const files = (arg ?? defaultContent).split(',').map((file) => file.trim()).filter(Boolean);
  const registry = loadModule(loadContent(files));
  const session = startSession(registry);

  let current = view(session);
  console.log(formatView(current).join('\n'));
  console.log('\nType /help for commands (/state and /inventory show your progress).');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // A manual asyncIterator (rather than `for await (const line of rl)`) so a
  // read can be started and later awaited across iterations. During a live
  // action runLiveAction pauses this readline and drives stdin itself, then
  // resumes it, so the loop keeps reading lines normally afterward.
  const it = rl[Symbol.asyncIterator]();
  try {
    process.stdout.write('> ');
    let pendingLine: Promise<LineResult> | null = null;
    for (;;) {
      if (!pendingLine) pendingLine = it.next();
      const { value: line, done } = await pendingLine;
      pendingLine = null;
      if (done) break;

      // A blank line between the command just entered and its result, so each
      // turn reads as a distinct block (playtest feedback #1).
      console.log('');

      const trimmed = line.trim();
      const index = Number(trimmed);
      const isNumericChoice = trimmed !== '' && Number.isInteger(index) && index >= 1 && index <= current.choices.length;

      let quit = false;
      if (liveMode && isNumericChoice) {
        const choice = current.choices[index - 1];
        try {
          const next = beginAction(session, choice.id);
          if (session.state.activeAction) {
            // runLiveAction pauses rl for the duration and resumes it before
            // resolving, so the loop's next it.next() reads normally.
            await runLiveAction(session, rl);
            current = view(session);
          } else {
            console.log(formatView(next).join('\n'));
            current = next;
          }
        } catch (err) {
          if (err instanceof RuntimeError) console.log(`Error: ${err.message}`);
          else throw err;
        }
      } else {
        const result = handleCommand(session, current, line);
        if (result.output.length > 0) console.log(result.output.join('\n'));
        if (result.view) current = result.view;
        quit = result.quit;
      }

      // Modals are unconditional regardless of which branch above produced
      // them (an instant action reached via beginAction in live mode can open
      // one just like apply() can) — see character-creation's mirror trigger.
      if (current.pendingModal === 'character-creation') {
        const data = await promptCharacterCreation(it);
        current = submitModal(session, data);
        console.log(formatView(current).join('\n'));
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
