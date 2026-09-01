import { parseModuleSource, type ModuleSource } from './universe';

const mustLoad = (prefix: string): boolean => prefix !== 'optional' && prefix !== 'recommended' && prefix !== 'incompatible';

interface Reading {
  closureOf: (id: string) => Set<string>;
  owners: readonly string[];
}

function reading(sources: readonly ModuleSource[]): Reading {
  const parsed = sources.map(parseModuleSource);
  const byId = new Map(parsed.map((module) => [module.info.id, module]));
  const closureOf = (id: string): Set<string> => {
    const closure = new Set<string>();
    const visit = (each: string): void => {
      if (closure.has(each)) return;
      closure.add(each);
      for (const dependency of byId.get(each)?.info.dependencies ?? []) {
        if (mustLoad(dependency.prefix)) visit(dependency.module);
      }
    };
    visit(id);
    return closure;
  };
  const owners = parsed.filter((module) => module.sections.some((section) => section.kind === 'location' && (section.value as { starting?: boolean }).starting === true)).map((module) => module.info.id);
  return { closureOf, owners };
}

export function worldWithin(sources: readonly ModuleSource[], id: string): readonly ModuleSource[] {
  const held = reading(sources).closureOf(id);
  return sources.filter((source) => held.has(source.name));
}

export function standingClosure(sources: readonly ModuleSource[]): ReadonlySet<string> {
  const { closureOf, owners } = reading(sources);
  if (owners.length === 0) throw new Error('worlds: no module declares a starting # location');

  const worlds = owners.map(closureOf);
  const smallest = worlds.reduce((least, each) => (each.size < least.size ? each : least));
  const stranded = owners.filter((_, at) => ![...smallest].every((id) => worlds[at]!.has(id)));
  if (stranded.length > 0) throw new Error(`worlds: ${stranded.join(', ')} mark a # location starting and their worlds do not nest with the smallest, so there is no one minimum world`);
  return smallest;
}

export function standingWithin(sources: readonly ModuleSource[]): readonly ModuleSource[] {
  const closure = standingClosure(sources);
  return sources.filter((source) => closure.has(source.name));
}

export const rootModules = (sources: readonly ModuleSource[]): readonly string[] =>
  sources.map(parseModuleSource).filter((module) => module.info.dependencies.every((dependency) => !mustLoad(dependency.prefix))).map((module) => module.info.id);
