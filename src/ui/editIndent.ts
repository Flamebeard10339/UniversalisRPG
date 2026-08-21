export const STEP = '  ';

export interface Typed {
  text: string;
  cursor: number;
}

const lineStartOf = (text: string, at: number): number => text.lastIndexOf('\n', at - 1) + 1;

export function stepIn(text: string, cursor: number): Typed {
  return { text: `${text.slice(0, cursor)}${STEP}${text.slice(cursor)}`, cursor: cursor + STEP.length };
}

export function stepOut(text: string, cursor: number): Typed {
  const start = lineStartOf(text, cursor);
  const taken = (/^[ \t]{1,2}/.exec(text.slice(start)) ?? [''])[0].length;
  if (taken === 0) return { text, cursor };
  return { text: text.slice(0, start) + text.slice(start + taken), cursor: Math.max(start, cursor - taken) };
}
