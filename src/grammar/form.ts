// A form is what an author is shown: literal text, `<a placeholder>`, `[an optional part]`, and a trailing `, …` for a list.
// Reading a form against what is written is the one thing every part of the editor asks: which shapes a half-typed line
// could still become, which placeholder the cursor stands in, and what a whole line was read as.

export interface Hole {
  name: string;
  start: number;
  end: number;
}

export interface Alignment {
  holes: readonly Hole[];
  // The hole the written text runs out inside, which is the one an author is filling. Its span ends where the text does.
  open: Hole | null;
  // Every part of the form is accounted for, so the line stands on its own.
  complete: boolean;
  // How many of the form's own characters the text has spelt out. A line that has spelt out none of a form is not yet being written in it.
  spelt: number;
}

type Node = { lit: string } | { hole: string } | { rest: true };

const PART = /(<[a-z][a-z0-9 -]*>|\[|\]|, …$)/;
const PLACEHOLDER = /^<[a-z][a-z0-9 -]*>$/;
const MORE = ',';

const pieces = (form: string): string[] => form.split(PART).filter((part) => part !== undefined && part !== '');

const closing = (parts: readonly string[], from: number): number => {
  let deep = 0;
  for (let at = from; at < parts.length; at++) {
    if (parts[at] === '[') deep += 1;
    if (parts[at] === ']') {
      deep -= 1;
      if (deep === 0) return at;
    }
  }
  return parts.length;
};

// An optional part is a fork rather than a special case: the form stands for every line that takes it and every line that leaves it out.
function expand(parts: readonly string[]): Node[][] {
  if (parts.length === 0) return [[]];
  const [head, ...tail] = parts;
  if (head === '[') {
    const close = closing(parts, 0);
    const inner = expand(parts.slice(1, close));
    const after = expand(parts.slice(close + 1));
    return [...inner, []].flatMap((taken) => after.map((rest) => [...taken, ...rest]));
  }
  const node: Node = head === ', …' ? { rest: true } : PLACEHOLDER.test(head!) ? { hole: head!.slice(1, -1) } : { lit: head! };
  return expand(tail).map((rest) => [node, ...rest]);
}

// A hole runs until the text that follows it in the form turns up, so what an author has written divides on its own.
const following = (nodes: readonly Node[], from: number): string | null => {
  for (let at = from; at < nodes.length; at++) {
    const node = nodes[at]!;
    if ('lit' in node) return node.lit;
    if ('rest' in node) return MORE;
  }
  return null;
};

const rests = (nodes: readonly Node[], from: number): boolean => nodes.slice(from).every((node) => 'rest' in node);

function scan(nodes: readonly Node[], written: string): Alignment | null {
  const holes: Hole[] = [];
  let at = 0;
  let spelt = 0;
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]!;
    if ('rest' in node) {
      if (at < written.length && written[at] !== MORE) return null;
      return { holes, open: null, complete: true, spelt };
    }
    if ('lit' in node) {
      if (written.startsWith(node.lit, at)) {
        at += node.lit.length;
        spelt += node.lit.length;
        continue;
      }
      return node.lit.startsWith(written.slice(at)) ? { holes, open: null, complete: false, spelt: spelt + written.length - at } : null;
    }
    if (at >= written.length) {
      const open = { name: node.hole, start: at, end: at };
      return { holes: [...holes, open], open, complete: false, spelt };
    }
    const next = following(nodes, index + 1);
    const cut = next === null ? -1 : written.indexOf(next, at + 1);
    if (cut < 0) {
      const open = { name: node.hole, start: at, end: written.length };
      return { holes: [...holes, open], open, complete: rests(nodes, index + 1), spelt };
    }
    holes.push({ name: node.hole, start: at, end: cut });
    at = cut;
  }
  return at === written.length ? { holes, open: null, complete: true, spelt } : null;
}

const worth = (found: Alignment): number => (found.complete ? 1000 : 0) + found.spelt;

// How the form reads what is written, taking the branch that accounts for the most of it. Null where the text is not this form, half-written or whole.
export function align(form: string, written: string): Alignment | null {
  let best: Alignment | null = null;
  for (const nodes of expand(pieces(form))) {
    const found = scan(nodes, written);
    if (found !== null && (best === null || worth(found) > worth(best))) best = found;
  }
  return best;
}

// The text could still grow into this form, whether or not it has yet.
export const fits = (form: string, written: string): boolean => align(form, written) !== null;

// The text is this form, whole.
export const matches = (form: string, written: string): boolean => align(form, written)?.complete === true;

// What one example puts in each of a form's holes, which is the nearest thing to a value an author can be shown.
export const holesIn = (form: string, example: string): readonly Hole[] | null => {
  const found = align(form, example);
  return found === null || !found.complete ? null : found.holes;
};

export const valueIn = (example: string, hole: Hole): string => example.slice(hole.start, hole.end);

// The example with one hole given over to a stand-in, which is how the engine is asked what that hole names.
export const standingIn = (example: string, hole: Hole, stood: string): string => `${example.slice(0, hole.start)}${stood}${example.slice(hole.end)}`;

export const exampleOf = (form: string, examples: readonly string[]): string | undefined => examples.find((example) => matches(form, example));
