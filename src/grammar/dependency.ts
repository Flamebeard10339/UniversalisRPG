import { DslError, Parser } from './parser';

export type DependencyPrefix = 'required' | 'incompatible' | 'unordered' | 'optional' | 'recommended';

const REQUIRED = 'it must be loaded, and this module is read after it';

const PREFIXES: Record<string, { name: DependencyPrefix; does: string }> = {
  '!': { name: 'incompatible', does: 'the world is refused where that module is loaded' },
  '~': { name: 'unordered', does: 'it must be loaded, and neither module is read before the other' },
  '?': { name: 'optional', does: 'it may be absent, and while it is, every id written here that names it is dropped, taking whatever will not stand without it' },
  '+': { name: 'recommended', does: 'read exactly as ? is' },
};

const named = (symbol: string): DependencyPrefix => PREFIXES[symbol]!.name;

export const PREFIX_MEANINGS = (): string =>
  `a bare name is required — ${REQUIRED}; ${Object.entries(PREFIXES).map(([symbol, { name, does }]) => `${symbol} ${name} — ${does}`).join('; ')}`;

export type VersionOperator = '<' | '<=' | '=' | '>=' | '>';

export type Version = readonly number[];

export interface Dependency {
  prefix: DependencyPrefix;
  module: string;
  operator?: VersionOperator;
  version?: Version;
}

export const version: Parser<Version> = {
  parse(cursor) {
    const raw = cursor.take(/\d+(?:\.\d+)*/);
    if (raw === null)
      throw new DslError('expected a version like 1.0.0', {
        start: cursor.abs(cursor.pos),
        end: cursor.abs(cursor.pos),
      });
    return raw.split('.').map(Number);
  },
  print: (value) => formatVersion(value),
  forms: ['<major>', '<major>.<minor>', '<major>.<minor>.<patch>'],
  examples: ['1', '0.1', '1.0.0'],
};

export const formatVersion = (value: Version): string => value.join('.');

export function compareVersions(left: Version, right: Version): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
}

export function satisfies(actual: Version, operator: VersionOperator, required: Version): boolean {
  const order = compareVersions(actual, required);
  switch (operator) {
    case '<':
      return order < 0;
    case '<=':
      return order <= 0;
    case '=':
      return order === 0;
    case '>=':
      return order >= 0;
    case '>':
      return order > 0;
  }
}

export function formatDependency(value: Dependency): string {
  const symbol = Object.keys(PREFIXES).find((key) => named(key) === value.prefix);
  const head = symbol === undefined ? value.module : `${symbol} ${value.module}`;
  return value.operator === undefined ? head : `${head} ${value.operator} ${formatVersion(value.version!)}`;
}

export const dependency: Parser<Dependency> = {
  parse(cursor) {
    const symbol = cursor.take(/[!~?+]/);
    cursor.take(/[ \t]*/);
    const module = cursor.take(/[a-z][a-z0-9-]*/);
    if (module === null)
      throw new DslError('expected a module id', {
        start: cursor.abs(cursor.pos),
        end: cursor.abs(cursor.pos),
      });

    const prefix = symbol === null ? 'required' : named(symbol);
    cursor.take(/[ \t]*/);
    const operator = cursor.take(/<=|>=|<|=|>/) as VersionOperator | null;
    if (operator === null) return { prefix, module };
    cursor.take(/[ \t]*/);
    return { prefix, module, operator, version: version.parse(cursor) };
  },
  print: (value) => formatDependency(value),
  forms: ['<module>', ...Object.keys(PREFIXES).map((symbol) => `${symbol} <module>`), '<module> <comparison> <version>'],
  // The example is what says which sigil means what, so it is written out of `PREFIXES` and a sigil added there arrives here saying its own name.
  examples: ['core', ...Object.keys(PREFIXES).map((symbol) => `${symbol} some-${named(symbol)}-module`), 'core >= 1.2.0'],
};
