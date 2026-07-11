// A contribution is packaged as a *single* DSL file that may hold several
// modules, delimited by their `# info` headers: every module the author wrote
// from scratch, verbatim, followed by an auto-generated `<coreId>-PATCHES`
// module (diffModuleToPatch) for each shipped module they edited. One file the
// reviewer can read top-to-bottom and the merge script can split back into
// per-module files — no separate "local-changes" mod to keep in sync, and core
// files are never shipped in the issue.
import { diffModuleToPatch } from './contributionPatch';

export type ContributionDraftInput = {
  moduleId: string;
  // For a shipped module this is its on-disk source (the diff base); for a
  // brand-new module it's the starter `# info` stub openDraft seeded.
  baselineSource: string;
  currentSource: string;
  // True when moduleId names a module that ships in the universe (so edits to
  // it become a `# patch`), false for a module the author created this session
  // (shipped verbatim as its own new module).
  isCoreModule: boolean;
};

export type ContributionBundleResult = {
  // The multi-module file, or null when nothing meaningful changed.
  source: string | null;
  warnings: string[];
  moduleIds: string[];
};

// Splits a multi-module DSL file into one source string per module, using the
// mandatory `# info` header as the delimiter (anything before the first one —
// e.g. a stray comment — is ignored). The inverse of the join buildBundle does.
export const parseModules = (text: string): string[] => {
  const lines = text.split(/\r?\n/);
  const modules: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (/^#\s+info\b/i.test(line)) {
      if (current) modules.push(current);
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  if (current) modules.push(current);
  return modules.map((moduleLines) => moduleLines.join('\n').trim()).filter((source) => source.length > 0);
};

// The `id:` from a module source's `# info` block (the first `id:` line, which
// is always the info block's since `# info` must come first).
export const moduleIdOf = (source: string): string | null => source.match(/^id:\s*(\S+)/m)?.[1] ?? null;

export const buildContributionBundle = (drafts: ContributionDraftInput[]): ContributionBundleResult => {
  const authored: { id: string; source: string }[] = [];
  const patches: { id: string; source: string }[] = [];
  const warnings: string[] = [];

  for (const draft of drafts) {
    if (draft.currentSource.trim() === draft.baselineSource.trim()) continue;
    if (draft.isCoreModule) {
      const result = diffModuleToPatch(draft.baselineSource, draft.currentSource, draft.moduleId);
      warnings.push(...result.warnings);
      if (result.moduleSource) patches.push({ id: `${draft.moduleId}-PATCHES`, source: result.moduleSource.trimEnd() });
    } else {
      authored.push({ id: draft.moduleId, source: draft.currentSource.trimEnd() });
    }
  }

  const parts = [...authored, ...patches];
  if (parts.length === 0) return { source: null, warnings, moduleIds: [] };
  return { source: `${parts.map((part) => part.source).join('\n\n')}\n`, warnings, moduleIds: parts.map((part) => part.id) };
};
