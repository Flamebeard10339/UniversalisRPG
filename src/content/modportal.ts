import { LOCAL_CHANGES_MODULE_ID } from './localChanges';
import { extractContributionDsl } from './contribution';
import { parseModuleSource } from './universe';

export const APPROVED_MOD_LABEL = 'approved-mod';
export const DEFAULT_MODPORTAL_CACHE = 'content/modportal.local';
export const MODPORTAL_MANIFEST_VERSION = 1;

export interface ApprovedModIssue {
  number: number;
  title: string;
  body?: string | null;
  url?: string;
  updatedAt?: string;
}

export interface MaterializedMod {
  issue: number;
  title: string;
  url?: string;
  updatedAt?: string;
  moduleId: string;
  file: string;
  text: string;
}

export interface ModportalEntry {
  issue: number;
  title: string;
  url?: string;
  updatedAt?: string;
  moduleId: string;
  file: string;
  enabled: boolean;
}

export interface ModportalManifest {
  version: typeof MODPORTAL_MANIFEST_VERSION;
  label: string;
  syncedAt?: string;
  entries: ModportalEntry[];
}

function generatedModuleId(issue: number): string {
  return `approved-mod-${issue}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceInfoId(source: string, from: string, to: string): string {
  const pattern = new RegExp(`^(\\uFEFF?# info[ \\t]+)${escapeRegex(from)}(?=[ \\t]*(?:\\r?\\n|$))`, 'm');
  const replaced = source.replace(pattern, `$1${to}`);
  if (replaced === source) throw new Error(`approved mod issue did not declare # info ${from}`);
  return replaced;
}

function replaceLocalChangesNamespace(source: string, moduleId: string): string {
  return replaceInfoId(source, LOCAL_CHANGES_MODULE_ID, moduleId).replace(/(^|[^a-z0-9-])local-changes\./g, `$1${moduleId}.`);
}

export function materializeApprovedModIssue(issue: ApprovedModIssue): MaterializedMod {
  if (!Number.isInteger(issue.number) || issue.number <= 0) throw new Error('approved mod issue requires a positive issue number');
  if (!issue.title) throw new Error(`approved mod issue #${issue.number} requires a title`);
  if (!issue.body) throw new Error(`approved mod issue #${issue.number} has no body`);
  const extracted = extractContributionDsl(issue.body);
  const parsed = parseModuleSource({ name: `issue-${issue.number}`, text: extracted });
  const moduleId = parsed.info.id === LOCAL_CHANGES_MODULE_ID ? generatedModuleId(issue.number) : parsed.info.id;
  const text = moduleId === parsed.info.id ? extracted : replaceLocalChangesNamespace(extracted, moduleId);
  parseModuleSource({ name: moduleId, text });
  return {
    issue: issue.number,
    title: issue.title,
    url: issue.url,
    updatedAt: issue.updatedAt,
    moduleId,
    file: `${issue.number}-${moduleId}.dsl`,
    text,
  };
}

export function emptyModportalManifest(label = APPROVED_MOD_LABEL): ModportalManifest {
  return { version: MODPORTAL_MANIFEST_VERSION, label, entries: [] };
}

export function upsertModportalEntries(existing: ModportalManifest, incoming: readonly MaterializedMod[], syncedAt: string): ModportalManifest {
  const previousByIssue = new Map(existing.entries.map((entry) => [entry.issue, entry]));
  const entries = incoming
    .map((mod) => {
      const previous = previousByIssue.get(mod.issue);
      return {
        issue: mod.issue,
        title: mod.title,
        url: mod.url,
        updatedAt: mod.updatedAt,
        moduleId: mod.moduleId,
        file: mod.file,
        enabled: previous?.enabled ?? true,
      };
    })
    .sort((a, b) => a.issue - b.issue);
  return { version: MODPORTAL_MANIFEST_VERSION, label: existing.label, syncedAt, entries };
}
