import path from 'node:path';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { formatModuleDiagnostic, type Registry } from '../src/content/registry';
import { DEBUG_MARK } from '../src/content/sections/define';
import { printDirective, printTerminator } from '../src/content/sections/test';
import { shippedSources } from '../src/content/shipped';
import type { ModuleSource } from '../src/content/universe';
import { TIME, type Condition } from '../src/grammar/condition';
import { roadDepths } from '../src/runtime/journey';
import { DEFAULT_RNG_SEED, nextRandom } from '../src/runtime/rng';
import { nextBoundary } from '../src/runtime/runtime';
import { applyDirective, choiceToDirective, readRoom, runTest, sessionOver, sessionStatus, startSession, type PlaySession } from '../src/runtime/session';
import { createGameState } from '../src/runtime/state';
import { MS_PER_MINUTE, msToSeconds, secondsToMs } from '../src/runtime/units';

// The state a run is walked against, taken off the thing that makes one. Naming the type instead
// would put the whole of the engine's state on the surface `published.test.ts` audits, and a sweep
// reaches for none of it: what it reads is a clock, a place and two tallies.
type Walked = ReturnType<typeof createGameState>;

export const DEFAULT_SEEDS = 4;
export const DEFAULT_WINDOW_MINUTES = 60;

const usage = [
  'Usage: npm run simulate-activity -- <save> [<action-spec>] [--at <location>] [--seeds <n>] [--window <minutes>] [--all]',
  '',
  '  <save>          a # save id to start every run from, as `load:` names one',
  '  <action-spec>   narrows the sweep to the offers whose `use:` line holds this text,',
  '                  so `highwayman` and `core.melee-combat on combat.highwayman` both name',
  '                  something. With none, everything on offer anywhere is measured',
  '  --at            narrows the sweep to one location',
  `  --seeds         how many rng seeds each offer is run under (default ${String(DEFAULT_SEEDS)})`,
  `  --window        how many minutes of game time every run is given (default ${String(DEFAULT_WINDOW_MINUTES)})`,
  '  --all           list every offer, including the ones that paid nothing at all',
  '',
  'Nothing here is computed: every figure is read off a run. The tool builds a # test per',
  'offer — `load:` the save, `goto:` the place, then that offer `until time >= <the far end of the',
  'window>` — walks it against a state of its own, and reports what the state ended holding. So a',
  'buff, a proc, an on-kill effect, a pack of two, or retaliation is priced in by having happened.',
  '',
  'Every run is given the same window of game time, and that window is the only denominator any',
  'rate here has. An offer that stops inside the window is taken up again where the player is left',
  'standing, waiting out anything the world puts right on its own — a fallen thing back on its feet,',
  'a daze worn off. What ends a run is the player having to go and do something else: buy bait, mend',
  'a line, walk back to where the target was. Nothing here knows those apart, and none of them is',
  'named: the engine is asked whether the offer is on the sheet, and the answer is the whole rule.',
  '',
  'What is left of the window after that is spent standing where the world left them, and the run is',
  'divided by the whole window all the same. So dying at seven seconds costs the rest of the hour,',
  'and an offer that pays for four minutes and nothing for the next fifty-six reads as the hour it',
  'was rather than as the four minutes.',
  '',
  'The offers are the ones the engine itself puts in front of a player standing there, so a',
  'fishing cast and an encounter are one measurement and a mechanic added next month is swept',
  'with no edit here. A fight the world picks is measured with it: the run does not have to',
  'take the offer to be killed by what made it.',
  '',
  '`worked` is how much of the window the offer itself ran for, across every time it was taken up,',
  "and where it is short of the window the engine's own sentence for the last attempt says why, death",
  'included. There is no death flag to read: dying is authored in the corpus rather than known to the',
  'engine, so the tool quotes rather than classifies. Where `worked` is short, the pace inside it is',
  'printed beside the rate — that one is a ceiling carried out to an hour, not an hour anything held.',
  '',
  'A fight something aggressive started is named where one happened. It is an annotation and not a',
  'suppression: whoever swung, the window is the one the player lived through, and what they came out',
  'of it holding is what standing there paid.',
  '',
  'This is a tool and not a gate. It runs on demand, it asserts nothing, and it always exits 0',
  'unless the arguments or the corpus are refused.',
].join('\n');

export interface SimulationArgs {
  save: string;
  holds?: string;
  at?: string;
  seeds: number;
  window: number;
  all: boolean;
}

const counted = (flag: string, raw: string | undefined): number => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${flag} wants a whole number of at least 1, not ${raw ?? 'nothing'}`);
  return value;
};

export function parseSimulationArgs(raw: readonly string[]): SimulationArgs {
  const loose: string[] = [];
  const args: SimulationArgs = { save: '', seeds: DEFAULT_SEEDS, window: DEFAULT_WINDOW_MINUTES, all: false };
  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i];
    if (arg === '--help' || arg === '-h') throw new Error(usage);
    else if (arg === '--all') args.all = true;
    else if (arg === '--at') {
      const at = raw[++i];
      if (at === undefined) throw new Error('--at wants a location id after it');
      args.at = at;
    } else if (arg === '--seeds') args.seeds = counted('--seeds', raw[++i]);
    else if (arg === '--window') args.window = counted('--window', raw[++i]);
    else if (arg.startsWith('--')) throw new Error(`unknown flag ${arg}\n\n${usage}`);
    else loose.push(arg);
  }
  if (loose.length === 0) throw new Error(`name a # save to measure from\n\n${usage}`);
  if (loose.length > 2) throw new Error(`one save and at most one action-spec, not ${loose.length} loose arguments\n\n${usage}`);
  args.save = loose[0];
  if (loose.length === 2) args.holds = loose[1];
  return args;
}

// One thing that can be done somewhere, addressed exactly as a `# test` line addresses it. `use` is
// what the engine offered a player standing there, printed back, so nothing about which mechanics
// exist is written down here.
export interface Subject {
  at: string;
  // How far the map's roads put this place from where a game begins, or undefined where none reach
  // it. It is what orders the sweep, so an offer's depth and the difficulty a player meets it at
  // are the same reading.
  depth?: number;
  use: string;
}

const byReach = (one: Subject, other: Subject): number =>
  (one.depth ?? Infinity) - (other.depth ?? Infinity) || one.at.localeCompare(other.at) || one.use.localeCompare(other.use);

// Everything a player who loaded this save could take, anywhere. The engine is asked rather than the
// registry read: a room's offers are what `sessionStatus` says they are, and a thing standing there
// unlooked-at is looked at first, because an unread foe offers nothing but a look.
export function subjectsFrom(registry: Registry, save: string, narrow: Pick<SimulationArgs, 'holds' | 'at'> = {}): Subject[] {
  const depths = roadDepths(registry);
  const found: Subject[] = [];
  for (const at of registry.locations.keys()) {
    if (narrow.at !== undefined && at !== narrow.at) continue;
    const session = startSession(registry);
    applyDirective(session, { kind: 'load', save });
    applyDirective(session, { kind: 'goto', location: at });
    readRoom(session);
    for (const choice of sessionStatus(session).choices) {
      if (choice.kind !== 'action') continue;
      const use = printDirective(choiceToDirective(choice));
      if (narrow.holds !== undefined && !use.includes(narrow.holds)) continue;
      found.push({ at, depth: depths.get(at), use });
    }
  }
  return found.sort(byReach);
}

// Where the world's clock stands on the save every run of a sweep starts from. The window runs from
// there, so the far end of it is one number for the whole sweep and every offer is walked between
// the same two readings of the clock.
export function clockOn(registry: Registry, save: string): number {
  const session = startSession(registry);
  applyDirective(session, { kind: 'load', save });
  return secondsToMs(sessionStatus(session).time);
}

const decimalsOf = (value: number): number => String(value).split('.')[1]?.length ?? 0;

// The window said the way a `# test` line says it. What stops the loop is the world's own clock
// reaching the far end, so the terminator is the denominator rather than a count this tool picked.
function windowTerminator(endMs: number): Condition {
  const seconds = msToSeconds(endMs);
  return { kind: 'comparison', left: { path: [TIME] }, operator: '>=', right: { value: seconds, places: decimalsOf(seconds) } };
}

export const PROBE_MODULE = 'simulation-probe';

export const standTest = (index: number): string => `${PROBE_MODULE}.stand-${index}`;
export const runTestId = (index: number): string => `${PROBE_MODULE}.run-${index}`;

// A module carrying two `# test` sections per subject: where the run starts from, and the one line
// being measured. They are split so the rng cursor can be set between them — `load:` restores the
// one the save was written with, and a seed set before it would be the save's seed and not the
// one asked for. Both are marked DEBUG, which is what lets the sweep stand somewhere no player is
// meant to find: measuring a place is not putting a player in it.
export function probeSource(dependencies: readonly string[], subjects: readonly Subject[], save: string, endMs: number): ModuleSource {
  const lines = [`# info ${PROBE_MODULE}`, 'version: 1.0.0', 'dependencies:', ...dependencies.map((id) => `  ${id}`)];
  const until = printTerminator(windowTerminator(endMs));
  subjects.forEach((subject, index) => {
    lines.push('', `# test stand-${index}`, DEBUG_MARK, `load: ${save}`, `goto: ${subject.at}`);
    lines.push('', `# test run-${index}`, DEBUG_MARK, `${subject.use} until ${until}`);
  });
  return { name: PROBE_MODULE, text: `${lines.join('\n')}\n` };
}

// What a run put in the player's hands, one tally at a time — a skill and an item by one path, so
// neither is the special case.
export interface Gain {
  kind: string;
  id: string;
  amount: number;
}

export interface Run {
  seed: number;
  // The engine's own sentence about why the offer stopped before the window closed, or nothing where
  // it was still going when the window closed. Death, a full pack and an empty room are told apart
  // here, in the words a player would have read.
  stoppedBy?: string;
  // What came at the player of its own accord while the window was open, if anything did. The window
  // is the one they lived through whoever swung in it, so this names the fight and hides nothing.
  engagedBy?: string;
  cycles: number;
  // How much of the window the offer itself ran for. What is left of the window was spent standing
  // wherever the world put them, and counts against every figure here just the same.
  worked: number;
  gains: Gain[];
}

export interface Measured {
  subject: Subject;
  runs: Run[];
}

// The seeds a sweep samples: the world's own, then wherever its own generator goes next. Seeds a
// step apart would be a sample of nothing — the first is what a `# test` runs at, and the rest are
// as far from it as the world's own rolls are from each other.
export function seedsFrom(count: number): number[] {
  const cursor = { rng: DEFAULT_RNG_SEED };
  const seeds = [DEFAULT_RNG_SEED];
  while (seeds.length < count) {
    nextRandom(cursor);
    seeds.push(cursor.rng);
  }
  return seeds.slice(0, count);
}

type Counts = Readonly<Record<string, number>>;

type Tallies = Record<string, Counts>;

// The counts a run is read out of. Both are running totals the state keeps, so what an offer paid is
// the difference across one and nothing here has to know what a mechanic hands over.
const tallies = (state: { xp: Counts; inventory: Counts }): Tallies => ({ xp: state.xp, item: state.inventory });

function since(was: Tallies, now: Tallies): Gain[] {
  const gains: Gain[] = [];
  for (const [kind, counts] of Object.entries(now)) {
    for (const [id, total] of Object.entries(counts)) {
      const amount = total - (was[kind]?.[id] ?? 0);
      if (amount !== 0) gains.push({ kind, id, amount });
    }
  }
  return gains;
}

const snapshot = (state: { xp: Counts; inventory: Counts }): Tallies => Object.fromEntries(Object.entries(tallies(state)).map(([kind, counts]) => [kind, { ...counts }]));

// Whether the line being measured can be taken up again exactly where it is being measured, by a
// player holding what they are now holding. The place is half the question because it is half the
// subject: a sweep asks what an offer pays *there*, and a run carried off somewhere else — by a
// faint, by anything — would have to walk back, which is a different action and another row's
// measurement. What is left is the engine's to answer: the offer is on the sheet the room hands
// back or it is not, and what would put it back there is the world's business rather than a shape
// this file knows.
function standsHere(session: PlaySession, state: Walked, subject: Subject): boolean {
  if (state.location !== subject.at) return false;
  readRoom(session);
  return sessionStatus(session).choices.some((choice) => choice.kind === 'action' && printDirective(choiceToDirective(choice)) === subject.use);
}

// Wait out whatever the world will put right on its own — a fallen thing back on its feet, a daze
// worn off — one due moment at a time, until the offer is on the sheet again. A moment the world has
// nothing due at is the world being done with it, and what is left needs the player to go and do
// something else: buy bait, mend a line, walk back to where the target was. That is where a run ends.
function waitForOffer(session: PlaySession, state: Walked, registry: Registry, subject: Subject, endMs: number): boolean {
  for (;;) {
    if (standsHere(session, state, subject)) return true;
    if (state.time >= endMs) return false;
    const at = Math.min(Math.ceil(nextBoundary(state, registry, endMs).at), endMs);
    if (at <= state.time) return false;
    applyDirective(session, { kind: 'wait', seconds: msToSeconds(at - state.time) });
  }
}

function walk(registry: Registry, index: number, subject: Subject, seed: number, endMs: number): Run {
  const state = createGameState();
  const blank: Run = { seed, cycles: 0, worked: 0, gains: [] };
  try {
    const stood = runTest(standTest(index), registry, state);
    if (!stood.passed) return { ...blank, stoppedBy: `could not stand there: ${stood.failure ?? 'no reason given'}` };
    state.rng = seed;
    const wasCycles = state.cyclesDone;
    const was = snapshot(state);
    const session = sessionOver(registry, state);
    let worked = 0;
    let stoppedBy: string | undefined;
    // The state forgets who came at the player each time a span opens, and a window holds as many
    // spans as the offer was taken up. The question the sheet asks is about the whole window, so it
    // is kept here — read at every seam a span is about to open at, and once more at the end.
    let engagedBy: string | undefined;
    const noteAggression = (): void => {
      engagedBy ??= state.engagedBy ?? undefined;
    };
    for (;;) {
      noteAggression();
      const from = state.time;
      stoppedBy = runTest(runTestId(index), registry, state).failure;
      worked += state.time - from;
      if (stoppedBy === undefined || state.time >= endMs) break;
      // An attempt that spent no time at all would spend none again, and there is no waiting out a
      // run that never started.
      if (state.time === from) break;
      if (!waitForOffer(session, state, registry, subject, endMs)) break;
    }
    // The rest of the window, once nothing the player could keep doing is left. A player who is
    // killed lands wherever the corpus lands them and the hour goes on around them, so the world
    // keeps running here and what it does to them in what is left is part of what standing there paid.
    if (state.time < endMs) applyDirective(session, { kind: 'wait', seconds: msToSeconds(endMs - state.time) });
    noteAggression();
    return {
      seed,
      stoppedBy,
      engagedBy,
      cycles: state.cyclesDone - wasCycles,
      worked,
      gains: since(was, tallies(state)),
    };
  } catch (error) {
    return { ...blank, stoppedBy: error instanceof Error ? error.message : String(error) };
  }
}

export function measure(registry: Registry, subjects: readonly Subject[], seeds: readonly number[], endMs: number): Measured[] {
  return subjects.map((subject, index) => ({ subject, runs: seeds.map((seed) => walk(registry, index, subject, seed, endMs)) }));
}

// An offer that put nothing in anybody's hands under any seed. It is hidden by default because a
// sweep of a whole world is mostly doors and benches, and it is a measurement rather than a
// judgement about which mechanics count — a door that turns out to pay appears. An offer nothing
// could be measured at is not one of these however empty it came back: that is a finding about the
// place, and hiding it would hide the reason its neighbours read the way they do.
export const paidNothing = ({ runs }: Measured): boolean => runs.every((run) => run.gains.length === 0 && run.engagedBy === undefined);

const MS_PER_HOUR = 60 * MS_PER_MINUTE;

const round = (value: number): string => {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 100) return Math.round(value).toLocaleString('en-US');
  return String(Math.round(value * 10) / 10);
};

const spread = (values: readonly number[]): string => {
  const low = Math.min(...values);
  const high = Math.max(...values);
  return low === high ? round(low) : `${round(low)}–${round(high)}`;
};

const address = ({ kind, id }: Gain): string => `${kind} ${id}`;

const amountIn = (run: Run, of: string): number => run.gains.find((gain) => address(gain) === of)?.amount ?? 0;

export const WHILE_IT_RAN = 'while it ran';

// Every seed answers, because every seed was given the same window and every seed spent all of it.
// The window is the divisor whatever the run did with it, so there is nothing here to say about
// which seeds counted. Beside it, wherever the offer did not last the window out, the pace inside
// the time it did last — the two are the same figure where it lasted, and only one is printed then.
function paidLines(runs: readonly Run[], windowMs: number): string[] {
  const paid = [...new Set(runs.flatMap((run) => run.gains.map(address)))];
  if (paid.length === 0) return ['      paid nothing'];
  const hours = windowMs / MS_PER_HOUR;
  const cut = runs.filter((run) => run.worked > 0 && run.worked < windowMs);
  return paid
    .map((of) => ({ of, rates: runs.map((run) => amountIn(run, of) / hours), paced: cut.map((run) => amountIn(run, of) / (run.worked / MS_PER_HOUR)) }))
    .sort((one, other) => Math.max(...other.rates) - Math.max(...one.rates))
    .map(({ of, rates, paced }) => `      ${of}: ${spread(rates)}/h${paced.length === 0 ? '' : `, ${spread(paced)}/h ${WHILE_IT_RAN}`}`);
}

function measuredLines({ subject, runs }: Measured, windowMs: number): string[] {
  const lines = [
    `    ${subject.use}`,
    `      cycles ${spread(runs.map((run) => run.cycles))} · worked ${spread(runs.map((run) => msToSeconds(run.worked)))}s of the ${round(msToSeconds(windowMs))}s window`,
  ];
  const took = runs.map((run) => run.engagedBy).find((by) => by !== undefined);
  if (took !== undefined) lines.push(`      ${took} took a fight inside the window`);
  // The shortest run's ending, because that is the one an author has to answer for. How many other
  // endings there were is said rather than listed: the same death told twice with a different tally
  // in it is one finding, and reading it as two is what sends someone looking for a second bug.
  const short = runs.filter((run) => run.stoppedBy !== undefined).sort((one, other) => one.worked - other.worked);
  const endings = new Set(short.map((run) => run.stoppedBy));
  if (short.length > 0) {
    lines.push(
      `      stopped short in ${String(short.length)}/${String(runs.length)} seeds: ${short[0]!.stoppedBy!}${endings.size > 1 ? ` (and ${String(endings.size - 1)} other ending(s) across the seeds)` : ''}`,
    );
  }
  return [...lines, ...paidLines(runs, windowMs)];
}

// Said once, above everything it is about, because the two figures on a line are not equally solid
// and a reader who takes them for one another has the error the window was put there to remove.
const CEILING = `a rate is what the whole window paid. "${WHILE_IT_RAN}" is the pace inside \`worked\` carried out to an hour — a ceiling nothing here actually held, and the shorter the run the less it means.`;

export function simulationLines(measured: readonly Measured[], args: Pick<SimulationArgs, 'save' | 'seeds' | 'window' | 'all'>): string[] {
  const windowMs = args.window * MS_PER_MINUTE;
  const shown = args.all ? [...measured] : measured.filter((each) => !paidNothing(each));
  const head = [`${args.save}: ${String(shown.length)} of ${String(measured.length)} offers, ${String(args.seeds)} seed(s) each, over a ${String(args.window)}-minute window of game time`];
  if (shown.length === 0) return [...head, 'nothing on offer paid anything under any seed. --all lists what was tried.'];

  const body: string[] = [];
  let place: string | null = null;
  for (const each of shown) {
    if (each.subject.at !== place) {
      place = each.subject.at;
      body.push('', `  ${place}${each.subject.depth === undefined ? ' (no road reaches here)' : ` (${String(each.subject.depth)} roads out)`}`);
    }
    body.push(...measuredLines(each, windowMs));
  }
  const lines = [...head, ...(body.some((line) => line.includes(WHILE_IT_RAN)) ? [CEILING] : []), ...body];
  if (!args.all) lines.push('', `${String(measured.length - shown.length)} offer(s) paid nothing at all and are not listed; --all shows them.`);
  return lines;
}

export interface SimulationReport {
  lines: string[];
  ok: boolean;
}

export function simulate(sources: readonly ModuleSource[], args: SimulationArgs): SimulationReport {
  const base = loadUniverseWithDiagnostics(sources);
  if (base.diagnostics.length > 0) return { lines: base.diagnostics.map(formatModuleDiagnostic), ok: false };
  if (!base.registry.saves.has(args.save)) {
    return { lines: [`${args.save}: no # save with that id. Defined: ${[...base.registry.saves.keys()].sort().join(', ')}`], ok: false };
  }
  if (args.at !== undefined && !base.registry.locations.has(args.at)) {
    return { lines: [`${args.at}: no # location with that id.`], ok: false };
  }

  const subjects = subjectsFrom(base.registry, args.save, args);
  if (subjects.length === 0) {
    return { lines: [`${args.save}: nothing is on offer anywhere that matches. Widen the spec or drop --at.`], ok: true };
  }

  const endMs = clockOn(base.registry, args.save) + args.window * MS_PER_MINUTE;
  const dependencies = base.parsed.map((module) => module.info.id);
  const loaded = loadUniverseWithDiagnostics([...sources, probeSource(dependencies, subjects, args.save, endMs)]);
  if (loaded.diagnostics.length > 0) return { lines: loaded.diagnostics.map(formatModuleDiagnostic), ok: false };

  return { lines: simulationLines(measure(loaded.registry, subjects, seedsFrom(args.seeds), endMs), args), ok: true };
}

function main(): void {
  let args: SimulationArgs;
  try {
    args = parseSimulationArgs(process.argv.slice(2));
  } catch (error) {
    console.error((error as Error).message);
    process.exit(2);
  }
  const report = simulate(shippedSources(), args);
  console.log(report.lines.join('\n'));
  if (!report.ok) process.exit(1);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
