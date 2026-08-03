import type { ModuleDiagnostic, Registry, UniverseLoadResult } from './registry';
import { registryDiff } from './registryDiff';
import { serializeRegistryModule, type SerializeModuleOptions } from './serialize';
import type { ModuleSource, ParsedModule } from './universe';

export interface RoundTrip {
  printed: string;
  diagnostics: ModuleDiagnostic[];
  differences: string[];
}

export function declaredVariableIds(module: ParsedModule): string[] {
  return module.sections
    .filter((section) => section.kind === 'variable')
    .map((section) => (section.value as { id: string }).id)
    .sort();
}

function compare(loaded: Registry, printed: string, checked: UniverseLoadResult): RoundTrip {
  if (checked.diagnostics.length > 0) return { printed, diagnostics: checked.diagnostics, differences: [] };
  return { printed, diagnostics: [], differences: registryDiff(loaded, checked.registry) };
}

// The reload is supplied rather than performed: a caller decides which other
// sources the printed module is reloaded beside, and squashing reloads against
// a different set than probing does.
export function roundTripModule(loaded: Registry, options: SerializeModuleOptions, reload: (printed: string) => UniverseLoadResult): RoundTrip {
  const printed = serializeRegistryModule(loaded, options);
  return compare(loaded, printed, reload(printed));
}

export interface UniverseRoundTrip extends RoundTrip {
  sources: ModuleSource[];
}

// Every source is replaced at once. A module is serialized from the merged
// registry, so it already carries what other modules did to its ids; leaving any
// original source in the reload would apply those edits a second time.
export function roundTripUniverse(loaded: Registry, modules: readonly ParsedModule[], reload: (printed: readonly ModuleSource[]) => UniverseLoadResult): UniverseRoundTrip {
  const sources = modules.map((module) => ({ ...module.source, text: serializeRegistryModule(loaded, { info: module.info, globalVariables: declaredVariableIds(module) }) }));
  const printed = sources.map((source) => `// --- ${source.name} ---\n${source.text}`).join('\n');
  return { ...compare(loaded, printed, reload(sources)), sources };
}

export const canSerialize = (module: ParsedModule): boolean => module.namespace !== null;
