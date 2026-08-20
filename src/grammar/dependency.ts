import { DslError, Parser } from "./parser";

export type DependencyPrefix =
  "required" | "incompatible" | "unordered" | "optional" | "recommended";

// Factorio's prefixes, whose grammar this follows:
// https://lua-api.factorio.com/latest/auxiliary/mod-structure.html
const PREFIXES: Record<string, DependencyPrefix> = {
  "!": "incompatible",
  "~": "unordered",
  "?": "optional",
  "+": "recommended",
};

export type VersionOperator = "<" | "<=" | "=" | ">=" | ">";

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
      throw new DslError("expected a version like 1.0.0", {
        start: cursor.abs(cursor.pos),
        end: cursor.abs(cursor.pos),
      });
    return raw.split(".").map(Number);
  },
  print: (value) => formatVersion(value),
  examples: ["1", "0.1", "1.0.0"],
};

export const formatVersion = (value: Version): string => value.join(".");

export function compareVersions(left: Version, right: Version): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
}

export function satisfies(
  actual: Version,
  operator: VersionOperator,
  required: Version,
): boolean {
  const order = compareVersions(actual, required);
  switch (operator) {
    case "<":
      return order < 0;
    case "<=":
      return order <= 0;
    case "=":
      return order === 0;
    case ">=":
      return order >= 0;
    case ">":
      return order > 0;
  }
}

export function formatDependency(value: Dependency): string {
  const symbol = Object.keys(PREFIXES).find(
    (key) => PREFIXES[key] === value.prefix,
  );
  const head =
    symbol === undefined ? value.module : `${symbol} ${value.module}`;
  return value.operator === undefined
    ? head
    : `${head} ${value.operator} ${formatVersion(value.version!)}`;
}

export const dependency: Parser<Dependency> = {
  parse(cursor) {
    const symbol = cursor.take(/[!~?+]/);
    cursor.take(/[ \t]*/);
    const module = cursor.take(/[a-z][a-z0-9-]*/);
    if (module === null)
      throw new DslError("expected a module id", {
        start: cursor.abs(cursor.pos),
        end: cursor.abs(cursor.pos),
      });

    const prefix = symbol === null ? "required" : PREFIXES[symbol];
    cursor.take(/[ \t]*/);
    const operator = cursor.take(/<=|>=|<|=|>/) as VersionOperator | null;
    if (operator === null) return { prefix, module };
    cursor.take(/[ \t]*/);
    return { prefix, module, operator, version: version.parse(cursor) };
  },
  print: (value) => formatDependency(value),
  examples: [
    "core",
    "! oldmod",
    "~ other",
    "? extras",
    "+ nice",
    "? extras >= 1.2.0",
    "core = 2.0.0",
  ],
};
