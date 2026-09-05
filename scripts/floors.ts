import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import path from 'node:path';
import { withEngineLocale } from '../src/content/engineLocale';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { formatModuleDiagnostic, type Registry } from '../src/content/registry';
import { everyDirective } from '../src/content/sections/test';
import { CORPUS_DIR } from '../src/content/shipped';
import type { ModuleSource } from '../src/content/universe';
import { replayTest, SECONDS_A_ROUTE_MAY_WALK } from '../src/runtime/session';
import { skillLevel } from '../src/runtime/skills';
import { createGameState } from '../src/runtime/state';
import { sourceFiles } from './lib/dslSources';
import { ladderForSkill, minutesToReachOn } from '../src/runtime/pace';
import { readSources } from './probe';

export const FLOORS_DIR = 'floors';

export const SECONDS_TO_LOAD_A_WORLD = 60;

export const SECONDS_A_ROUTE_MAY_TAKE = SECONDS_A_ROUTE_MAY_WALK + SECONDS_TO_LOAD_A_WORLD;

const usage = [
  'Usage: npm run floors [-- --world <dir>]',
  '',
  `Walks every # test under ${FLOORS_DIR}/ over the shipped world and prints, for each, the level`,
  'it reached, the game-minutes it took, and the minutes the curve allows for reaching that',
  'level. A floor is the fastest route anyone has walked to a goal, and the folder is where',
  'the speedrun runs leave their best. Nothing here is asserted about the minutes: the sheet',
  'is read, and a route slower than the curve is the finding. It exits non-zero only where a',
  'route no longer walks, which is what a rebalance that killed the floor looks like.',
  '',
  "A route's goal is read off its own closing `assert: level.<skill> >= <n>`; one that closes",
  'on nothing of the kind is walked and reported without a curve to stand beside.',
  '',
  `  --world  a directory holding a ${CORPUS_DIR}/ and a ${FLOORS_DIR}/ of its own, walked instead of`,
  '           the shipped ones. This is what points it at a copy of the world rather than at this',
  '           checkout, and without it the shipped folders are what it reads.',
  '',
  `Each route is walked in a process of its own, as many at once as there are cores. Routes share`,
  'nothing: every one starts from a fresh state and walks whatever it `run:`s from the beginning,',
  'so the only thing a hung route costs is itself.',
  '',
  `A route that cannot reach what it waits for is refused by the runtime after ${String(SECONDS_A_ROUTE_MAY_WALK)} seconds of`,
  'real time, naming the loop it was going round, and that bound is the runtime\'s for every tool',
  `that walks a route. A process still going ${String(SECONDS_TO_LOAD_A_WORLD)} seconds past it has wedged below the directive`,
  'the runtime counts, so it is killed from outside and reported as failed by name.',
].join('\n');

const MS_PER_MINUTE = 60_000;

export interface Goal {
  readonly skill: string;
  readonly level: number;
}

export function goalOf(registry: Registry, testId: string): Goal | undefined {
  let goal: Goal | undefined;
  for (const directive of everyDirective(registry.tests.get(testId)?.directives ?? [])) {
    if (directive.kind !== 'assert' || directive.condition.kind !== 'comparison') continue;
    const { left, operator, right } = directive.condition;
    if (left.path[0] !== 'level' || left.path.length < 2 || operator !== '>=') continue;
    goal = { skill: left.path.slice(1).join('.'), level: right.value };
  }
  return goal;
}

export const floorIds = (sources: readonly ModuleSource[], under: string): readonly string[] => sourceFiles(under).map((file) => path.basename(file).replace(/\.[^.]*$/, '')).filter((id) => sources.some((source) => source.name === id));

export function foldersOf(argv: readonly string[]): { corpus: string; floors: string } {
  const at = argv.indexOf('--world');
  if (at === -1) return { corpus: CORPUS_DIR, floors: FLOORS_DIR };
  const world = argv[at + 1];
  if (world === undefined || world.startsWith('--')) throw new Error(`--world wants a directory after it

${usage}`);
  return { corpus: path.join(world, CORPUS_DIR), floors: path.join(world, FLOORS_DIR) };
}

const times = (ratio: number): string => `${ratio.toFixed(2)}×`;

export function floorLines(sources: readonly ModuleSource[], floors: readonly string[], only?: string): { lines: string[]; ok: boolean } {
  const loaded = loadUniverseWithDiagnostics(withEngineLocale(sources));
  if (loaded.diagnostics.length > 0) return { lines: loaded.diagnostics.map(formatModuleDiagnostic), ok: false };
  const { registry } = loaded;
  const lines: string[] = [];
  let ok = true;
  const routes = [...registry.tests.keys()].filter((id) => (only === undefined ? floors.some((floor) => id.startsWith(`${floor}.`)) : id === only)).sort();
  if (routes.length === 0) lines.push(`no # test stands under ${floors.length === 0 ? 'any floor module' : floors.join(', ')}`);
  for (const id of routes) {
    const state = createGameState();
    const failure = ((): string | null => {
      try {
        const run = replayTest(id, registry, state);
        return run.result.passed ? null : (run.result.failure ?? 'no reason given');
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    })();
    if (failure !== null) {
      ok = false;
      lines.push(`${id}: FAILED — ${failure}`);
      continue;
    }
    const minutes = state.time / MS_PER_MINUTE;
    const goal = goalOf(registry, id);
    if (goal === undefined) {
      lines.push(`${id}: walked in ${minutes.toFixed(1)} game-minutes, and closes on no assert: level.<skill> >= <n>, so it stands beside no curve`);
      continue;
    }
    const reached = skillLevel(state.xp[goal.skill] ?? 0);
    const ladder = ladderForSkill(registry, goal.skill);
    if (ladder === undefined) {
      lines.push(`${id}: ${goal.skill} ${String(reached)} in ${minutes.toFixed(1)} game-minutes, and ${goal.skill} declares no # ladder, so it stands beside no curve`);
      continue;
    }
    const asks = minutesToReachOn(ladder, reached);
    lines.push(`${id}: ${goal.skill} ${String(reached)} in ${minutes.toFixed(1)} game-minutes; the curve asks ${asks.toFixed(1)} (${times(minutes / asks)})`);
  }
  return { lines, ok };
}


const WALKING = '--walking';

export function floorRouteIds(sources: readonly ModuleSource[], floors: readonly string[]): string[] {
  const loaded = loadUniverseWithDiagnostics(withEngineLocale(sources));
  if (loaded.diagnostics.length > 0) return [];
  return [...loaded.registry.tests.keys()].filter((id) => floors.some((floor) => id.startsWith(`${floor}.`))).sort();
}

interface Walked {
  id: string;
  lines: string[];
  ok: boolean;
}

const stoppedLine = (id: string): string => `${id}: FAILED — still going after ${String(SECONDS_A_ROUTE_MAY_TAKE)}s of real time, past the ${String(SECONDS_A_ROUTE_MAY_WALK)}s the runtime refuses a route at, and killed from outside. Something below the directive the runtime counts is not coming back.`;

function walkApart(id: string, args: readonly string[]): Promise<Walked> {
  return new Promise((settle) => {
    const child = spawn(process.execPath, [...process.execArgv, process.argv[1]!, ...args, WALKING, id], { stdio: ['ignore', 'pipe', 'inherit'] });
    let said = '';
    let stopped = false;
    const clock = setTimeout(() => {
      stopped = true;
      child.kill('SIGKILL');
    }, SECONDS_A_ROUTE_MAY_TAKE * 1000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => (said += chunk));
    child.on('close', (code) => {
      clearTimeout(clock);
      if (stopped) return settle({ id, lines: [stoppedLine(id)], ok: false });
      settle({ id, lines: said.split('\n').filter((line) => line.trim() !== ''), ok: code === 0 });
    });
  });
}

async function walkedApart(ids: readonly string[], args: readonly string[], atOnce: number): Promise<Walked[]> {
  const done: Walked[] = [];
  let next = 0;
  const lanes = Array.from({ length: Math.min(atOnce, ids.length) }, async () => {
    for (let mine = next++; mine < ids.length; mine = next++) done.push(await walkApart(ids[mine]!, args));
  });
  await Promise.all(lanes);
  return done;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg === '--help' || arg === '-h')) {
    console.log(usage);
    return;
  }
  const { corpus, floors } = foldersOf(args);
  const at = args.indexOf(WALKING);
  if (at !== -1) {
    const mine = readSources([corpus, floors]);
    const report = floorLines(mine, floorIds(mine, floors), args[at + 1]);
    console.log(report.lines.join('\n'));
    if (!report.ok) process.exit(1);
    return;
  }

  const sources = readSources([corpus, floors]);
  const ids = floorRouteIds(sources, floorIds(sources, floors));
  if (ids.length === 0) {
    const report = floorLines(sources, floorIds(sources, floors));
    console.log(report.lines.join('\n'));
    if (!report.ok) process.exit(1);
    return;
  }

  const walked = await walkedApart(ids, args.filter((arg) => arg !== WALKING), Math.max(1, cpus().length - 1));
  const said = new Map(walked.map((each) => [each.id, each]));
  console.log(ids.flatMap((id) => said.get(id)?.lines ?? []).join('\n'));
  if (walked.some((each) => !each.ok)) process.exit(1);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) void main();
