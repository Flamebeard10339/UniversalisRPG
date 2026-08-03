import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'android', '.git']);

export function posix(path: string): string {
  return normalize(path).replace(/\\/g, '/');
}

// The one enumeration of tracked paths — audit-status, the architecture
// view and merge-ready all ask this question, and three private copies of
// it is how they drift. Throws when git does; a caller that can answer
// around that catches it.
export function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .trim()
    .split('\n')
    .filter((file) => file !== '');
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
