import path from 'node:path';
import { withEngineLocale } from '../src/content/engineLocale';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { formatModuleDiagnostic, type Registry } from '../src/content/registry';
import { everyDirective } from '../src/content/sections/test';
import { CORPUS_DIR } from '../src/content/shipped';
import type { ModuleSource } from '../src/content/universe';
import { replayTest } from '../src/runtime/session';
import { skillLevel } from '../src/runtime/skills';
import { createGameState } from '../src/runtime/state';
import { sourceFiles } from './lib/dslSources';
import { minutesToReach } from './lib/pace';
import { readSources } from './probe';

export const FLOORS_DIR = 'floors';

const usage = [
  'Usage: npm run floors',
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

const times = (ratio: number): string => `${ratio.toFixed(2)}×`;

export function floorLines(sources: readonly ModuleSource[], floors: readonly string[]): { lines: string[]; ok: boolean } {
  const loaded = loadUniverseWithDiagnostics(withEngineLocale(sources));
  if (loaded.diagnostics.length > 0) return { lines: loaded.diagnostics.map(formatModuleDiagnostic), ok: false };
  const { registry } = loaded;
  const lines: string[] = [];
  let ok = true;
  const routes = [...registry.tests.keys()].filter((id) => floors.some((floor) => id.startsWith(`${floor}.`))).sort();
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
    const asks = minutesToReach(reached);
    lines.push(`${id}: ${goal.skill} ${String(reached)} in ${minutes.toFixed(1)} game-minutes; the curve asks ${asks.toFixed(1)} (${times(minutes / asks)})`);
  }
  return { lines, ok };
}

function main(): void {
  if (process.argv.slice(2).some((arg) => arg === '--help' || arg === '-h')) {
    console.log(usage);
    return;
  }
  const sources = readSources([CORPUS_DIR, FLOORS_DIR]);
  const report = floorLines(sources, floorIds(sources, FLOORS_DIR));
  console.log(report.lines.join('\n'));
  if (!report.ok) process.exit(1);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
