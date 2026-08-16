import type { ModuleDiagnostic, Registry, UniverseLoadResult } from './registry';
import { registryDiff } from './registryDiff';
import { serializeRegistryModule, type SerializeModuleOptions } from './serialize';
import { GLOBAL_SECTION_KINDS } from './namespace';
import type { ModuleSource, ParsedModule } from './universe';

export interface RoundTrip {
  printed: string;
  diagnostics: ModuleDiagnostic[];
  differences: string[];
}

export function declaredGlobalIds(module: ParsedModule): string[] {
  return module.sections
    .filter((section) => GLOBAL_SECTION_KINDS.includes(section.kind))
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

export interface Republished {
  // Null when the round trip refused, which is a caller's cue to publish the
  // author's own bytes rather than a print that would lose something.
  printed: string | null;
  diagnostics: ModuleDiagnostic[];
  differences: string[];
}

// A module serialized under an id other than the one it loaded under. The round
// trip is taken first and under the loaded id, because that is the only
// comparison whose two sides hold the same keys: renaming a module moves the
// compiled locale keys and inline action ids with it, and a diff against a
// hand-renamed registry reports every one of those as a loss. What the trip
// proves is the thing the rename does not touch — that the serializer carries
// this module whole, which is what an edit to another module's content is not.
export function republishModule(
  loaded: Registry,
  options: SerializeModuleOptions,
  reload: (printed: string) => UniverseLoadResult,
  as: { registry: Registry; options: SerializeModuleOptions },
): Republished {
  const trip = roundTripModule(loaded, options, reload);
  if (trip.diagnostics.length > 0 || trip.differences.length > 0) return { printed: null, diagnostics: trip.diagnostics, differences: trip.differences };
  return { printed: serializeRegistryModule(as.registry, as.options), diagnostics: [], differences: [] };
}

// Deliberately not a RoundTrip. A universe has no single reloadable text — the
// concatenation of several modules declares `# info` more than once and will not
// load — so `printed` would carry a second meaning on an inherited field.
export interface UniverseRoundTrip {
  sources: ModuleSource[];
  diagnostics: ModuleDiagnostic[];
  differences: string[];
}

// Every source is replaced at once. A module is serialized from the merged
// registry, so it already carries what other modules did to its ids; leaving any
// original source in the reload would apply those edits a second time.
export function roundTripUniverse(loaded: Registry, modules: readonly ParsedModule[], reload: (printed: readonly ModuleSource[]) => UniverseLoadResult): UniverseRoundTrip {
  const sources = modules.map((module) => ({ ...module.source, text: serializeRegistryModule(loaded, { info: module.info, globals: declaredGlobalIds(module) }) }));
  const { diagnostics, differences } = compare(loaded, '', reload(sources));
  return { sources, diagnostics, differences };
}

export const canSerialize = (module: ParsedModule): boolean => module.namespace !== null;
