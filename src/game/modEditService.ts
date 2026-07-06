import type { ContentBundle, ContentModule, JsonPatchOperation, ModuleDataUpdatesObject } from './types';
import { diffJsonPatch } from './jsonPatch';
import { getModObjectType } from './modObjectRegistry';
import type { ModStore } from './modStore';

export const localContributionsModId = 'local-contributions';

export type ModEditService = {
  saveEdit: (targetModId: string, objectType: string, objectId: string, patchOps: JsonPatchOperation[]) => void;
  diffEdit: (previous: unknown, next: unknown) => JsonPatchOperation[];
};

type ModEditServiceOptions = {
  resolvedBundle: ContentBundle;
  store: ModStore;
};

const localContributionModule = (bundle: ContentBundle): ContentModule => ({
  id: localContributionsModId,
  version: '1.0.0',
  universe: bundle.manifest.id,
  author: bundle.manifest.author,
  game_version: '1.0',
  dependencies: [],
  'data-updates': { patches: [] },
});

const asUpdatesObject = (module: ContentModule): ModuleDataUpdatesObject => {
  const updates = module['data-updates'];
  return updates && !Array.isArray(updates) ? updates : {};
};

const dependencyTargets = (dependency: string) => dependency.replace(/^([!+?~])?\s*/, '').split(/\s+/)[0];

const withSoftDependency = (module: ContentModule, targetModId: string) => {
  if (!targetModId || targetModId === module.id || (module.dependencies ?? []).some((dependency) => dependencyTargets(dependency) === targetModId)) {
    return module;
  }
  return { ...module, dependencies: [...(module.dependencies ?? []), `+${targetModId}`] };
};

export const createModEditService = ({ resolvedBundle, store }: ModEditServiceOptions): ModEditService => ({
  diffEdit: diffJsonPatch,

  saveEdit: (targetModId, objectType, objectId, patchOps) => {
    const entry = getModObjectType(objectType);
    if (!entry) {
      throw new Error(`Unknown mod object type: ${objectType}`);
    }

    const targetExists = entry.read(resolvedBundle).some((item) => item.id === objectId);
    const createsObject = patchOps.some((op) => op.op === 'add' && op.path === '');
    if (!targetExists && !createsObject) {
      throw new Error(`Cannot patch missing ${objectType}: ${objectId}`);
    }

    const current = store.read(localContributionsModId) ?? localContributionModule(resolvedBundle);
    const updates = asUpdatesObject(current);
    const nextPatches = [
      ...(updates.patches ?? []).filter((patch) =>
        patch.targetModId !== targetModId ||
        patch.objectType !== objectType ||
        patch.objectId !== objectId,
      ),
      { targetModId, objectType, objectId, ops: patchOps },
    ];

    store.write(withSoftDependency({
      ...current,
      universe: resolvedBundle.manifest.id,
      'data-updates': { ...updates, patches: nextPatches },
    }, targetModId));
  },
});
