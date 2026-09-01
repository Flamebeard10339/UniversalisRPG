import path from 'node:path';
import { CORPUS_DIR } from '../src/content/shipped';
import { engineModules } from '../src/content/engineModules';
import type { Registry } from '../src/content/registry';
import { parseOwnerRef } from '../src/runtime/state';
import { SAVE_VERSION } from '../src/runtime/save';
import { gitHistory, HistoryUnavailable } from './lib/gitHistory';
import { inferRename, settled, type Inference, type RenameHistory } from './lib/renameHistory';
import {
  classifier,
  edited,
  loadContent,
  loadProblems,
  readContent,
  savesIn,
  writeFiles,
  type ContentFile,
  type Edit,
  type SaveBody,
  type Written,
} from './lib/saveFixtures';

// A `# save` body names ids and nothing checks them: rename the section and the recording still
// parses, still loads, and quietly stops meaning what it says — the loader prunes what it cannot
// find and plays on. `npm run oracle` says which bodies that has happened to; this says what the ids
// became and puts them back.
//
// Rename inference is a reading of a diff and can be wrong, so nothing is written on a guess: an
// answer with a second signal behind it writes under `--write`, and everything else waits for the
// author to name it with `--rename`. Nothing is written at all unless every rewritten body then
// loads against the real registry with the loader pruning nothing, and the run refuses as a whole
// rather than in part.

export interface RepairOptions {
  write?: boolean;
  // Renames the author named themselves, which are taken over anything history would have said.
  renames?: ReadonlyMap<string, string>;
}

export interface RepairReport {
  lines: string[];
  ok: boolean;
  files: ContentFile[];
}

const RENAME_FLAG = '--rename';

const refused = (lines: string[]): RepairReport => ({ lines: [...lines, '', 'Refused: no file was written.'], ok: false, files: [] });

// Whether anything in the world declares this id, under any kind. The kinds come off the registry
// rather than a list here, so a kind added next month is asked about with nothing edited.
const declaredIn = (registry: Registry) => (id: string): boolean => registry.namespace.kinds().some((kind) => registry.namespace.has(kind, id));

// Every string a save body holds, as a key or as a value. A body is a recording rather than a
// declared shape — no field says which of its strings are addresses — so all of them are asked
// about and the registry says which it knows.
function stringsIn(value: unknown, into: Set<string>): void {
  if (typeof value === 'string') {
    into.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const each of value) stringsIn(each, into);
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, held] of Object.entries(value)) {
      into.add(key);
      stringsIn(held, into);
    }
  }
}

// The two ways a string in a body may be an address: written whole, or as the `<kind>.<id>` an
// active action and its roster seats carry their owner as. Whichever the registry knows settles it.
const readingsOf = (text: string): string[] => {
  const { obj, objId } = parseOwnerRef(text);
  return obj === '' ? [text] : [text, objId];
};

// The addresses a body names that nothing declares any more. A string with no module in front of it
// is a slot, a plane position or a word of the engine's own rather than an address, and asking
// history about it turns up nothing anyway.
function danglingIn(body: SaveBody, declared: (id: string) => boolean): string[] {
  const strings = new Set<string>();
  stringsIn(body, strings);
  return [...strings].filter((text) => text.includes('.') && !readingsOf(text).some(declared)).sort();
}

const renamedText = (text: string, renames: ReadonlyMap<string, string>): string => {
  const whole = renames.get(text);
  if (whole !== undefined) return whole;
  const { obj, objId } = parseOwnerRef(text);
  const inner = obj === '' ? undefined : renames.get(objId);
  return inner === undefined ? text : `${obj}.${inner}`;
};

function renamedIn(value: unknown, renames: ReadonlyMap<string, string>): unknown {
  if (typeof value === 'string') return renamedText(value, renames);
  if (Array.isArray(value)) return value.map((each) => renamedIn(each, renames));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, held]) => [renamedText(key, renames), renamedIn(held, renames)]));
  }
  return value;
}

const bodyText = (written: Written, body: SaveBody): string => JSON.stringify({ version: written.fixture.version, ...body });

const judge = (written: Written, text: string) => ({ id: written.fixture.id, ...(written.over ? { over: written.over } : {}), text });

interface Rotted {
  written: Written;
  // What the loader had to prune to stand the body up as it stands.
  pruned: readonly string[];
}

const said = (found: Inference): string => `  ${found.id} → ${found.to ?? '?'}  [${found.standing}]\n    ${found.evidence}`;

export function repair(files: readonly ContentFile[], history: RenameHistory, options: RepairOptions = {}): RepairReport {
  const authored = options.renames ?? new Map<string, string>();
  const loaded = loadContent(files, engineModules());
  if (loaded.diagnostics.length > 0) {
    return refused(['The content does not load, so there is no registry to say which id a body names is gone.', ...loaded.diagnostics]);
  }

  const saves = savesIn(files, loaded);
  const behind = saves.filter((written) => written.fixture.version !== SAVE_VERSION);
  if (behind.length > 0) {
    return refused([
      `${behind.length} fixture(s) are not stamped SAVE_VERSION ${SAVE_VERSION}, and a body this build cannot read is a shape question rather than a name one.`,
      ...behind.map((written) => `  ${written.fixture.file}: ${written.fixture.id} — version ${written.fixture.version}`),
      'Run `npm run migrate-saves` first.',
    ]);
  }

  const declared = declaredIn(loaded.registry);
  const rotted: Rotted[] = saves.flatMap((written) => {
    const pruned = loadProblems([judge(written, bodyText(written, written.body))], loaded.registry);
    return pruned.length === 0 ? [] : [{ written, pruned }];
  });

  const lines: string[] = [];
  if (rotted.length === 0) {
    return { lines: ['Every # save body names ids the world still declares. Nothing to repair.'], ok: true, files: [] };
  }

  const classificationOf = classifier(loaded.registry, saves.map((written) => written.fixture));
  for (const each of rotted) {
    lines.push(`${each.written.fixture.file}: # save ${each.written.fixture.id} (${classificationOf(each.written.fixture.id)})`);
    for (const problem of each.pruned) lines.push(`  ${problem.slice(each.written.fixture.id.length + 2)}`);
  }

  const asked = new Map<string, Inference>();
  let unreadable: string | null = null;
  for (const each of rotted) {
    for (const id of danglingIn(each.written.body, declared)) {
      if (asked.has(id) || authored.has(id)) continue;
      try {
        asked.set(id, inferRename(id, history, declared));
      } catch (error) {
        if (!(error instanceof HistoryUnavailable)) throw error;
        unreadable = error.message;
      }
    }
  }
  if (unreadable !== null) return refused([...lines, '', unreadable]);

  const found = [...asked.values()];
  const taken = found.filter(settled);
  const waiting = found.filter((each) => !settled(each));

  const renames = new Map<string, string>(authored);
  for (const each of taken) if (!renames.has(each.id)) renames.set(each.id, each.to!);

  if (authored.size > 0) lines.push('', `${authored.size} rename(s) you named, taken as written:`, ...[...authored].map(([from, to]) => `  ${from} → ${to}`));
  if (taken.length > 0) lines.push('', `${taken.length} rename(s) history is willing to stand behind:`, ...taken.map(said));
  if (waiting.length > 0) lines.push('', `${waiting.length} id(s) history will not settle. Name each yourself with \`${RENAME_FLAG} <old>=<new>\`:`, ...waiting.map(said));

  const collisions = rotted.flatMap((each) => {
    const strings = new Set<string>();
    stringsIn(each.written.body, strings);
    return [...renames].filter(([from, to]) => strings.has(from) && strings.has(to)).map(([from, to]) => `${each.written.fixture.id}: already names both ${from} and ${to}, so renaming one onto the other would lose a holding`);
  });

  const rewrites = rotted.map((each) => ({ written: each.written, text: bodyText(each.written, renamedIn(each.written.body, renames) as SaveBody) }));
  const spread = rewrites.filter((rewrite) => rewrite.written.span === null).map((rewrite) => `${rewrite.written.fixture.id}: its body is ${rewrite.written.spread} lines, and rewriting one in place needs exactly one`);
  const stillPruned = loadProblems(rewrites.map((rewrite) => judge(rewrite.written, rewrite.text)), loaded.registry);

  const problems = [...collisions, ...spread, ...stillPruned];
  if (problems.length > 0) {
    return refused([...lines, '', 'What the repair would write is still not a state the world holds:', ...problems.map((problem) => `  ${problem}`)]);
  }

  const unchanged = rewrites.filter((rewrite) => rewrite.text === bodyText(rewrite.written, rewrite.written.body));
  if (unchanged.length === rewrites.length) {
    return refused([...lines, '', 'Nothing here is a rename this can put back.']);
  }

  const recordings = rewrites.filter((rewrite) => classificationOf(rewrite.written.fixture.id) === 'recording').map((rewrite) => rewrite.written.fixture.id);
  if (recordings.length > 0) {
    lines.push('', `These are recordings of a replay, and putting a name back only makes them loadable — it does not make them true. Walk each route again: ${recordings.join(', ')}`);
  }

  const byFile = new Map<string, Edit[]>();
  for (const rewrite of rewrites) {
    const file = rewrite.written.fixture.file;
    byFile.set(file, [...(byFile.get(file) ?? []), { span: rewrite.written.span!, text: rewrite.text }]);
  }
  const written = edited(files, byFile);

  if (options.write !== true) {
    lines.push('', `${rewrites.length} body(ies) in ${written.length} file(s) would be rewritten. Nothing was written: run it again with --write.`);
    return { lines, ok: true, files: [] };
  }
  lines.push('', `Rewrote ${rewrites.length} body(ies) in ${written.length} file(s).`);
  return { lines, ok: true, files: written };
}

const usage = [
  'Usage: npm run repair-saves -- [<content directory>] [--write] [--rename <old>=<new>]...',
  '',
  'A `# save` body names ids and nothing checks them, so renaming or moving a section',
  'leaves the recording parsing, loading and no longer meaning what it says. This finds',
  'every body the loader has to prune, looks back through git for what each missing id',
  'became, and puts it back.',
  '',
  'It reports and writes nothing unless --write is given. Even then it writes only a',
  'rename history will stand behind: one where the section was the only one of its kind',
  'to move in that commit, kept its title, or is written into the name that replaced it.',
  'Anything else waits for `--rename <old>=<new>`, which is taken as written.',
  '',
  'Nothing is written unless every rewritten body then loads against the real registry',
  'with the loader pruning nothing, and the run refuses as a whole rather than in part.',
  '',
  'A body stamped an older SAVE_VERSION is a shape question: `npm run migrate-saves`.',
].join('\n');

function parseRenames(args: readonly string[]): Map<string, string> {
  const renames = new Map<string, string>();
  for (const [index, arg] of args.entries()) {
    if (arg !== RENAME_FLAG) continue;
    const pair = args[index + 1] ?? '';
    const at = pair.indexOf('=');
    if (at <= 0 || at === pair.length - 1) throw new Error(`${RENAME_FLAG} takes <old>=<new>, not ${JSON.stringify(pair)}`);
    renames.set(pair.slice(0, at), pair.slice(at + 1));
  }
  return renames;
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage);
    return;
  }
  const loose = args.filter((arg, index) => !arg.startsWith('--') && args[index - 1] !== RENAME_FLAG);
  if (loose.length > 1) {
    console.error(`repair-saves takes at most one directory\n\n${usage}`);
    process.exit(2);
  }
  let renames: Map<string, string>;
  try {
    renames = parseRenames(args);
  } catch (error) {
    console.error(`${(error as Error).message}\n\n${usage}`);
    process.exit(2);
    return;
  }
  const directory = loose[0] ?? CORPUS_DIR;
  const report = repair(readContent(directory), gitHistory(directory), { write: args.includes('--write'), renames });
  console.log(report.lines.join('\n'));
  writeFiles(report.files);
  if (!report.ok) process.exit(1);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
