import { globalSectionKinds, sectionOf, type SectionKind } from './sections';
import { LOCAL_CHANGES_MODULE_ID } from './localChanges';
import { contributionBase, extractContributionDsl } from './contribution';
import type { ContributionBase } from './contribution';
import { parseModuleSource } from './universe';
import { contentSectionMaps } from './sections';
import { mapOf } from './registry';
import { formatModuleDiagnostic } from './registry';
import { loadUniverseWithDiagnostics } from './load';
import type { Contribution, Registry } from './registry';
import type { ModuleSource } from './universe';
import { declaredGlobalIds, republishModule } from './serialize';
import { visitSection } from './sections';

export const MOD_PENDING_LABEL = 'mod-pending';
export const MOD_APPROVED_LABEL = 'mod-approved';
export const MOD_AUTO_ENABLED_LABEL = 'mod-auto-enabled';
export const MODPORTAL_MANIFEST_VERSION = 2;

export type ModTier = 'approved' | 'auto-enabled';

export const LISTABLE_MOD_LABELS: readonly { label: string; tier: ModTier }[] = [
  { label: MOD_APPROVED_LABEL, tier: 'approved' },
  { label: MOD_AUTO_ENABLED_LABEL, tier: 'auto-enabled' },
];

export interface ApprovedModIssue {
  number: number;
  title: string;
  body?: string | null;
  url?: string;
  updatedAt?: string;
  labels?: readonly { name?: string }[];
  tier?: ModTier;
}

export interface MaterializedMod {
  issue: number;
  title: string;
  url?: string;
  updatedAt?: string;
  tier: ModTier;
  base: ContributionBase;
  moduleId: string;
  file: string;
  text: string;
}

export interface ModportalEntry {
  issue: number;
  title: string;
  url?: string;
  updatedAt?: string;
  tier: ModTier;
  base?: ContributionBase;
  moduleId: string;
  file: string;
  enabled: boolean;
  diagnostics?: string[];
}

export interface ModportalManifest {
  version: typeof MODPORTAL_MANIFEST_VERSION;
  syncedAt?: string;
  entries: ModportalEntry[];
  intent: Record<string, boolean>;
}

export function tierDefaultsEnabled(tier: ModTier): boolean {
  return tier === 'auto-enabled';
}

export function issueTier(issue: ApprovedModIssue): ModTier {
  if (issue.tier) return issue.tier;
  const labels = issue.labels?.map((label) => label.name) ?? [];
  return labels.includes(MOD_AUTO_ENABLED_LABEL) ? 'auto-enabled' : 'approved';
}

function generatedModuleId(issue: number): string {
  return `approved-mod-${issue}`;
}

function renamedId(id: string, from: string, to: string): string {
  return id.startsWith(`${from}.`) ? `${to}${id.slice(from.length)}` : id;
}

function replaceInfoId(source: string, from: string, to: string): string {
  const pattern = new RegExp(`^(\\uFEFF?# info[ \\t]+)${from}(?=[ \\t]*(?:\\r?\\n|$))`, 'm');
  const replaced = source.replace(pattern, `$1${to}`);
  if (replaced === source) throw new Error(`approved mod issue did not declare # info ${from}`);
  return replaced;
}

function cloned<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function renamedStats(held: unknown, from: string, to: string): unknown {
  const renamed = ([statId, range]: [string, unknown]): [string, unknown] => [renamedId(statId, from, to), range];
  if (Array.isArray(held)) return (held as [string, unknown][]).map(renamed);
  return Object.fromEntries(Object.entries(held as Record<string, unknown>).map(renamed));
}

function rewriteSection(kind: SectionKind, key: string, value: object, from: string, to: string): object {
  const next = cloned(value) as { id?: string; stats?: unknown };
  if (typeof next.id === 'string') next.id = renamedId(next.id, from, to);
  if (kind === 'entity' && next.stats) next.stats = renamedStats(next.stats, from, to);
  visitSection(sectionOf(kind, next), `# ${kind} ${key}`, (_kind, id: string) => renamedId(id, from, to));
  return next;
}

function renamedContributions(loaded: Registry, moduleId: string): ReadonlyMap<string, readonly Contribution[]> {
  const next = new Map(loaded.contributions);
  const written = next.get(LOCAL_CHANGES_MODULE_ID) ?? [];
  next.delete(LOCAL_CHANGES_MODULE_ID);
  next.set(
    moduleId,
    written.map((each) => {
      const id = renamedId(each.id, LOCAL_CHANGES_MODULE_ID, moduleId);
      return { kind: each.kind, id, value: rewriteSection(each.kind as SectionKind, id, each.value, LOCAL_CHANGES_MODULE_ID, moduleId) };
    }),
  );
  return next;
}

function localGlobalIds(parsed: ReturnType<typeof parseModuleSource>, moduleId: string): string[] {
  return parsed.sections.filter((section) => globalSectionKinds().includes(section.kind)).map((section) => renamedId((section.value as { id: string }).id, LOCAL_CHANGES_MODULE_ID, moduleId));
}

function renamedRegistry(loaded: Registry, moduleId: string): Registry {
  const registry = { ...loaded };
  for (const [kind, mapName] of contentSectionMaps()) {
    const sourceMap = mapOf(loaded, mapName) as unknown as ReadonlyMap<string, object>;
    const next = new Map(sourceMap);
    for (const [id, value] of sourceMap) {
      if (!id.startsWith(`${LOCAL_CHANGES_MODULE_ID}.`)) continue;
      next.delete(id);
      next.set(renamedId(id, LOCAL_CHANGES_MODULE_ID, moduleId), rewriteSection(kind, id, value, LOCAL_CHANGES_MODULE_ID, moduleId));
    }
    (registry as unknown as Record<string, unknown>)[mapName] = next;
  }
  registry.namespace = loaded.namespace.renamed(LOCAL_CHANGES_MODULE_ID, moduleId);
  registry.contributions = renamedContributions(loaded, moduleId);
  return registry;
}

function canonicalLocalChangesModule(source: string, moduleId: string, base: readonly ModuleSource[]): string {
  const asWritten = (): string => replaceInfoId(source, LOCAL_CHANGES_MODULE_ID, moduleId);
  const checked = loadUniverseWithDiagnostics([...base, { name: LOCAL_CHANGES_MODULE_ID, text: source }]);
  if (checked.diagnostics.length > 0) return asWritten();
  const parsed = parseModuleSource({
    name: LOCAL_CHANGES_MODULE_ID,
    text: source,
  });
  const republished = republishModule(checked.registry, { info: parsed.info, globals: declaredGlobalIds(parsed) }, (printed) => loadUniverseWithDiagnostics([...base, { name: LOCAL_CHANGES_MODULE_ID, text: printed }]), {
    registry: renamedRegistry(checked.registry, moduleId),
    options: {
      info: { ...parsed.info, id: moduleId },
      globals: localGlobalIds(parsed, moduleId),
    },
  });
  return republished.printed ?? asWritten();
}

export function materializeApprovedModIssue(issue: ApprovedModIssue, baseSources: readonly ModuleSource[] = []): MaterializedMod {
  if (!Number.isInteger(issue.number) || issue.number <= 0) throw new Error('approved mod issue requires a positive issue number');
  if (!issue.title) throw new Error(`approved mod issue #${issue.number} requires a title`);
  if (!issue.body) throw new Error(`approved mod issue #${issue.number} has no body`);
  const extracted = extractContributionDsl(issue.body);
  const parsed = parseModuleSource({
    name: `issue-${issue.number}`,
    text: extracted,
  });
  const contribution = contributionBase(issue.body);
  const declared = parsed.info.dependencies.map((dependency) => dependency.module);
  if (contribution.universe !== undefined && !declared.includes(contribution.universe)) {
    throw new Error(`approved mod issue #${issue.number} targets universe ${contribution.universe}, which its module does not declare a dependency on (it declares ${declared.join(', ') || 'none'})`);
  }
  const moduleId = parsed.info.id === LOCAL_CHANGES_MODULE_ID ? generatedModuleId(issue.number) : parsed.info.id;
  const text = moduleId === parsed.info.id ? extracted : canonicalLocalChangesModule(extracted, moduleId, baseSources);
  parseModuleSource({ name: moduleId, text });
  return {
    issue: issue.number,
    title: issue.title,
    url: issue.url,
    updatedAt: issue.updatedAt,
    tier: issueTier(issue),
    base: contribution,
    moduleId,
    file: `${issue.number}-${moduleId}.dsl`,
    text,
  };
}

export function emptyModportalManifest(): ModportalManifest {
  return { version: MODPORTAL_MANIFEST_VERSION, entries: [], intent: {} };
}

export interface SyncPlan {
  existing: ModportalManifest;
  materialized: readonly MaterializedMod[];
  base: readonly ModuleSource[];
  syncedAt: string;
}

export function planModportalSync(plan: SyncPlan): ModportalManifest {
  const intent = plan.existing.intent;
  const wanted = (mod: MaterializedMod): boolean => intent[String(mod.issue)] ?? tierDefaultsEnabled(mod.tier);
  const chosen = (mod: MaterializedMod): boolean => intent[String(mod.issue)] === true;
  const ordered = [...plan.materialized].sort((a, b) => Number(chosen(b)) - Number(chosen(a)) || a.issue - b.issue);

  const admitted: ModuleSource[] = [];
  const entries: ModportalEntry[] = [];
  for (const mod of ordered) {
    const entry: ModportalEntry = {
      issue: mod.issue,
      title: mod.title,
      url: mod.url,
      updatedAt: mod.updatedAt,
      tier: mod.tier,
      base: mod.base,
      moduleId: mod.moduleId,
      file: mod.file,
      enabled: false,
    };
    entries.push(entry);
    if (!wanted(mod)) continue;

    const source: ModuleSource = { name: mod.moduleId, text: mod.text };
    const diagnostics = loadUniverseWithDiagnostics([...plan.base, ...admitted, source]).diagnostics.map(formatModuleDiagnostic);
    if (diagnostics.length > 0) {
      entry.diagnostics = diagnostics;
      continue;
    }
    admitted.push(source);
    entry.enabled = true;
  }

  return {
    version: MODPORTAL_MANIFEST_VERSION,
    syncedAt: plan.syncedAt,
    entries: entries.sort((a, b) => a.issue - b.issue),
    intent,
  };
}
