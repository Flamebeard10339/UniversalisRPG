// Standalone, independent tool for merging two divergent versions of a DSL
// module file that share a common ancestor — e.g. two community
// contributions that both edited the same module, or an on-disk file that
// moved since a contributor's baseline. Deliberately separate from
// merge-contribution-issue.mjs: that script only ever *upserts* a single
// incoming full-source file (see its own doc comment for why that never
// needs patch/merge logic) — this script is for the different, rarer case
// of reconciling two edits to the same file.
//
// Delegates the actual 3-way text merge to `git merge-file`, a correct,
// battle-tested diff3 implementation, rather than hand-rolling one — this
// never touches git history/refs/the working tree, it's a plumbing command
// that operates purely on three arbitrary file contents. A DSL module is
// line-oriented, human-authored text, so a line-based 3-way merge (the same
// algorithm `git merge` itself uses) is the right tool: non-overlapping
// changes merge cleanly, overlapping ones are reported as a conflict with
// standard <<<<<<< / ======= / >>>>>>> markers for manual resolution —
// never silently guessed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const mergeDslFiles = ({ base, ours, theirs, labelOurs = 'ours', labelTheirs = 'theirs' }) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-dsl-'));
  const basePath = path.join(tmpDir, 'base');
  const oursPath = path.join(tmpDir, 'ours');
  const theirsPath = path.join(tmpDir, 'theirs');
  fs.writeFileSync(basePath, base);
  fs.writeFileSync(oursPath, ours);
  fs.writeFileSync(theirsPath, theirs);

  try {
    const merged = execFileSync(
      'git',
      ['merge-file', '-p', '-L', labelOurs, '-L', 'base', '-L', labelTheirs, oursPath, basePath, theirsPath],
      { encoding: 'utf8' },
    );
    return { merged, hasConflicts: false };
  } catch (error) {
    // git merge-file exits 1 (with conflict markers on stdout, still
    // captured via execFileSync's error.stdout) when there's a genuine
    // overlapping-line conflict — anything else is a real failure.
    if (error && typeof error === 'object' && 'status' in error && error.status === 1 && typeof error.stdout === 'string') {
      return { merged: error.stdout, hasConflicts: true };
    }
    throw error;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
};

const parseArgs = (argv) => {
  const args = { base: '', ours: '', theirs: '', out: '', labelOurs: 'ours', labelTheirs: 'theirs' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--base') args.base = argv[++index] ?? '';
    else if (arg === '--ours') args.ours = argv[++index] ?? '';
    else if (arg === '--theirs') args.theirs = argv[++index] ?? '';
    else if (arg === '--out') args.out = argv[++index] ?? '';
    else if (arg === '--label-ours') args.labelOurs = argv[++index] ?? 'ours';
    else if (arg === '--label-theirs') args.labelTheirs = argv[++index] ?? 'theirs';
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
};

const usage = `Usage:
  node scripts/merge-dsl-files.mjs --base <file> --ours <file> --theirs <file> [--out <file>] [--label-ours <name>] [--label-theirs <name>]

Merges two divergent DSL module files that share a common ancestor (--base)
into one. Non-overlapping changes merge automatically; overlapping ones are
left as standard <<<<<<< / ======= / >>>>>>> conflict markers for manual
resolution — never silently guessed. Prints the merged text to stdout (or
writes it to --out if given) and exits 1 if the result contains conflicts,
0 if it merged cleanly.`;

export const runCli = (argv = process.argv.slice(2)) => {
  const args = parseArgs(argv);
  if (args.help) return { text: usage, exitCode: 0 };
  if (!args.base || !args.ours || !args.theirs) throw new Error('Missing one of --base/--ours/--theirs.');

  const { merged, hasConflicts } = mergeDslFiles({
    base: fs.readFileSync(args.base, 'utf8'),
    ours: fs.readFileSync(args.ours, 'utf8'),
    theirs: fs.readFileSync(args.theirs, 'utf8'),
    labelOurs: args.labelOurs,
    labelTheirs: args.labelTheirs,
  });

  if (args.out) fs.writeFileSync(args.out, merged);
  return { text: args.out ? '' : merged, exitCode: hasConflicts ? 1 : 0, hasConflicts };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { text, exitCode, hasConflicts } = runCli();
    if (text) process.stdout.write(text);
    if (hasConflicts) console.error('Merge produced conflicts — resolve the <<<<<<< / ======= / >>>>>>> markers manually.');
    process.exit(exitCode);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage);
    process.exit(2);
  }
}
