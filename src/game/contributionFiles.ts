import type { ContentBundle, ContributionDraft } from './types';

const uniqueById = <T extends { id: string }>(items: T[]) => [...new Map(items.map((item) => [item.id, item])).values()];

// A draft module is allowed to share an id with a packaged one — that's how
// editing a core/shipped module works (uniqueById below keeps the *last*
// occurrence for a given id, so listing draft modules after base modules
// makes the draft win).
const localDraftModules = (draft: ContributionDraft) => {
  const removedModules = new Set(draft.removed?.modules ?? []);
  return (draft.modules ?? []).filter((module) => !removedModules.has(module.id));
};

export const mergedContributionModules = (bundle: ContentBundle, draft: ContributionDraft) => {
  const baseModules = bundle.modules ?? [];
  return uniqueById([...baseModules, ...localDraftModules(draft)]).sort((left, right) => left.id.localeCompare(right.id));
};
