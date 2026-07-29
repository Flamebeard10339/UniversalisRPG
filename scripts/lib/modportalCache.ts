import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { emptyModportalManifest } from '../../src/content/modportal';
import type { ModportalEntry, ModportalManifest } from '../../src/content/modportal';

export const MODPORTAL_MANIFEST_FILE = 'manifest.json';

export interface ModportalCache {
  manifest: ModportalManifest;
  warnings: string[];
}

// A path out of the manifest is data, not a location this tool chose: `..` in
// one would read outside the cache the entry claims to live in.
function insideCache(root: string, file: string): boolean {
  const relative = path.relative(root, path.resolve(root, file));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isEntry(value: unknown): value is ModportalEntry {
  const entry = value as ModportalEntry | null;
  return typeof entry === 'object' && entry !== null && typeof entry.moduleId === 'string' && typeof entry.file === 'string';
}

export const modportalEntryPath = (root: string, entry: ModportalEntry): string => path.resolve(root, entry.file);

// Everything reads this file: the game at launch and the tool that repairs the
// cache. A truncated write or an interrupted sync must take down neither, so a
// manifest that will not parse reads as an empty one carrying a warning rather
// than throwing past the tolerant loader.
export function readModportalCache(root: string, label?: string): ModportalCache {
  const file = path.join(root, MODPORTAL_MANIFEST_FILE);
  const ignored = (reason: string): ModportalCache => ({ manifest: emptyModportalManifest(label), warnings: [`Modportal ignored ${MODPORTAL_MANIFEST_FILE}: ${reason}`] });
  if (!existsSync(file)) return { manifest: emptyModportalManifest(label), warnings: [] };

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
  for (const entry of held.entries) {
    if (!isEntry(entry)) {
      warnings.push(`Modportal skipped an entry that names no moduleId and file: ${JSON.stringify(entry)}`);
      continue;
    }
    if (!insideCache(root, entry.file)) {
      warnings.push(`Modportal skipped ${entry.moduleId}: file escapes cache directory`);
      continue;
    }
    entries.push(entry);
  }
  return { manifest: { ...emptyModportalManifest(held.label ?? label), syncedAt: held.syncedAt, entries }, warnings };
}
