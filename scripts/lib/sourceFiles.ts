import { readdirSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'android', '.git']);

export function posix(path: string): string {
  return normalize(path).replace(/\\/g, '/');
}

export function sourceFiles(directory: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries) {
    if (SKIPPED_DIRECTORIES.has(entry)) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (SOURCE_EXTENSIONS.some((extension) => entry.endsWith(extension))) found.push(posix(path));
  }
  return found;
}
