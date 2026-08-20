import { Parser, parseWhole } from './parser';

export function isCodec(value: unknown): value is Parser<unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Parser<unknown>>;
  return typeof candidate.parse === 'function' && typeof candidate.print === 'function' && Array.isArray(candidate.examples);
}

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

export const exportedCodecs = (modules: Record<string, object>): Map<Parser<unknown>, string> => reachableCodecs(Object.entries(modules).flatMap(([path, module]) => Object.entries(module).map(([name, value]) => [`${path}#${name}`, value] as const)));

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

export const collectionFailures = (codecs: Map<Parser<unknown>, string>): string[] => [...codecs].flatMap(([parser, name]) => roundTripFailures(name, parser));
