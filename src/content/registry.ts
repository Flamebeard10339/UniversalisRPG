import { Action } from "../grammar/action";
import { Locales } from "./locale";
import { Namespace } from "./namespace";
import { ParsedModule } from "./universe";
import { Span } from "../grammar/parser";
import {
  ACTION_OWNER_KINDS,
  MAP_NAMES,
  registryMapOf,
  SectionMaps,
} from "./sections";
import type { Entity } from "./sections/entity";

// Every map a section kind fills, plus the four tables no single kind owns.
// The maps are not written here: each kind declares where its values land, and
// this is the union of those declarations — so a kind cannot be missing a map
// and a map cannot hold what its kind does not build.
export interface Registry extends SectionMaps {
  // Membership as a mask, so hostility is one `and`. Compiled from declaration
  // order, because names are authored and bits are not.
  factionBits: Map<string, number>;
  // The entity the runtime plays as, found by name rather than privileged: the
  // grammar reads nothing from it that it does not read from a rat.
  player?: Entity;
  namespace: Namespace;
  // The text side of the load, kept apart from every content map so that
  // loading a locale cannot reach one.
  locales: Locales;
}

export const mapOf = (
  registry: Registry,
  name: string,
): Map<string, { id?: string }> =>
  registry[name as keyof SectionMaps] as Map<string, { id?: string }>;

export const emptyMaps = (): SectionMaps =>
  Object.fromEntries(MAP_NAMES.map((name) => [name, new Map()])) as SectionMaps;

const tableOf = (
  registry: Registry,
  kind: string,
): ReadonlyMap<string, { actions?: readonly Action[] }> =>
  registry[registryMapOf(kind) as keyof SectionMaps] as ReadonlyMap<
    string,
    { actions?: readonly Action[] }
  >;

// Every table of actions a player can be offered one from, each beside the id
// that owns it — which is what lets a refusal name the module to blame.
export function everyActionTable(
  registry: Registry,
): Array<[string, string, readonly Action[]]> {
  const owned = ACTION_OWNER_KINDS.flatMap((kind) =>
    [...tableOf(registry, kind)].map(
      ([id, value]) =>
        [kind, id, value.actions ?? []] as [string, string, readonly Action[]],
    ),
  );
  return [
    ...owned,
    ...[...registry.actions].map(
      ([id, action]) =>
        ["action", id, [action]] as [string, string, readonly Action[]],
    ),
  ];
}

export type ModuleLoadStage =
  "parse" | "order" | "resolve" | "merge" | "build" | "validate";

export interface ModuleDiagnostic {
  sourceName: string;
  moduleId: string;
  stage: ModuleLoadStage;
  message: string;
  span?: Span;
  line?: number;
  column?: number;
}

export interface ModuleStatus {
  sourceName: string;
  moduleId: string;
  pack?: string;
  enabled: boolean;
  loaded: boolean;
}

export interface UniverseLoadResult {
  registry: Registry;
  diagnostics: ModuleDiagnostic[];
  modules: ModuleStatus[];
  // The modules that built this registry, in the order they were applied, so
  // that a caller needing an id, a version or a section list does not reparse.
  parsed: ParsedModule[];
  loadedModules: string[];
  disabledModules: string[];
}

// What addresses a compiled craft, on the same terms a travel is addressed: an
// id, because the label is display text no surface draws.
export const CRAFT_ADDRESS = "craft";

export function formatModuleDiagnostic(value: ModuleDiagnostic): string {
  const at =
    value.line === undefined
      ? value.sourceName
      : `${value.sourceName}:${value.line}:${value.column}`;
  return `${at} [${value.moduleId}] ${value.stage}: ${value.message}`;
}

// The well-known id the runtime plays as. It is a name, not a privilege: the
// entity it finds declares its sheet the way every other entity does.
export const PLAYER_ENTITY = "player";

// `world` takes the first bit and is what an entity naming no faction belongs
// to, which is why almost nothing needs the line: rats do not fight rats.
export const WORLD_BIT = 1;

export function factionMask(
  registry: Registry,
  entity: { faction: readonly string[] } | undefined,
): number {
  if (!entity || entity.faction.length === 0) return WORLD_BIT;
  return entity.faction.reduce(
    (mask, id) => mask | (registry.factionBits.get(id) ?? 0),
    0,
  );
}

// Two entities are hostile exactly when they share no bit.
export function hostile(
  registry: Registry,
  a: { faction: readonly string[] } | undefined,
  b: { faction: readonly string[] } | undefined,
): boolean {
  return (factionMask(registry, a) & factionMask(registry, b)) === 0;
}
