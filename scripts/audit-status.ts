import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { codeOnly } from './lib/stripComments';

const MANIFEST = 'docs/audits/systems.json';

interface System {
  name: string;
  paths: string[];
  lastAudit: string | null;
  lastAuditDoc: string | null;
  note: string | null;
}

interface Manifest {
  threshold: number;
  systems: System[];
}

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function contentAt(revision: string, path: string): string | null {
  try {
    return execFileSync('git', ['show', `${revision}:${path}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

interface Change {
  from: string | null;
  to: string | null;
}

function changesIn(sha: string, paths: string[]): Change[] {
  const output = git('show', '--format=', '--name-status', '-M', sha, '--', ...paths).trim();
  if (output === '') return [];
  return output.split('\n').map((line) => {
    const [status, first, second] = line.split('\t');
    if (status.startsWith('R') || status.startsWith('C')) return { from: first, to: second };
    if (status === 'A') return { from: null, to: first };
    if (status === 'D') return { from: first, to: null };
    return { from: first, to: first };
  });
}

// The stripper only understands TypeScript, so a system's workflows, manifests
// and Gradle files are compared verbatim instead.
const STRIPPABLE = /\.tsx?$/;

function unchangedCode(change: Change, sha: string): boolean {
  if (change.from === null || change.to === null) return false;
  const before = contentAt(`${sha}^`, change.from);
  const after = contentAt(sha, change.to);
  if (before === null || after === null) return false;
  if (!STRIPPABLE.test(change.to)) return before === after;
  return codeOnly(before).join('\n') === codeOnly(after).join('\n');
}

interface Touch {
  sha: string;
  subject: string;
  code: boolean;
}

function touchesSince(system: System): Touch[] {
  if (system.lastAudit === null || system.paths.length === 0) return [];
  const log = git('log', '--format=%h %s', `${system.lastAudit}..HEAD`, '--', ...system.paths).trim();
  if (log === '') return [];
  return log.split('\n').map((line) => {
    const [sha, ...subject] = line.split(' ');
    return {
      sha,
      subject: subject.join(' '),
      code: changesIn(sha, system.paths).some((change) => !unchangedCode(change, sha)),
    };
  });
}

const AUDIT_DOC_DIRECTORY = 'docs/audits/';
const MINIMUM_AUDIT_DOC_BYTES = 500;

function documented(system: System): boolean {
  if (system.lastAudit === null) return true;
  const doc = system.lastAuditDoc;
  if (doc === null || !doc.startsWith(AUDIT_DOC_DIRECTORY) || !existsSync(doc)) return false;
  const stats = statSync(doc);
  return stats.isFile() && stats.size >= MINIMUM_AUDIT_DOC_BYTES;
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;
const verbose = process.argv.includes('--verbose');
const due: string[] = [];
const undocumented: string[] = [];

for (const system of manifest.systems) {
  const touches = touchesSince(system);
  const changing = touches.filter((touch) => touch.code).length;
  const owed = system.lastAudit === null && system.paths.length > 0;
  const overdue = owed || changing >= manifest.threshold;

  if (overdue) due.push(system.name);
  if (!documented(system)) undocumented.push(system.name);

  const detail =
    system.paths.length === 0
      ? 'no paths declared'
      : owed
        ? 'never audited'
        : `${changing} of ${touches.length} commit(s) changed code since ${system.lastAudit}`;
  console.log(`${overdue ? 'DUE ' : '    '} ${system.name.padEnd(22)} ${detail}`);
  if (system.note) console.log(`      ${system.note}`);
  if (verbose) for (const touch of touches) console.log(`      ${touch.code ? 'code ' : 'no-op'} ${touch.sha} ${touch.subject}`);
}

console.log(`\nThreshold ${manifest.threshold}. Systems and their paths are declared in ${MANIFEST}.`);

for (const name of undocumented) console.error(`no audit doc:  ${name} records a lastAudit, but its lastAuditDoc is missing, empty, or not a file under ${AUDIT_DOC_DIRECTORY}`);
if (due.length > 0) console.error(`audit due:     ${due.join(', ')}`);

if (due.length + undocumented.length > 0) {
  console.error('\nSpawn an independent auditor with the audit prompt in CLAUDE.md, write the audit under docs/audits/, lift its findings into backlog.md, then set lastAudit and lastAuditDoc.');
  process.exit(1);
}
console.log('Every system has a current, documented audit.');
