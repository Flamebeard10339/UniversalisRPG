import { Action } from '../grammar/action';
import { Locales } from './locale';
import { Namespace } from './namespace';
import { ParsedModule } from './universe';
import { Span } from '../grammar/parser';
import { actionOwnerKinds, mapNames, registryMapOf, SectionMaps } from './sections';
import type { Entity } from './sections/entity';
import type { Edge } from './sections/location';

export interface Registry extends SectionMaps {
  factionBits: Map<string, number>;
  player?: Entity;
  namespace: Namespace;
  locales: Locales;
  roads: ReadonlyMap<string, readonly Edge[]>;
}

export function startingLocationId(registry: Registry): string | undefined {
  return [...registry.locations.values()].find((location) => location.starting)?.id;
}

export const mapOf = (registry: Registry, name: string): Map<string, { id?: string }> => registry[name as keyof SectionMaps] as Map<string, { id?: string }>;

export const emptyMaps = (): SectionMaps => Object.fromEntries(mapNames().map((name) => [name, new Map()])) as SectionMaps;

const tableOf = (registry: Registry, kind: string): ReadonlyMap<string, { actions?: readonly Action[] }> => registry[registryMapOf(kind) as keyof SectionMaps] as ReadonlyMap<string, { actions?: readonly Action[] }>;

export function everyActionTable(registry: Registry): Array<[string, string, readonly Action[]]> {
  const owned = actionOwnerKinds().flatMap((kind) => [...tableOf(registry, kind)].map(([id, value]) => [kind, id, value.actions ?? []] as [string, string, readonly Action[]]));
  return [...owned, ...[...registry.actions].map(([id, action]) => ['action', id, [action]] as [string, string, readonly Action[]])];
}

export type ModuleLoadStage = 'parse' | 'order' | 'resolve' | 'merge' | 'build' | 'validate';

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
  parsed: ParsedModule[];
  loadedModules: string[];
  disabledModules: string[];
}

export function formatModuleDiagnostic(value: ModuleDiagnostic): string {
  const at = value.line === undefined ? value.sourceName : `${value.sourceName}:${value.line}:${value.column}`;
  return `${at} [${value.moduleId}] ${value.stage}: ${value.message}`;
}

export const PLAYER_ENTITY = 'player';

export const WORLD_BIT = 1;

export function factionMask(registry: Registry, entity: { faction: readonly string[] } | undefined): number {
  if (!entity || entity.faction.length === 0) return WORLD_BIT;
  return entity.faction.reduce((mask, id) => mask | (registry.factionBits.get(id) ?? 0), 0);
}

export function hostile(registry: Registry, a: { faction: readonly string[] } | undefined, b: { faction: readonly string[] } | undefined): boolean {
  return (factionMask(registry, a) & factionMask(registry, b)) === 0;
}
