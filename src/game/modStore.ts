import type { ContentModule, ContributionDraft } from './types';

export type ModStore = {
  exists: (modId: string) => boolean;
  read: (modId: string) => ContentModule | null;
  write: (module: ContentModule) => void;
};

const upsertById = <T extends { id: string }>(items: T[], item: T) =>
  items.some((candidate) => candidate.id === item.id)
    ? items.map((candidate) => (candidate.id === item.id ? item : candidate))
    : [...items, item];

export const createDraftModStore = (
  draft: ContributionDraft,
  updateDraft: (patch: Partial<Omit<ContributionDraft, 'universeId'>>) => void,
): ModStore => {
  let modules = draft.modules;
  return {
    exists: (modId) => modules.some((module) => module.id === modId),
    read: (modId) => modules.find((module) => module.id === modId) ?? null,
    write: (module) => {
      modules = upsertById(modules, module);
    updateDraft({
      modules,
      removed: {
        ...draft.removed,
        modules: (draft.removed.modules ?? []).filter((id) => id !== module.id),
      },
    });
    },
  };
};
