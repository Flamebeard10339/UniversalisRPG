import { readFileSync } from 'node:fs';

// Both bots take a brief, and both take it the same way: as the path to a file. What that buys is
// in the lines below, which every usage block that offers a brief prints rather than wording again.
export const BRIEF_IS_A_FILE: readonly string[] = [
  'a file rather than an argument, because `npm run` and',
  '`npx` on Windows cut a multi-line argument at its first',
  'newline and silently drop every argument after it: a brief',
  'given as text arrives as its own first line, and nothing',
  'says so',
];

export function readBrief(flag: string, named: string): string {
  let held: string;
  try {
    held = readFileSync(named, 'utf8');
  } catch {
    throw new Error(`${flag} names the file saying what is to be done, and ${JSON.stringify(named.split('\n')[0] ?? '')} could not be read. Pass the path to the brief, not the brief itself.`);
  }
  if (held.trim() === '') throw new Error(`${flag} names ${JSON.stringify(named)}, and there is nothing in it`);
  return held;
}
