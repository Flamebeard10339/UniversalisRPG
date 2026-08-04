export interface Flags {
  positional: string[];
  flags: Record<string, string>;
  // The argument list as given. `audit` alone needs it: its repeated
  // --proof/--finding flags carry an order and a scope that a flat
  // key-value map cannot hold, so it rescans them itself.
  raw: string[];
}

export type FlagArity = 'value' | 'boolean';

// A command's usage string is its flag spec. Every flag it accepts is named
// in the text it prints when asked for help, so what the parser enforces
// and what the help documents cannot drift apart: a flag dropped from the
// usage stops being accepted, and one never written there was never
// reachable in the first place. A flag followed by anything that is not
// another flag takes a value; one followed by nothing, or by a prose
// parenthetical, takes none — a `(` opens description, not declaration,
// which is the same stop positionalArity applies to its half.
export function flagArities(usage: string): Map<string, FlagArity> {
  const tokens = usage.split(/\s+/);
  const arities = new Map<string, FlagArity>();
  for (let i = 0; i < tokens.length; i++) {
    const name = /^\[?--([a-z][a-z0-9-]*)\]?$/.exec(tokens[i])?.[1];
    if (name === undefined || arities.has(name)) continue;
    const next = tokens[i + 1] ?? '';
    arities.set(name, next === '' || next.startsWith('--') || next.startsWith('[--') || next.startsWith(']') || next.startsWith('(') ? 'boolean' : 'value');
  }
  return arities;
}

// The same contract as flagArities, for the other half of the argument list.
// Positionals are written before flags in every usage string, so the prefix
// up to the first flag is the arity: `<id>` and `["<new title>"]` are one
// slot each, `<id>...` makes the tail unbounded, and a command whose prefix
// holds no placeholder takes none. Null means unbounded.
export function positionalArity(usage: string): number | null {
  const head = usage.split('\n')[0];
  // Stop at the first flag or the first prose parenthetical, whichever comes
  // first: everything after either is describing, not declaring. A
  // `<a|b|c>` alternation names a choice among literal subcommand keywords,
  // which resolveCommand consumes before the parser sees the list, so it is
  // not a slot — counting it read `tasks spec` as taking three arguments.
  const stop = head.search(/\s(\[?--|\()/);
  const prefix = stop === -1 ? head : head.slice(0, stop);
  const slots = (prefix.match(/<[^>]+>(\.\.\.)?/g) ?? []).filter((slot) => !slot.includes('|'));
  return slots.some((slot) => slot.endsWith('...')) ? null : slots.length;
}

export interface ParsedArgs {
  parsed: Flags;
  errors: string[];
  // The names behind the `unknown flag` errors, so a caller that knows the
  // whole vocabulary can say where each one does belong. Deriving them from
  // the messages instead would make the wording of a refusal load-bearing.
  unknown: string[];
}

// Knowing a flag's arity is what lets the parser refuse rather than guess.
// A bare `--actor` used to become the string 'true' and record a holder by
// that name; a `--order` swallowed the positional that followed it. Neither
// is decidable from the argument list alone.
export function parseArgs(args: string[], arities: Map<string, FlagArity>, maxPositional: number | null): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  const errors: string[] = [];
  const unknown: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const arity = arities.get(key);
    if (arity === undefined) {
      errors.push(`unknown flag: ${arg}`);
      unknown.push(key);
      continue;
    }
    if (arity === 'boolean') {
      flags[key] = 'true';
      continue;
    }
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) {
      errors.push(`${arg} needs a value`);
      continue;
    }
    flags[key] = value;
    i++;
  }
  if (maxPositional !== null) {
    for (const extra of positional.slice(maxPositional)) errors.push(`unexpected argument: ${JSON.stringify(extra)}`);
  }
  return { parsed: { positional, flags, raw: args }, errors, unknown };
}
