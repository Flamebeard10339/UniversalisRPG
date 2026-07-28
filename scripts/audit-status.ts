import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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

function commitsSince(system: System): string[] {
  if (system.paths.length === 0) return [];
  const range = system.lastAudit === null ? [] : [`${system.lastAudit}..HEAD`];
  const log = git('log', '--format=%h %s', ...range, '--', ...system.paths).trim();
  return log === '' ? [] : log.split('\n');
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;
const verbose = process.argv.includes('--verbose');
const due: string[] = [];

for (const system of manifest.systems) {
  const commits = commitsSince(system);
  const owed = system.lastAudit === null && system.paths.length > 0;
  const overdue = owed || commits.length >= manifest.threshold;
  if (overdue) due.push(system.name);

  const count = system.paths.length === 0 ? 'n/a' : String(commits.length);
  console.log(`${overdue ? 'DUE ' : '    '} ${system.name.padEnd(22)} ${count.padStart(4)} commit(s) since audit`);
  if (system.note) console.log(`      ${system.note}`);
  if (verbose) for (const commit of commits) console.log(`      ${commit}`);
}

console.log(`\nThreshold ${manifest.threshold}. Systems and their paths are declared in ${MANIFEST}.`);
if (due.length > 0) console.log(`Audit due: ${due.join(', ')}. Use the audit prompt in CLAUDE.md.`);
