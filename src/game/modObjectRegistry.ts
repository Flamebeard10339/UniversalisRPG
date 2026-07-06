import type { ContentBundle, ModuleDataSectionObject, ValidationIssue } from './types';
import { validateContentShape } from './validators';

export type ModObjectRegistryEntry = {
  objectType: string;
  dataKey: keyof ModuleDataSectionObject;
  read: (bundle: ContentBundle) => Array<{ id: string }>;
  write: (bundle: ContentBundle, values: Array<{ id: string }>) => ContentBundle;
  validate: (bundle: ContentBundle) => ValidationIssue[];
};

const bundleCollection = (bundle: ContentBundle, key: keyof ModuleDataSectionObject) => {
  if (key === 'displayProfiles') return bundle.manifest.displayProfiles ?? [];
  if (key === 'resources' || key === 'resourceDefinitions') return bundle.resourceDefinitions ?? [];
  return ((bundle as unknown as Record<keyof ModuleDataSectionObject, Array<{ id: string }> | undefined>)[key]) ?? [];
};

const withBundleCollection = (bundle: ContentBundle, key: keyof ModuleDataSectionObject, values: Array<{ id: string }>) => {
  if (key === 'displayProfiles') {
    return { ...bundle, manifest: { ...bundle.manifest, displayProfiles: values as never } };
  }
  if (key === 'resources' || key === 'resourceDefinitions') {
    return { ...bundle, resourceDefinitions: values as never };
  }
  return { ...bundle, [key]: values };
};

const registry = new Map<string, ModObjectRegistryEntry>();

export const registerModObjectType = (objectType: string, dataKey: keyof ModuleDataSectionObject) => {
  const entry: ModObjectRegistryEntry = {
    objectType,
    dataKey,
    read: (bundle) => bundleCollection(bundle, dataKey),
    write: (bundle, values) => withBundleCollection(bundle, dataKey, values),
    validate: validateContentShape,
  };
  registry.set(objectType, entry);
  registry.set(dataKey, entry);
};

[
  ['action', 'actions'],
  ['dialogue', 'dialogues'],
  ['displayProfile', 'displayProfiles'],
  ['collectionLog', 'collectionLogs'],
  ['dropTable', 'dropTables'],
  ['entity', 'entities'],
  ['effect', 'effects'],
  ['enemy', 'enemies'],
  ['flag', 'flags'],
  ['interactionType', 'interactionTypes'],
  ['item', 'items'],
  ['location', 'locations'],
  ['resource', 'resources'],
  ['resourceDefinition', 'resourceDefinitions'],
  ['skill', 'skills'],
  ['stat', 'stats'],
].forEach(([objectType, dataKey]) => registerModObjectType(objectType, dataKey as keyof ModuleDataSectionObject));

export const modObjectTypes = () => [...new Set([...registry.values()])];

export const getModObjectType = (objectType: string) => registry.get(objectType);
