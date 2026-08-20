import { formatModuleDiagnostic, ModuleDiagnostic, UniverseLoadResult } from './registry';
import { LOCAL_CHANGES_MODULE_ID } from './localChanges';

export interface ContributionIssueInput {
  notes?: string;
  localModule: string;
  validation: UniverseLoadResult;
  contentFiles: readonly string[];
}

export interface ContributionBase {
  universe?: string;
  contentFiles: readonly string[];
}

const DSL_FENCE = '```dsl';
const DSL_HEADING = 'local changes dsl';
const UNIVERSE_HEADING = 'target universe';
const FILES_HEADING = 'content files';

const DSL_HEADING_LABEL = 'Local Changes DSL';
const FENCE = '```';
const HEADING_LINE = /^#{1,6}[ \t]*(?<label>.+?)[ \t]*$/;

interface IssueSection {
  label: string;
  lines: string[];
}

function issueSections(body: string): IssueSection[] {
  const sections: IssueSection[] = [];
  let current: IssueSection | undefined;
  let fenced = false;
  for (const line of body.split('\n')) {
    if (line.startsWith(FENCE)) {
      fenced = !fenced;
      current?.lines.push(line);
      continue;
    }
    const label = fenced ? undefined : HEADING_LINE.exec(line)?.groups?.label;
    if (label === undefined) current?.lines.push(line);
    else {
      current = { label: label.toLowerCase(), lines: [] };
      sections.push(current);
    }
  }
  return sections;
}

function fencedDsl(lines: readonly string[]): string {
  const start = lines.findIndex((line) => line.startsWith(DSL_FENCE));
  if (start === -1) throw new Error(`the ${DSL_HEADING_LABEL} section contains no ${DSL_FENCE} block`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith(FENCE));
  if (end === -1) throw new Error(`the ${DSL_HEADING_LABEL} section has an unterminated ${DSL_FENCE} block`);
  return `${rest.slice(0, end).join('\n').trimEnd()}\n`;
}

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
  if (issueSections(notes).some((section) => section.label === DSL_HEADING)) {
    throw new Error(`contributor notes cannot contain a ${DSL_HEADING_LABEL} heading: it is the delimiter the module is read from`);
  }
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
    `## ${DSL_HEADING_LABEL}`,
    DSL_FENCE,
    localModule,
    FENCE,
    '',
    '<!-- Keep the fenced DSL block intact; it is the plug-and-play local-changes module. -->',
  ].join('\n');
}

export function extractContributionDsl(issueBody: string): string {
  const matching = issueSections(issueBody).filter((section) => section.label === DSL_HEADING);
  if (matching.length === 0) throw new Error(`issue body has no ${DSL_HEADING_LABEL} heading`);
  if (matching.length > 1) throw new Error(`issue body has ${matching.length} ${DSL_HEADING_LABEL} headings, so which block is the module is ambiguous`);
  return fencedDsl(matching[0].lines);
}

export function contributionBase(issueBody: string): ContributionBase {
  const sections = issueSections(issueBody);
  const valuesOf = (label: string): string[] => sections.filter((section) => section.label === label).flatMap((section) => section.lines.map((line) => line.trim()).filter(Boolean));
  const [universe] = valuesOf(UNIVERSE_HEADING);
  return {
    universe,
    contentFiles: valuesOf(FILES_HEADING)
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice('- '.length).trim()),
  };
}
