import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { Change, Heading, RenameHistory } from './renameHistory';

// The one place anything here runs git. It reads a patch and reports what headings moved in it; what
// that means is `renameHistory.ts`'s, which is why the suite can prove the reasoning without a
// repository to prove it against.

// A record separator no commit subject and no line of a `.dsl` can hold, so the log splits on it.
const MARK = String.fromCharCode(1);

const COMMIT = new RegExp(`^${MARK}(?<sha>[0-9a-f]+) (?<subject>.*)$`);
const FILE = /^\+\+\+ b\/(?<file>.+)$/;
const HUNK = /^@@ /;
const HEADING = /^(?<sign>[-+])# (?<kind>[a-z][a-z0-9-]*) (?<id>[^\s]+)\s*$/;
const TITLE = /^(?<sign>[-+])title:[ \t]*(?<title>.*)$/;

// How far back a rename is worth looking for. A section renamed more times over than this is one
// nobody is going to recognise from a save body anyway.
const DEPTH = 40;

// The module a heading declares its section under, which is the file it is written in. Every address
// in the corpus is written that way, so a heading and the id a save body names are one string once
// this is done. A heading naming a module of its own is already whole.
const qualified = (file: string, id: string): string => (id.includes('.') ? id : `${path.basename(file).replace(/\.dsl$/, '')}.${id}`);

interface Carried {
  heading: Heading;
  into: Heading[];
}

// What a `git log --patch` says about section headings and nothing else. Its input is text, so what
// it reads out of a patch is proved without a repository to read one from.
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
    // A hunk boundary is as far as a title can follow its heading: past it the two were never
    // adjacent in the file, and the words belong to whatever the hunk cut in between.
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

// The commits whose patch is worth reading at all: `-S` hands back the ones where the number of times
// this word is written changed, and every commit that took its heading out is one of those.
function log(needle: string, directory: string, cwd: string): string {
  return execFileSync('git', ['log', `--max-count=${DEPTH}`, `--format=${MARK}%H %s`, '--patch', '--unified=0', '--no-color', '--no-renames', `-S${needle}`, '--', directory], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export class HistoryUnavailable extends Error {}

// Reads the history of one directory, remembering what it has already been asked: a repair asks
// about every id a rotted body names, and the same id is usually named several times over.
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
