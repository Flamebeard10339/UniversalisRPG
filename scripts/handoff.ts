import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const usage = [
  'Usage: npm run handoff',
  '',
  'Asks whether the folders a session hands over through are still telling the',
  'truth. A feature that runs longer than one session keeps three files under',
  'docs/<feature>/ — deliverable-log.md says what it is for, open.md is what is',
  'still wrong, settled.md is what a cold agent has to know. Nothing is struck',
  'through in any of them: done means deleted.',
  '',
  'It reports rather than gates. The one thing it can measure that a reader',
  'cannot is how much work has landed since the docs were last written, which is',
  'the number that says whether they have drifted.',
].join('\n');

const KEPT = ['deliverable-log.md', 'open.md', 'settled.md'] as const;

const WORK = ['src', 'content', 'scripts'];

const git = (...args: string[]): string => execFileSync('git', args, { encoding: 'utf8' }).trim();

export interface Complaint {
  file: string;
  says: string;
}

// A line that is struck through, or a heading that calls itself finished, is the shape this format exists to remove: it leaves a reader working out which half of the file still applies.
export function complaintsIn(file: string, text: string): Complaint[] {
  const complaints: Complaint[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.includes('~~')) complaints.push({ file, says: `line ${index + 1} is struck through, and done means deleted` });
    if (/^#{1,6}\s/.test(line) && /\b(closed|fixed|done|resolved|complete)\b/i.test(line)) complaints.push({ file, says: `line ${index + 1} is a heading that calls itself finished: ${line.trim()}` });
  });
  return complaints;
}

export interface Folder {
  name: string;
  missing: string[];
  complaints: Complaint[];
  unlinked: string[];
  since: number;
  lastWrote: string;
}

function reviewFolder(dir: string): Folder {
  const held = KEPT.filter((name) => existsSync(path.join(dir, name)));
  const missing = KEPT.filter((name) => !held.includes(name));
  const complaints = held.filter((name) => name !== 'deliverable-log.md').flatMap((name) => complaintsIn(name, readFileSync(path.join(dir, name), 'utf8')));

  const log = existsSync(path.join(dir, 'deliverable-log.md')) ? readFileSync(path.join(dir, 'deliverable-log.md'), 'utf8') : '';
  const unlinked = held.filter((name) => name !== 'deliverable-log.md' && !log.includes(name));

  const written = held.map((name) => git('log', '-1', '--format=%H %h %s', '--', path.join(dir, name))).filter((line) => line !== '');
  const newest = written[0] ?? '';
  let since = 0;
  let lastWrote = '(never committed)';
  if (newest !== '') {
    // The docs are as old as their youngest line, so the commit to count from is the last one that touched any of them.
    const commits = written.map((line) => line.split(' ')[0]);
    const times = commits.map((hash) => Number(git('show', '-s', '--format=%ct', hash)));
    const at = times.indexOf(Math.max(...times));
    lastWrote = written[at].split(' ').slice(1).join(' ');
    since = Number(git('rev-list', '--count', `${commits[at]}..HEAD`, '--', ...WORK));
  }
  return { name: path.basename(dir), missing, complaints, unlinked, since, lastWrote };
}

export function folderLines(folder: Folder): string[] {
  const lines = [`docs/${folder.name}/`];
  const say = (mark: string, text: string): void => void lines.push(`  ${mark} ${text}`);
  if (folder.missing.length > 0) say('--', `no ${folder.missing.join(', ')} — a folder that keeps one of the three keeps all three`);
  else say('ok', 'deliverable-log, open and settled all present');
  for (const complaint of folder.complaints) say('--', `${complaint.file}: ${complaint.says}`);
  for (const name of folder.unlinked) say('--', `deliverable-log.md never names ${name}, so a reader starting there will not find it`);
  if (folder.since === 0) say('ok', 'nothing has landed since these were last written');
  else say(folder.since > 8 ? '--' : 'ok', `${folder.since} commit(s) under ${WORK.join('/')} since these were last written — the last was ${folder.lastWrote}`);
  return lines;
}

export function handoffLines(dirs: readonly string[]): string[] {
  if (dirs.length === 0) return ['no docs/<feature>/ folder keeps a deliverable-log, so nothing here is handed over between sessions'];
  const folders = dirs.map(reviewFolder);
  const wrong = folders.flatMap((folder) => [...folder.missing, ...folder.complaints, ...folder.unlinked]).length;
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
    .filter((dir) => KEPT.some((name) => existsSync(path.join(dir, name))));

function main(): void {
  if (process.argv.includes('--help')) {
    console.log(usage);
    return;
  }
  console.log(handoffLines(featureFolders()).join('\n'));
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
