import type { Registry } from '../../src/content/registry';
import { COMMANDS, type CommandSpec } from '../../src/runtime/command';
import type { PlayView } from '../../src/runtime/session';

// What a play surface has to answer for, derived rather than listed. Two questions, each with its
// own subjects: every leaf a live view carries, and every command a player may type.

// A field name declared in PlayStatus and everything under it; anything else standing as a key is
// content the world put there — an item id, a flag, a grown instance — and is read as one of the
// values that object holds rather than as a place of its own. Written as the shape of a name
// because the types that say so are gone by the time a live view is walked.
const FIELD = /^[a-zA-Z][a-zA-Z0-9]*$/;

// A signature of two characters or fewer turns up everywhere by coincidence — a bare digit is in
// every rendered surface — so it proves nothing and is dropped.
const SHORTEST_SIGNATURE = 2;

export interface Leaf {
  readonly path: string;
  // Every string the view puts at this path, across every element of every array above it. A
  // renderer shows the path only by showing all of them: passing on whichever one happened to come
  // first is what let a quest's title stand in for the lines under it.
  readonly signatures: readonly string[];
}

function walk(value: unknown, path: string, into: Map<string, string[]>): void {
  const held = (signature: string): void => void into.set(path, [...(into.get(path) ?? []), signature]);
  if (value === null || value === undefined || value === '') return;
  if (typeof value === 'string') return held(value);
  if (typeof value === 'number') return held(String(value));
  // Nothing in a rendered line is the word `true`, so a flag's own value can be neither found nor
  // missed. What a renderer does with one is a claim its own test has to make.
  if (typeof value === 'boolean') return;
  if (Array.isArray(value)) {
    for (const each of value) walk(each, `${path}[]`, into);
    return;
  }
  if (typeof value !== 'object') return held(String(value));
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (FIELD.test(key)) walk(inner, path === '' ? key : `${path}.${key}`, into);
    else {
      held(key);
      walk(inner, `${path}{}`, into);
    }
  }
}

// Every leaf of a live view, keyed by where it sits rather than by the top-level field holding it.
// A field a section grows next month arrives here as its own path, under whichever renderer has to
// draw it, with nothing edited.
export function leaves(view: PlayView): Leaf[] {
  const into = new Map<string, string[]>();
  walk(view, '', into);
  return [...into].map(([path, signatures]) => ({ path, signatures: [...new Set(signatures)].filter((each) => each.length > SHORTEST_SIGNATURE) }));
}

export interface PathExcuse {
  readonly path: string;
  readonly why: string;
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
  const live = runs.flatMap((run) => run.steps).flatMap((step) => leaves(step.view)).map((leaf) => leaf.path);
  return excused.filter((each) => each.why.length <= 20 || !live.some((path) => under(path, each.path))).map((each) => each.path);
}

// Every string this world can say, off the locale that declares them. It is what tells a leaf
// holding words a player reads from one holding a machine name, an enum a renderer acts on, or a
// figure each surface rounds its own way — none of which any two drivers were ever going to spell
// alike, and none of which is a capability. Read off the tables rather than guessed at from the
// shape of the string, so a prose field a kind grows is prose here with nothing edited.
export function everythingSaid(registry: Registry): ReadonlySet<string> {
  const said = new Set<string>();
  for (const entry of registry.locales.base.values()) said.add(entry.text);
  for (const table of registry.locales.declared.values()) for (const text of table.values()) said.add(text);
  return said;
}

// A path only some of whose strings are prose is one the world says through and addresses through
// at once — an id beside a title — and the words are the half a player reads.
function wordsHere(view: PlayView, said: ReadonlySet<string>): Map<string, readonly string[]> {
  const words = new Map<string, readonly string[]>();
  for (const leaf of leaves(view)) {
    const mine = leaf.signatures.filter((each) => said.has(each));
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
  const verdicts = runs.map((run) => {
    const carried = new Set<string>();
    const drew = new Set<string>();
    for (const step of run.steps) {
      for (const path of wordsHere(step.view, said).keys()) carried.add(path);
      for (const path of drawnHere(step, said)) drew.add(path);
    }
    return { run, carried, drew };
  });
  const everyPath = [...new Set(verdicts.flatMap(({ carried }) => [...carried]))];

  return everyPath.flatMap((path) => {
    if (excused.some((each) => under(path, each.path))) return [];
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
