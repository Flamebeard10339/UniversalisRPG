import { formatModuleDiagnostic, loadUniverseWithDiagnostics, type Registry } from '../content/registry';
import type { ModuleSource } from '../content/universe';
import { startingLocationId } from './save';
import { type SaveContext } from './saveSlots';
import { startSession, type PlaySession } from './session';

// What is wrong with a universe, and which modules it is wrong of. The modules
// are a list rather than one name because the two things that can be wrong are
// about different numbers of modules: the loader disables a module and names
// that module, and a requirement is a property of the merged universe, which
// every module that loaded built. Neither is inferred from where a caller was
// standing when it found out.
export interface UniverseProblem {
  modules: readonly string[];
  message: string;
}

// What a session needs of a universe that the load path does not check, stated
// as a value so that everything downstream derives its cases from it rather
// than from a shape somebody wrote down.
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

// The universe a session stands in when the one that was asked for could not be
// started. Authored rather than constructed: it goes through the same load path
// as any other module, so there is no second way to make a registry, and it
// names nothing outside itself, so it cannot be reading anything out of the
// universe it stands in for. It carries no `# locale`, which is what puts every
// engine sentence on the screen as its own key — a screen nobody mistakes for a
// game.
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
  // Always a session: what the door hands back is startable, whether the
  // universe asked for opened or the stand-in did.
  session: PlaySession;
  // The modules the sources loaded, in the order they were applied. What an
  // authoring surface declares its dependencies against, which is why it is the
  // loader's answer about the sources rather than an answer about whichever
  // universe the session ended up in: an author editing their way out of a
  // stand-in still stages against the modules that did load.
  modules: readonly string[];
  problems: readonly UniverseProblem[];
  // The requirements the universe asked for did not meet. Non-empty is exactly
  // the states the stand-in opened in.
  unmet: readonly RequirementId[];
}

// The one door a universe is opened through. It loads once, reads what the
// loader disabled out of the loader's own per-module report, checks what a
// session requires of what came back, and stands the session in a universe it
// carries when a requirement is unmet. It answers for every input.
//
// The save context, where one is passed, is told that this session is no slot's
// game whenever the stand-in opened: a release nobody can load must not be able
// to write a stand-in over the slot a player's game is in.
export function openUniverse(sources: readonly ModuleSource[], options: { save?: SaveContext } = {}): OpenedUniverse {
  const loaded = loadUniverseWithDiagnostics(sources);
  const disabled = loaded.diagnostics.map((diagnostic): UniverseProblem => ({ modules: [diagnostic.moduleId], message: formatModuleDiagnostic(diagnostic) }));
  const unmet = REQUIREMENTS.filter((requirement) => !requirement.met(loaded.registry));

  if (unmet.length === 0) {
    return { session: startSession(loaded.registry), modules: loaded.loadedModules, problems: disabled, unmet: [] };
  }

  if (options.save) options.save.synced = null;
  return {
    session: startSession(loadUniverseWithDiagnostics([FALLBACK_SOURCE]).registry),
    modules: loaded.loadedModules,
    problems: [...disabled, ...unmet.map((requirement): UniverseProblem => ({ modules: loaded.loadedModules, message: requirement.unmet }))],
    unmet: unmet.map((requirement) => requirement.id),
  };
}
