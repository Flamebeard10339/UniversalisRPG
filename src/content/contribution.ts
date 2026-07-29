import { formatModuleDiagnostic, ModuleDiagnostic, UniverseLoadResult } from './registry';
import { LOCAL_CHANGES_MODULE_ID } from './localChanges';

export interface ContributionIssueInput {
  title: string;
  notes?: string;
  localModule: string;
  validation: UniverseLoadResult;
  contentFiles: readonly string[];
}

const DSL_FENCE = '```dsl';

function validationLines(validation: UniverseLoadResult): string[] {
  const lines = [`Loaded modules: ${validation.loadedModules.join(', ') || '(none)'}`];
  if (validation.disabledModules.length > 0) lines.push(`Disabled modules: ${validation.disabledModules.join(', ')}`);
  if (validation.diagnostics.length === 0) lines.push('Diagnostics: none');
  else lines.push('Diagnostics:', ...validation.diagnostics.map((diagnostic) => `- ${formatModuleDiagnostic(diagnostic)}`));
  return lines;
}

export function localDiagnostics(sourceName: string, diagnostics: readonly ModuleDiagnostic[]): ModuleDiagnostic[] {
  return diagnostics.filter((diagnostic) => diagnostic.sourceName === sourceName || diagnostic.moduleId === LOCAL_CHANGES_MODULE_ID);
}

export function localModuleLoaded(sourceName: string, validation: UniverseLoadResult): boolean {
  const status = validation.modules.find((module) => module.sourceName === sourceName);
  return status?.moduleId === LOCAL_CHANGES_MODULE_ID && status.loaded === true && localDiagnostics(sourceName, validation.diagnostics).length === 0;
}

export function buildContributionIssueBody(input: ContributionIssueInput): string {
  const notes = input.notes?.trim() || 'No contributor notes provided.';
  const localModule = input.localModule.replace(/^\uFEFF/, '').trimEnd();
  return [
    '## Summary',
    notes,
    '',
    '## Content Files',
    ...input.contentFiles.map((file) => `- ${file}`),
    '',
    '## Validation',
    ...validationLines(input.validation),
    '',
    '## Local Changes DSL',
    DSL_FENCE,
    localModule,
    '```',
    '',
    '<!-- Keep the fenced DSL block intact; it is the plug-and-play local-changes module. -->',
  ].join('\n');
}

export function extractContributionDsl(issueBody: string): string {
  const start = issueBody.indexOf(DSL_FENCE);
  if (start === -1) throw new Error('issue body does not contain a ```dsl block');
  const bodyStart = issueBody.indexOf('\n', start);
  if (bodyStart === -1) throw new Error('issue body has an unterminated ```dsl block');
  const end = issueBody.indexOf('\n```', bodyStart + 1);
  if (end === -1) throw new Error('issue body has an unterminated ```dsl block');
  return issueBody.slice(bodyStart + 1, end).trimEnd() + '\n';
}
