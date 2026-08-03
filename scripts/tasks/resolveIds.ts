import type { Task } from '../lib/taskStore';
import { refuseUnknownIds, reportUnknownIds } from './render';

export interface ResolveOptions {
  // A read's unknown id is an answer, not an error: pass the emitter and the
  // report goes there at exit 0. Writes omit it and get the refusing form.
  report?: (line: string) => void;
}

// Long generated ids made exact ids unusable as handles, so every command
// resolves a fragment: an exact id wins outright, then a prefix of exactly
// one id, then a substring of exactly one. Ambiguity is refused with the
// candidates rather than guessed — resolution must never depend on store
// order — and every non-exact resolution is named in the output. Returns
// null after reporting when any fragment fails, so a batch is all-or-nothing
// and a write caller has nothing half-resolved to act on.
export function resolveTaskIds(given: string[], tasks: Task[], options: ResolveOptions = {}): Task[] | null {
  const resolved: Task[] = [];
  const unknown: string[] = [];
  for (const fragment of given) {
    const exact = tasks.find((task) => task.id === fragment);
    if (exact) {
      resolved.push(exact);
      continue;
    }
    const prefixed = tasks.filter((task) => task.id.startsWith(fragment));
    const candidates = prefixed.length > 0 ? prefixed : tasks.filter((task) => task.id.includes(fragment));
    if (candidates.length === 1) {
      console.log(`resolved ${fragment} -> ${candidates[0].id}`);
      resolved.push(candidates[0]);
      continue;
    }
    if (candidates.length > 1) {
      console.error(`error: ${fragment} matches ${candidates.length} ids — say which one: ${candidates.map((task) => task.id).join(', ')}`);
      process.exitCode = 1;
      return null;
    }
    unknown.push(fragment);
  }
  if (unknown.length > 0) {
    if (options.report) reportUnknownIds(unknown, tasks, options.report);
    else refuseUnknownIds(unknown, tasks);
    return null;
  }
  // A batch that names one record twice — or two fragments that resolve to
  // one id — is one action on it, not two.
  return [...new Map(resolved.map((task) => [task.id, task])).values()];
}
