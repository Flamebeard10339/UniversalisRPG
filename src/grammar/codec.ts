import { matches, paired } from './form';
import { Parser, Written, parseWhole } from './parser';

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
    (value as Parser<unknown>).within?.forEach((held, at) => visit(`${name}.within.${at}`, held));
  };
  for (const [name, value] of roots) visit(name, value);
  return found;
}

export const exportedCodecs = (modules: Record<string, object>): Map<Parser<unknown>, string> => reachableCodecs(Object.entries(modules).flatMap(([path, module]) => Object.entries(module).map(([name, value]) => [`${path}#${name}`, value] as const)));

export function formFailures(name: string, forms: readonly string[], examples: readonly string[]): string[] {
  if (forms.length === 0) return [`${name} shows no form`];
  const problems = [
    ...examples.filter((example) => !forms.some((form) => matches(form, example))).map((example) => `${name}: ${JSON.stringify(example)} is none of the shapes ${forms.join(' | ')}`),
    ...forms.filter((form) => !examples.some((example) => matches(form, example))).map((form) => `${name}: the shape ${JSON.stringify(form)} is shown with nothing that has it`),
  ];
  if (examples[0] !== undefined && !matches(forms[0]!, examples[0])) problems.push(`${name}: ${JSON.stringify(examples[0])} leads with a shape other than ${JSON.stringify(forms[0])}`);
  return problems;
}

export const shapeFailures = (codecs: Map<Parser<unknown>, string>): string[] => [...codecs].flatMap(([parser, name]) => formFailures(name, parser.forms, parser.examples));

export const writtenFrom = (parser: Parser<unknown>): Written[] => paired(parser.forms, parser.examples).map((example, at) => ({ form: parser.forms[at]!, example: example ?? parser.forms[at]! }));

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
