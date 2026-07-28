import Anthropic from '@anthropic-ai/sdk';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { sourceFiles } from './lib/sourceFiles';

const LEDGER = 'docs/audits/readability.json';
const ROOTS = ['src', 'scripts'];
const COLD_MODEL = 'claude-haiku-4-5';
const GRADER_MODEL = 'claude-opus-5';
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

const GRADER_PROMPT =
  'A reader saw one source file, with no other context, and wrote the description below. ' +
  'You can see the same file. Decide whether the description would let a competent engineer ' +
  'work with this file correctly.\n\n' +
  'Fail it if the description misses an export, misstates what something does, or leaves a ' +
  'caller-visible behaviour undescribed. Do not fail it for brevity, for style, or for anything ' +
  'listed under UNCLEAR that genuinely cannot be determined from this file alone — that is the ' +
  "file's shortcoming to record, not the description's.\n\n" +
  'Reply with a single line: PASS or FAIL, then a tab, then one sentence of justification.';

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

const client = new Anthropic();

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

async function ask(model: string, prompt: string, deterministic: boolean): Promise<string> {
  // Only Haiku accepts temperature; Opus 5 rejects any sampling parameter with a 400.
  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    ...(deterministic ? { temperature: 0 } : {}),
    messages: [{ role: 'user', content: prompt }],
  });
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

function withFile(prompt: string, path: string, source: string): string {
  return `${prompt.replace('<path>', path)}\n\n<file path="${path}">\n${source}\n</file>`;
}

// Siblings make the hardest distractors, and taking the next three cyclically keeps
// the choice stable across runs.
function distractorsFor(path: string, ledger: Ledger, tracked: string[]): string[] {
  const siblings = tracked.filter((other) => dirname(other) === dirname(path) && ledger.files[other]?.summary);
  const pool = siblings.length > DISTRACTORS ? siblings : tracked.filter((other) => other !== path && ledger.files[other]?.summary);
  const ordered = [...pool].sort();
  const start = ordered.indexOf(path);
  const picked: string[] = [];
  for (let step = 1; picked.length < DISTRACTORS && step <= ordered.length; step++) {
    const candidate = ordered[(start + step) % ordered.length];
    if (candidate !== path) picked.push(ledger.files[candidate].summary);
  }
  return picked;
}

async function summarize(path: string, source: string): Promise<string> {
  const answer = await ask(
    GRADER_MODEL,
    withFile(
      'Write one sentence describing what this file does, for use in a multiple-choice test. ' +
        'Do not name the file, its path, or any of its exported identifiers — the sentence must ' +
        'describe the role, not label it. Reply with the sentence and nothing else.',
      path,
      source,
    ),
    false,
  );
  return answer.trim().split('\n')[0];
}

async function discriminate(path: string, source: string, real: string, distractors: string[]): Promise<Verdict> {
  const options = [real, ...distractors];
  const correct = options.findIndex((option) => option === real);
  const lettered = options.map((option, index) => `${'ABCD'[index]}. ${option}`).join('\n');
  const answer = await ask(
    COLD_MODEL,
    withFile(
      `Which one of these sentences describes the file below? Reply with a single letter.\n\n${lettered}`,
      path,
      source,
    ),
    true,
  );
  return answer.trim().toUpperCase().startsWith('ABCD'[correct]) ? 'pass' : 'fail';
}

async function auditProse(path: string, source: string): Promise<{ verdict: Verdict; note: string }> {
  const description = await ask(COLD_MODEL, withFile(AUDIT_PROMPT, path, source), true);
  const judgement = await ask(
    GRADER_MODEL,
    `${withFile(GRADER_PROMPT, path, source)}\n\n<description>\n${description}\n</description>`,
    false,
  );
  const [verdict, ...rest] = judgement.trim().split(/\s+/);
  return { verdict: verdict.toUpperCase().startsWith('PASS') ? 'pass' : 'fail', note: rest.join(' ') };
}

const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const dryRun = process.argv.includes('--dry-run');
const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger;
const tracked = ROOTS.flatMap((root) => sourceFiles(root))
  .filter((path) => !path.endsWith('.d.ts'))
  .sort();
const targets = args.length > 0 ? args.map((arg) => arg.replace(/\\/g, '/')) : tracked;
const sha = git('rev-parse', '--short', 'HEAD');
const today = git('log', '-1', '--format=%cs');

// Every summary is minted before any test runs. Interleaving the two would give the
// first files audited an empty distractor pool and an unearned pass.
if (!dryRun) {
  for (const path of targets) {
    if (ledger.files[path]?.summary) continue;
    ledger.files[path] = {
      ...(ledger.files[path] ?? { lastAuditedSha: '', discrimination: 'fail', prose: 'fail', proseNote: '', model: COLD_MODEL, date: today }),
      summary: await summarize(path, readFileSync(path, 'utf8')),
    };
    writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 2)}\n`);
  }
}

for (const path of targets) {
  const source = readFileSync(path, 'utf8');

  if (dryRun) {
    const distractors = distractorsFor(path, ledger, tracked);
    console.log(`=== ${path} ===`);
    console.log(`cold model: ${COLD_MODEL} (temperature 0), grader: ${GRADER_MODEL} (no sampling params)`);
    console.log(`distractors available: ${distractors.length}`);
    console.log(`prompt bytes: ${withFile(AUDIT_PROMPT, path, source).length}`);
    continue;
  }

  const summary = ledger.files[path].summary;
  const distractors = distractorsFor(path, ledger, tracked);
  const discrimination = distractors.length === DISTRACTORS ? await discriminate(path, source, summary, distractors) : 'pass';
  const prose = await auditProse(path, source);

  ledger.files[path] = {
    lastAuditedSha: sha,
    discrimination,
    prose: prose.verdict,
    summary,
    proseNote: prose.note,
    model: COLD_MODEL,
    date: today,
  };
  console.log(`${discrimination === 'pass' ? '  ' : 'D!'}${prose.verdict === 'pass' ? '  ' : ' P!'} ${path}`);
  writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 2)}\n`);
}

if (!dryRun) console.log(`\nLedger written to ${LEDGER} at ${sha}.`);
