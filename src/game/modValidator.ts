import type { ContentBundle, ContentModule, ValidationIssue } from './types';
import { applyModulesToBundle } from './contentModules';

export type ModValidator = {
  validate: (bundle: ContentBundle, modules: ContentModule[], enabledModuleIds?: string[]) => {
    bundle: ContentBundle;
    enabledModuleIds: string[];
    issues: ValidationIssue[];
  };
};

export const createModValidator = (): ModValidator => ({
  validate: (bundle, modules, enabledModuleIds) => applyModulesToBundle(bundle, modules, enabledModuleIds),
});
