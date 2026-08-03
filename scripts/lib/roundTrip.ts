import type { ModuleDiagnostic, Registry, UniverseLoadResult } from '../../src/content/registry';
import { registryDiff } from '../../src/content/registryDiff';
import { serializeRegistryModule, type SerializeModuleOptions } from '../../src/content/serialize';

export interface RoundTrip {
  printed: string;
  diagnostics: ModuleDiagnostic[];
  differences: string[];
}

// The reload is supplied rather than performed: a caller decides which other
// sources the printed module is reloaded beside, and squashing reloads against
// a different set than probing does.
export function roundTripModule(loaded: Registry, options: SerializeModuleOptions, reload: (printed: string) => UniverseLoadResult): RoundTrip {
  const printed = serializeRegistryModule(loaded, options);
  const checked = reload(printed);
  // A registry that failed to load has nothing to say about what the serializer
  // preserved, so diagnostics end the check rather than joining a diff.
  if (checked.diagnostics.length > 0) return { printed, diagnostics: checked.diagnostics, differences: [] };
  return { printed, diagnostics: [], differences: registryDiff(loaded, checked.registry) };
}
