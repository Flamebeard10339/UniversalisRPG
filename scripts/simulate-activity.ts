import path from 'node:path';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { formatModuleDiagnostic, type Registry } from '../src/content/registry';
import { DEBUG_MARK } from '../src/content/sections/define';
import { printDirective, printTerminator, type DebugSwitch } from '../src/content/sections/test';
import { shippedSources } from '../src/content/shipped';
import { modulesNamed } from '../src/content/packs';
import { withModulesOff, type ModuleSource } from '../src/content/universe';
import { TIME, type Condition } from '../src/grammar/condition';
import { roadDepths } from '../src/runtime/journey';
import { DEFAULT_RNG_SEED, nextRandom } from '../src/runtime/rng';
import { nextBoundary, statValue } from '../src/runtime/runtime';
import { applyDirective, choiceToDirective, readRoom, runTest, sessionOver, sessionStatus, type PlaySession } from '../src/runtime/session';
import { createGameState, type GameState } from '../src/runtime/state';
import { fromMilliUnits, MS_PER_MINUTE, msToSeconds } from '../src/runtime/units';
import { FLOORS_DIR } from './floors';
import { readSources } from './probe';
import { abilityAtLevel } from './lib/pace';
import { frontiers, levelsIn, meanRate, ratioFor, ratioOf, WITHIN, type Levels, type Paid } from './lib/ratio';

type Walked = ReturnType<typeof createGameState>;

export const DEFAULT_SEEDS = 4;
export const DEFAULT_WINDOW_MINUTES = 60;

const usage = [
  'Usage: npm run simulate-activity -- <save> [<action-spec>] [--off <pack>] [--at <location>] [--seeds <n>] [--window <minutes>] [--all] [--ideal]',
  '',
  '  --ladder        <stat>=<level>[,<stat>=<level>...] — stand the player where the ladder puts a',
  '                  character of that level in that stat, so a sweep names the rung it is asking',
  '                  about rather than the base underneath one. The ladder is the declared line in',
  '                  scripts/lib/pace.ts that `npm run ladder-check` audits the world against, and',
  '                  the base that reaches it is solved rather than reckoned: the player is stood up',
  '                  twice under two bases, what the world made of each is read back, and the base',
  '                  that lands on the rung falls out of the two. So gear, race and what the level',
  '                  itself grants are all inside the figure, and the head says what they stood at',
  '',
  '  --ideal         stand every run up under unkillable, instant-kill and succeed-checks, so what',
  '                  is read is the most an offer can pay and the least it can cost: the ceiling',
  '                  a build is measured against rather than what any build gets',
  '  --after         <test> — stand where that route ends instead of on a save, so a rung of the',
  `                  ladder is a route under ${FLOORS_DIR}/ and no save is written anywhere. The floors are`,
  '                  loaded beside the world when this is given',
  '  --stats         <stat>=<number>[,<stat>=<number>...] — stand the player at these stats, written',
  '                  over the player\'s own base through the world\'s own door, so a sweep reads what',
  '                  every offer pays at a rung of the stat ladder rather than at what one save holds.',
  '                  The head says what the player actually stood at, gear and level included',
  '',
  '  <save>          a # save id to start every run from, as `load:` names one',
  '  <action-spec>   narrows the sweep to the offers whose `use:` line holds this text,',
  '                  so `highwayman` and `core.melee-combat on combat.highwayman` both name',
  '                  something. With none, everything on offer anywhere is measured',
  '  --at            narrows the sweep to one location',
  '  --off           turn a pack or a module off before measuring, by the name the settings',
  '                  page offers it under; repeatable. `--off quests` measures the town alone',
  `  --seeds         how many rng seeds each offer is run under (default ${String(DEFAULT_SEEDS)})`,
  `  --window        how many minutes of game time every run is given (default ${String(DEFAULT_WINDOW_MINUTES)})`,
  '  --all           list every offer, including the ones that paid nothing at all',
  '',
  'Nothing here is computed: every figure is read off a run. The tool builds a # test per',
  'offer — `load:` the save, `goto:` the place, then that offer `until time >= <the far end of that',
  'offer\'s own window>`, which is read off standing the run up rather than reckoned — walks it against',
  'a state of its own, and reports what the state ended holding. So a buff, a proc, an on-kill effect,',
  'a pack of two, or retaliation is priced in by having happened.',
  '',
  'Every run is given the same window of game time, and that window is the only denominator any',
  'rate here has. The window opens on the clock the run itself stands up on — the save\'s own, or where',
  'the route under --after left the player, walked in the very world the run is then measured in — and',
  'closes a window of game time later. So a player stood at a rung of the ladder, who walks that route',
  'faster than the base underneath them does, is measured over the window rather than over the window',
  'plus the difference between the two.',
  '',
  'An offer that stops inside the window is taken up again where the player is left',
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
  '`worked` is how much of the window the offer itself ran for, across every time it was taken up, and',
  'it is never more than the window: an attempt still under way when the window closes counts for the',
  "part of it that fell inside. Where it is short of the window, the engine's own sentence for the last",
  'attempt says why, death included. There is no death flag to read: dying is authored in the corpus',
  'rather than known to the engine, so the tool quotes rather than classifies. Where `worked` is short,',
  'the pace inside it is printed beside the rate — a ceiling carried out to an hour, not an hour',
  'anything held.',
  '',
  'A fight something aggressive started is named where one happened. It is an annotation and not a',
  'suppression: whoever swung, the window is the one the player lived through, and what they came out',
  'of it holding is what standing there paid.',
  '',
  'Beside every experience rate is what the curve asks for at that level: the cost of the level over',
  'the time the level is meant to take. The level is the one the save stands at in that skill, never',
  "the run's highest, and the save is named in the first line — a ratio is quoted for a build and is",
  'not a property of the world on its own.',
  '',
  'Two readings close the sheet. The pace target binds on the frontier and nowhere else, so the first',
  'is the best-paying offer within reach and how far off target it is: an offer under target is what',
  'makes one activity worth half of another rather than a defect. That alone would be satisfied by a',
  'world with one good thing to do and two hundred worthless ones, so the second is how many offers',
  'come within twice the frontier. A count of one is a level with one thing to do.',
  '',
  "An offer's own figure is the mean across its seeds and not the best of them, because a maximum",
  'over seeds climbs as seeds are added — so --seeds alone would move every ratio here with nothing',
  'in the world having changed.',
  '',
  'This is a tool and not a gate. It runs on demand, it asserts nothing, and it always exits 0',
  'unless the arguments or the corpus are refused.',
].join('\n');

export interface SimulationArgs {
  save: string;
  off?: string[];
  holds?: string;
  at?: string;
  seeds: number;
  window: number;
  all: boolean;
  ideal?: boolean;
  stats?: readonly StatAsk[];
  rungs?: readonly RungAsk[];
  after?: string;
}

export type Start = { readonly save: string } | { readonly after: string };

export const startOf = (args: Pick<SimulationArgs, 'save' | 'after'>): Start => (args.after === undefined ? { save: args.save } : { after: args.after });

export const startLabel = (start: Start): string => ('save' in start ? start.save : `after ${start.after}`);

export const standLine = (start: Start): string => ('save' in start ? `load: ${start.save}` : `run: ${start.after}`);

export interface StatAsk {
  readonly id: string;
  readonly value: number;
}

export interface RungAsk {
  readonly id: string;
  readonly level: number;
}

export const GOD_WORDS: readonly DebugSwitch[] = ['unkillable', 'instant-kill', 'succeed-checks'];

export function parsePairs(flag: string, spec: string): StatAsk[] {
  return spec.split(',').map((pair) => {
    const [id, raw, ...more] = pair.split('=');
    const value = Number(raw);
    if (!id || raw === undefined || more.length > 0 || raw.trim() === '' || !Number.isFinite(value)) throw new Error(`${flag} takes <stat>=<number> pairs separated by commas, and ${JSON.stringify(pair)} is not one`);
    return { id: id.trim(), value };
  });
}

export const parseStats = (spec: string): StatAsk[] => parsePairs('--stats', spec);

export function parseRungs(spec: string): RungAsk[] {
  return parsePairs('--ladder', spec).map(({ id, value }) => {
    if (!Number.isInteger(value) || value < 1) throw new Error(`--ladder takes <stat>=<level>, and a level is a whole number of at least 1, not ${String(value)}`);
    return { id, level: value };
  });
}

const counted = (flag: string, raw: string | undefined): number => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${flag} wants a whole number of at least 1, not ${raw ?? 'nothing'}`);
  return value;
};

export function parseSimulationArgs(raw: readonly string[]): SimulationArgs {
  const loose: string[] = [];
  const args: SimulationArgs = { save: '', seeds: DEFAULT_SEEDS, window: DEFAULT_WINDOW_MINUTES, all: false, ideal: false };
  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i];
    if (arg === '--help' || arg === '-h') throw new Error(usage);
    else if (arg === '--all') args.all = true;
    else if (arg === '--ideal') args.ideal = true;
    else if (arg === '--after') {
      const test = raw[++i];
      if (test === undefined) throw new Error('--after wants a # test id after it');
      args.after = test;
    }
    else if (arg === '--stats') {
      const spec = raw[++i];
      if (spec === undefined) throw new Error('--stats wants <stat>=<number>[,<stat>=<number>...] after it');
      args.stats = [...(args.stats ?? []), ...parseStats(spec)];
    }
    else if (arg === '--ladder') {
      const spec = raw[++i];
      if (spec === undefined) throw new Error('--ladder wants <stat>=<level>[,<stat>=<level>...] after it');
      args.rungs = [...(args.rungs ?? []), ...parseRungs(spec)];
    }
    else if (arg === '--at') {
      const at = raw[++i];
      if (at === undefined) throw new Error('--at wants a location id after it');
      args.at = at;
    } else if (arg === '--off') {
      const spec = raw[++i];
      if (spec === undefined) throw new Error('--off wants a pack or module name after it');
      (args.off ??= []).push(spec);
    } else if (arg === '--seeds') args.seeds = counted('--seeds', raw[++i]);
    else if (arg === '--window') args.window = counted('--window', raw[++i]);
    else if (arg.startsWith('--')) throw new Error(`unknown flag ${arg}\n\n${usage}`);
    else loose.push(arg);
  }
  if (args.after === undefined) {
    if (loose.length === 0) throw new Error(`name a # save to measure from, or --after <test> to stand where a route ends\n\n${usage}`);
    if (loose.length > 2) throw new Error(`one save and at most one action-spec, not ${loose.length} loose arguments\n\n${usage}`);
    args.save = loose[0];
    if (loose.length === 2) args.holds = loose[1];
    return args;
  }
  if (loose.length > 1) throw new Error(`with --after, at most one loose argument, the action-spec, not ${loose.length}\n\n${usage}`);
  if (loose.length === 1) args.holds = loose[0];
  return args;
}

export interface Subject {
  at: string;
  depth?: number;
  use: string;
}

const byReach = (one: Subject, other: Subject): number =>
  (one.depth ?? Infinity) - (other.depth ?? Infinity) || one.at.localeCompare(other.at) || one.use.localeCompare(other.use);

const asStart = (start: Start | string): Start => (typeof start === 'string' ? { save: start } : start);

export function stood(registry: Registry, start: Start | string): { session: PlaySession; state: GameState } {
  const state = createGameState();
  const session = sessionOver(registry, state);
  const from = asStart(start);
  if ('save' in from) {
    applyDirective(session, { kind: 'load', save: from.save });
    return { session, state };
  }
  const walked = runTest(from.after, registry, state);
  if (!walked.passed) throw new Error(`--after ${from.after}: the route does not walk — ${walked.failure ?? 'no reason given'}`);
  return { session, state };
}

export function subjectsFrom(registry: Registry, start: Start | string, narrow: Pick<SimulationArgs, 'holds' | 'at'> = {}): Subject[] {
  const depths = roadDepths(registry);
  const found: Subject[] = [];
  for (const at of registry.locations.keys()) {
    if (narrow.at !== undefined && at !== narrow.at) continue;
    const { session } = stood(registry, start);
    applyDirective(session, { kind: 'goto', location: at });
    readRoom(session);
    for (const choice of sessionStatus(session).choices) {
      if (choice.kind !== 'action' && choice.kind !== 'craft') continue;
      const use = printDirective(choiceToDirective(choice));
      if (narrow.holds !== undefined && !use.includes(narrow.holds)) continue;
      found.push({ at, depth: depths.get(at), use });
    }
  }
  return found.sort(byReach);
}

export function levelsOn(registry: Registry, start: Start | string): Levels {
  return levelsIn(stood(registry, start).state.xp);
}

export function standingAt(registry: Registry, start: Start | string, stats: readonly string[]): StatAsk[] {
  if (stats.length === 0) return [];
  const { state } = stood(registry, start);
  return stats.map((id) => ({ id, value: statValue(id, state, registry) }));
}

const decimalsOf = (value: number): number => String(value).split('.')[1]?.length ?? 0;

function windowTerminator(endMs: number): Condition {
  const seconds = msToSeconds(endMs);
  return { kind: 'comparison', left: { path: [TIME] }, operator: '>=', right: { value: seconds, places: decimalsOf(seconds) } };
}

export const PROBE_MODULE = 'simulation-probe';

export const standTest = (index: number): string => `${PROBE_MODULE}.stand-${index}`;
export const runTestId = (index: number): string => `${PROBE_MODULE}.run-${index}`;

export interface Stood {
  readonly player: string;
  readonly stats: readonly StatAsk[];
}

export function probeSource(dependencies: readonly string[], subjects: readonly Subject[], start: Start | string, ends: readonly number[], ideal = false, stood?: Stood): ModuleSource {
  const lines = [`# info ${PROBE_MODULE}`, 'version: 1.0.0', 'dependencies:', ...dependencies.map((id) => `  ${id}`)];
  if (stood !== undefined && stood.stats.length > 0) lines.push('', `# entity ${stood.player}`, `+stats: ${stood.stats.map((each) => `${each.id} ${String(each.value)}`).join(', ')}`);
  subjects.forEach((subject, index) => {
    lines.push('', `# test stand-${index}`, DEBUG_MARK, standLine(asStart(start)), ...(ideal ? GOD_WORDS : []), `goto: ${subject.at}`);
    const endsAt = ends[index];
    if (endsAt !== undefined) lines.push('', `# test run-${index}`, DEBUG_MARK, `${subject.use} until ${printTerminator(windowTerminator(endsAt))}`);
  });
  return { name: PROBE_MODULE, text: `${lines.join('\n')}\n` };
}

function clockStandingUp(registry: Registry, test: string): number {
  const state = createGameState();
  try {
    runTest(test, registry, state);
  } catch {
    return state.time;
  }
  return state.time;
}

export function standClocks(registry: Registry, subjects: readonly Subject[]): number[] {
  const stoodAlready = new Map<string, number>();
  return subjects.map((_subject, index) => {
    const test = standTest(index);
    const sameStand = JSON.stringify(registry.tests.get(test)?.directives ?? test);
    const known = stoodAlready.get(sameStand);
    if (known !== undefined) return known;
    const clock = clockStandingUp(registry, test);
    stoodAlready.set(sameStand, clock);
    return clock;
  });
}

export function stoodIn(sources: readonly ModuleSource[], dependencies: readonly string[], start: Start | string, stood?: Stood): Registry {
  const loaded = loadUniverseWithDiagnostics([...sources, probeSource(dependencies, [], start, [], false, stood)]);
  if (loaded.diagnostics.length > 0) throw new Error(loaded.diagnostics.map(formatModuleDiagnostic).join('\n'));
  return loaded.registry;
}

export const RUNG_PROBE_BASES: readonly [number, number] = [0, 1];

export function baseForRung(sources: readonly ModuleSource[], dependencies: readonly string[], player: string, start: Start, rung: RungAsk): number {
  const readAt = (base: number): number =>
    standingAt(stoodIn(sources, dependencies, start, { player, stats: [{ id: rung.id, value: base }] }), start, [rung.id])[0]!.value;
  const [lower, upper] = RUNG_PROBE_BASES;
  const [stoodLow, stoodHigh] = [readAt(lower), readAt(upper)];
  const perPoint = (stoodHigh - stoodLow) / (upper - lower);
  if (perPoint === 0) {
    throw new Error(`--ladder ${rung.id}=${String(rung.level)}: a point of ${rung.id} written on the sheet moves what the player stands at by nothing at all, so no base of it stands them on that rung`);
  }
  return lower + (abilityAtLevel(rung.level) - stoodLow) / perPoint;
}

export interface Gain {
  kind: string;
  id: string;
  amount: number;
}

export interface Run {
  seed: number;
  stoppedBy?: string;
  engagedBy?: string;
  cycles: number;
  worked: number;
  gains: Gain[];
}

export interface Measured {
  subject: Subject;
  runs: Run[];
}

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

const inUnits = (milli: Counts): Counts => Object.fromEntries(Object.entries(milli).map(([id, amount]) => [id, fromMilliUnits(amount)]));

const tallies = (state: { xp: Counts; inventory: Counts; spent: Counts }): Tallies => ({ xp: state.xp, item: state.inventory, spent: inUnits(state.spent) });

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

const snapshot = (state: { xp: Counts; inventory: Counts; spent: Counts }): Tallies => Object.fromEntries(Object.entries(tallies(state)).map(([kind, counts]) => [kind, { ...counts }]));

function standsHere(session: PlaySession, state: Walked, subject: Subject): boolean {
  if (state.location !== subject.at) return false;
  readRoom(session);
  return sessionStatus(session).choices.some((choice) => choice.kind === 'action' && printDirective(choiceToDirective(choice)) === subject.use);
}

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
    let engagedBy: string | undefined;
    const noteAggression = (): void => {
      engagedBy ??= state.engagedBy ?? undefined;
    };
    for (;;) {
      noteAggression();
      const from = state.time;
      stoppedBy = runTest(runTestId(index), registry, state).failure;
      worked += Math.min(state.time, endMs) - from;
      if (stoppedBy === undefined || state.time >= endMs) break;
      if (state.time === from) break;
      if (!waitForOffer(session, state, registry, subject, endMs)) break;
    }
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

export function measure(registry: Registry, subjects: readonly Subject[], seeds: readonly number[], ends: readonly number[]): Measured[] {
  return subjects.map((subject, index) => ({ subject, runs: seeds.map((seed) => walk(registry, index, subject, seed, ends[index]!)) }));
}

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

const times = (ratio: number): string => {
  if (!Number.isFinite(ratio)) return '—';
  if (ratio >= 10) return String(Math.round(ratio));
  if (ratio >= 1) return String(Math.round(ratio * 10) / 10);
  if (ratio >= 0.01) return String(Math.round(ratio * 100) / 100);
  return ratio === 0 ? '0' : '<0.01';
};

const address = ({ kind, id }: Gain): string => `${kind} ${id}`;

const amountIn = (run: Run, of: string): number => run.gains.find((gain) => address(gain) === of)?.amount ?? 0;

export const WHILE_IT_RAN = 'while it ran';

const XP = 'xp';

const skillIn = (of: string): string | undefined => (of.startsWith(`${XP} `) ? of.slice(XP.length + 1) : undefined);

const againstTheCurve = (of: string, rates: readonly number[], levels: Levels): string => {
  const skill = skillIn(of);
  if (skill === undefined) return '';
  const against = ratioFor(skill, meanRate(rates), levels);
  return ` · ${times(ratioOf(against))}× the level-${String(against.level)} target`;
};

function paidLines(runs: readonly Run[], windowMs: number, levels: Levels): string[] {
  const paid = [...new Set(runs.flatMap((run) => run.gains.map(address)))];
  if (paid.length === 0) return ['      paid nothing'];
  const hours = windowMs / MS_PER_HOUR;
  const cut = runs.filter((run) => run.worked > 0 && run.worked < windowMs);
  return paid
    .map((of) => ({ of, rates: runs.map((run) => amountIn(run, of) / hours), paced: cut.map((run) => amountIn(run, of) / (run.worked / MS_PER_HOUR)) }))
    .sort((one, other) => Math.max(...other.rates) - Math.max(...one.rates))
    .map(({ of, rates, paced }) => `      ${of}: ${spread(rates)}/h${paced.length === 0 ? '' : `, ${spread(paced)}/h ${WHILE_IT_RAN}`}${againstTheCurve(of, rates, levels)}`);
}

export function paidInto(measured: readonly Measured[], windowMs: number): Paid[] {
  const hours = windowMs / MS_PER_HOUR;
  const paid: Paid[] = [];
  for (const { subject, runs } of measured) {
    for (const of of new Set(runs.flatMap((run) => run.gains.map(address)))) {
      const skill = skillIn(of);
      if (skill === undefined) continue;
      paid.push({ skill, use: subject.use, at: subject.at, rate: meanRate(runs.map((run) => amountIn(run, of) / hours)) });
    }
  }
  return paid;
}

export function curveLines(measured: readonly Measured[], windowMs: number, levels: Levels): string[] {
  const found = frontiers(paidInto(measured, windowMs), levels);
  if (found.length === 0) return [];
  return [
    '',
    'against the curve, for the build every run here started from:',
    ...found.flatMap((frontier) => [
      `  ${frontier.skill} at level ${String(frontier.level)} — the curve asks ${round(frontier.target)}/h, and the best within reach pays ${round(frontier.paid)}/h: ${times(frontier.paid / frontier.target)}× target`,
      `    ${frontier.at} — ${frontier.best}`,
      `    ${String(frontier.within)} of ${String(frontier.offers)} offers paying into it come within ${String(WITHIN)}× of that`,
    ]),
  ];
}

function measuredLines({ subject, runs }: Measured, windowMs: number, levels: Levels): string[] {
  const lines = [
    `    ${subject.use}`,
    `      cycles ${spread(runs.map((run) => run.cycles))} · worked ${spread(runs.map((run) => msToSeconds(run.worked)))}s of the ${round(msToSeconds(windowMs))}s window`,
  ];
  const took = runs.map((run) => run.engagedBy).find((by) => by !== undefined);
  if (took !== undefined) lines.push(`      ${took} took a fight inside the window`);
  const short = runs.filter((run) => run.stoppedBy !== undefined).sort((one, other) => one.worked - other.worked);
  const endings = new Set(short.map((run) => run.stoppedBy));
  if (short.length > 0) {
    lines.push(
      `      stopped short in ${String(short.length)}/${String(runs.length)} seeds: ${short[0]!.stoppedBy!}${endings.size > 1 ? ` (and ${String(endings.size - 1)} other ending(s) across the seeds)` : ''}`,
    );
  }
  return [...lines, ...paidLines(runs, windowMs, levels)];
}

const CEILING = `a rate is what the whole window paid. "${WHILE_IT_RAN}" is the pace inside \`worked\` carried out to an hour — a ceiling nothing here actually held, and the shorter the run the less it means.`;

export function simulationLines(measured: readonly Measured[], args: Pick<SimulationArgs, 'save' | 'seeds' | 'window' | 'all'> & { ideal?: boolean; standing?: readonly StatAsk[]; after?: string }, levels: Levels = {}): string[] {
  const windowMs = args.window * MS_PER_MINUTE;
  const shown = args.all ? [...measured] : measured.filter((each) => !paidNothing(each));
  const head = [`${startLabel(startOf(args))}: ${String(shown.length)} of ${String(measured.length)} offers, ${String(args.seeds)} seed(s) each, over a ${String(args.window)}-minute window of game time${args.ideal ? `, under ${GOD_WORDS.join(', ')}: the most an offer can pay and the least it can cost` : ''}`];
  if (args.standing !== undefined && args.standing.length > 0) head.push(`standing at ${args.standing.map((each) => `${each.id} ${round(each.value)}`).join(', ')}, gear and level included`);
  if (shown.length === 0) return [...head, 'nothing on offer paid anything under any seed. --all lists what was tried.'];

  const body: string[] = [];
  let place: string | null = null;
  for (const each of shown) {
    if (each.subject.at !== place) {
      place = each.subject.at;
      body.push('', `  ${place}${each.subject.depth === undefined ? ' (no road reaches here)' : ` (${String(each.subject.depth)} roads out)`}`);
    }
    body.push(...measuredLines(each, windowMs, levels));
  }
  const lines = [...head, ...(body.some((line) => line.includes(WHILE_IT_RAN)) ? [CEILING] : []), ...body];
  if (!args.all) lines.push('', `${String(measured.length - shown.length)} offer(s) paid nothing at all and are not listed; --all shows them.`);
  return [...lines, ...curveLines(measured, windowMs, levels)];
}

export interface SimulationReport {
  lines: string[];
  ok: boolean;
}

export function worldOff(names: readonly string[]): readonly ModuleSource[] {
  const shipped = shippedSources();
  if (names.length === 0) return shipped;
  return withModulesOff(shipped, modulesNamed(loadUniverseWithDiagnostics(shipped).modules, names));
}

export function simulate(sources: readonly ModuleSource[], args: SimulationArgs): SimulationReport {
  const base = loadUniverseWithDiagnostics(sources);
  if (base.diagnostics.length > 0) return { lines: base.diagnostics.map(formatModuleDiagnostic), ok: false };
  const start = startOf(args);
  if ('save' in start && !base.registry.saves.has(start.save)) {
    return { lines: [`${start.save}: no # save with that id. Defined: ${[...base.registry.saves.keys()].sort().join(', ')}`], ok: false };
  }
  if ('after' in start && !base.registry.tests.has(start.after)) {
    return { lines: [`--after ${start.after}: no # test with that id. Defined: ${[...base.registry.tests.keys()].sort().join(', ')}`], ok: false };
  }
  if (args.at !== undefined && !base.registry.locations.has(args.at)) {
    return { lines: [`${args.at}: no # location with that id.`], ok: false };
  }

  const named = args.stats ?? [];
  const rungs = args.rungs ?? [];
  const dependencies = base.parsed.map((module) => module.info.id);

  const written: readonly (readonly [string, readonly string[]])[] = [
    ['--stats', named.map((each) => each.id)],
    ['--ladder', rungs.map((each) => each.id)],
  ];
  for (const [flag, ids] of written) {
    const unknown = ids.filter((id) => !base.registry.stats.has(id));
    if (unknown.length > 0) return { lines: [`${flag} names no # stat under: ${unknown.join(', ')}. Write the id whole, as thieving.thieving-ability.`], ok: false };
  }
  const both = rungs.map((each) => each.id).filter((id) => named.some((each) => each.id === id));
  if (both.length > 0) return { lines: [`--stats and --ladder both name ${both.join(', ')}, and a player stands on one base per stat: name it under one of them`], ok: false };
  const standers = written.filter(([, ids]) => ids.length > 0).map(([flag]) => flag);
  if (standers.length > 0 && base.registry.player === undefined) return { lines: [`${standers.join(' and ')} has no player to stand: the world declares no # entity player`], ok: false };

  let asked: StatAsk[];
  let world: Registry;
  let stoodAt: Stood | undefined;
  try {
    asked = [...named, ...rungs.map((rung) => ({ id: rung.id, value: baseForRung(sources, dependencies, base.registry.player!.id, start, rung) }))];
    stoodAt = asked.length > 0 ? { player: base.registry.player!.id, stats: asked } : undefined;
    world = stoodIn(sources, dependencies, start, stoodAt);
  } catch (error) {
    return { lines: [error instanceof Error ? error.message : String(error)], ok: false };
  }

  const subjects = subjectsFrom(world, start, args);
  if (subjects.length === 0) {
    return { lines: [`${startLabel(start)}: nothing is on offer anywhere that matches. Widen the spec or drop --at.`], ok: true };
  }

  const standing = loadUniverseWithDiagnostics([...sources, probeSource(dependencies, subjects, start, [], args.ideal, stoodAt)]);
  if (standing.diagnostics.length > 0) return { lines: standing.diagnostics.map(formatModuleDiagnostic), ok: false };
  const ends = standClocks(standing.registry, subjects).map((at) => at + args.window * MS_PER_MINUTE);

  const loaded = loadUniverseWithDiagnostics([...sources, probeSource(dependencies, subjects, start, ends, args.ideal, stoodAt)]);
  if (loaded.diagnostics.length > 0) return { lines: loaded.diagnostics.map(formatModuleDiagnostic), ok: false };

  const stoodStats = standingAt(world, start, asked.map((each) => each.id));
  return { lines: simulationLines(measure(loaded.registry, subjects, seedsFrom(args.seeds), ends), { ...args, standing: stoodStats }, levelsOn(world, start)), ok: true };
}

function main(): void {
  let args: SimulationArgs;
  try {
    args = parseSimulationArgs(process.argv.slice(2));
  } catch (error) {
    console.error((error as Error).message);
    process.exit(2);
  }
  const report = simulate([...worldOff(args.off ?? []), ...(args.after === undefined ? [] : readSources([FLOORS_DIR]))], args);
  console.log(report.lines.join('\n'));
  if (!report.ok) process.exit(1);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
