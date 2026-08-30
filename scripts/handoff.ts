import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { probe, readSources } from './probe';

const usage = [
  'Usage: npm run handoff [--quick]',
  '',
  '  --quick   report on the files without running the proofs standing under them',
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
  'A line about behaviour may hand its evidence over as a proof rather than as a',
  'paragraph: a # test in open-tests.dsl, or a describe() in open-tests.test.ts,',
  'named for the line and red until the line closes. Neither is gated by anything —',
  'npm test names every vitest project but that one — so what closes the line is',
  'the proof passing, and the prose says only what the proof cannot. This runs',
  'them, so the question a lane asks before picking a line up — does this still',
  'fail? — is answered rather than guessed, and a proof that has gone green is',
  'reported as a line that may already be closed.',
  '',
  'It reports rather than gates. The one thing it can measure that a reader',
  'cannot is how much work has landed since the docs were last written, which is',
  'the number that says whether they have drifted.',
].join('\n');

const OPEN = ['open-agent.md', 'open-human.md'];

export const PROOFS = ['open-tests.dsl', 'open-tests.test.ts'];

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

// What a proof file declares, read out of the file rather than off a list beside it: a route
// is a `# test`, and a proof about anything a route cannot say is a top-level `describe`.
const DECLARES: Readonly<Record<string, RegExp>> = {
  '.dsl': /^#[ \t]+test[ \t]+(\S+)/gm,
  '.ts': /^describe\([ \t]*['"`]([^'"`]+)['"`]/gm,
};

// A line hands its evidence over by closing on the proof, so the citation is the closing clause
// rather than a second sentence beside it. One form, so neither side can drift from the other.
const CITES = /`([^`\s]+)` passes/g;

export const declaredIn = (file: string, text: string): string[] => [...text.matchAll(DECLARES[path.extname(file)] ?? DECLARES['.ts'])].map((match) => match[1]);

export const citedIn = (text: string): string[] => [...text.matchAll(CITES)].map((match) => match[1]);

export interface Verdict {
  file: string;
  id: string;
  passes: boolean;
}

export function proofComplaints(proofs: ReadonlyArray<readonly [string, string]>, open: ReadonlyArray<readonly [string, string]>): Complaint[] {
  const complaints: Complaint[] = [];
  const cited = new Set(open.flatMap(([, text]) => citedIn(text)));
  const declared = new Set(proofs.flatMap(([file, text]) => declaredIn(file, text)));
  for (const [file, text] of proofs) {
    const ids = declaredIn(file, text);
    if (ids.length === 0) complaints.push({ file, says: 'declares no proof, and a proof file no line stands on is the format growing back' });
    for (const id of ids) {
      if (!cited.has(id)) complaints.push({ file, says: `${id} stands under no open line — a proof is cited by the line it closes` });
    }
  }
  for (const [file, text] of open) {
    for (const id of citedIn(text)) {
      if (!declared.has(id)) complaints.push({ file, says: `closes on ${id} passing, and no proof declares it` });
    }
  }
  return complaints;
}

// A route is walked beside the shipped corpus, because a proof with nowhere to stand is why it is
// here rather than in content/. A module the loader will not take reports no verdict at all, which
// leaves every route in it failing — which is the safe reading, and the reason a refusal is proved
// in the .test.ts half instead.
function routeVerdicts(file: string, ids: readonly string[]): Verdict[] {
  const moduleId = /^#[ \t]+info[ \t]+(\S+)/m.exec(readFileSync(file, 'utf8'))?.[1];
  const walked = new Map<string, boolean>();
  if (moduleId !== undefined) {
    for (const line of probe(readSources(['content', file]), { show: [], test: [moduleId], roundTrip: false }).lines) {
      const said = /^(\S+): (PASSED|FAILED)/.exec(line);
      if (said !== null) walked.set(said[1].slice(said[1].indexOf('.') + 1), said[2] === 'PASSED');
    }
  }
  return ids.map((id) => ({ file, id, passes: walked.get(id) === true }));
}

function suiteVerdicts(file: string, ids: readonly string[]): Verdict[] {
  const raw = ((): string => {
    try {
      return execSync(`npx vitest run --configLoader runner --project open --reporter=json "${file.split(path.sep).join('/')}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (error) {
      return String((error as { stdout?: string }).stdout ?? '');
    }
  })();
  const held = new Map<string, boolean>();
  try {
    const report = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as { testResults?: { assertionResults?: { ancestorTitles?: string[]; status?: string }[] }[] };
    for (const suite of report.testResults ?? []) {
      for (const each of suite.assertionResults ?? []) {
        const id = each.ancestorTitles?.[0];
        if (id !== undefined) held.set(id, (held.get(id) ?? true) && each.status === 'passed');
      }
    }
  } catch {
    return ids.map((id) => ({ file, id, passes: false }));
  }
  return ids.map((id) => ({ file, id, passes: held.get(id) === true }));
}

const verdictsFor = (dir: string, name: string, ids: readonly string[]): Verdict[] => (name.endsWith('.dsl') ? routeVerdicts : suiteVerdicts)(path.join(dir, name), ids);

export interface Folder {
  name: string;
  open: string[];
  proofs: string[];
  missing: string[];
  strays: string[];
  items: number;
  complaints: Complaint[];
  passing: Verdict[];
  ran: boolean;
  since: number;
  lastWrote: string;
}

function reviewFolder(dir: string, run: boolean): Folder {
  const held = readdirSync(dir);
  const open = held.filter(isOpen);
  const proofs = held.filter((name) => PROOFS.includes(name));
  const read = (name: string) => [name, readFileSync(path.join(dir, name), 'utf8')] as const;
  const texts = open.map(read);
  const proofTexts = proofs.map(read);
  const verdicts = run ? proofTexts.flatMap(([name, text]) => verdictsFor(dir, name, declaredIn(name, text))) : [];

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
    proofs,
    missing: OPEN.filter((name) => !open.includes(name)),
    strays: held.filter((name) => !isOpen(name) && !PROOFS.includes(name)),
    items: texts.reduce((count, [, text]) => count + itemsIn(text.split(/\r?\n/)).length, 0),
    complaints: [...texts.flatMap(([name, text]) => complaintsIn(name, text)), ...proofComplaints(proofTexts, texts)],
    passing: verdicts.filter((verdict) => verdict.passes),
    ran: run && proofs.length > 0,
    since,
    lastWrote,
  };
}

export const wrongIn = (folder: Folder): number => folder.complaints.length + folder.missing.length + folder.strays.length + folder.passing.length;

export function folderLines(folder: Folder): string[] {
  const lines = [`docs/${folder.name}/`];
  const say = (mark: string, text: string): void => void lines.push(`  ${mark} ${text}`);
  say('ok', `${folder.open.join(' and ')}, ${folder.items} open item(s) between them`);
  for (const name of folder.missing) say('--', `no ${name} — the queue is split by who is blocked, and a half that is empty says so in a line rather than by being absent`);
  for (const name of folder.strays) say('--', `${name} stands beside them, and this format is the open files and nothing else — what is already true belongs in the code, in CLAUDE.md, in a memory, or in git`);
  for (const complaint of folder.complaints) say('--', `${complaint.file}: ${complaint.says}`);
  if (folder.ran) say('ok', `${folder.proofs.join(' and ')}, ${folder.passing.length} of ${folder.proofs.length === 1 ? 'them' : 'them'} passing`);
  for (const verdict of folder.passing) say('--', `${verdict.file}: ${verdict.id} passes now — the line closing on it may be closed, and the proof migrated into the suite by being moved`);
  if (folder.since === 0) say('ok', 'nothing has landed since these were last written');
  else say(folder.since > 8 ? '--' : 'ok', `${folder.since} commit(s) under ${WORK.join('/')} since these were last written — the last was ${folder.lastWrote}`);
  return lines;
}

// docs/ is the folders that hand over and nothing beside them. A spec tree, a folder of dated
// audits and two jsonl logs stood here — 135 files of what was already in the code — and this is
// the line that says so the next time one starts, since a folder nobody is handed grows quietly.
export const besideThem = (root = 'docs', dirs: readonly string[] = featureFolders(root)): string[] => {
  const handing = new Set(dirs.map((dir) => path.basename(dir)));
  return readdirSync(root).filter((name) => !handing.has(name));
};

export function handoffLines(dirs: readonly string[], run = true, strays: readonly string[] = []): string[] {
  if (dirs.length === 0) return ['no docs/<feature>/ folder keeps an open-*.md, so nothing here is handed over between sessions'];
  const folders = dirs.map((dir) => reviewFolder(dir, run));
  const wrong = folders.reduce((count, folder) => count + wrongIn(folder), 0) + strays.length;
  const stale = folders.filter((folder) => folder.since > 8).length;
  return [
    ...folders.flatMap((folder) => [...folderLines(folder), '']),
    ...strays.map((name) => `-- docs/${name} hands nothing over, and docs/ is the folders that do — what is already true belongs in the code, in CLAUDE.md, in a memory, or in git`),
    ...(strays.length === 0 ? [] : ['']),
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
  const folders = featureFolders();
  console.log(handoffLines(folders, !process.argv.includes('--quick'), besideThem('docs', folders)).join('\n'));
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
