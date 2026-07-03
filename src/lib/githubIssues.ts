import type { ContributionPackage } from '../game/types';

const REPOSITORY_URL = 'https://github.com/Flamebeard10339/UniversalisRPG';

export const createContributionPackage = (pack: ContributionPackage) => pack;

export const formatContributionIssueBody = (pack: ContributionPackage) => {
  const t = pack.t ?? ((key: string, fallbackOrParams?: string | Record<string, string | number>) =>
    typeof fallbackOrParams === 'string' ? fallbackOrParams : key);
  const validationSummary =
    pack.validationIssues.length === 0
      ? t('github.noValidationIssues')
      : pack.validationIssues.map((issue) => `- ${issue.severity}: ${issue.path} - ${t(issue.message, issue.params)}`).join('\n');

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
