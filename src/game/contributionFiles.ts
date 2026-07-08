import type { ContentBundle, ContentModule, ContributionDraft } from './types';

export type ContributionJsonFile = {
  path: string;
  json: unknown;
};

const uniqueById = <T extends { id: string }>(items: T[]) => [...new Map(items.map((item) => [item.id, item])).values()];

export const moduleFileName = (module: Pick<ContentModule, 'id'>) => `${module.id}.json`;

export const moduleFilePath = (module: Pick<ContentModule, 'id'>) => `modules/${moduleFileName(module)}`;

export const moduleManifestIds = (bundle: ContentBundle, draft: ContributionDraft) =>
  mergedContributionModules(bundle, draft).map((module) => module.id);

// A draft module is allowed to share an id with a packaged one — that's how
// editing a core/shipped module works (uniqueById below keeps the *last*
// occurrence for a given id, so listing draft modules after base modules
// makes the draft win). Previously excluded any draft module whose id
// matched a packaged one, which silently dropped every override of an
// existing module from both this display and the submission package below.
const localDraftModules = (draft: ContributionDraft) => {
  const removedModules = new Set(draft.removed?.modules ?? []);
  return (draft.modules ?? []).filter((module) => !removedModules.has(module.id));
};

export const mergedContributionModules = (bundle: ContentBundle, draft: ContributionDraft) => {
  const baseModules = bundle.modules ?? [];
  return uniqueById([...baseModules, ...localDraftModules(draft)]).sort((left, right) => left.id.localeCompare(right.id));
};

export const changedModuleJsonFiles = (bundle: ContentBundle, draft: ContributionDraft): ContributionJsonFile[] => {
  const localModules = localDraftModules(draft);
  if (localModules.length === 0) {
    return [];
  }

  return [
    { path: 'universe.json', json: { ...bundle.manifest, modules: moduleManifestIds(bundle, draft) } },
    ...localModules.map((module) => ({ path: moduleFilePath(module), json: module })),
  ];
};

export const changedContributionJsonFiles = (bundle: ContentBundle, draft: ContributionDraft): ContributionJsonFile[] => [
  ...changedModuleJsonFiles(bundle, draft),
  ...(((draft.locations ?? []).length > 0 || (draft.removed?.locations ?? []).length > 0) ? [{ path: 'locations.json', json: draft.locations ?? [] }] : []),
  ...(((draft.entities ?? []).length > 0 || (draft.removed?.entities ?? []).length > 0) ? [{ path: 'entities.json', json: draft.entities ?? [] }] : []),
  ...(((draft.actions ?? []).length > 0 || (draft.removed?.actions ?? []).length > 0) ? [{ path: 'actions.json', json: draft.actions ?? [] }] : []),
  ...((draft.modulePacks ?? []).length > 0 ? [{ path: 'module-packs.json', json: draft.modulePacks }] : []),
  ...((draft.locales && Object.keys(draft.locales).length > 0) ? [{ path: 'locales.json', json: draft.locales }] : []),
];

export const editableModuleJsonFiles = (bundle: ContentBundle, draft: ContributionDraft): ContributionJsonFile[] => [
  { path: 'universe.json', json: { ...bundle.manifest, modules: moduleManifestIds(bundle, draft) } },
  ...mergedContributionModules(bundle, draft).map((module) => ({ path: moduleFilePath(module), json: module })),
];
