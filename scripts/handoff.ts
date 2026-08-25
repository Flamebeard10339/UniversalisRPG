import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const usage = [
  'Usage: npm run handoff',
  '',
  'Asks whether the folders a session hands over through are still telling the',
  'truth. A feature that runs longer than one session keeps a deliverable-log.md',
  'under docs/<feature>/ saying what the work is for, and beside it the files that',
  'log names — what is still wrong, and what a cold agent has to know. The log is',
  'the folder index, so this reads the naming both ways: a file the log never',
  'names strands a reader, and a name the log holds with no file behind it is the',
  'log gone stale. Nothing is struck through in any of them: done means deleted.',
  '',
  'It reports rather than gates. The one thing it can measure that a reader',
  'cannot is how much work has landed since the docs were last written, which is',
  'the number that says whether they have drifted.',
].join('\n');

const LOG = 'deliverable-log.md';

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

export function namesInLog(text: string): string[] {
  const written = [...text.matchAll(/(?:^|[^\w./\\-])([\w-]+\.md)/g)].map((found) => found[1]);
  return [...new Set(written)];
}

export interface Folder {
  name: string;
  companions: string[];
  complaints: Complaint[];
  unlinked: string[];
  gone: string[];
  since: number;
  lastWrote: string;
}

function reviewFolder(dir: string): Folder {
  const log = readFileSync(path.join(dir, LOG), 'utf8');
  const companions = readdirSync(dir).filter((name) => name !== LOG && name.endsWith('.md'));
  const complaints = companions.flatMap((name) => complaintsIn(name, readFileSync(path.join(dir, name), 'utf8')));

  const named = namesInLog(log);
  const unlinked = companions.filter((name) => !named.includes(name));
  const gone = named.filter((name) => name !== LOG && !companions.includes(name) && !existsSync(name));

  const held = [LOG, ...companions];
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
  return { name: path.basename(dir), companions, complaints, unlinked, gone, since, lastWrote };
}

export const wrongIn = (folder: Folder): number =>
  folder.complaints.length + folder.unlinked.length + folder.gone.length + (folder.companions.length === 0 ? 1 : 0);

export function folderLines(folder: Folder): string[] {
  const lines = [`docs/${folder.name}/`];
  const say = (mark: string, text: string): void => void lines.push(`  ${mark} ${text}`);
  if (folder.companions.length === 0) say('--', `${LOG} stands alone — a folder that hands over keeps what is still wrong and what is settled in files beside it`);
  else say('ok', `${LOG} and the ${folder.companions.length} file(s) it names: ${folder.companions.join(', ')}`);
  for (const complaint of folder.complaints) say('--', `${complaint.file}: ${complaint.says}`);
  for (const name of folder.unlinked) say('--', `${LOG} never names ${name}, so a reader starting there will not find it`);
  for (const name of folder.gone) say('--', `${LOG} names ${name}, and no such file stands beside it`);
  if (folder.since === 0) say('ok', 'nothing has landed since these were last written');
  else say(folder.since > 8 ? '--' : 'ok', `${folder.since} commit(s) under ${WORK.join('/')} since these were last written — the last was ${folder.lastWrote}`);
  return lines;
}

export function handoffLines(dirs: readonly string[]): string[] {
  if (dirs.length === 0) return ['no docs/<feature>/ folder keeps a deliverable-log, so nothing here is handed over between sessions'];
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
    .filter((dir) => existsSync(path.join(dir, LOG)));

function main(): void {
  if (process.argv.includes('--help')) {
    console.log(usage);
    return;
  }
  console.log(handoffLines(featureFolders()).join('\n'));
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
