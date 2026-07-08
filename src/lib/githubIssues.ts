import { createPatch } from 'diff';
import type { ContributionDslModuleFile, ContributionPackage } from '../game/types';

const REPOSITORY_URL = 'https://github.com/Flamebeard10339/UniversalisRPG';

export const createContributionPackage = (pack: ContributionPackage) => pack;

// Each DSL module is packaged as a unified diff against its own on-disk
// baseline (not the whole file) — a one-line fix in a large module
// shouldn't force a reviewer to read the entire thing. Concatenating
// multiple createPatch() outputs is jsdiff's own multi-file convention;
// parsePatch() on the receiving end (scripts/merge-contribution-issue.mjs)
// splits it back into per-file patches with no bespoke splitting logic.
export const formatDslModulesDiffBlock = (dslModules: ContributionDslModuleFile[]): string =>
  dslModules.map((file) => createPatch(file.path, file.baselineSource, file.source)).join('\n');

export const formatContributionIssueBody = (pack: ContributionPackage) => {
  const t = pack.t ?? ((key: string, fallbackOrParams?: string | Record<string, string | number>) =>
    typeof fallbackOrParams === 'string' ? fallbackOrParams : key);
  const validationSummary =
    pack.validationIssues.length === 0
      ? t('github.noValidationIssues')
      : pack.validationIssues.map((issue) => `- ${issue.severity}: ${issue.path} - ${t(issue.message, issue.params)}`).join('\n');
  const dslModules = pack.dslModules ?? [];

  return [
    `## ${t('github.targetUniverse')}`,
    pack.targetUniverseId,
    '',
    `## ${t('github.notes')}`,
    pack.notes.trim() || t('github.noContributorNotes'),
    '',
    `## ${t('github.validation')}`,
    validationSummary,
    '',
    `## ${t('github.appVersion')}`,
    pack.appVersion,
    '',
    `## ${t('github.changedJson')}`,
    '```json',
    JSON.stringify(pack.changedFiles, null, 2),
    '```',
    ...(dslModules.length > 0
      ? ['', `## ${t('github.changedDslModules')}`, '```diff', formatDslModulesDiffBlock(dslModules), '```']
      : []),
  ].join('\n');
};

export const createPrefilledIssueUrl = (pack: ContributionPackage) => {
  const t = pack.t ?? ((key: string, fallbackOrParams?: string | Record<string, string | number>) =>
    typeof fallbackOrParams === 'string' ? fallbackOrParams : key);
  const params = new URLSearchParams({
    title: pack.targetModuleId
      ? t('github.issueTitleModule', { universe: pack.targetUniverseId, module: pack.targetModuleId })
      : t('github.issueTitle', { universe: pack.targetUniverseId }),
    labels: 'content,community',
    body: formatContributionIssueBody(pack),
  });

  return `${REPOSITORY_URL}/issues/new?${params.toString()}`;
};
