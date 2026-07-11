import type { ContributionDslModuleFile, ContributionPackage } from '../game/types';

const REPOSITORY_URL = 'https://github.com/Flamebeard10339/UniversalisRPG';

export const createContributionPackage = (pack: ContributionPackage) => pack;

// Each changed/new DSL module is embedded as its complete, self-contained
// source — not a diff — so a reviewer can drop the file in and test it
// directly (a diff alone requires a merge step first before it's runnable).
// One '### <path>' heading + fenced block per file, in a fixed, greppable
// shape parseContributionIssue (scripts/merge-contribution-issue.mjs) reads
// back out — no reliance on any diff-tool's own multi-file convention.
export const formatDslModulesBlock = (dslModules: ContributionDslModuleFile[]): string =>
  dslModules.map((file) => `### ${file.path}\n\`\`\`md\n${file.source}\n\`\`\``).join('\n\n');

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
    ...(dslModules.length > 0
      ? ['', `## ${t('github.changedDslModules')}`, '', formatDslModulesBlock(dslModules)]
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
