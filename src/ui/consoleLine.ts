// What a typed line becomes on its way to the shared table. The table is what
// parses a command, so nothing is interpreted here: a line is passed on as it
// was written, and the only line that is not passed on is one with nothing in
// it. A filter here would be this driver deciding what the game accepts.
export function typed(line: string): string | null {
  const trimmed = line.trim();
  return trimmed === '' ? null : trimmed;
}
