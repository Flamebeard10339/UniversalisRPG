import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { harvestFiles, parseAuditDoc, systemForDoc } from '../lib/auditImport';
import * as git from '../lib/git';
import { appendAuditPass, clauseStandings, duplicateClauseIds, outstandingSummary, parseSpecDoc, stampClauseIds, VERDICTS, type AuditVerdict, type ProofClause, type Verdict } from '../lib/specDoc';
import { loadStore, type Severity, type Task } from '../lib/taskStore';
import type { Flags } from './cli';
import { readStore, recordEvents, refuseUnknownSpec, reportUnknownSpec, resolveConfig, saveStoreAndWarn, slugify, specFile, subjectOf, today, uniqueId } from './context';
import { stdinPrompter } from './prompt';
import { printRow, truncateLine } from './render';

// The migration path only, for the legacy documents under docs/audits/ and
// any new report written as one. Findings under `## H1` / `## M2` / `## L3`
// become unreviewed tasks; every other heading shape in those docs is a
// superseded or reconciliation format and is silently left unimported.
export function cmdImport(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const docPath = args.positional[0];
  if (!docPath) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  if (!existsSync(docPath)) {
    console.error(`error: no such file: ${docPath}`);
    process.exitCode = 1;
    return;
  }

  const basename = path.basename(docPath).replace(/\.md$/, '');
  const system = systemForDoc(basename);
  const findings = parseAuditDoc(readFileSync(docPath, 'utf8'));

  const tasks = loadStore(config.storePath);
  const taken = new Set(tasks.map((task) => task.id));
  const created: Task[] = [];
  let imported = 0;
  let skipped = 0;
  for (const finding of findings) {
    const id = `${basename}-${finding.code.toLowerCase()}`;
    if (taken.has(id)) {
      skipped++;
      continue;
    }
    const task: Task = {
      id,
      title: finding.title,
      kind: 'finding',
      state: 'unreviewed',
      severity: finding.severity,
      system,
      spec: null,
      clause: null,
      requires: [],
      writes: [],
      discharges: [],
      grant: null,
      produces: [],
      files: [`${docPath}#${finding.code}`, ...harvestFiles(finding.body, existsSync)],
      deliverable: null,
      evidence: finding.body,
      source: null,
      reason: null,
      closed: null,
      closedCommit: null,
      claimed: null,
      claimedBy: null,
      extra: null,
    };
    tasks.push(task);
    taken.add(id);
    created.push(task);
    imported++;
  }
  saveStoreAndWarn(tasks, config);
  recordEvents(
    config,
    'import',
    created.map((task) => subjectOf(task, `imported from ${docPath} as ${task.severity ?? 'unrated'} finding ${truncateLine(task.title, 60)}`)),
  );

  const skippedNote = skipped > 0 ? ` (${skipped} already present, skipped)` : '';
  const systemNote = system === null && findings.length > 0 ? ' — no system mapping for this doc name, system left null' : '';
  console.log(`imported ${imported} finding(s) from ${docPath}${skippedNote}${systemNote}`);
}

// A prompt without a resolvable diff range cannot do its job — the two
// git calls are kept apart so a base-branch typo and a detached-HEAD
// failure are reported as what each actually is, and neither is allowed
// to fall back to a placeholder that still exits 0.
export function resolveDiffRange(baseBranch: string, emit: (line: string) => void): { base: string; head: string } | null {
  const base = git.mergeBase(baseBranch);
  if (base === null) {
    emit(`could not resolve a merge-base between HEAD and ${baseBranch}`);
    return null;
  }
  const head = git.head();
  if (head === null) {
    emit('could not resolve HEAD');
    return null;
  }
  return { base, head };
}

function diffChangedFiles(range: string): string[] {
  try {
    const output = execFileSync('git', ['diff', '--name-only', range], { encoding: 'utf8' }).trim();
    return output === '' ? [] : output.split('\n');
  } catch {
    return [];
  }
}

// What the auditor is told to look for. Lives here, not in CLAUDE.md:
// hand-copied briefs are what trained agents to fabricate their own, so the
// one authoritative checklist is the one the tool prints.
const AUDIT_CHECKLIST = [
  'a simpler existing pattern that should have been reused;',
  'scope drift;',
  'CI, test, coverage, lint, type, or security weakening;',
  'unmet acceptance criteria;',
  'duplicated utilities or domain concepts;',
  'architecture-boundary violations;',
  'tests that repeat the implementation\'s assumptions;',
  'missing edge cases;',
  'public API, data, security, performance, or rollback risks;',
  'cross-system effects;',
  'comments that restate self-documenting code;',
];

export function cmdAuditPrompt(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const slug = args.positional[0];
  if (!slug) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  const path_ = specFile(config, slug);
  if (!existsSync(path_)) {
    reportUnknownSpec(config, slug, (line) => console.log(line));
    return;
  }

  const baseBranch = args.flags['base-branch'] ?? 'main';
  // A read answers, including when the answer is that it could not resolve
  // the range.
  const range = resolveDiffRange(baseBranch, (line) => console.log(line));
  if (range === null) return;
  const { base, head } = range;

  const doc = parseSpecDoc(readFileSync(path_, 'utf8'));
  const tasks = readStore(config);
  const members = tasks.filter((task) => task.spec === slug);
  const latest = doc.auditPasses[doc.auditPasses.length - 1];

  // Locators (`path:12`, `path#H1`) are evidence on the record; what the
  // auditor opens is the path, so the union is over paths — otherwise one
  // file appears twice, once openable and once not.
  const relevantFiles = [...new Set([...members.flatMap((task) => task.files), ...diffChangedFiles(`${base}..${head}`)].map((file) => file.split(/[:#]/)[0]))].sort();
  const noTargetCount = doc.proofClauses.filter((clause) => (clause.proofTargets ?? []).length === 0).length;

  console.log(`You are auditing ${slug} on branch ${config.branch}.`);
  console.log(`Spec: ${path_}`);
  console.log(`Diff range: ${base}..${head}`);
  console.log('');
  console.log('Do not assume the implementation approach is correct. Read the spec deliverable, the latest audit pass if any, and the diff above. Verify each proof clause independently.');
  console.log('');
  console.log('The audit answers two questions, and the second cannot be reached clause by clause:');
  console.log('1. Is every promised clause delivered, with evidence that runs?');
  console.log('2. Is anything worse than before this branch? Clause-by-clause verification cannot see a regression, because each clause looks fine in isolation — diff the behavior, not the promise.');
  console.log('');
  console.log('Look specifically for:');
  for (const item of AUDIT_CHECKLIST) console.log(`- ${item}`);
  console.log('');
  console.log('Required commands (all must pass; `npm run tasks -- merge-ready` runs them together):');
  console.log('- npm run tasks -- merge-ready');
  console.log('');
  console.log('Log any tool friction — task tool, audit tool, harness — in .planning/agent-feedback/tool-friction.md');
  console.log('');
  console.log('Relevant files:');
  if (relevantFiles.length === 0) console.log('- none');
  for (const file of relevantFiles) console.log(`- ${file}`);
  console.log('');
  const standings = clauseStandings(doc.proofClauses, latest?.verdicts);
  console.log('Proof clauses:');
  for (const clause of doc.proofClauses) {
    console.log(`- [c${clause.id}] ${clause.text}`);
    const standing = standings.find((verdict) => verdict.clause === clause.id)!;
    console.log(`  latest verdict: ${standing.status}${standing.status === 'unknown' ? ' — nobody has graded this clause' : standing.evidence ? ` — ${standing.evidence}` : ''}`);
    const targets = clause.proofTargets ?? [];
    if (targets.length === 0) {
      console.log('  no proof target — requires human verification: inspect the behavior directly.');
      console.log('  If this is pure domain logic or an API layer, prefer naming a `proof: vitest <file> "<test>"` or `proof: command <cmd>` target so a future pass can mutation-test it. If this is UI work, add or run smoke coverage once the implementation has settled.');
    } else {
      for (const target of targets) console.log(`  proof: ${target}`);
      console.log('  has a proof target — if it names pure logic or an API, temporarily remove, invert, or scale the behavior it proves and confirm it fails for the right reason before accepting it; a UI or smoke target is inspected, not mutation-tested.');
    }
  }
  console.log('');
  if (noTargetCount > 0) console.log(`${noTargetCount} of ${doc.proofClauses.length} clause(s) have no proof target and require human verification.`);
  console.log('');
  console.log(`${latest ? `Latest audit pass: pass ${latest.pass} (${latest.date})` : 'Latest audit pass: none recorded'} — ${outstandingSummary(standings)}`);
  console.log('');
  console.log('Member tasks:');
  if (members.length === 0) console.log('- none');
  const byId = new Map(tasks.map((task) => [task.id, task]));
  for (const task of members) printRow(task, byId, { indent: '- ', withFiles: true });
  console.log('');
  console.log('For every clause with a proof target, confirm the target exists and fails under a meaningful mutation or reproduction before accepting it as proof. `npm run mutate -- <manifest.json>` is the tool; `npm run probe` asks the DSL load path questions without a scratch runner.');
  console.log('Do not treat green tests as proof unless they are tied to the clause they discharge.');
  console.log('');
  console.log('Deliver your results into the store, not into a report nobody reads:');
  console.log(`- verdicts: \`tasks audit ${slug} --proof N=met|unmet|unknown --evidence N="..." ...\` — met requires evidence the next pass can re-run; unmet means you checked and it fails; ungraded clauses are recorded unknown.`);
  console.log(`- findings: file them in the same \`tasks audit\` call (--finding "..." --severity ... --system "..." --deliverable "..." --evidence "..."), or write the report under docs/audits/ and \`tasks import <doc>\`. Every finding needs both halves: what is broken, and what fixing it would mean.`);
  console.log(`- \`tasks audit ${slug}\` with findings and no --proof flags files the findings without recording a pass, so filing late findings never erases recorded verdicts.`);
  console.log('If you write a report document, archive it under docs/audits/ before the session ends — but the store is the record of note.');
  console.log('');
  console.log('Report each clause as met, unmet or unknown. `met` carries the evidence that backs it and the tool refuses it without one; `unmet` means you checked and it fails; `unknown` means nobody looked, and reporting it as unmet instead hides that nothing was verified.');
  console.log('You file findings; you never promote them. Triage is a separate step with a separate actor, and its rule differs by pass: a branch\'s own first-pass findings are promoted without a walk, so a HIGH you file here will be scheduled without anyone asking you again; from pass 2 on, promotion extends what the spec already owes and waits for a human. Say plainly which of yours you believe this branch must not merge without.');
}

interface AuditFinding {
  title: string;
  severity: Severity | null;
  system: string | null;
  files: string[];
  deliverable: string | null;
  evidence: string | null;
}

interface AuditArgs {
  slug: string | null;
  configFlags: Record<string, string>;
  baseBranch: string;
  proofs: Map<number, Verdict>;
  evidence: Map<number, string>;
  errors: string[];
  // Files named for an unmet proof clause — where the undelivered task
  // this pass creates for it should tell the next session to start.
  clauseFiles: Map<number, string[]>;
  findings: AuditFinding[];
}

const CONFIG_FLAG_NAMES = new Set(['store', 'systems', 'specs-dir', 'branch', 'actor']);

// The clause-scoped `N=value` shape --proof, --file and --evidence share
// before any --finding opens. One parser for it: the two `--evidence`
// branches used to each carve the `N=` prefix off by hand, and drifted.
function clauseScoped(raw: string): { clause: number; value: string } | null {
  const eq = raw.indexOf('=');
  if (eq <= 0) return null;
  const clause = Number(raw.slice(0, eq));
  return Number.isFinite(clause) ? { clause, value: raw.slice(eq + 1) } : null;
}

// Repeated --proof/--evidence/--finding flags need a dedicated scanner: the
// generic parseArgs collapses a repeated flag to its last value, and a
// --finding's --severity/--system/--file belong to whichever --finding
// came most recently, which a flat key-value map cannot express.
//
// --file and --evidence are overloaded by position: while no --finding has
// been seen yet they are clause-scoped and take the same `N=value` shape as
// --proof (`--file 2=src/save.ts:88`); once a --finding is open they attach
// to that finding instead and take a bare value.
export function parseAuditArgs(args: string[]): AuditArgs {
  const configFlags: Record<string, string> = {};
  let baseBranch = 'main';
  const proofs = new Map<number, Verdict>();
  const evidence = new Map<number, string>();
  const errors: string[] = [];
  const clauseFiles = new Map<number, string[]>();
  const findings: AuditFinding[] = [];
  let slug: string | null = null;
  let current: AuditFinding | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      if (slug === null) slug = arg;
      continue;
    }
    const key = arg.slice(2);
    const value = args[i + 1];
    i++;
    if (CONFIG_FLAG_NAMES.has(key)) {
      configFlags[key] = value ?? '';
    } else if (key === 'base-branch') {
      baseBranch = value ?? 'main';
    } else if (key === 'proof') {
      const [clause, status] = (value ?? '').split('=');
      if (!VERDICTS.includes(status as Verdict)) errors.push(`--proof ${value ?? ''} names no verdict — a clause is met, unmet or unknown`);
      else proofs.set(Number(clause), status as Verdict);
    } else if (key === 'evidence') {
      const scoped = clauseScoped(value ?? '');
      if (scoped !== null) evidence.set(scoped.clause, scoped.value);
      else if (current === null) errors.push(`--evidence ${value ?? ''} names no clause — before any --finding, evidence is clause-scoped and takes the same N="..." shape as --proof`);
      else if (current.evidence !== null) errors.push(`finding "${current.title}" already has evidence`);
      else current.evidence = value ?? '';
    } else if (key === 'finding') {
      current = { title: value ?? '', severity: null, system: null, files: [], deliverable: null, evidence: null };
      findings.push(current);
    } else if (key === 'file' && current === null) {
      const scoped = clauseScoped(value ?? '');
      if (scoped === null) errors.push(`--file ${value ?? ''} names no clause — before any --finding, a file is clause-scoped and takes the same N=path:line shape as --proof`);
      else clauseFiles.set(scoped.clause, [...(clauseFiles.get(scoped.clause) ?? []), scoped.value]);
    } else if (current === null) {
      errors.push(`--${key} describes a finding, and no --finding has been opened yet — put it after the --finding it belongs to`);
    } else if (key === 'severity') {
      current.severity = value as Severity;
    } else if (key === 'system') {
      current.system = value ?? null;
    } else if (key === 'deliverable') {
      current.deliverable = value ?? null;
    } else if (key === 'file') {
      current.files.push(value ?? '');
    } else {
      errors.push(`unknown flag --${key} after --finding ${JSON.stringify(current.title)} — a finding takes --severity, --system, --deliverable, --evidence and --file`);
    }
  }
  return { slug, configFlags, baseBranch, proofs, evidence, errors, clauseFiles, findings };
}

export const AUDIT_USAGE =
  `usage: tasks audit <spec> [--base-branch main] [--actor <name>] [--proof N=met|unmet|unknown ...] [--evidence N="..." ... (required for every met clause)] [--file N=path:line ...] [--finding "..." --severity high|medium|low --system "<name>" --deliverable "..." --evidence "..." [--file path:line ...]]...  (with no --proof flags and no findings, walks the clauses interactively; findings with no --proof flags are filed without recording a pass, so late findings never reset verdicts; a clause left ungraded is recorded unknown, never unmet)`;

// Stops at the first clause the answerer walks away from rather than
// looping on an exhausted stdin, and the caller grades the rest `unknown` —
// a half-finished walk graded nothing, which is exactly what unknown says.
async function walkClausesInteractively(clauses: ProofClause[]): Promise<AuditVerdict[]> {
  const prompter = stdinPrompter();
  const verdicts: AuditVerdict[] = [];
  for (const clause of clauses) {
    console.log(`\nclause ${clause.id}: ${clause.text}`);
    let status: Verdict | null = null;
    while (status === null && !prompter.exhausted()) {
      const answer = (await prompter.ask('met/unmet/unknown? ')).trim().toLowerCase();
      if (VERDICTS.includes(answer as Verdict)) status = answer as Verdict;
      else if (!prompter.exhausted()) console.log('type "met", "unmet" or "unknown"');
    }
    if (status === null) break;
    // A met verdict is a completion claim, so it is held until the claim
    // names something the next auditor can re-run; unmet and unknown claim
    // nothing and an empty answer records nothing.
    let evidenceText: string | null = null;
    while (evidenceText === null && !prompter.exhausted()) {
      evidenceText = (await prompter.ask(status === 'met' ? 'evidence (required for met): ' : 'evidence (optional): ')).trim() || null;
      if (status !== 'met') break;
      if (evidenceText === null && !prompter.exhausted()) console.log('a met verdict needs evidence the next pass can re-run');
    }
    if (status === 'met' && evidenceText === null) break;
    verdicts.push({ clause: clause.id, status, evidence: evidenceText });
  }
  prompter.close();
  return verdicts;
}

function buildFindingTask(finding: AuditFinding, slug: string, pass: number, taken: Set<string>): Task {
  const id = uniqueId(slugify(`${slug}-pass${pass}-${finding.title}`), taken);
  return {
    id,
    title: finding.title,
    kind: 'finding',
    state: 'unreviewed',
    severity: finding.severity,
    system: finding.system,
    spec: null,
    clause: null,
    requires: [],
    writes: [],
    discharges: [],
    grant: null,
    produces: [],
    files: finding.files,
    deliverable: finding.deliverable,
    evidence: finding.evidence,
    source: { spec: slug, pass },
    reason: null,
    closed: null,
    closedCommit: null,
    claimed: null,
    claimedBy: null,
    extra: null,
  };
}

function refuseInvalidFindings(findings: AuditFinding[]): boolean {
  for (const finding of findings) {
    if (!finding.severity || !['high', 'medium', 'low'].includes(finding.severity)) {
      console.error(`error: finding "${finding.title}" needs --severity high|medium|low`);
      process.exitCode = 1;
      return true;
    }
    if (!finding.deliverable) {
      console.error(`error: finding "${finding.title}" needs --deliverable "..." — a finding must say what fixing it would mean`);
      process.exitCode = 1;
      return true;
    }
    // Triage shows both halves and decides on both: a finding with no
    // evidence reaches the human as a proposed fix to a problem they have
    // to take on faith, which is the one thing triage cannot do.
    if (!finding.evidence) {
      console.error(`error: finding "${finding.title}" needs --evidence "..." — a finding must say what is broken, not only what fixing it would mean`);
      process.exitCode = 1;
      return true;
    }
  }
  return false;
}

// The only way a finding enters the store.
export async function cmdAudit(args: Flags, usage: string): Promise<void> {
  const parsed = parseAuditArgs(args.raw);
  if (!parsed.slug) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  if (parsed.errors.length > 0) {
    console.error(`error: ${parsed.errors[0]}`);
    process.exitCode = 1;
    return;
  }
  const config = resolveConfig(parsed.configFlags);
  const slug = parsed.slug;
  const path_ = specFile(config, slug);
  if (!existsSync(path_)) {
    refuseUnknownSpec(config, slug);
    return;
  }

  // Findings with no verdicts record no pass: a pass is a statement about
  // the branch's clauses, and the standing reads from the latest pass only —
  // so an all-unknown pass created as a side effect of filing findings
  // erased real verdicts, twice, on the branch that recorded the friction.
  if (parsed.proofs.size === 0 && parsed.findings.length > 0) {
    if (refuseInvalidFindings(parsed.findings)) return;
    const doc = parseSpecDoc(readFileSync(path_, 'utf8'));
    const against = doc.auditPasses.length === 0 ? 1 : doc.auditPasses[doc.auditPasses.length - 1].pass;
    const tasks = loadStore(config.storePath);
    const taken = new Set(tasks.map((task) => task.id));
    const created: Task[] = [];
    for (const finding of parsed.findings) {
      const task = buildFindingTask(finding, slug, against, taken);
      tasks.push(task);
      taken.add(task.id);
      created.push(task);
    }
    saveStoreAndWarn(tasks, config);
    recordEvents(config, 'audit', created.map((task) => subjectOf(task, `recorded unreviewed by ${slug} against pass ${against}: ${truncateLine(task.title, 60)}`)));
    console.log(`${created.length} finding(s) recorded, unreviewed, against pass ${against} — no pass appended, so recorded clause verdicts stand`);
    return;
  }

  // Stamped before anything is recorded, so this pass names ids the spec
  // file already carries rather than ids it is about to be given.
  const original = readFileSync(path_, 'utf8');
  const text = stampClauseIds(original);
  const doc = parseSpecDoc(text);
  // Both of these are the state of the spec *document* disagreeing with the
  // write, not malformed CLI input, and doctor already reports the second
  // at exit 0. Refusing meant a typo in a heading stopped an auditor filing
  // findings at all — a gate failing closed on a disagreement.
  if (doc.proofClauses.length === 0) {
    console.warn(`warning: ${slug}'s ## Deliverable has no Proof: clauses — recording a pass that grades nothing`);
  }
  const duplicates = duplicateClauseIds(doc.proofClauses);
  if (duplicates.length > 0) {
    console.warn(`warning: ${slug} tags more than one proof clause [c${duplicates[0]}] — a verdict for it cannot say which one it graded; \`tasks doctor\` reports this until the tags are unique`);
  }

  // A verdict for a clause the spec does not have is a typo, and silently
  // dropping it turned `--proof 99=met` into a recorded pass that graded
  // nothing — superseding real verdicts, since the standing reads from the
  // latest pass only. Refused by name, the way an unscoped --evidence is.
  const clauseIds = new Set(doc.proofClauses.map((clause) => clause.id));
  const unmatched = [...parsed.proofs.keys()].filter((id) => !clauseIds.has(id));
  if (unmatched.length > 0) {
    const shown = unmatched.map((id) => (Number.isNaN(id) ? '(not a number)' : `c${id}`)).join(', ');
    const known = doc.proofClauses.map((clause) => `c${clause.id}`).join(', ') || '(none)';
    console.error(`error: --proof names no clause in ${slug}: ${shown} — its clauses are ${known}. Nothing was recorded`);
    process.exitCode = 1;
    return;
  }

  // Whichever route graded the clauses, the ones it did not reach are
  // `unknown` rather than missing: a pass that says nothing about a clause
  // is a pass that nobody ran on it, and that is a fact worth recording.
  const graded =
    parsed.proofs.size === 0 && parsed.findings.length === 0
      ? await walkClausesInteractively(doc.proofClauses)
      : doc.proofClauses.filter((clause) => parsed.proofs.has(clause.id)).map((clause) => ({ clause: clause.id, status: parsed.proofs.get(clause.id)!, evidence: parsed.evidence.get(clause.id) ?? null }));

  // A walk abandoned before its first verdict — an exhausted stdin, a
  // caller with no TTY — used to record a full all-unknown pass, which is
  // the same verdict-wiping trap the findings-only route closed. A pass
  // that graded zero clauses is not a pass.
  if (doc.proofClauses.length > 0 && graded.length === 0) {
    console.error('error: this pass graded no clause, and recording it would reset every recorded verdict to unknown. Pass --proof N=met|unmet|unknown, or file findings without proofs — they append no pass');
    process.exitCode = 1;
    return;
  }
  const verdicts = clauseStandings(doc.proofClauses, graded);
  const ungraded = verdicts.filter((verdict) => verdict.status === 'unknown').map((verdict) => `c${verdict.clause}`);

  const unevidenced = verdicts.filter((verdict) => verdict.status === 'met' && !verdict.evidence);
  if (unevidenced.length > 0) {
    console.error(`error: ${unevidenced.map((verdict) => `clause ${verdict.clause} is met with no evidence`).join('; ')} — pass --evidence N="..." naming what you checked, so the next pass can re-run it`);
    process.exitCode = 1;
    return;
  }

  if (refuseInvalidFindings(parsed.findings)) return;

  const passNumber = doc.auditPasses.length + 1;
  // A range this checkout cannot compute is recorded as unresolved rather
  // than refused or invented.
  const range = resolveDiffRange(parsed.baseBranch, (line) => console.warn(`warning: ${line} — recording the pass with an unresolved range`));
  const base = range?.base ?? '(unresolved)';
  const head = range?.head ?? '(unresolved)';

  const tasks = loadStore(config.storePath);
  const taken = new Set(tasks.map((task) => task.id));

  const created: Array<{ task: Task; note: string }> = [];
  let undeliveredCreated = 0;
  for (const verdict of verdicts) {
    if (verdict.status !== 'unmet') continue;
    const baseId = `${slug}-clause-${verdict.clause}`;
    if (tasks.some((task) => task.id === baseId && task.state === 'open')) continue;
    const id = taken.has(baseId) ? `${baseId}-pass-${passNumber}` : baseId;
    const clauseText = doc.proofClauses.find((clause) => clause.id === verdict.clause)?.text ?? '';
    const undelivered: Task = {
      id,
      title: `Unmet deliverable clause ${verdict.clause}: ${clauseText}`,
      kind: 'undelivered',
      state: 'open',
      severity: 'high',
      system: null,
      spec: slug,
      clause: verdict.clause,
      requires: [],
      writes: [],
      discharges: [],
      grant: null,
      produces: [],
      files: parsed.clauseFiles.get(verdict.clause) ?? [],
      deliverable: clauseText,
      evidence: verdict.evidence,
      source: { spec: slug, pass: passNumber },
      reason: null,
      closed: null,
      closedCommit: null,
      claimed: null,
      claimedBy: null,
      extra: null,
    };
    tasks.push(undelivered);
    taken.add(id);
    created.push({ task: undelivered, note: `created by ${slug} pass ${passNumber} for unmet clause ${verdict.clause}` });
    undeliveredCreated++;
  }

  let findingsCreated = 0;
  for (const finding of parsed.findings) {
    const task = buildFindingTask(finding, slug, passNumber, taken);
    tasks.push(task);
    taken.add(task.id);
    created.push({ task, note: `recorded unreviewed by ${slug} pass ${passNumber}: ${truncateLine(finding.title, 60)}` });
    findingsCreated++;
  }

  saveStoreAndWarn(tasks, config);
  writeFileSync(path_, appendAuditPass(text, { pass: passNumber, date: today(), base, head, verdicts }), 'utf8');
  // The pass itself is the event with no task — a pass that graded every
  // clause met creates no record, and is still the thing someone asks the
  // log about when they ask what was decided about this spec.
  recordEvents(config, 'audit', [
    { id: null, system: null, spec: slug, note: `recorded pass ${passNumber} against ${head.slice(0, 7)}: ${outstandingSummary(verdicts)}` },
    ...created.map((entry) => subjectOf(entry.task, entry.note)),
  ]);

  console.log(`recorded pass ${passNumber} for ${slug}: ${outstandingSummary(verdicts)}`);
  if (text !== original) console.log(`tagged ${slug}'s proof clauses [cN] — the tag is the clause's identity, so keep it when you reword or reorder`);
  if (undeliveredCreated > 0) console.log(`${undeliveredCreated} undelivered task(s) created for unmet clauses`);
  if (ungraded.length > 0) console.log(`${ungraded.length} clause(s) recorded unknown — nobody graded them: ${ungraded.join(', ')}. No undelivered task was created, because an ungraded clause is not a broken promise`);
  if (findingsCreated > 0) console.log(`${findingsCreated} finding(s) recorded, unreviewed`);
}
