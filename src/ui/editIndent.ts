export const STEP = '  ';

export interface Typed {
  text: string;
  cursor: number;
}

const lineStartOf = (text: string, at: number): number => text.lastIndexOf('\n', at - 1) + 1;

export function stepIn(text: string, cursor: number): Typed {
  return { text: `${text.slice(0, cursor)}${STEP}${text.slice(cursor)}`, cursor: cursor + STEP.length };
}

// A block is held open by indentation, so a new line inside one starts where the line above it started; a return that gave that up would ask an author to type it back every time.
export function opened(text: string, cursor: number): Typed {
  const start = lineStartOf(text, cursor);
  const indent = /^[ \t]*/.exec(text.slice(start, cursor))![0];
  return { text: `${text.slice(0, cursor)}\n${indent}${text.slice(cursor)}`, cursor: cursor + 1 + indent.length };
}

// The one edit worth finishing for an author, told from every other by its shape: a single return typed where the cursor stood. A return that arrives pasted, or among other characters, is left as it was written.
export function typed(was: string, now: string, cursor: number): Typed {
  const at = cursor - 1;
  if (at < 0 || now.length !== was.length + 1 || now[at] !== '\n' || now.slice(0, at) !== was.slice(0, at) || now.slice(cursor) !== was.slice(at)) return { text: now, cursor };
  return opened(was, at);
}

export function stepOut(text: string, cursor: number): Typed {
  const start = lineStartOf(text, cursor);
  const taken = (/^[ \t]{1,2}/.exec(text.slice(start)) ?? [''])[0].length;
  if (taken === 0) return { text, cursor };
  return { text: text.slice(0, start) + text.slice(start + taken), cursor: Math.max(start, cursor - taken) };
}
