import { parseModuleSource, type ModuleSource } from './universe';

// What a set of modules makes a world out of, answered over the sources themselves rather than over
// a directory. `shipped.ts` reads the corpus and `worldFixture.ts` reads the engine's own; both ask
// here what those sources hold, so the derivation is one thing that can be handed sources written to
// prove it rather than a reading only the corpus can exercise.

const mustLoad = (prefix: string): boolean => prefix !== 'optional' && prefix !== 'recommended' && prefix !== 'incompatible';

interface Reading {
  closureOf: (id: string) => Set<string>;
  owners: readonly string[];
}

// A module's world is that module plus every dependency the loader would refuse to start it
// without, and the modules that could open one are whichever mark a # location starting. Both are
// read off the sources rather than named, so a module split again moves with no edit here.
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

// One module and everything the loader would refuse to start it without, in the order the sources
// were given. What a test that wants a particular module's world asks for, by naming that module.
export function worldWithin(sources: readonly ModuleSource[], id: string): readonly ModuleSource[] {
  const held = reading(sources).closureOf(id);
  return sources.filter((source) => held.has(source.name));
}

// The smallest world with somewhere to stand. More than one module may mark a starting # location,
// because a module loading over another may take the keyword back and put it on a place of its own
// — which is how a tutorial opens somewhere the town it is written into does not. Each such module
// carries its own world and every one of them stands, so the minimum is the smallest of them; two
// that did not nest would be two worlds rather than one world and a layer over it, and there is
// nothing here that could choose between them.
export function standingClosure(sources: readonly ModuleSource[]): ReadonlySet<string> {
  const { closureOf, owners } = reading(sources);
  if (owners.length === 0) throw new Error('worlds: no module declares a starting # location');

  const worlds = owners.map(closureOf);
  const smallest = worlds.reduce((least, each) => (each.size < least.size ? each : least));
  const stranded = owners.filter((_, at) => ![...smallest].every((id) => worlds[at]!.has(id)));
  if (stranded.length > 0) throw new Error(`worlds: ${stranded.join(', ')} mark a # location starting and their worlds do not nest with the smallest, so there is no one minimum world`);
  return smallest;
}

// The minimum world with somewhere to stand, out of the sources given.
export function standingWithin(sources: readonly ModuleSource[]): readonly ModuleSource[] {
  const closure = standingClosure(sources);
  return sources.filter((source) => closure.has(source.name));
}

// Every module that leans on nothing, so nothing loads before it and it has to load alone or not at
// all.
export const rootModules = (sources: readonly ModuleSource[]): readonly string[] =>
  sources.map(parseModuleSource).filter((module) => module.info.dependencies.every((dependency) => !mustLoad(dependency.prefix))).map((module) => module.info.id);
