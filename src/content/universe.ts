import { ENGINE_ROOTS } from "../grammar/condition";
import {
  formatDependency,
  formatVersion,
  satisfies,
} from "../grammar/dependency";
import { ModuleInfo, info as infoSection } from "./sections/info";
import { DEFAULT_CONTEXT } from "../grammar/section";
import { ModuleSection, parseModule } from "./sections";
import { SECTION_KINDS } from "./sections";
import { DslError } from "../grammar/parser";
import { Authored } from "../grammar/section";

export interface ModuleSource {
  name: string;
  text: string;
  enabled?: boolean;
}

export interface ParsedModule {
  source: ModuleSource;
  info: ModuleInfo;
  // The prefix every id this module declares hangs under. A module that declares
  // no `# info` has no identity to namespace with, so its ids are root ids —
  // which is only safe alone, and `orderModules` is where that is enforced.
  namespace: string | null;
  sections: ModuleSection[];
}

export interface ModuleOrderProblem {
  module: ParsedModule;
  error: DslError;
}

// A module id may not shadow a section kind, a root the engine owns, or `self`.
// Taken from the engine's own list rather than restated, so the two cannot drift
// — `skills` sat here for a while and is not a root at all.
const RESERVED_IDS: readonly string[] = [
  ...SECTION_KINDS,
  ...ENGINE_ROOTS,
  "self",
];

const MODULE_ID = /^[a-z][a-z0-9-]*$/;

export function parseModuleSource(source: ModuleSource): ParsedModule {
  const parsed = parseModule(source.text);
  const infos = parsed.filter((section) => section.kind === "info");
  if (infos.length > 1)
    throw new DslError(`module ${source.name} declares # info more than once`);

  const authored = (infos[0]?.value ?? {
    id: source.name,
  }) as Authored<ModuleInfo>;
  const info = infoSection.build(authored, DEFAULT_CONTEXT);
  if (!MODULE_ID.test(info.id))
    throw new DslError(`${info.id} is not a usable module id`);
  if (RESERVED_IDS.includes(info.id))
    throw new DslError(`${info.id} is a reserved module id`);

  return {
    source,
    info,
    namespace: infos.length > 0 ? info.id : null,
    sections: parsed.filter((section) => section.kind !== "info"),
  };
}

function dependencyError(
  module: ParsedModule,
  loaded: ReadonlyMap<string, ParsedModule>,
): DslError | null {
  const where = `# info ${module.info.id} dependencies:`;
  for (const declared of module.info.dependencies) {
    const present = loaded.get(declared.module);
    if (declared.prefix === "incompatible") {
      if (present)
        return new DslError(
          `${where} ${module.info.id} is incompatible with ${declared.module}, which is loaded`,
        );
      continue;
    }
    if (!present) {
      if (declared.prefix === "optional" || declared.prefix === "recommended")
        continue;
      return new DslError(
        `${where} names a module that is not loaded: ${formatDependency(declared)}`,
      );
    }
    if (
      declared.operator &&
      !satisfies(present.info.version, declared.operator, declared.version!)
    ) {
      return new DslError(
        `${where} needs ${formatDependency(declared)}, but ${declared.module} ${formatVersion(present.info.version)} is loaded`,
      );
    }
  }
  return null;
}

function loadsAfter(
  module: ParsedModule,
  loaded: ReadonlyMap<string, ParsedModule>,
): Set<string> {
  const before = new Set<string>();
  for (const declared of module.info.dependencies) {
    if (declared.prefix === "incompatible") continue;
    const present = loaded.get(declared.module);
    if (!present) continue;
    if (
      declared.operator &&
      !satisfies(present.info.version, declared.operator, declared.version!)
    )
      continue;
    if (declared.prefix !== "unordered") before.add(declared.module);
  }
  return before;
}

function cyclicModuleIds(
  after: ReadonlyMap<string, ReadonlySet<string>>,
): string[] {
  let nextIndex = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const stacked = new Set<string>();
  const cyclic = new Set<string>();

  const visit = (id: string): void => {
    index.set(id, nextIndex);
    low.set(id, nextIndex);
    nextIndex++;
    stack.push(id);
    stacked.add(id);

    for (const dependency of after.get(id) ?? []) {
      if (!after.has(dependency)) continue;
      if (!index.has(dependency)) {
        visit(dependency);
        low.set(id, Math.min(low.get(id)!, low.get(dependency)!));
      } else if (stacked.has(dependency)) {
        low.set(id, Math.min(low.get(id)!, index.get(dependency)!));
      }
    }

    if (low.get(id) !== index.get(id)) return;
    const component: string[] = [];
    for (;;) {
      const popped = stack.pop()!;
      stacked.delete(popped);
      component.push(popped);
      if (popped === id) break;
    }
    if (component.length > 1 || (after.get(id)?.has(id) ?? false))
      for (const each of component) cyclic.add(each);
  };

  for (const id of [...after.keys()].sort()) if (!index.has(id)) visit(id);
  return [...cyclic].sort();
}

export function moduleOrderProblems(
  modules: readonly ParsedModule[],
): ModuleOrderProblem[] {
  const byId = new Map<string, ParsedModule>();
  const duplicateIds = new Set<string>();
  for (const module of modules) {
    if (byId.has(module.info.id)) duplicateIds.add(module.info.id);
    byId.set(module.info.id, module);
  }
  if (duplicateIds.size > 0) {
    return modules
      .filter((module) => duplicateIds.has(module.info.id))
      .map((module) => ({
        module,
        error: new DslError(`two modules declare the id ${module.info.id}`),
      }));
  }

  // A module that is nothing but translations declares no id, so it is not one
  // of the modules an unnamespaced module has to be kept apart from.
  const declaring = modules.filter((module) =>
    module.sections.some((section) => section.kind !== "locale"),
  );
  const unnamed = declaring.filter((module) => module.namespace === null);
  if (declaring.length > 1 && unnamed.length > 0) {
    return unnamed.map((module) => ({
      module,
      error: new DslError(
        `${module.info.id} declares no # info, so its ids have no namespace to keep them apart from the other ${declaring.length - 1} module(s) loaded`,
      ),
    }));
  }

  const dependencyProblems = modules.flatMap((module) => {
    const error = dependencyError(module, byId);
    return error ? [{ module, error }] : [];
  });
  if (dependencyProblems.length > 0) return dependencyProblems;

  const after = new Map<string, Set<string>>();
  for (const module of modules)
    after.set(module.info.id, loadsAfter(module, byId));
  const cyclic = new Set(cyclicModuleIds(after));
  if (cyclic.size === 0) return [];

  const message = `modules depend on each other in a cycle: ${[...cyclic].sort().join(", ")}. Use ~ for a dependency that need not load first.`;
  return modules
    .filter((module) => cyclic.has(module.info.id))
    .map((module) => ({ module, error: new DslError(message) }));
}

// Lexicographically smallest topological order
export function orderModules(modules: readonly ParsedModule[]): ParsedModule[] {
  const problems = moduleOrderProblems(modules);
  if (problems.length > 0) throw problems[0].error;

  const byId = new Map<string, ParsedModule>();
  for (const module of modules) byId.set(module.info.id, module);

  const after = new Map<string, Set<string>>();
  for (const module of modules)
    after.set(module.info.id, loadsAfter(module, byId));

  const pending = new Set(byId.keys());
  const ordered: ParsedModule[] = [];
  while (pending.size > 0) {
    const ready = [...pending]
      .filter(
        (id) =>
          ![...after.get(id)!].some((dependency) => pending.has(dependency)),
      )
      .sort();
    if (ready.length === 0) {
      throw new DslError(
        `modules depend on each other in a cycle: ${[...pending].sort().join(", ")}. Use ~ for a dependency that need not load first.`,
      );
    }
    pending.delete(ready[0]);
    ordered.push(byId.get(ready[0])!);
  }
  return ordered;
}

export const parseUniverse = (
  sources: readonly ModuleSource[],
): ParsedModule[] => orderModules(sources.map(parseModuleSource));
