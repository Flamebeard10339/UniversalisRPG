import type { ContributionDslModuleFile, ContributionPackage } from '../game/types';

const REPOSITORY_URL = 'https://github.com/Flamebeard10339/UniversalisRPG';

export const createContributionPackage = (pack: ContributionPackage) => pack;

// A contribution is always a small, self-contained new module — even one
// that edits existing content does so via `# patch <targetModuleId>`
// (docs/content-dsl-grammar.md), never a direct edit to the target's own
// file. That means there's never a large "before" to diff against: the
// whole module IS the minimal, complete representation of the change, and
// it never contains text from the module(s) it patches beyond what it
// explicitly overrides. One '### <path>' heading + fenced block per file,
// in a fixed, greppable shape parseContributionIssue
// (scripts/merge-contribution-issue.mjs) reads back out.
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

// GitHub's issues/new?body=... prefill silently breaks ("Your request URL
// is too long") once the body includes any nontrivial DSL content — there's
// no reliable size threshold below which it's safe, so the body is never
// put in the URL at all, only the (always-short) title/labels. The UI's
// "Copy body" button is how the body actually gets into the issue.
export const createPrefilledIssueUrl = (pack: ContributionPackage) => {
  const t = pack.t ?? ((key: string, fallbackOrParams?: string | Record<string, string | number>) =>
    typeof fallbackOrParams === 'string' ? fallbackOrParams : key);
  const params = new URLSearchParams({
    title: pack.targetModuleId
      ? t('github.issueTitleModule', { universe: pack.targetUniverseId, module: pack.targetModuleId })
      : t('github.issueTitle', { universe: pack.targetUniverseId }),
    labels: 'content,community',
  });

  return `${REPOSITORY_URL}/issues/new?${params.toString()}`;
};
