import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { Change, Heading, RenameHistory } from './renameHistory';

const MARK = String.fromCharCode(1);

const COMMIT = new RegExp(`^${MARK}(?<sha>[0-9a-f]+) (?<subject>.*)$`);
const FILE = /^\+\+\+ b\/(?<file>.+)$/;
const HUNK = /^@@ /;
const HEADING = /^(?<sign>[-+])# (?<kind>[a-z][a-z0-9-]*) (?<id>[^\s]+)\s*$/;
const TITLE = /^(?<sign>[-+])title:[ \t]*(?<title>.*)$/;

const DEPTH = 40;

const qualified = (file: string, id: string): string => (id.includes('.') ? id : `${path.basename(file).replace(/\.dsl$/, '')}.${id}`);

interface Carried {
  heading: Heading;
  into: Heading[];
}

export function headingsChangedIn(text: string): Change[] {
  const changes: Change[] = [];
  let change: Change & { removed: Heading[]; added: Heading[] } = { sha: '', subject: '', removed: [], added: [] };
  let file = '';
  let carried: Carried | null = null;

  for (const line of text.split('\n')) {
    const commit = COMMIT.exec(line);
    if (commit) {
      if (change.sha !== '') changes.push(change);
      change = { sha: commit.groups!.sha!, subject: commit.groups!.subject!.trimEnd(), removed: [], added: [] };
      file = '';
      carried = null;
      continue;
    }
    const named = FILE.exec(line);
    if (named) {
      file = named.groups!.file!;
      carried = null;
      continue;
    }
    if (HUNK.test(line)) {
      carried = null;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading && file !== '') {
      const found: Heading = { file, kind: heading.groups!.kind!, id: qualified(file, heading.groups!.id!) };
      carried = { heading: found, into: heading.groups!.sign! === '-' ? change.removed : change.added };
      carried.into.push(found);
      continue;
    }
    const title = TITLE.exec(line);
    if (title && carried !== null && carried.into === (title.groups!.sign! === '-' ? change.removed : change.added) && carried.heading.title === undefined) {
      carried.heading.title = title.groups!.title!.trim();
    }
  }
  if (change.sha !== '') changes.push(change);
  return changes;
}

function log(needle: string, directory: string, cwd: string): string {
  return execFileSync('git', ['log', `--max-count=${DEPTH}`, `--format=${MARK}%H %s`, '--patch', '--unified=0', '--no-color', '--no-renames', `-S${needle}`, '--', directory], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export class HistoryUnavailable extends Error {}

export function gitHistory(directory: string, cwd: string = process.cwd()): RenameHistory {
  const asked = new Map<string, readonly Change[]>();
  return {
    removalsOf(id: string): readonly Change[] {
      const held = asked.get(id);
      if (held) return held;
      let patch: string;
      try {
        patch = log(id.slice(id.lastIndexOf('.') + 1), directory, cwd);
      } catch (error) {
        throw new HistoryUnavailable(`git could not be asked what became of ${id}: ${error instanceof Error ? error.message : String(error)}`);
      }
      const found = headingsChangedIn(patch).filter((change) => change.removed.some((heading) => heading.id === id));
      asked.set(id, found);
      return found;
    },
  };
}
