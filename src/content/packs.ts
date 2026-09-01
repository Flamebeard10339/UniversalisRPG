import type { ModuleStatus } from './registry';

export interface PortalModule {
  readonly name: string;
  readonly id: string;
  readonly on: boolean;
  readonly loaded: boolean;
}

export type Standing = 'all' | 'none' | 'some';

export interface PortalPack {
  readonly pack: string;
  readonly modules: readonly PortalModule[];
  readonly standing: Standing;
}

const standingOf = (modules: readonly PortalModule[]): Standing => {
  if (modules.every((module) => module.on)) return 'all';
  if (modules.every((module) => !module.on)) return 'none';
  return 'some';
};

export function packsOf(statuses: readonly ModuleStatus[]): readonly PortalPack[] {
  const held = new Map<string, PortalModule[]>();
  for (const status of statuses) {
    const module: PortalModule = { name: status.sourceName, id: status.moduleId, on: status.enabled, loaded: status.loaded };
    const pack = status.pack ?? status.moduleId;
    held.set(pack, [...(held.get(pack) ?? []), module]);
  }
  return [...held.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([pack, modules]) => {
      const sorted = [...modules].sort((left, right) => left.id.localeCompare(right.id));
      return { pack, modules: sorted, standing: standingOf(sorted) };
    });
}

export function modulesNamed(statuses: readonly ModuleStatus[], names: readonly string[]): string[] {
  const packs = packsOf(statuses);
  const found = names.flatMap((name) => {
    const pack = packs.find((each) => each.pack === name);
    if (pack) return pack.modules.map((module) => module.name);
    const module = packs.flatMap((each) => each.modules).find((each) => each.name === name || each.id === name);
    if (module) return [module.name];
    throw new Error(`no pack or module is called ${name}. There is ${packs.map((each) => each.pack).join(', ')}`);
  });
  return [...new Set(found)].sort();
}

export const modulesOff = (packs: readonly PortalPack[]): readonly string[] => packs.flatMap((pack) => pack.modules.filter((module) => !module.on).map((module) => module.name));

export function turned(off: Iterable<string>, names: readonly string[], on: boolean): string[] {
  const next = new Set(off);
  for (const name of names) {
    if (on) next.delete(name);
    else next.add(name);
  }
  return [...next].sort();
}

export const packTurnsTo = (pack: PortalPack): boolean => pack.standing !== 'all';

export const refused = (packs: readonly PortalPack[]): readonly PortalModule[] => packs.flatMap((pack) => pack.modules.filter((module) => module.on && !module.loaded));
