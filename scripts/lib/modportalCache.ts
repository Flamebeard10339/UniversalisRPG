import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { WORLD_EXTENSION } from '../../src/grammar/structure';
import { moduleIdOf } from '../../src/content/worldDir';
import { emptyModportalManifest, MODPORTAL_MANIFEST_VERSION } from '../../src/content/modportal';
import type { ModportalEntry, ModportalManifest, ModTier } from '../../src/content/modportal';

export const DEFAULT_MODPORTAL_CACHE = 'content/modportal.local';
export const MODPORTAL_MANIFEST_FILE = 'manifest.json';

const ENTRY_STEM = /^\d+-[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/;

const namesEntry = (file: string): boolean => file.endsWith(WORLD_EXTENSION) && ENTRY_STEM.test(moduleIdOf(file));

export interface ModportalCache {
  manifest: ModportalManifest;
  warnings: string[];
}

export interface EntryText {
  text?: string;
  warning?: string;
}

function insideCache(root: string, file: string): boolean {
  const relative = path.relative(root, path.resolve(root, file));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isEntry(value: unknown): value is ModportalEntry {
  const entry = value as ModportalEntry | null;
  return typeof entry === 'object' && entry !== null && typeof entry.moduleId === 'string' && typeof entry.file === 'string';
}

function isTier(value: unknown): value is ModTier {
  return value === 'approved' || value === 'auto-enabled';
}

function intentFrom(value: unknown): Record<string, boolean> {
  if (typeof value !== 'object' || value === null) return {};
  return Object.fromEntries(Object.entries(value).filter(([, enabled]) => typeof enabled === 'boolean')) as Record<string, boolean>;
}

export const modportalEntryPath = (root: string, entry: ModportalEntry): string => path.resolve(root, entry.file);

export function readEntryText(root: string, entry: ModportalEntry): EntryText {
  const file = modportalEntryPath(root, entry);
  if (!existsSync(file)) return { warning: `Modportal skipped ${entry.moduleId}: missing ${entry.file}` };
  return { text: readFileSync(file, 'utf8') };
}

export function orphanEntryFiles(root: string, entries: readonly ModportalEntry[]): string[] {
  const kept = new Set(entries.map((entry) => entry.file));
  return readdirSync(root).filter((file) => namesEntry(file) && !kept.has(file));
}

export function readModportalCache(root: string): ModportalCache {
  const file = path.join(root, MODPORTAL_MANIFEST_FILE);
  const ignored = (reason: string): ModportalCache => ({ manifest: emptyModportalManifest(), warnings: [`Modportal ignored ${MODPORTAL_MANIFEST_FILE}: ${reason}`] });
  if (!existsSync(file)) return { manifest: emptyModportalManifest(), warnings: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    return ignored(error instanceof Error ? error.message : String(error));
  }
  const held = parsed as Partial<ModportalManifest> | null;
  if (typeof held !== 'object' || held === null || !Array.isArray(held.entries)) return ignored('it holds no entries array');

  const warnings: string[] = [];
  const entries: ModportalEntry[] = [];
  const intent = intentFrom(held.intent);
  const olderThanTiers = held.version !== MODPORTAL_MANIFEST_VERSION;
  for (const entry of held.entries) {
    if (!isEntry(entry)) {
      warnings.push(`Modportal skipped an entry that names no moduleId and file: ${JSON.stringify(entry)}`);
      continue;
    }
    if (!insideCache(root, entry.file)) {
      warnings.push(`Modportal skipped ${entry.moduleId}: file escapes cache directory`);
      continue;
    }
    if (olderThanTiers) {
      intent[String(entry.issue)] ??= entry.enabled;
      continue;
    }
    if (!isTier(entry.tier)) {
      warnings.push(`Modportal skipped ${entry.moduleId}: it names no tier`);
      continue;
    }
    entries.push(entry);
  }
  if (olderThanTiers) warnings.push(`Modportal read ${MODPORTAL_MANIFEST_FILE} as pre-tier: kept your enable/disable choices, run sync to rebuild the entries.`);
  return { manifest: { ...emptyModportalManifest(), syncedAt: held.syncedAt, entries, intent }, warnings };
}
