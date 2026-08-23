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

// What one driver made of one script: the views it walked through, and everything it drew while
// walking them.
export interface SurfaceRun {
  readonly name: string;
  readonly views: readonly PlayView[];
  readonly rendered: string;
}

const under = (path: string, excused: string): boolean => path === excused || path.startsWith(`${excused}.`) || path.startsWith(`${excused}[`) || path.startsWith(`${excused}{`);

// An excuse list is content, and content drifts: this holds every excuse to the two facts that
// keep it honest — a live view still carries something at the path it names, and the reason is
// more than a placeholder.
export function excusedPathsAreReal(runs: readonly SurfaceRun[], excused: readonly PathExcuse[]): string[] {
  const live = runs.flatMap((run) => run.views).flatMap((view) => leaves(view)).map((leaf) => leaf.path);
  return excused.filter((each) => each.why.length <= 20 || !live.some((path) => under(path, each.path))).map((each) => each.path);
}

// Where the drivers disagree. A path drawn by every driver is parity and a path drawn by none is
// one decision made everywhere — a machine name a player never reads, an enum a renderer acts on
// rather than prints. A path drawn by some and not the others is a surface that has lost a
// capability the others kept, which is the only thing this can catch and the only thing worth
// catching: nothing here says what ought to be drawn, only that they cannot differ about it.
//
// A path counts as drawn when every string the view put there turns up verbatim in the render:
// passing on whichever one came first is what let a quest's title stand in for the lines under it.
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

export function driftingPaths(runs: readonly SurfaceRun[], said: ReadonlySet<string>, excused: readonly PathExcuse[]): string[] {
  // Each driver is judged against what its own session published, never against another's: two
  // drivers walking one script still reach different states — a live one ticks an action out
  // where a turn-taking one stops after a cycle — and holding one to strings the other's world
  // held and its own never did would report a difference nobody made.
  const verdicts = runs.map((run) => {
    const own = new Map<string, string[]>();
    for (const view of run.views) {
      // A path only some of whose strings are prose is one the world says through and addresses
      // through at once — an id beside a title — and the words are the half a player reads.
      for (const leaf of leaves(view)) {
        const words = leaf.signatures.filter((each) => said.has(each));
        if (words.length > 0) own.set(leaf.path, [...new Set([...(own.get(leaf.path) ?? []), ...words])]);
      }
    }
    return { run, own };
  });
  const everyPath = [...new Set(verdicts.flatMap(({ own }) => [...own.keys()]))];

  return everyPath.flatMap((path) => {
    if (excused.some((each) => under(path, each.path))) return [];
    const asked = verdicts.filter(({ own }) => (own.get(path) ?? []).length > 0);
    const drew = asked.filter(({ run, own }) => own.get(path)!.every((each) => run.rendered.includes(each)));
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
