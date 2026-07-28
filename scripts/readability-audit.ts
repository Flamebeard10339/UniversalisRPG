import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { sourceFiles } from './lib/sourceFiles';

const LEDGER = 'docs/audits/readability.json';
const ROOTS = ['src', 'scripts'];
const MODEL = 'haiku';
const DISTRACTORS = 3;

const AUDIT_PROMPT =
  'Please perform a readability audit on file: <path>. Fully describe the form and function of the file ' +
  'without reading any other files or documentation.\n\n' +
  'Answer under exactly these headings:\n' +
  'PURPOSE — what this file is for, in one sentence.\n' +
  'EXPORTS — each exported name and the role it plays.\n' +
  'INPUTS AND OUTPUTS — what it consumes and what it produces.\n' +
  'NON-OBVIOUS BEHAVIOUR — anything a reader could not predict from the names alone.\n' +
  'UNCLEAR — anything you could not determine from this file alone.';

const SUMMARY_PROMPT =
  'Write one sentence describing what file <path> does, for use as an answer in a multiple-choice test. ' +
  'Do not name the file, its path, or any of its exported identifiers — describe the role, do not label it. ' +
  'Reply with the sentence and nothing else.';

type Verdict = 'pass' | 'fail';

interface Entry {
  lastAuditedSha: string;
  discrimination: Verdict;
  prose: Verdict;
  summary: string;
  proseNote: string;
  model: string;
  date: string;
}

interface Ledger {
  threshold: number;
  files: Record<string, Entry>;
}

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function load(): Ledger {
  return JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger;
}

function save(ledger: Ledger): void {
  writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 2)}\n`);
}

function tracked(): string[] {
  return ROOTS.flatMap((root) => sourceFiles(root))
    .filter((path) => !path.endsWith('.d.ts'))
    .sort();
}

function withFile(prompt: string, path: string): string {
  return `${prompt.replace('<path>', path)}\n\n<file path="${path}">\n${readFileSync(path, 'utf8')}\n</file>`;
}

// Siblings make the hardest distractors, and they also blunt any project-level
// context the auditor carries: knowing the layer scheme cannot separate two
// files from the same folder. Taking the next three cyclically keeps the set
// stable across runs.
function distractorsFor(path: string, ledger: Ledger): string[] {
  const summarized = tracked().filter((other) => other !== path && ledger.files[other]?.summary);
  const siblings = summarized.filter((other) => dirname(other) === dirname(path));
  const pool = siblings.length >= DISTRACTORS ? siblings : summarized;
  const ordered = [...pool, path].sort();
  const start = ordered.indexOf(path);
  const picked: string[] = [];
  for (let step = 1; picked.length < DISTRACTORS && step <= ordered.length; step++) {
    const candidate = ordered[(start + step) % ordered.length];
    if (candidate !== path) picked.push(ledger.files[candidate].summary);
  }
  return picked;
}

function discriminationPrompt(path: string, ledger: Ledger): { prompt: string; answer: string } {
  const real = ledger.files[path]?.summary;
  if (!real) throw new Error(`${path} has no summary yet; run --needs-summary first.`);
  const options = [real, ...distractorsFor(path, ledger)].sort();
  const answer = 'ABCD'[options.indexOf(real)];
  const lettered = options.map((option, index) => `${'ABCD'[index]}. ${option}`).join('\n');
  return { prompt: withFile(`Which one of these sentences describes file <path>? Reply with a single letter.\n\n${lettered}`, path), answer };
}

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

const ledger = load();

if (args.includes('--needs-summary')) {
  for (const path of tracked()) if (!ledger.files[path]?.summary) console.log(path);
} else if (flag('--prompt-summary')) {
  console.log(withFile(SUMMARY_PROMPT, flag('--prompt-summary')!));
} else if (flag('--prompt-audit')) {
  console.log(withFile(AUDIT_PROMPT, flag('--prompt-audit')!));
} else if (flag('--prompt-discriminate')) {
  const { prompt, answer } = discriminationPrompt(flag('--prompt-discriminate')!, ledger);
  console.log(prompt);
  console.error(`expected answer: ${answer}`);
} else if (flag('--answer')) {
  const path = flag('--answer')!;
  console.log(discriminationPrompt(path, ledger).answer);
} else if (flag('--set-summary')) {
  const path = flag('--set-summary')!;
  const existing = ledger.files[path];
  ledger.files[path] = {
    lastAuditedSha: existing?.lastAuditedSha ?? '',
    discrimination: existing?.discrimination ?? 'fail',
    prose: existing?.prose ?? 'fail',
    proseNote: existing?.proseNote ?? '',
    model: MODEL,
    date: existing?.date ?? '',
    summary: args[args.indexOf('--set-summary') + 2],
  };
  save(ledger);
} else if (flag('--record')) {
  const path = flag('--record')!;
  const existing = ledger.files[path];
  if (!existing?.summary) throw new Error(`${path} has no summary; set one before recording a verdict.`);
  ledger.files[path] = {
    ...existing,
    lastAuditedSha: git('rev-parse', '--short', 'HEAD'),
    discrimination: flag('--discrimination') === 'pass' ? 'pass' : 'fail',
    prose: flag('--prose') === 'pass' ? 'pass' : 'fail',
    proseNote: flag('--note') ?? '',
    model: MODEL,
    date: git('log', '-1', '--format=%cs'),
  };
  save(ledger);
  console.log(`${path}: discrimination=${ledger.files[path].discrimination} prose=${ledger.files[path].prose}`);
} else {
  console.log(
    'Usage:\n' +
      '  --needs-summary                    list files with no summary yet\n' +
      '  --prompt-summary <path>            prompt to mint a one-line summary\n' +
      '  --prompt-audit <path>              the readability audit prompt\n' +
      '  --prompt-discriminate <path>       four-way test; expected letter goes to stderr\n' +
      '  --answer <path>                    expected letter alone\n' +
      '  --set-summary <path> <sentence>    store a summary\n' +
      '  --record <path> --discrimination pass|fail --prose pass|fail [--note "…"]',
  );
}
