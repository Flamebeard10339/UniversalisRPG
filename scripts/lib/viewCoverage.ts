import { COMMANDS, type CommandSpec } from '../../src/runtime/command';
import { leaves } from '../../src/runtime/viewLeaves';
import type { PlayView } from '../../src/runtime/session';

const SHORTEST_SIGNATURE = 2;

export interface PathExcuse {
  readonly path: string;
  readonly why: string;
  covers(view: PlayView): boolean;
}

export interface SurfaceStep {
  readonly view: PlayView;
  readonly rendered: string;
}

export interface SurfaceRun {
  readonly name: string;
  readonly steps: readonly SurfaceStep[];
}

const under = (path: string, excused: string): boolean => path === excused || path.startsWith(`${excused}.`) || path.startsWith(`${excused}[`) || path.startsWith(`${excused}{`);

export function excusedPathsAreReal(runs: readonly SurfaceRun[], excused: readonly PathExcuse[]): string[] {
  const steps = runs.flatMap((run) => run.steps);
  const live = steps.flatMap((step) => leaves(step.view)).map((leaf) => leaf.path);
  const bites = (each: PathExcuse): boolean => steps.some((step) => each.covers(step.view) && leaves(step.view).some((leaf) => under(leaf.path, each.path)));
  return excused.filter((each) => each.why.length <= 20 || !live.some((path) => under(path, each.path)) || !bites(each)).map((each) => each.path);
}

function wordsHere(view: PlayView, said: ReadonlySet<string>): Map<string, readonly string[]> {
  const words = new Map<string, readonly string[]>();
  for (const leaf of leaves(view)) {
    const mine = leaf.signatures.filter((each) => each.length > SHORTEST_SIGNATURE && said.has(each));
    if (mine.length > 0) words.set(leaf.path, mine);
  }
  return words;
}

function times(rendered: string, word: string): number {
  let count = 0;
  for (let at = rendered.indexOf(word); at >= 0; at = rendered.indexOf(word, at + word.length)) count += 1;
  return count;
}

function drawnHere(step: SurfaceStep, said: ReadonlySet<string>): ReadonlySet<string> {
  const words = wordsHere(step.view, said);
  const bearers = new Map<string, string[]>();
  for (const [path, mine] of words) for (const word of mine) bearers.set(word, [...(bearers.get(word) ?? []), path]);
  const counted = new Map<string, number>();
  const drawn = (word: string): number => counted.get(word) ?? (counted.set(word, times(step.rendered, word)), counted.get(word)!);
  const proved = new Set([...words].filter(([, mine]) => mine.some((word) => bearers.get(word)!.length === 1 && drawn(word) > 0)).map(([path]) => path));
  const spokenFor = (word: string, path: string): number => bearers.get(word)!.filter((each) => each !== path && proved.has(each)).length;
  return new Set([...words].filter(([path, mine]) => mine.some((word) => drawn(word) > spokenFor(word, path))).map(([path]) => path));
}

export function driftingPaths(runs: readonly SurfaceRun[], said: ReadonlySet<string>, excused: readonly PathExcuse[]): string[] {
  const excusedHere = (path: string, view: PlayView): boolean => excused.some((each) => under(path, each.path) && each.covers(view));

  const verdicts = runs.map((run) => {
    const carried = new Set<string>();
    const drew = new Set<string>();
    for (const step of run.steps) {
      for (const path of wordsHere(step.view, said).keys()) if (!excusedHere(path, step.view)) carried.add(path);
      for (const path of drawnHere(step, said)) if (!excusedHere(path, step.view)) drew.add(path);
    }
    return { run, carried, drew };
  });
  const everyPath = [...new Set(verdicts.flatMap(({ carried }) => [...carried]))];

  return everyPath.flatMap((path) => {
    const asked = verdicts.filter(({ carried }) => carried.has(path));
    const drew = asked.filter((each) => each.drew.has(path));
    if (drew.length === 0 || drew.length === asked.length) return [];
    const missing = asked.filter((each) => !drew.includes(each));
    return [`${path} — drawn by ${drew.map(({ run }) => run.name).join(' and ')}, not by ${missing.map(({ run }) => run.name).join(' or ')}`];
  });
}

export const playerCommands = (): readonly CommandSpec[] => COMMANDS.filter((spec) => spec.match === 'name' && spec.audience === 'player');

export interface CommandExcuse {
  readonly command: string;
  readonly why: string;
}

export function excusedCommandsAreReal(excused: readonly CommandExcuse[]): string[] {
  const named = new Set(playerCommands().map((spec) => spec.name));
  return excused.filter((each) => !named.has(each.command) || each.why.length <= 20).map((each) => each.command);
}

export interface SurfaceAnswers {
  readonly name: string;
  answer(spec: CommandSpec): readonly string[];
}

export function unansweredCommands(surfaces: readonly SurfaceAnswers[], excused: readonly CommandExcuse[]): string[] {
  const excusedNames = new Set(excused.map((each) => each.command));
  const heard = (surface: SurfaceAnswers, spec: CommandSpec): boolean => surface.answer(spec).some((line) => line.trim() !== '');
  return playerCommands().flatMap((spec) => {
    if (excusedNames.has(spec.name)) return [];
    const answering = surfaces.filter((surface) => heard(surface, spec));
    if (answering.length === 0 || answering.length === surfaces.length) return [];
    const silent = surfaces.filter((surface) => !answering.includes(surface));
    return [`${spec.name} — answered by ${answering.map((each) => each.name).join(' and ')}, met with silence by ${silent.map((each) => each.name).join(' or ')}`];
  });
}
