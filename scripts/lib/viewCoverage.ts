import { COMMANDS, type CommandSpec } from '../../src/runtime/command';
import { leaves } from '../../src/runtime/viewLeaves';
import type { PlayView } from '../../src/runtime/session';

// What a play surface has to answer for, derived rather than listed. Two questions, each with its
// own subjects: every leaf a live view carries, and every command a player may type.

// A signature of two characters or fewer turns up everywhere by coincidence — a bare digit is in
// every rendered surface — so it can settle nothing about which surface drew what. It is too short
// to be *evidence*; the view published it all the same, which is why this stands here and not in
// the walk.
const SHORTEST_SIGNATURE = 2;

export interface PathExcuse {
  readonly path: string;
  readonly why: string;
  // The moments the excuse covers, asked of the view the driver was holding. A reason that holds
  // only in some states — a screen whose one answer is the one that leaves — is keyed to the state
  // and not to the path, because keying it to the path would excuse the states it says nothing
  // about too, and a driver that dropped the path everywhere would pass on a reason for a corner
  // of it. An excuse that really is about the path whatever the view says answers true to all of
  // them, and says so in one place a reader can see.
  covers(view: PlayView): boolean;
}

// One moment of a run: the view the driver was left holding, beside what it drew for that view
// alone. Held apart moment by moment rather than poured into one blob, because a whole run's text
// says a word so many times that no count taken over it can tell which path put it there.
export interface SurfaceStep {
  readonly view: PlayView;
  readonly rendered: string;
}

// What one driver made of one script.
export interface SurfaceRun {
  readonly name: string;
  readonly steps: readonly SurfaceStep[];
}

const under = (path: string, excused: string): boolean => path === excused || path.startsWith(`${excused}.`) || path.startsWith(`${excused}[`) || path.startsWith(`${excused}{`);

// An excuse list is content, and content drifts: this holds every excuse to the two facts that
// keep it honest — a live view still carries something at the path it names, and the reason is
// more than a placeholder.
export function excusedPathsAreReal(runs: readonly SurfaceRun[], excused: readonly PathExcuse[]): string[] {
  const steps = runs.flatMap((run) => run.steps);
  const live = steps.flatMap((step) => leaves(step.view)).map((leaf) => leaf.path);
  const bites = (each: PathExcuse): boolean => steps.some((step) => each.covers(step.view) && leaves(step.view).some((leaf) => under(leaf.path, each.path)));
  return excused.filter((each) => each.why.length <= 20 || !live.some((path) => under(path, each.path)) || !bites(each)).map((each) => each.path);
}

// A path only some of whose strings are prose is one the world says through and addresses through
// at once — an id beside a title — and the words are the half a player reads.
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

// The paths one moment's render draws **in its own right**. A path whose words another path also
// holds is drawn for free by anyone who asks only whether the words are somewhere in the text, so
// a word counts for a path only beyond the times the paths already known to be drawn account for
// it — and a path is known to be drawn by holding a word no other path holds, since nothing else
// could have put such a word on the surface. What is left over is the path's own showing.
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

// Where the drivers disagree. A path drawn by every driver is parity and a path drawn by none is
// one decision made everywhere — a machine name a player never reads, an enum a renderer acts on
// rather than prints. A path drawn by some and not the others is a surface that has lost a
// capability the others kept, which is the only thing this can catch and the only thing worth
// catching: nothing here says what ought to be drawn, only that they cannot differ about it.
export function driftingPaths(runs: readonly SurfaceRun[], said: ReadonlySet<string>, excused: readonly PathExcuse[]): string[] {
  // Each driver is judged against what its own session published, never against another's: two
  // drivers walking one script still reach different states — a live one ticks an action out
  // where a turn-taking one stops after a cycle — and holding one to strings the other's world
  // held and its own never did would report a difference nobody made. A driver draws a path by
  // drawing it at any one moment its view carried it: a terminal answers a command rather than
  // redrawing everything each turn, and being shown once is what being shown means.
  // An excuse is spent moment by moment, beside the words it is excusing. A path let off at the one
  // moment its reason speaks of is still asked at every other, which is what keeps an excuse
  // written for a corner of a path from covering the whole of it.
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

// Every command an ordinary session may type, read off the table that declares them. What /help
// lists for a player, what the playbot's prompt says exists, and what has to be answered here are
// then one decision made in one place.
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

// Every command a player may type that some drivers answer and others meet with silence. A
// command answered with nothing is a capability a surface has lost without anybody deleting it:
// the line is still accepted, the engine still does the work, and the player is told none of it.
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
