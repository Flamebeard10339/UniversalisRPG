import { formatDependency, formatVersion, satisfies } from '../grammar/dependency';
import { ModuleInfo, infoSchema } from './info';
import { ModuleSection, SECTION_KINDS, parseModule } from './module';
import { DslError } from '../grammar/parser';
import { Authored, hydrateSection } from '../grammar/section';

export interface ModuleSource {
  name: string;
  text: string;
}

export interface ParsedModule {
  info: ModuleInfo;
  sections: ModuleSection[];
}

const RESERVED_IDS: readonly string[] = [...SECTION_KINDS, 'player', 'skills', 'self', 'time'];

const MODULE_ID = /^[a-z][a-z0-9-]*$/;

export function parseModuleSource(source: ModuleSource): ParsedModule {
  const parsed = parseModule(source.text);
  const infos = parsed.filter((section) => section.kind === 'info');
  if (infos.length > 1) throw new DslError(`module ${source.name} declares # info more than once`);

  const authored = (infos[0]?.value ?? { id: source.name }) as Authored<ModuleInfo>;
  const info = hydrateSection(authored, infoSchema);
  if (!MODULE_ID.test(info.id)) throw new DslError(`${info.id} is not a usable module id`);
  if (RESERVED_IDS.includes(info.id)) throw new DslError(`${info.id} is a reserved module id`);

  return { info, sections: parsed.filter((section) => section.kind !== 'info') };
}

function loadsAfter(module: ParsedModule, loaded: ReadonlyMap<string, ParsedModule>): Set<string> {
  const where = `# info ${module.info.id} dependencies:`;
  const before = new Set<string>();

  for (const declared of module.info.dependencies) {
    const present = loaded.get(declared.module);
    if (declared.prefix === 'incompatible') {
      if (present) throw new DslError(`${where} ${module.info.id} is incompatible with ${declared.module}, which is loaded`);
      continue;
    }
    if (!present) {
      if (declared.prefix === 'optional' || declared.prefix === 'recommended') continue;
      throw new DslError(`${where} names a module that is not loaded: ${formatDependency(declared)}`);
    }
    if (declared.operator && !satisfies(present.info.version, declared.operator, declared.version!)) {
      throw new DslError(`${where} needs ${formatDependency(declared)}, but ${declared.module} ${formatVersion(present.info.version)} is loaded`);
    }
    if (declared.prefix !== 'unordered') before.add(declared.module);
    // `~` is deliberately absent: it requires the module without ordering against it
  }
  return before;
}

// Lexicographically smallest topological order
export function orderModules(modules: readonly ParsedModule[]): ParsedModule[] {
  const byId = new Map<string, ParsedModule>();
  for (const module of modules) {
    if (byId.has(module.info.id)) throw new DslError(`two modules declare the id ${module.info.id}`);
    byId.set(module.info.id, module);
  }

  const after = new Map<string, Set<string>>();
  for (const module of modules) after.set(module.info.id, loadsAfter(module, byId));

  const pending = new Set(byId.keys());
  const ordered: ParsedModule[] = [];
  while (pending.size > 0) {
    const ready = [...pending].filter((id) => ![...after.get(id)!].some((dependency) => pending.has(dependency))).sort();
    if (ready.length === 0) {
      throw new DslError(`modules depend on each other in a cycle: ${[...pending].sort().join(', ')}. Use ~ for a dependency that need not load first.`);
    }
    pending.delete(ready[0]);
    ordered.push(byId.get(ready[0])!);
  }
  return ordered;
}

export const parseUniverse = (sources: readonly ModuleSource[]): ParsedModule[] => orderModules(sources.map(parseModuleSource));
