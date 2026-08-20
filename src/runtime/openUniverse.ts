import { LOCAL_CHANGES_MODULE_ID, renderLocalChangesModule } from '../content/localChanges';
import { formatModuleDiagnostic, type Registry } from '../content/registry';
import { loadUniverseWithDiagnostics } from '../content/load';
import type { ModuleSource } from '../content/universe';
import type { Answer } from './localized';
import { startingLocationId } from './save';
import { entitledSlot, type SaveContext } from './saveSlots';
import { startSession, type PlaySession } from './session';

export interface UniverseProblem {
  modules: readonly Answer[];
  words: 'tool';
  message: string;
}

export interface Requirement {
  id: string;
  unmet: string;
  met(registry: Registry): boolean;
}

export const REQUIREMENTS = [
  {
    id: 'starting-location',
    unmet: 'no # location is marked starting, so a new game has nowhere to begin',
    met: (registry: Registry) => startingLocationId(registry) !== undefined,
  },
] as const satisfies readonly Requirement[];

export type RequirementId = (typeof REQUIREMENTS)[number]['id'];

export const FALLBACK_MODULE_ID = 'nothing-opened';

export const FALLBACK_SOURCE: ModuleSource = {
  name: FALLBACK_MODULE_ID,
  text: [
    `# info ${FALLBACK_MODULE_ID}`,
    'version: 0.0.0',
    'pack: engine',
    '',
    '# location nowhere',
    'x: 0, y: 0',
    'starting',
    'title: NOTHING OPENED',
    'examine: This is not the game. The content did not open, and what is on this screen is a stand-in the engine carries so there is somewhere to read the problem from. Nothing here is saved.',
    '',
  ].join('\n'),
};

export interface OpenedUniverse {
  session: PlaySession;
  modules: readonly Answer[];
  problems: readonly UniverseProblem[];
  unmet: readonly RequirementId[];
}

export function openUniverse(sources: readonly ModuleSource[], options: { save?: SaveContext } = {}): OpenedUniverse {
  const loaded = loadUniverseWithDiagnostics(sources);
  const disabled = loaded.diagnostics.map((diagnostic): UniverseProblem => ({ modules: [diagnostic.moduleId], words: 'tool', message: formatModuleDiagnostic(diagnostic) }));
  const unmet = REQUIREMENTS.filter((requirement) => !requirement.met(loaded.registry));

  if (options.save) options.save.synced = unmet.length > 0 ? null : entitledSlot(options.save);

  if (unmet.length === 0) {
    return { session: startSession(loaded.registry), modules: loaded.loadedModules, problems: disabled, unmet: [] };
  }

  return {
    session: startSession(loadUniverseWithDiagnostics([FALLBACK_SOURCE]).registry),
    modules: loaded.loadedModules,
    problems: [...disabled, ...unmet.map((requirement): UniverseProblem => ({ modules: [], words: 'tool', message: requirement.unmet }))],
    unmet: unmet.map((requirement) => requirement.id),
  };
}

export function openWithLocalCleared(sources: readonly ModuleSource[], dependencies: readonly Answer[]): OpenedUniverse | null {
  const local = sources.find((source) => source.name === LOCAL_CHANGES_MODULE_ID);
  if (local === undefined) return null;
  const rest = sources.filter((source) => source !== local);
  return openUniverse([...rest, { name: LOCAL_CHANGES_MODULE_ID, text: renderLocalChangesModule(dependencies) }]);
}
