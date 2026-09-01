export const STEP = '  ';

export interface Typed {
  text: string;
  cursor: number;
}

const lineStartOf = (text: string, at: number): number => text.lastIndexOf('\n', at - 1) + 1;

export function stepIn(text: string, cursor: number): Typed {
  return { text: `${text.slice(0, cursor)}${STEP}${text.slice(cursor)}`, cursor: cursor + STEP.length };
}

export function opened(text: string, cursor: number): Typed {
  const start = lineStartOf(text, cursor);
  const indent = /^[ \t]*/.exec(text.slice(start, cursor))![0];
  return { text: `${text.slice(0, cursor)}\n${indent}${text.slice(cursor)}`, cursor: cursor + 1 + indent.length };
}

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
