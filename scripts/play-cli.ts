import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { actionFirstUnit, craftFirstUnit, loadModule, RuntimeError, type ActiveAction, type GameState } from '../src/game/contentDsl/runtime';
import { apply, beginAction, startSession, submitModal, view, wait, type PlayChoice, type PlaySession, type PlayView } from '../src/game/contentDsl/session';

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
  '  /wait <s>    advance simulated time by <s> seconds',
  '  /speed <n>   set the live-mode time multiplier (default 1)',
  '  /state       show location, elapsed sim-time, flags, inventory, xp',
  '  /help        show this help',
  '  /quit, /q    show final state and exit',
];

// --live-mode real-time multiplier: 1 sim-second per real-second by default.
// Set via /speed, read by runLiveAction/liveTick. Module-level because it's a
// REPL-session-wide dial, not per-action state.
let speedMultiplier = 1;

function formatChoices(choices: PlayChoice[]): string[] {
  return choices.map((choice, index) => {
    const detail = choice.detail ? ` — ${choice.detail}` : '';
    return `  ${index + 1}) ${choice.label}${detail}`;
  });
}

function formatView(v: PlayView): string[] {
  const lines: string[] = [];
  for (const said of v.said) lines.push(said);
  lines.push(`${v.location.title} (${v.location.id})`);
  lines.push(v.location.description);
  if (v.entities.length > 0) lines.push(`Here: ${v.entities.map((entity) => entity.title).join(', ')}`);
  lines.push(...formatChoices(v.choices));
  lines.push(`[time: ${v.time}s]`);
  return lines;
}

function formatState(state: GameState): string[] {
  const inventory = Object.fromEntries(Object.entries(state.inventory).filter(([, count]) => count > 0));
  return [
    `Location: ${state.location}`,
    `Elapsed simulated time: ${state.time}s`,
    `Flags: ${JSON.stringify(state.flags)}`,
    `Inventory: ${JSON.stringify(inventory)}`,
    `XP: ${JSON.stringify(state.xp)}`,
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
  const line = `${label}... ${bar} attempts:${after.attemptsMade} health:${after.healthRemaining.toFixed(1)}  [time: ${session.state.time.toFixed(1)}s]`;
  return { active: true, line };
}

const LIVE_TICK_MS = 200;

function delay(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

type LineResult = IteratorResult<string>;

// Out-parameter for runLiveAction's leftover pending read (see below on why
// this can't just be the function's return value).
interface PendingLineBox {
  line: Promise<LineResult> | null;
}

// Real-time shell around liveTick: ticks roughly every LIVE_TICK_MS of real
// time, converting elapsed real time to simulated seconds (scaled by
// speedMultiplier). Ends when either the action completes on its own
// (liveTick reports active: false — the natural end for a non-repeating
// action, or a repeating one that ran out of input) or a line of input
// arrives (Enter, with or without text — the only way to stop a repeating
// action, which never self-completes); either way the line's CONTENT is
// discarded, it only serves as an interrupt signal.
//
// Concurrency note: `it` is the SAME AsyncIterator driving the caller's main
// command loop (see main()) — readline's async iterator hands lines to
// whichever `next()` call is outstanding, in the order those calls were
// made, regardless of whether anyone ever awaits the result. So this
// function must never call it.next() and then abandon the resulting promise
// unconsumed — a line that arrives later would be delivered to that
// abandoned promise instead of to main()'s next read, and get silently
// lost. Concretely: if the loop exits because the line arrived, that
// resolved promise's line has been "used up" as the stop signal, so
// out.line is left null (main() starts a fresh read next). If the loop
// exits because the action completed naturally, the read we started is
// still pending, so out.line is set to that SAME promise for main() to
// await instead of issuing a new read — this is also what makes a
// piped/non-TTY run terminate rather than hang: once stdin ends, that
// pending read (like any subsequent one) resolves with done: true, which
// both loops already treat as "stop".
//
// out.line is an out-PARAMETER, not this (async) function's return value,
// deliberately: `await` recursively unwraps nested promises/thenables, so an
// async function that itself returned `Promise<LineResult> | null` would
// have that inner promise silently flattened away by the caller's `await` —
// i.e. main() would end up blocking on the pending read instead of getting
// it back unresolved. Routing it through a plain mutable box sidesteps that.
async function runLiveAction(session: PlaySession, it: AsyncIterator<string>, out: PendingLineBox): Promise<void> {
  let lastTick = Date.now();
  let pendingLine: Promise<LineResult> | null = it.next();
  let stoppedByUser = false;

  while (session.state.activeAction) {
    const winner = await Promise.race([pendingLine!.then((): 'line' => 'line'), delay(LIVE_TICK_MS).then((): 'tick' => 'tick')]);

    if (winner === 'line') {
      stoppedByUser = true;
      session.state.activeAction = null;
      pendingLine = null;
      break;
    }

    const now = Date.now();
    const elapsedMs = now - lastTick;
    lastTick = now;
    const tick = liveTick(session, elapsedMs, speedMultiplier);
    process.stdout.write(`\r\x1b[K${tick.line}`);
    if (!tick.active) break;
  }

  process.stdout.write('\n');
  if (stoppedByUser) console.log('Stopped.');
  console.log(formatView(view(session)).join('\n'));
  out.line = pendingLine;
}

function loadContent(files: string[]): string {
  return files.map((file) => readFileSync(path.resolve(repoRoot, file), 'utf8')).join('\n');
}

const RACES = ['Human', 'Elf', 'Dwarf', 'Orc'];

// Multiple sequential reads for one modal — handled here in the shell, not in
// the pure handleCommand, since it needs to await readline input mid-flow.
async function promptCharacterCreation(rl: ReturnType<typeof createInterface>): Promise<{ name: string; race: string }> {
  const rawName = (await rl.question('Name: ')).trim();
  const name = rawName === '' ? 'Adventurer' : rawName;

  console.log('Race:');
  RACES.forEach((race, index) => console.log(`  ${index + 1}) ${race}`));
  const rawRace = (await rl.question('Race: ')).trim();
  const index = Number(rawRace);
  const race = Number.isInteger(index) && index >= 1 && index <= RACES.length ? RACES[index - 1] : 'Human';

  return { name, race };
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const liveMode = rawArgs.includes('--live');
  const arg = rawArgs.find((a) => !a.startsWith('--'));
  const files = (arg ?? defaultContent).split(',').map((file) => file.trim()).filter(Boolean);
  const registry = loadModule(loadContent(files));
  const session = startSession(registry);

  let current = view(session);
  console.log(formatView(current).join('\n'));

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // A manual asyncIterator (rather than `for await (const line of rl)`) so
  // runLiveAction can borrow the SAME iterator mid-loop to race input against
  // real-time ticks, then hand control back — see runLiveAction's doc comment
  // on why the pending-read handoff matters.
  const it = rl[Symbol.asyncIterator]();
  try {
    process.stdout.write('> ');
    let pendingLine: Promise<LineResult> | null = null;
    for (;;) {
      if (!pendingLine) pendingLine = it.next();
      const { value: line, done } = await pendingLine;
      pendingLine = null;
      if (done) break;

      const trimmed = line.trim();
      const index = Number(trimmed);
      const isNumericChoice = trimmed !== '' && Number.isInteger(index) && index >= 1 && index <= current.choices.length;

      let quit = false;
      if (liveMode && isNumericChoice) {
        const choice = current.choices[index - 1];
        try {
          const next = beginAction(session, choice.id);
          if (session.state.activeAction) {
            const box: PendingLineBox = { line: null };
            await runLiveAction(session, it, box);
            pendingLine = box.line;
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
        const data = await promptCharacterCreation(rl);
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
