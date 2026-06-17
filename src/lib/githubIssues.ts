import type { ContributionPackage } from '../game/types';

const REPOSITORY_URL = 'https://github.com/Flamebeard10339/UniversalisRPG';

export const createContributionPackage = (pack: ContributionPackage) => pack;

export const formatContributionIssueBody = (pack: ContributionPackage) => {
  const validationSummary =
    pack.validationIssues.length === 0
      ? 'No validation issues.'
      : pack.validationIssues.map((issue) => `- ${issue.severity}: ${issue.path} - ${issue.message}`).join('\n');

  return [
    `## Target universe`,
    pack.targetUniverseId,
    '',
    '## Notes',
    pack.notes.trim() || 'No contributor notes provided.',
    '',
    '## Validation',
    validationSummary,
    '',
    '## App version',
    pack.appVersion,
    '',
    '## Changed JSON',
    '```json',
    JSON.stringify(pack.changedFiles, null, 2),
    '```',
  ].join('\n');
};

export const createPrefilledIssueUrl = (pack: ContributionPackage) => {
  const params = new URLSearchParams({
    title: `[Content]: ${pack.targetUniverseId} contribution`,
    labels: 'content,community',
    body: formatContributionIssueBody(pack),
  });

  return `${REPOSITORY_URL}/issues/new?${params.toString()}`;
};
