import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const usage = [
  'Usage: npm run handoff',
  '',
  'Asks whether the folders a session hands over through are still telling the',
  'truth. A feature that runs longer than one session keeps two files under',
  'docs/<feature>/ and nothing else: what is still wrong that a lane can close on',
  'its own, and what is still wrong that waits on the author. Nothing is struck',
  'through in either: done means deleted. What is already true is not written down',
  'here at all — it is in the code, in a test, in CLAUDE.md, in a memory, or in git.',
  '',
  'So this reads a folder off the tree rather than off an index, reports any third',
  'file as the format growing back, and asks of every open item whether it names',
  'the thing that would close it — an item that names none is how invented work',
  'gets started.',
  '',
  'It reports rather than gates. The one thing it can measure that a reader',
  'cannot is how much work has landed since the docs were last written, which is',
  'the number that says whether they have drifted.',
].join('\n');

const OPEN = ['open-agent.md', 'open-human.md'];

const isOpen = (name: string): boolean => /^open-.+\.md$/.test(name);

const WORK = ['src', 'content', 'scripts'];

const git = (...args: string[]): string => execFileSync('git', args, { encoding: 'utf8' }).trim();

export interface Complaint {
  file: string;
  says: string;
}

export interface Item {
  at: number;
  heading: string;
  body: string[];
}

// An item's own clause naming what would close or move it is the whole format: without it a reader cannot tell an open question from a decision already taken, and a lane invents the answer.
const namesItsClose = (line: string): boolean => /^\*[^*\s]/.test(line.trimStart());

export function itemsIn(lines: readonly string[]): Item[] {
  const items: Item[] = [];
  lines.forEach((line, index) => {
    if (/^##\s+\S/.test(line)) items.push({ at: index + 1, heading: line.trim(), body: [] });
    else items[items.length - 1]?.body.push(line);
  });
  return items;
}

// A line that is struck through, or a heading that calls itself finished, is the shape this format exists to remove: it leaves a reader working out which half of the file still applies.
export function complaintsIn(file: string, text: string): Complaint[] {
  const complaints: Complaint[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.includes('~~')) complaints.push({ file, says: `line ${index + 1} is struck through, and done means deleted` });
    if (/^#{1,6}\s/.test(line) && /\b(closed|fixed|done|resolved|complete)\b/i.test(line)) complaints.push({ file, says: `line ${index + 1} is a heading that calls itself finished: ${line.trim()}` });
  });
  for (const item of itemsIn(lines)) {
    if (!item.body.some(namesItsClose)) complaints.push({ file, says: `line ${item.at} names nothing that would close it: ${item.heading}` });
  }
  return complaints;
}

export interface Folder {
  name: string;
  open: string[];
  missing: string[];
  strays: string[];
  items: number;
  complaints: Complaint[];
  since: number;
  lastWrote: string;
}

function reviewFolder(dir: string): Folder {
  const held = readdirSync(dir).filter((name) => name.endsWith('.md'));
  const open = held.filter(isOpen);
  const texts = open.map((name) => [name, readFileSync(path.join(dir, name), 'utf8')] as const);

  const written = open.map((name) => git('log', '-1', '--format=%H %h %s', '--', path.join(dir, name))).filter((line) => line !== '');
  let since = 0;
  let lastWrote = '(never committed)';
  if (written.length > 0) {
    // The docs are as old as their youngest line, so the commit to count from is the last one that touched either of them.
    const commits = written.map((line) => line.split(' ')[0]);
    const times = commits.map((hash) => Number(git('show', '-s', '--format=%ct', hash)));
    const at = times.indexOf(Math.max(...times));
    lastWrote = written[at].split(' ').slice(1).join(' ');
    since = Number(git('rev-list', '--count', `${commits[at]}..HEAD`, '--', ...WORK));
  }

  return {
    name: path.basename(dir),
    open,
    missing: OPEN.filter((name) => !open.includes(name)),
    strays: held.filter((name) => !isOpen(name)),
    items: texts.reduce((count, [, text]) => count + itemsIn(text.split(/\r?\n/)).length, 0),
    complaints: texts.flatMap(([name, text]) => complaintsIn(name, text)),
    since,
    lastWrote,
  };
}

export const wrongIn = (folder: Folder): number => folder.complaints.length + folder.missing.length + folder.strays.length;

export function folderLines(folder: Folder): string[] {
  const lines = [`docs/${folder.name}/`];
  const say = (mark: string, text: string): void => void lines.push(`  ${mark} ${text}`);
  say('ok', `${folder.open.join(' and ')}, ${folder.items} open item(s) between them`);
  for (const name of folder.missing) say('--', `no ${name} — the queue is split by who is blocked, and a half that is empty says so in a line rather than by being absent`);
  for (const name of folder.strays) say('--', `${name} stands beside them, and this format is the open files and nothing else — what is already true belongs in the code, in CLAUDE.md, in a memory, or in git`);
  for (const complaint of folder.complaints) say('--', `${complaint.file}: ${complaint.says}`);
  if (folder.since === 0) say('ok', 'nothing has landed since these were last written');
  else say(folder.since > 8 ? '--' : 'ok', `${folder.since} commit(s) under ${WORK.join('/')} since these were last written — the last was ${folder.lastWrote}`);
  return lines;
}

export function handoffLines(dirs: readonly string[]): string[] {
  if (dirs.length === 0) return ['no docs/<feature>/ folder keeps an open-*.md, so nothing here is handed over between sessions'];
  const folders = dirs.map(reviewFolder);
  const wrong = folders.reduce((count, folder) => count + wrongIn(folder), 0);
  const stale = folders.filter((folder) => folder.since > 8).length;
  return [
    ...folders.flatMap((folder) => [...folderLines(folder), '']),
    wrong === 0 && stale === 0 ? 'nothing to hand over that is not already written down.' : `${wrong} thing(s) to put right${stale === 0 ? '' : `, and ${stale} folder(s) whose docs are behind the work`}.`,
  ];
}

export const featureFolders = (root = 'docs'): string[] =>
  readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))
    .filter((dir) => readdirSync(dir).some(isOpen));

function main(): void {
  if (process.argv.includes('--help')) {
    console.log(usage);
    return;
  }
  console.log(handoffLines(featureFolders()).join('\n'));
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
