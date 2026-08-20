import { GLOBAL_SECTION_KINDS, sectionOf, type SectionKind } from "./sections";
import { LOCAL_CHANGES_MODULE_ID } from "./localChanges";
import { contributionBase, extractContributionDsl } from "./contribution";
import type { ContributionBase } from "./contribution";
import { parseModuleSource } from "./universe";
import { CONTENT_SECTION_MAPS } from "./sections";
import { mapOf } from "./registry";
import { formatModuleDiagnostic } from "./registry";
import { loadUniverseWithDiagnostics } from "./load";
import type { Registry } from "./registry";
import type { ModuleSource } from "./universe";
import { declaredGlobalIds, republishModule } from "./serialize";
import { visitSection } from "./sections";

export const MOD_PENDING_LABEL = "mod-pending";
export const MOD_APPROVED_LABEL = "mod-approved";
export const MOD_AUTO_ENABLED_LABEL = "mod-auto-enabled";
export const MODPORTAL_MANIFEST_VERSION = 2;

export type ModTier = "approved" | "auto-enabled";

export const LISTABLE_MOD_LABELS: readonly { label: string; tier: ModTier }[] =
  [
    { label: MOD_APPROVED_LABEL, tier: "approved" },
    { label: MOD_AUTO_ENABLED_LABEL, tier: "auto-enabled" },
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
  // What the contribution claimed it was validated against, carried so a
  // maintainer reading the cache can tell a mod checked against this content set
  // from one checked against something else.
  base?: ContributionBase;
  moduleId: string;
  file: string;
  enabled: boolean;
  diagnostics?: string[];
}

// `intent` is what the user chose, keyed by issue number, and it deliberately
// outlives the entry: an issue that loses its label is pruned from `entries`
// while the decision to switch it off survives a later re-label. A tier default
// is not a choice and never lands here, so promoting a mod to
// `mod-auto-enabled` can still enable it.
export interface ModportalManifest {
  version: typeof MODPORTAL_MANIFEST_VERSION;
  syncedAt?: string;
  entries: ModportalEntry[];
  intent: Record<string, boolean>;
}

export function tierDefaultsEnabled(tier: ModTier): boolean {
  return tier === "auto-enabled";
}

export function issueTier(issue: ApprovedModIssue): ModTier {
  if (issue.tier) return issue.tier;
  const labels = issue.labels?.map((label) => label.name) ?? [];
  return labels.includes(MOD_AUTO_ENABLED_LABEL) ? "auto-enabled" : "approved";
}

function generatedModuleId(issue: number): string {
  return `approved-mod-${issue}`;
}

function renamedId(id: string, from: string, to: string): string {
  return id.startsWith(`${from}.`) ? `${to}${id.slice(from.length)}` : id;
}

function replaceInfoId(source: string, from: string, to: string): string {
  const pattern = new RegExp(
    `^(\\uFEFF?# info[ \\t]+)${from}(?=[ \\t]*(?:\\r?\\n|$))`,
    "m",
  );
  const replaced = source.replace(pattern, `$1${to}`);
  if (replaced === source)
    throw new Error(`approved mod issue did not declare # info ${from}`);
  return replaced;
}

function cloned<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// A save is addressed by the key it hangs under and carries no `id` field, so
// the field is rewritten where there is one and the key is rewritten either
// way by the caller.
function rewriteHydratedSection(
  kind: SectionKind,
  key: string,
  value: object,
  from: string,
  to: string,
): object {
  const next = cloned(value) as {
    id?: string;
    stats?: Record<string, unknown>;
  };
  if (typeof next.id === "string") next.id = renamedId(next.id, from, to);
  if (kind === "entity" && next.stats) {
    next.stats = Object.fromEntries(
      Object.entries(next.stats).map(([statId, range]) => [
        renamedId(statId, from, to),
        range,
      ]),
    );
  }
  visitSection(sectionOf(kind, next), `# ${kind} ${key}`, (_kind, id: string) =>
    renamedId(id, from, to),
  );
  return next;
}

function localGlobalIds(
  parsed: ReturnType<typeof parseModuleSource>,
  moduleId: string,
): string[] {
  return parsed.sections
    .filter((section) => GLOBAL_SECTION_KINDS.includes(section.kind))
    .map((section) =>
      renamedId(
        (section.value as { id: string }).id,
        LOCAL_CHANGES_MODULE_ID,
        moduleId,
      ),
    );
}

// Every map the rename has to reach is every map a kind lands in, which the row
// already answers. A kind listed for the loader and forgotten here would keep
// its `local-changes.` id, be dropped by serialize's own-module filter, and
// leave every reference that WAS renamed pointing at a section the published mod
// no longer contains — so the list is the row's and not a second one. A global
// id carries no module prefix, so renaming a variable or a slot finds nothing to
// rename, and it costs a pass to be ready for the day one of them does.
function renamedRegistry(loaded: Registry, moduleId: string): Registry {
  const registry = { ...loaded };
  for (const [kind, mapName] of CONTENT_SECTION_MAPS) {
    const sourceMap = mapOf(loaded, mapName) as unknown as ReadonlyMap<
      string,
      object
    >;
    const next = new Map(sourceMap);
    for (const [id, value] of sourceMap) {
      if (!id.startsWith(`${LOCAL_CHANGES_MODULE_ID}.`)) continue;
      next.delete(id);
      next.set(
        renamedId(id, LOCAL_CHANGES_MODULE_ID, moduleId),
        rewriteHydratedSection(
          kind,
          id,
          value,
          LOCAL_CHANGES_MODULE_ID,
          moduleId,
        ),
      );
    }
    (registry as unknown as Record<string, unknown>)[mapName] = next;
  }
  return registry;
}

// Canonicalising is an offer, not a promise: what the serializer cannot carry
// travels as the author's own bytes under the new id instead. Every edit to
// another module's content and every `# remove` is in that set.
function canonicalLocalChangesModule(
  source: string,
  moduleId: string,
  base: readonly ModuleSource[],
): string {
  const asWritten = (): string =>
    replaceInfoId(source, LOCAL_CHANGES_MODULE_ID, moduleId);
  const checked = loadUniverseWithDiagnostics([
    ...base,
    { name: LOCAL_CHANGES_MODULE_ID, text: source },
  ]);
  if (checked.diagnostics.length > 0) return asWritten();
  const parsed = parseModuleSource({
    name: LOCAL_CHANGES_MODULE_ID,
    text: source,
  });
  const republished = republishModule(
    checked.registry,
    { info: parsed.info, globals: declaredGlobalIds(parsed) },
    (printed) =>
      loadUniverseWithDiagnostics([
        ...base,
        { name: LOCAL_CHANGES_MODULE_ID, text: printed },
      ]),
    {
      registry: renamedRegistry(checked.registry, moduleId),
      options: {
        info: { ...parsed.info, id: moduleId },
        globals: localGlobalIds(parsed, moduleId),
      },
    },
  );
  return republished.printed ?? asWritten();
}

export function materializeApprovedModIssue(
  issue: ApprovedModIssue,
  baseSources: readonly ModuleSource[] = [],
): MaterializedMod {
  if (!Number.isInteger(issue.number) || issue.number <= 0)
    throw new Error("approved mod issue requires a positive issue number");
  if (!issue.title)
    throw new Error(`approved mod issue #${issue.number} requires a title`);
  if (!issue.body)
    throw new Error(`approved mod issue #${issue.number} has no body`);
  const extracted = extractContributionDsl(issue.body);
  const parsed = parseModuleSource({
    name: `issue-${issue.number}`,
    text: extracted,
  });
  const contribution = contributionBase(issue.body);
  // The universe a web contributor names is read rather than filed: a module
  // that does not depend on what its author says it targets was validated
  // against something other than what the maintainer is about to load.
  const declared = parsed.info.dependencies.map(
    (dependency) => dependency.module,
  );
  if (
    contribution.universe !== undefined &&
    !declared.includes(contribution.universe)
  ) {
    throw new Error(
      `approved mod issue #${issue.number} targets universe ${contribution.universe}, which its module does not declare a dependency on (it declares ${declared.join(", ") || "none"})`,
    );
  }
  const moduleId =
    parsed.info.id === LOCAL_CHANGES_MODULE_ID
      ? generatedModuleId(issue.number)
      : parsed.info.id;
  const text =
    moduleId === parsed.info.id
      ? extracted
      : canonicalLocalChangesModule(extracted, moduleId, baseSources);
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

// Admission is incremental so that one mod which does not load cannot withhold
// the rest of the portal: a candidate joins the set only if the set still loads
// with it, and otherwise is recorded switched off carrying the diagnostic that
// rejected it. Explicit intent is admitted ahead of tier defaults, so a mod the
// user asked for wins a conflict against one merely on by default.
export function planModportalSync(plan: SyncPlan): ModportalManifest {
  const intent = plan.existing.intent;
  const wanted = (mod: MaterializedMod): boolean =>
    intent[String(mod.issue)] ?? tierDefaultsEnabled(mod.tier);
  const chosen = (mod: MaterializedMod): boolean =>
    intent[String(mod.issue)] === true;
  const ordered = [...plan.materialized].sort(
    (a, b) => Number(chosen(b)) - Number(chosen(a)) || a.issue - b.issue,
  );

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
    const diagnostics = loadUniverseWithDiagnostics([
      ...plan.base,
      ...admitted,
      source,
    ]).diagnostics.map(formatModuleDiagnostic);
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
