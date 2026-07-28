import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { sourceFiles } from './lib/sourceFiles';
import { codeOnly } from './lib/stripComments';

const LEDGER = 'docs/audits/readability.json';
const ROOTS = ['src', 'scripts'];

type Verdict = 'pass' | 'fail';

interface Entry {
  lastAuditedSha: string;
  discrimination: Verdict;
  prose: Verdict;
  model: string;
  date: string;
}

interface Ledger {
  threshold: number;
  files: Record<string, Entry>;
}

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
}

function contentAt(revision: string, path: string): string | null {
  try {
    return git('show', `${revision}:${path}`);
  } catch {
    return null;
  }
}

// Only consulted when the log's own path history runs out, which happens when
// the oldest commit in range is the rename itself.
function renameSource(sha: string, path: string): string | null {
  for (const line of git('show', '--format=', '--name-status', '-M', sha).split('\n')) {
    const [status, from, to] = line.split('\t');
    if (status?.startsWith('R') && to === path) return from;
  }
  return null;
}

interface Touch {
  sha: string;
  subject: string;
  path: string;
}

// --follow names the file as it stood at each commit, so a commit's predecessor
// here gives the path on the far side of a rename.
function touches(path: string, since: string): Touch[] {
  const log = git('log', '--follow', '--format=%x01%h %s', '--name-only', `${since}..HEAD`, '--', path).trim();
  if (log === '') return [];

  const found: Touch[] = [];
  for (const line of log.split('\n')) {
    if (line.startsWith('\x01')) {
      const [sha, ...subject] = line.slice(1).split(' ');
      found.push({ sha, subject: subject.join(' '), path });
    } else if (line !== '' && found.length > 0) {
      found[found.length - 1].path = line;
    }
  }
  return found;
}

// A comment strip, a rename, or a reformat leaves the file just as readable, so
// only commits whose stripped source differs spend the budget.
function codeChangingCommits(path: string, since: string): Touch[] {
  const found = touches(path, since);
  return found.filter((touch, index) => {
    const after = contentAt(touch.sha, touch.path);
    if (after === null) return false;
    const priorPath = found[index + 1]?.path ?? renameSource(touch.sha, touch.path) ?? touch.path;
    const before = contentAt(`${touch.sha}^`, priorPath);
    return before === null || codeOnly(before).join('\n') !== codeOnly(after).join('\n');
  });
}

const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger;

const explainFlag = process.argv.indexOf('--explain');
if (explainFlag !== -1) {
  const target = process.argv[explainFlag + 1];
  const since = process.argv[explainFlag + 2] ?? ledger.files[target]?.lastAuditedSha;
  const changing = new Set(codeChangingCommits(target, since).map((touch) => touch.sha));
  for (const touch of touches(target, since)) {
    console.log(`${changing.has(touch.sha) ? 'code   ' : 'no-op  '} ${touch.sha} ${touch.subject}`);
  }
  console.log(`\n${changing.size} of ${touches(target, since).length} commits since ${since} changed code in ${target}.`);
  process.exit(0);
}
const tracked = ROOTS.flatMap((root) => sourceFiles(root))
  .filter((path) => !path.endsWith('.d.ts'))
  .sort();

const unaudited: string[] = [];
const failed: string[] = [];
const stale: string[] = [];

for (const path of tracked) {
  const entry = ledger.files[path];
  if (!entry) {
    unaudited.push(path);
    continue;
  }
  if (entry.discrimination === 'fail') {
    failed.push(path);
    continue;
  }
  const commits = codeChangingCommits(path, entry.lastAuditedSha);
  if (commits.length >= ledger.threshold) stale.push(`${path} (${commits.length} code-changing commits since ${entry.lastAuditedSha})`);
}

const orphaned = Object.keys(ledger.files).filter((path) => !tracked.includes(path));

for (const path of unaudited) console.error(`never audited: ${path}`);
for (const path of failed) console.error(`audit failed:  ${path}`);
for (const path of stale) console.error(`stale:         ${path}`);
for (const path of orphaned) console.error(`ledger names a file that no longer exists: ${path}`);

console.log(`${tracked.length} files tracked, ${Object.keys(ledger.files).length} in ${LEDGER}, threshold ${ledger.threshold}.`);

const problems = unaudited.length + failed.length + stale.length + orphaned.length;
if (problems > 0) {
  console.error(`\n${problems} file(s) need a readability audit. Run \`npm run readability-audit -- <path>\` to refresh one.`);
  process.exit(1);
}

console.log('Every file has a current readability audit.');
