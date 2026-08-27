import path from 'node:path';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { formatModuleDiagnostic, type Registry } from '../src/content/registry';
import { DEBUG_MARK } from '../src/content/sections/define';
import { printDirective } from '../src/content/sections/test';
import { shippedSources } from '../src/content/shipped';
import type { ModuleSource } from '../src/content/universe';
import { roadDepths } from '../src/runtime/journey';
import { DEFAULT_RNG_SEED, nextRandom } from '../src/runtime/rng';
import { applyDirective, choiceToDirective, readRoom, runTest, sessionStatus, startSession } from '../src/runtime/session';
import { createGameState } from '../src/runtime/state';
import { MS_PER_MINUTE } from '../src/runtime/units';

export const DEFAULT_SEEDS = 4;
export const DEFAULT_CYCLES = 20;

const usage = [
  'Usage: npm run balance -- <save> [<action-spec>] [--at <location>] [--seeds <n>] [--cycles <n>] [--all]',
  '',
  '  <save>          a # save id to start every run from, as `load:` names one',
  '  <action-spec>   narrows the sweep to the offers whose `use:` line holds this text,',
  '                  so `highwayman` and `core.melee-combat on combat.highwayman` both name',
  '                  something. With none, everything on offer anywhere is measured',
  '  --at            narrows the sweep to one location',
  `  --seeds         how many rng seeds each offer is run under (default ${String(DEFAULT_SEEDS)})`,
  `  --cycles        how many times each run asks the loop to come round (default ${String(DEFAULT_CYCLES)})`,
  '  --all           list every offer, including the ones that paid nothing at all',
  '',
  'Nothing here is computed: every figure is read off a run. The tool builds a # test per',
  'offer — `load:` the save, `goto:` the place, then that offer `until <n> times` — walks it',
  'against a state of its own, and reports what the state ended holding. So a buff, a proc,',
  'an on-kill effect, a pack of two, or retaliation is priced in by having happened.',
  '',
  'The offers are the ones the engine itself puts in front of a player standing there, so a',
  'fishing cast and an encounter are one measurement and a mechanic added next month is swept',
  'with no edit here. A fight the world picks is measured with it: the run does not have to',
  'take the offer to be killed by what made it.',
  '',
  'A run either came round the number of times it was asked for, or it stopped short — and',
  'the engine\'s own sentence says why, death included. There is no death flag to read: dying',
  'is authored in the corpus rather than known to the engine, so the tool quotes rather than',
  'classifies.',
  '',
  'This is a tool and not a gate. It runs on demand, it asserts nothing, and it always exits 0',
  'unless the arguments or the corpus are refused.',
].join('\n');

export interface BalanceArgs {
  save: string;
  holds?: string;
  at?: string;
  seeds: number;
  cycles: number;
  all: boolean;
}

const counted = (flag: string, raw: string | undefined): number => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${flag} wants a whole number of at least 1, not ${raw ?? 'nothing'}`);
  return value;
};

export function parseBalanceArgs(raw: readonly string[]): BalanceArgs {
  const loose: string[] = [];
  const args: BalanceArgs = { save: '', seeds: DEFAULT_SEEDS, cycles: DEFAULT_CYCLES, all: false };
  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i];
    if (arg === '--help' || arg === '-h') throw new Error(usage);
    else if (arg === '--all') args.all = true;
    else if (arg === '--at') {
      const at = raw[++i];
      if (at === undefined) throw new Error('--at wants a location id after it');
      args.at = at;
    } else if (arg === '--seeds') args.seeds = counted('--seeds', raw[++i]);
    else if (arg === '--cycles') args.cycles = counted('--cycles', raw[++i]);
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
export function subjectsFrom(registry: Registry, save: string, narrow: Pick<BalanceArgs, 'holds' | 'at'> = {}): Subject[] {
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

export const PROBE_MODULE = 'balance-probe';

export const standTest = (index: number): string => `${PROBE_MODULE}.stand-${index}`;
export const runTestId = (index: number): string => `${PROBE_MODULE}.run-${index}`;

// A module carrying two `# test` sections per subject: where the run starts from, and the one line
// being measured. They are split so the rng cursor can be set between them — `load:` restores the
// one the save was written with, and a seed set before it would be the save's seed and not the
// one asked for. Both are marked DEBUG, which is what lets the sweep stand somewhere no player is
// meant to find: measuring a place is not putting a player in it.
export function probeSource(dependencies: readonly string[], subjects: readonly Subject[], save: string, cycles: number): ModuleSource {
  const lines = [`# info ${PROBE_MODULE}`, 'version: 1.0.0', 'dependencies:', ...dependencies.map((id) => `  ${id}`)];
  subjects.forEach((subject, index) => {
    lines.push('', `# test stand-${index}`, DEBUG_MARK, `load: ${save}`, `goto: ${subject.at}`);
    lines.push('', `# test run-${index}`, DEBUG_MARK, `${subject.use} until ${cycles} times`);
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
  // Whether the loop came round the number of times it was asked for. It did not, and `stoppedBy`
  // is the engine's own sentence about why — which is where death, a full pack and an empty room
  // are told apart, in the words a player would have read.
  finished: boolean;
  stoppedBy?: string;
  cycles: number;
  milliseconds: number;
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

function walk(registry: Registry, index: number, seed: number): Run {
  const state = createGameState();
  const blank: Run = { seed, finished: false, cycles: 0, milliseconds: 0, gains: [] };
  try {
    const stood = runTest(standTest(index), registry, state);
    if (!stood.passed) return { ...blank, stoppedBy: `could not stand there: ${stood.failure ?? 'no reason given'}` };
    state.rng = seed;
    const wasTime = state.time;
    const wasCycles = state.cyclesDone;
    const was = snapshot(state);
    const result = runTest(runTestId(index), registry, state);
    return { seed, finished: result.passed, stoppedBy: result.failure, cycles: state.cyclesDone - wasCycles, milliseconds: state.time - wasTime, gains: since(was, tallies(state)) };
  } catch (error) {
    return { ...blank, stoppedBy: error instanceof Error ? error.message : String(error) };
  }
}

export function measure(registry: Registry, subjects: readonly Subject[], seeds: readonly number[]): Measured[] {
  return subjects.map((subject, index) => ({ subject, runs: seeds.map((seed) => walk(registry, index, seed)) }));
}

// An offer that put nothing in anybody's hands under any seed. It is hidden by default because a
// sweep of a whole world is mostly doors and benches, and it is a measurement rather than a
// judgement about which mechanics count — a door that turns out to pay appears.
export const paidNothing = ({ runs }: Measured): boolean => runs.every((run) => run.gains.length === 0);

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

function paidLines(runs: readonly Run[]): string[] {
  const paid = [...new Set(runs.flatMap((run) => run.gains.map(address)))];
  if (paid.length === 0) return ['      paid nothing'];
  return paid
    .map((of) => ({ of, amounts: runs.map((run) => amountIn(run, of)), rates: runs.map((run) => amountIn(run, of) / (run.milliseconds / MS_PER_HOUR)) }))
    .sort((one, other) => Math.max(...other.rates) - Math.max(...one.rates))
    .map(({ of, amounts, rates }) => `      ${of}: ${spread(amounts)}, ${spread(rates)}/h`);
}

function measuredLines({ subject, runs }: Measured): string[] {
  const finished = runs.filter((run) => run.finished).length;
  const seconds = runs.map((run) => run.milliseconds / 1000);
  const lines = [
    `    ${subject.use}`,
    `      cycles ${spread(runs.map((run) => run.cycles))} · finished ${String(finished)}/${String(runs.length)} seeds · ${spread(seconds)}s of game time`,
  ];
  // The shortest run's ending, because that is the one an author has to answer for. How many other
  // endings there were is said rather than listed: the same death told twice with a different tally
  // in it is one finding, and reading it as two is what sends someone looking for a second bug.
  const short = runs.filter((run) => run.stoppedBy !== undefined).sort((one, other) => one.cycles - other.cycles);
  const endings = new Set(short.map((run) => run.stoppedBy));
  if (short.length > 0) lines.push(`      stopped short: ${short[0]!.stoppedBy!}${endings.size > 1 ? ` (and ${String(endings.size - 1)} other ending(s) across the seeds)` : ''}`);
  return [...lines, ...paidLines(runs)];
}

export function balanceLines(measured: readonly Measured[], args: Pick<BalanceArgs, 'save' | 'seeds' | 'cycles' | 'all'>): string[] {
  const shown = args.all ? [...measured] : measured.filter((each) => !paidNothing(each));
  const head = [
    `${args.save}: ${String(shown.length)} of ${String(measured.length)} offers, ${String(args.seeds)} seed(s) each, asked for ${String(args.cycles)} times round`,
  ];
  if (shown.length === 0) return [...head, 'nothing on offer paid anything under any seed. --all lists what was tried.'];

  const lines: string[] = head;
  let place: string | null = null;
  for (const each of shown) {
    if (each.subject.at !== place) {
      place = each.subject.at;
      lines.push('', `  ${place}${each.subject.depth === undefined ? ' (no road reaches here)' : ` (${String(each.subject.depth)} roads out)`}`);
    }
    lines.push(...measuredLines(each));
  }
  if (!args.all) lines.push('', `${String(measured.length - shown.length)} offer(s) paid nothing at all and are not listed; --all shows them.`);
  return lines;
}

export interface BalanceReport {
  lines: string[];
  ok: boolean;
}

export function balance(sources: readonly ModuleSource[], args: BalanceArgs): BalanceReport {
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

  const dependencies = base.parsed.map((module) => module.info.id);
  const loaded = loadUniverseWithDiagnostics([...sources, probeSource(dependencies, subjects, args.save, args.cycles)]);
  if (loaded.diagnostics.length > 0) return { lines: loaded.diagnostics.map(formatModuleDiagnostic), ok: false };

  return { lines: balanceLines(measure(loaded.registry, subjects, seedsFrom(args.seeds)), args), ok: true };
}

function main(): void {
  let args: BalanceArgs;
  try {
    args = parseBalanceArgs(process.argv.slice(2));
  } catch (error) {
    console.error((error as Error).message);
    process.exit(2);
  }
  const report = balance(shippedSources(), args);
  console.log(report.lines.join('\n'));
  if (!report.ok) process.exit(1);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
