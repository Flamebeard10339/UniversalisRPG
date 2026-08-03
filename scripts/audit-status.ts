import { execFileSync } from 'node:child_process';
import { checkManifest, covers, loadManifest, overlappingConcepts, sharedOwnership, type Manifest, type System } from './lib/systems';
import { codeOnly } from './lib/stripComments';

const MANIFEST = 'docs/audits/systems.json';

function trackedFiles(): string[] {
  return git('ls-files')
    .trim()
    .split('\n')
    .filter((file) => file !== '');
}

// Membership only means something if it is a partition. A file owned by no
// system can never trigger an audit, and nothing used to notice one appearing.
function orphanedFiles(manifest: Manifest, tracked: string[]): string[] {
  const declared = [...manifest.systems.flatMap((system) => system.paths), ...manifest.unowned.paths];
  return tracked.filter((file) => !declared.some((path) => covers(path, file)));
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

const manifest = loadManifest(MANIFEST);
const verbose = process.argv.includes('--verbose');
const tracked = trackedFiles();

// A system's audit window is its declared paths — the coverage relation,
// deliberately many-to-many. Ownership narrowed to one answer per file so
// that "which files are in this system" could be asked; it is not consulted
// here, so no window moved when it did.
for (const system of manifest.systems) {
  const touches = touchesSince(system);
  const changing = touches.filter((touch) => touch.code).length;

  const detail =
    system.paths.length === 0
      ? 'no paths declared'
      : system.lastAudit === null
        ? 'never swept'
        : `${changing} of ${touches.length} commit(s) changed code since ${system.lastAudit}`;
  console.log(`     ${system.name.padEnd(22)} ${detail}`);
  if (system.note) console.log(`      ${system.note}`);
  if (verbose) for (const touch of touches) console.log(`      ${touch.code ? 'code ' : 'no-op'} ${touch.sha} ${touch.subject}`);
}

console.log(`\nSystems and their paths are declared in ${MANIFEST}. Counts are informational: an audit reviews a branch's diff, not a commit total.`);

const shared = sharedOwnership(manifest, tracked);
if (shared.length > 0) {
  console.log(`\nshared:        ${shared.length} tracked file(s) sit in more than one audit window. Ownership resolves each to the system whose claim is most specific:`);
  for (const entry of shared) console.log(`               ${entry.file} -> ${entry.owner}${entry.tied ? ' (BY TIE-BREAK, not by specificity)' : ''}, also audited by ${entry.alsoCovered.join(', ')}`);
}

const overlaps = overlappingConcepts(manifest);
if (overlaps.length > 0) {
  console.log(`\nconcepts:      ${overlaps.length} path(s) claimed by two concepts of one system. A file doing two jobs is where a seam belongs:`);
  for (const entry of overlaps) console.log(`               ${entry.path} — ${entry.concepts.join(' and ')} (${entry.system})`);
}

for (const issue of checkManifest(manifest)) console.log(`\n${issue.level === 'error' ? 'manifest err' : 'manifest    '}:  ${issue.message}`);

const orphans = orphanedFiles(manifest, tracked);

// The one condition this exits non-zero on, unchanged: attributing a diff to
// a system depends on every file being attributable at all. Everything above
// reports, because a report that names the problem is worth more than a gate
// that hides it behind a rerun.
if (orphans.length > 0) {
  console.error(`\nunowned:       ${orphans.length} tracked file(s) belong to no system and are not declared unowned in ${MANIFEST}:`);
  for (const file of orphans) console.error(`               ${file}`);
  console.error('\nEvery tracked file is owned by a system or declared unowned, so that a diff can be attributed to a system.');
  process.exit(1);
}
