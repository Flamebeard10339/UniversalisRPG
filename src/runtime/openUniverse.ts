import { LOCAL_CHANGES_MODULE_ID, renderLocalChangesModule } from '../content/localChanges';
import { formatModuleDiagnostic, startingLocationId, type Registry } from '../content/registry';
import { loadUniverseWithDiagnostics } from '../content/load';
import type { ModuleSource } from '../content/universe';
import type { Answer } from './localized';
import type { PruneWarning } from './pruning';
import { savedGameFromSerialized } from './save';
import { liveHolding, liveSlot, type SaveContext } from './saveSlots';
import { loadSaved, startSession, type PlaySession } from './session';

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

// What the session handed back is standing on. A live slot with nothing in it is a new game and the
// session is that slot's from here on; a slot holding a game this build can read is picked back up,
// which is what makes closing the tab cost nothing. A slot holding one it cannot read is neither:
// the game is new, the slot stays the player's — nothing will autosave over it — and `why` is what
// they are told rather than losing it in silence.
export type Resumption =
  | { readonly kind: 'new' }
  | { readonly kind: 'resumed'; readonly slot: Answer; readonly pruned: readonly PruneWarning[] }
  | { readonly kind: 'kept'; readonly slot: Answer; readonly why: string };

export interface OpenedUniverse {
  session: PlaySession;
  modules: readonly Answer[];
  problems: readonly UniverseProblem[];
  unmet: readonly RequirementId[];
  resumed: Resumption;
}

const because = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function resume(session: PlaySession, save: SaveContext): Resumption {
  const slot = liveSlot(save);
  const holding = liveHolding(save);
  if (holding.kind === 'empty') return { kind: 'new' };
  if (holding.kind === 'unreadable') return { kind: 'kept', slot, why: 'nothing here can read the bytes it holds' };
  const saved = savedGameFromSerialized(holding.slot.payload);
  if (saved === null) return { kind: 'kept', slot, why: 'it does not read as a saved game' };
  try {
    return { kind: 'resumed', slot, pruned: loadSaved(session, saved) };
  } catch (error) {
    return { kind: 'kept', slot, why: because(error) };
  }
}

export function openUniverse(sources: readonly ModuleSource[], options: { save?: SaveContext } = {}): OpenedUniverse {
  const loaded = loadUniverseWithDiagnostics(sources);
  const disabled = loaded.diagnostics.map((diagnostic): UniverseProblem => ({ modules: [diagnostic.moduleId], words: 'tool', message: formatModuleDiagnostic(diagnostic) }));
  const unmet = REQUIREMENTS.filter((requirement) => !requirement.met(loaded.registry));

  if (unmet.length > 0) {
    if (options.save) options.save.synced = null;
    return {
      session: startSession(loadUniverseWithDiagnostics([FALLBACK_SOURCE]).registry),
      modules: loaded.loadedModules,
      problems: [...disabled, ...unmet.map((requirement): UniverseProblem => ({ modules: [], words: 'tool', message: requirement.unmet }))],
      unmet: unmet.map((requirement) => requirement.id),
      resumed: { kind: 'new' },
    };
  }

  const session = startSession(loaded.registry);
  const resumed: Resumption = options.save ? resume(session, options.save) : { kind: 'new' };
  if (options.save) options.save.synced = resumed.kind === 'kept' ? null : liveSlot(options.save);
  return { session, modules: loaded.loadedModules, problems: disabled, unmet: [], resumed };
}

export function openWithLocalCleared(sources: readonly ModuleSource[], dependencies: readonly Answer[]): OpenedUniverse | null {
  const local = sources.find((source) => source.name === LOCAL_CHANGES_MODULE_ID);
  if (local === undefined) return null;
  const rest = sources.filter((source) => source !== local);
  return openUniverse([...rest, { name: LOCAL_CHANGES_MODULE_ID, text: renderLocalChangesModule(dependencies) }]);
}
