import type { ContentBundle, ContentModule, ModuleDataEntry } from './types';

const contentFileNames = new Set([
  'locations.json',
  'edges.json',
  'actions.json',
  'skills.json',
  'stats.json',
  'items.json',
  'flags.json',
  'resources.json',
  'effects.json',
  'interaction-types.json',
  'enemies.json',
  'drop-tables.json',
  'dialogues.json',
]);

const typedRows = (type: string, values: Array<Record<string, unknown>> = []): ModuleDataEntry[] =>
  values.map((value) => ({ type, ...value }));

const uniqueModuleId = (bundle: ContentBundle) => {
  const ids = new Set((bundle.modules ?? []).map((module) => module.id));
  const baseId = `${bundle.manifest.id}-core`;
  if (!ids.has(baseId)) return baseId;
  let index = 2;
  while (ids.has(`${baseId}-${index}`)) index += 1;
  return `${baseId}-${index}`;
};

export const migrateMonolithicBundleToCoreModule = (bundle: ContentBundle): ContentBundle => {
  const data: ModuleDataEntry[] = [
    ...typedRows('displayProfile', bundle.manifest.displayProfiles as Array<Record<string, unknown>> | undefined),
    ...typedRows('location', bundle.locations),
    ...typedRows('edge', bundle.edges),
    ...typedRows('action', bundle.actions),
    ...typedRows('skill', bundle.skills),
    ...typedRows('stat', bundle.stats),
    ...typedRows('item', bundle.items),
    ...typedRows('flag', bundle.flags),
    ...typedRows('resourceDefinition', bundle.resourceDefinitions),
    ...typedRows('effect', bundle.effects),
    ...typedRows('interactionType', bundle.interactionTypes),
    ...typedRows('enemy', bundle.enemies),
    ...typedRows('dropTable', bundle.dropTables),
    ...typedRows('dialogue', bundle.dialogues),
  ];

  if (data.length === 0) return bundle;

  const coreModule: ContentModule = {
    id: uniqueModuleId(bundle),
    version: '1.0.0',
    universe: bundle.manifest.id,
    author: bundle.manifest.author,
    game_version: '1.0',
    dependencies: [],
    data,
    locale: bundle.locales,
  };
  const modules = [coreModule, ...(bundle.modules ?? [])];

  return {
    ...bundle,
    manifest: {
      ...bundle.manifest,
      files: bundle.manifest.files.filter((file) => !contentFileNames.has(file)),
      modules: modules.map((module) => module.id),
      displayProfiles: undefined,
    },
    locations: [],
    edges: [],
    actions: [],
    skills: [],
    stats: [],
    items: [],
    flags: [],
    resourceDefinitions: [],
    effects: [],
    interactionTypes: [],
    enemies: [],
    dropTables: [],
    dialogues: [],
    locales: Object.fromEntries(bundle.manifest.locales.map((locale) => [locale, {}])),
    modules,
  };
};
