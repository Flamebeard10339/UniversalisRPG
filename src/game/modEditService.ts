import type { ContentBundle, ContentModule, JsonPatchOperation, ModuleDataUpdatesObject, ModuleObjectPatch } from './types';
import { diffJsonPatch } from './jsonPatch';
import { getModObjectType, modObjectTypes } from './modObjectRegistry';
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

const removeStringArrayReferences = (value: unknown, removedId: string): { changed: boolean; value: unknown } => {
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === 'string')) {
      const next = value.filter((item) => item !== removedId);
      return { changed: next.length !== value.length, value: next };
    }

    let changed = false;
    const next = value.map((item) => {
      const result = removeStringArrayReferences(item, removedId);
      changed ||= result.changed;
      return result.value;
    });
    return { changed, value: next };
  }

  if (!value || typeof value !== 'object') {
    return { changed: false, value };
  }

  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const result = removeStringArrayReferences(child, removedId);
    changed ||= result.changed;
    next[key] = result.value;
  }
  return { changed, value: next };
};

const referenceCleanupPatches = (
  resolvedBundle: ContentBundle,
  targetModId: string,
  removedObjectType: string,
  removedObjectId: string,
): ModuleObjectPatch[] => {
  const removedEntry = getModObjectType(removedObjectType);
  return modObjectTypes().flatMap((entry) =>
    entry.read(resolvedBundle).flatMap((row) => {
      if (entry.dataKey === removedEntry?.dataKey && row.id === removedObjectId) {
        return [];
      }

      const result = removeStringArrayReferences(row, removedObjectId);
      if (!result.changed) {
        return [];
      }

      const ops = diffJsonPatch(row, result.value);
      return ops.length > 0
        ? [{ targetModId, objectType: String(entry.dataKey), objectId: row.id, ops }]
        : [];
    }),
  );
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
    const removesObject = patchOps.some((op) => op.op === 'remove' && op.path === '');
    const cleanupPatches = removesObject
      ? referenceCleanupPatches(resolvedBundle, targetModId, objectType, objectId)
      : [];
    const nextPatches = [
      ...(updates.patches ?? []),
      { targetModId, objectType, objectId, ops: patchOps },
      ...cleanupPatches,
    ];

    store.write(withSoftDependency({
      ...current,
      universe: resolvedBundle.manifest.id,
      'data-updates': { ...updates, patches: nextPatches },
    }, targetModId));
  },
});
