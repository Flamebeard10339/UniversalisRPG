import type { ContentBundle, ContentModule, ContributionDraft } from './types';

export type ContributionJsonFile = {
  path: string;
  json: unknown;
};

const uniqueById = <T extends { id: string }>(items: T[]) => [...new Map(items.map((item) => [item.id, item])).values()];

export const moduleFileName = (module: Pick<ContentModule, 'id'>) => `${module.id}.json`;

export const moduleFilePath = (module: Pick<ContentModule, 'id'>) => `modules/${moduleFileName(module)}`;

export const mergedContributionModules = (bundle: ContentBundle, draft: ContributionDraft) => {
  const removedModules = new Set(draft.removed?.modules ?? []);
  const baseModules = (bundle.modules ?? []).filter((module) => !removedModules.has(module.id));
  return uniqueById([...(draft.modules ?? []), ...baseModules]).sort((left, right) => left.id.localeCompare(right.id));
};

export const moduleIndexJson = (bundle: ContentBundle, draft: ContributionDraft) =>
  mergedContributionModules(bundle, draft).map((module) => moduleFileName(module));

export const changedModuleJsonFiles = (bundle: ContentBundle, draft: ContributionDraft): ContributionJsonFile[] => {
  if ((draft.modules ?? []).length === 0 && (draft.removed?.modules ?? []).length === 0) {
    return [];
  }

  return [
    { path: 'modules/index.json', json: moduleIndexJson(bundle, draft) },
    ...draft.modules.map((module) => ({ path: moduleFilePath(module), json: module })),
  ];
};

export const changedContributionJsonFiles = (bundle: ContentBundle, draft: ContributionDraft): ContributionJsonFile[] => [
  ...changedModuleJsonFiles(bundle, draft),
  ...((draft.modulePacks ?? []).length > 0 ? [{ path: 'module-packs.json', json: draft.modulePacks }] : []),
];

export const editableModuleJsonFiles = (bundle: ContentBundle, draft: ContributionDraft): ContributionJsonFile[] => [
  { path: 'modules/index.json', json: moduleIndexJson(bundle, draft) },
  ...mergedContributionModules(bundle, draft).map((module) => ({ path: moduleFilePath(module), json: module })),
];
