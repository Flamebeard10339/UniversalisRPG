import { normalize } from 'node:path';
import * as git from './git';

export function posix(path: string): string {
  return normalize(path).replace(/\\/g, '/');
}

// The one enumeration of tracked paths — audit-status, the layer rule, the
// architecture view and merge-ready all ask this question, and private copies
// of it is how they drift. Throws when git does; a caller that can answer
// around that catches it.
export function trackedFiles(): string[] {
  const files = git.lsFiles();
  if (files === null) throw new Error('git ls-files failed — cannot enumerate tracked files');
  return files;
}
