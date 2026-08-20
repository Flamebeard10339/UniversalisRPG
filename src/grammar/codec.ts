import { Parser, parseWhole } from './parser';

// A parser is a codec, so the question "is this one" is answerable of any value
// a walk turns up. Structural rather than nominal, because the walk reads module
// exports and schema fields, neither of which carries the type.
export function isCodec(value: unknown): value is Parser<unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Parser<unknown>>;
  return typeof candidate.parse === 'function' && typeof candidate.print === 'function' && Array.isArray(candidate.examples);
}

// Every codec reachable from named roots, each under the name it was reached by,
// following a list parser to its element so a `list(tagClause)` is not the end of
// the walk. Object identity is the key: two `list(id)` calls are two codecs and
// both are subjects.
export function reachableCodecs(roots: Iterable<readonly [string, unknown]>): Map<Parser<unknown>, string> {
  const found = new Map<Parser<unknown>, string>();
  const visit = (name: string, value: unknown): void => {
    if (!isCodec(value) || found.has(value)) return;
    found.set(value, name);
    visit(`${name}.element`, (value as { element?: unknown }).element);
  };
  for (const [name, value] of roots) visit(name, value);
  return found;
}

// The codecs a set of loaded modules exports, which is what an eager glob over a
// directory hands back. A parser written next month is a subject the moment it
// is exported, with no edit here and none at the call site.
export const exportedCodecs = (modules: Record<string, object>): Map<Parser<unknown>, string> => reachableCodecs(Object.entries(modules).flatMap(([path, module]) => Object.entries(module).map(([name, value]) => [`${path}#${name}`, value] as const)));

// The law, stated once: an example is a spelling this parser both reads and
// writes, so parsing it and printing the result returns the same text. Returns
// the examples that failed and what came back, so a failure names the spelling
// rather than only the count.
export function roundTripFailures(name: string, parser: Parser<unknown>): string[] {
  if (parser.examples.length === 0) return [`${name} carries no examples`];
  return parser.examples.flatMap((example) => {
    let printed: string;
    try {
      printed = parser.print(parseWhole(parser, example, 0, 'an example'));
    } catch (error) {
      return [`${name}: ${JSON.stringify(example)} threw ${error instanceof Error ? error.message : String(error)}`];
    }
    return printed === example ? [] : [`${name}: ${JSON.stringify(example)} printed back as ${JSON.stringify(printed)}`];
  });
}

// Every failure over a whole collection, so the assertion is one list rather
// than one case per parser — which is what lets the subjects be the collection.
export const collectionFailures = (codecs: Map<Parser<unknown>, string>): string[] => [...codecs].flatMap(([parser, name]) => roundTripFailures(name, parser));
