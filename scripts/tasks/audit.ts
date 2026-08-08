import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { harvestFiles, parseAuditDoc, systemForDoc } from '../lib/auditImport';
import { appendAuditPass, clauseStandings, duplicateClauseIds, outstandingSummary, parseSpecDoc, stampClauseIds, VERDICTS, type AuditVerdict, type ProofClause, type Verdict } from '../lib/specDoc';
import { createTask, loadStore, nextSeq, resolveFault, type Fault, type Severity, type Task } from '../lib/taskStore';
import { resolveDiffRange } from './auditPrompt';
import type { Flags } from './cli';
import { recordEvents, refuseUnknownSpec, resolveConfig, saveStoreAndWarn, slugify, specFile, subjectOf, today, uniqueId } from './context';
import { activePrompter } from './prompt';
import { truncateLine } from './render';

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

  // A legacy document carries no fault of its own, and inventing one per
  // finding would be a guess; the caller who chose to import it classifies
  // the batch, and `tasks edit --fault` reclassifies any of them afterwards.
  const fault = resolveFault('finding', args.flags.fault);
  if ('error' in fault) {
    console.error(fault.error);
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
    const task = createTask(
      { id, seq: nextSeq(tasks), title: finding.title, state: 'unreviewed', kind: 'finding', fault: fault.value },
      {
        severity: finding.severity,
        system,
        files: [`${docPath}#${finding.code}`, ...harvestFiles(finding.body, existsSync)],
        evidence: finding.body,
      },
    );
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

interface AuditFinding {
  title: string;
  severity: Severity | null;
  system: string | null;
  files: string[];
  deliverable: string | null;
  evidence: string | null;
  fault: string | null;
}

// A finding that named everything a record needs. The narrowing is the point:
// `buildFindingTask` takes one of these, so a finding that skipped a required
// field cannot reach the assembly at all.
type FiledFinding = Omit<AuditFinding, 'severity' | 'deliverable' | 'evidence' | 'fault'> & {
  severity: Severity;
  deliverable: string;
  evidence: string;
  fault: Fault;
};

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
// The value is assembled here, so this is where it is trimmed: outer
// whitespace only, never the interior, because `--args-from` joins a
// continuation onto the line above it with a newline and a multi-line
// reason must survive that untouched.
function clauseScoped(raw: string): { clause: number; value: string } | null {
  const eq = raw.indexOf('=');
  if (eq <= 0) return null;
  const clause = Number(raw.slice(0, eq));
  return Number.isFinite(clause) ? { clause, value: raw.slice(eq + 1).trim() } : null;
}

// A reason must contain at least one character that occupies space when
// rendered and does not command the renderer. Whitespace (`\s`) occupies
// nothing; `Default_Ignorable_Code_Point` — the Unicode property that
// defines "occupies no space when rendered", covering ZERO WIDTH SPACE and
// its Cf kin plus the Mn/Lo outliers a general category alone misses
// (variation selectors including VS16, COMBINING GRAPHEME JOINER, the
// Hangul filler jamo, Khmer inherent vowel signs, Mongolian free variation
// selectors) — renders nothing; category Cc (NUL, BEL, ESC, DEL and their
// kin — control characters) commands the renderer rather than rendering, up
// to and including painting colour codes or ringing a bell when the file is
// later read. Everything else is a legitimate reason, however ugly: a
// single punctuation mark, a long run of one character, a lone combining
// mark, an unpaired surrogate (replaced by U+FFFD on write, visible by the
// time it lands). This line is drawn and stays drawn — no further
// exclusions.
const VISIBLE_CHARACTER = /[^\s\p{Default_Ignorable_Code_Point}\p{Cc}]/u;
export function hasVisibleContent(text: string | null): boolean {
  return text !== null && VISIBLE_CHARACTER.test(text);
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
      else current.evidence = (value ?? '').trim();
    } else if (key === 'finding') {
      current = { title: value ?? '', severity: null, system: null, files: [], deliverable: null, evidence: null, fault: null };
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
      current.deliverable = value?.trim() ?? null;
    } else if (key === 'fault') {
      current.fault = value ?? null;
    } else if (key === 'file') {
      current.files.push(value ?? '');
    } else {
      errors.push(`unknown flag --${key} after --finding ${JSON.stringify(current.title)} — a finding takes --severity, --system, --fault, --deliverable, --evidence and --file`);
    }
  }
  return { slug, configFlags, baseBranch, proofs, evidence, errors, clauseFiles, findings };
}

// The same flags, off a file, because a full pass does not fit on a command
// line. Twelve --proof/--evidence pairs carrying test names, mutation
// verdicts and probe output ran past the Windows 8191-character limit in two
// separate sessions — roughly 13k characters over nine clauses and five
// findings, refused as "The command line is too long", nothing run — and the
// pass after it compressed its evidence to fit. The command asks for
// evidence a next pass can re-run and then rationed how much of it there was
// room for; only the transport moves, and the parser below is the same one.
//
// A bare spec slug is the one value a reader plausibly writes on a line of
// its own before any flag: it is the positional argument `tasks audit` takes
// on the command line, not inside this file, and a reader who has just
// finished writing a whole pass reaches for it out of habit. Matched against
// the same shape `slugify` produces, so the check names the actual form a
// slug takes rather than a guess at one.
const LOOKS_LIKE_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// A line opening with `--` is a flag and everything after the first space is
// its value; any other line continues the value above it, which is what lets
// a clause's evidence be a paragraph. Blank lines and `#` at column zero are
// skipped, so a file can be annotated.
export function parseAuditFile(text: string, label: string): { argv: string[]; errors: string[] } {
  const argv: string[] = [];
  const errors: string[] = [];
  text.split('\n').forEach((raw, index) => {
    const line = raw.replace(/\r$/, '').trimEnd();
    if (line.trim() === '' || line.startsWith('#')) return;
    if (line.startsWith('--')) {
      const space = line.indexOf(' ');
      argv.push(space === -1 ? line : line.slice(0, space), space === -1 ? '' : line.slice(space + 1));
      return;
    }
    if (argv.length === 0) {
      const remedy = LOOKS_LIKE_SLUG.test(line) ? ` — if "${line}" is the spec slug, it belongs on the command line: npm run tasks -- audit ${line} --args-from ${label}` : '';
      errors.push(`${label}:${index + 1}: a value line before any flag — every line here either opens a flag with -- or continues the one above it${remedy}`);
      return;
    }
    argv[argv.length - 1] = `${argv[argv.length - 1]}\n${line}`;
  });
  return { argv, errors };
}

export const AUDIT_USAGE =
  `usage: tasks audit <spec> [--args-from <file>] [--base-branch main] [--actor <name>] [--proof N=met|unmet|unknown|deferred ...] [--evidence N="..." ... (required for every met or deferred clause)] [--file N=path:line ...] [--finding "..." --severity high|medium|low --system "<name>" --fault tooling|contract|nobody --deliverable "..." --evidence "..." [--file path:line ...]]...  (a file of the same flags, one per line, with any unprefixed line continuing the value above it — which is how a pass carrying evidence specific enough to re-run gets past the command-line length limit. With no --proof flags and no findings, walks the clauses interactively; findings with no --proof flags are filed without recording a pass, so late findings never reset verdicts; a clause left ungraded is recorded unknown, never unmet; deferred converts a clause into a tracked undelivered record rather than dropping it, and is refused with no reason)`;

// `--args-from` is consumed here rather than by parseAuditArgs, which would
// have to know about a flag that is not part of a pass.
function readAuditFile(raw: string[]): { argv: string[]; rest: string[]; errors: string[] } {
  const at = raw.indexOf('--args-from');
  if (at === -1) return { argv: [], rest: raw, errors: [] };
  const path_ = raw[at + 1];
  const rest = [...raw.slice(0, at), ...raw.slice(at + 2)];
  if (path_ === undefined || path_.startsWith('--')) return { argv: [], rest, errors: ['--args-from needs a path to a file of audit flags'] };
  let text: string;
  try {
    text = readFileSync(path_, 'utf8');
  } catch (error) {
    return { argv: [], rest, errors: [`--args-from could not read ${path_}: ${error instanceof Error ? error.message : String(error)}`] };
  }
  const parsed = parseAuditFile(text, path_);
  return { argv: parsed.argv, rest, errors: parsed.errors };
}

// Stops at the first clause the answerer walks away from rather than
// looping on an exhausted stdin, and the caller grades the rest `unknown` —
// a half-finished walk graded nothing, which is exactly what unknown says.
async function walkClausesInteractively(clauses: ProofClause[]): Promise<AuditVerdict[]> {
  const prompter = activePrompter();
  const verdicts: AuditVerdict[] = [];
  for (const clause of clauses) {
    console.log(`\nclause ${clause.id}: ${clause.text}`);
    let status: Verdict | null = null;
    while (status === null && !prompter.exhausted()) {
      const answer = (await prompter.ask('met/unmet/unknown/deferred? ')).trim().toLowerCase();
      if (VERDICTS.includes(answer as Verdict)) status = answer as Verdict;
      else if (!prompter.exhausted()) console.log('type "met", "unmet", "unknown" or "deferred"');
    }
    if (status === null) break;
    // A met verdict is a completion claim and a deferred one is a scope
    // decision, so both are held until the claim names something the next
    // pass can re-run; unmet and unknown claim nothing and an empty answer
    // records nothing.
    const needsReason = status === 'met' || status === 'deferred';
    let evidenceText: string | null = null;
    if (needsReason) {
      let visible = false;
      while (!visible && !prompter.exhausted()) {
        const answer = (await prompter.ask(status === 'met' ? 'evidence (required for met): ' : 'reason (required for deferred): ')).trim();
        visible = hasVisibleContent(answer);
        if (visible) evidenceText = answer;
        else if (!prompter.exhausted()) console.log(status === 'met' ? 'a met verdict needs evidence the next pass can re-run' : 'a deferred verdict needs a reason the next pass can re-run');
      }
      if (!visible) break;
    } else {
      evidenceText = (await prompter.ask('evidence (optional): ')).trim() || null;
    }
    verdicts.push({ clause: clause.id, status, evidence: evidenceText });
  }
  prompter.close();
  return verdicts;
}

function buildFindingTask(finding: FiledFinding, slug: string, pass: number, taken: Set<string>, tasks: Task[]): Task {
  const id = uniqueId(slugify(`${slug}-pass${pass}-${finding.title}`), taken);
  return createTask(
    { id, seq: nextSeq(tasks), title: finding.title, state: 'unreviewed', kind: 'finding', fault: finding.fault },
    {
      severity: finding.severity,
      system: finding.system,
      files: finding.files,
      deliverable: finding.deliverable,
      evidence: finding.evidence,
      source: { spec: slug, pass },
    },
  );
}

// Null is a refusal already reported, so the caller returns rather than
// re-deciding. Every field a record needs is checked here and nowhere else,
// which is what lets `buildFindingTask` take a narrowed finding.
function filedFindings(findings: AuditFinding[]): FiledFinding[] | null {
  const filed: FiledFinding[] = [];
  for (const finding of findings) {
    const refuse = (message: string): null => {
      console.error(`error: finding ${JSON.stringify(finding.title)} ${message}`);
      process.exitCode = 1;
      return null;
    };
    if (!finding.severity || !['high', 'medium', 'low'].includes(finding.severity)) return refuse('needs --severity high|medium|low');
    if (!finding.deliverable) return refuse('needs --deliverable "..." — a finding must say what fixing it would mean');
    // Triage shows both halves and decides on both: a finding with no
    // evidence reaches the human as a proposed fix to a problem they have
    // to take on faith, which is the one thing triage cannot do.
    if (!finding.evidence) return refuse('needs --evidence "..." — a finding must say what is broken, not only what fixing it would mean');
    const fault = resolveFault('finding', finding.fault ?? undefined);
    if ('error' in fault) {
      console.error(`${fault.error} (finding ${JSON.stringify(finding.title)})`);
      process.exitCode = 1;
      return null;
    }
    filed.push({ ...finding, severity: finding.severity, deliverable: finding.deliverable, evidence: finding.evidence, fault: fault.value });
  }
  return filed;
}

// The only way a finding enters the store.
export async function cmdAudit(args: Flags, usage: string): Promise<void> {
  const fromFile = readAuditFile(args.raw);
  if (fromFile.errors.length > 0) {
    console.error(`error: ${fromFile.errors[0]}`);
    process.exitCode = 1;
    return;
  }
  // The file's flags first and the command line's after, so a `--base-branch`
  // typed beside `--args-from` still wins: the transport did not change
  // which argument is the more specific one.
  const parsed = parseAuditArgs([...fromFile.argv, ...fromFile.rest]);
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
    const late = filedFindings(parsed.findings);
    if (late === null) return;
    const doc = parseSpecDoc(readFileSync(path_, 'utf8'));
    const against = doc.auditPasses.length === 0 ? 1 : doc.auditPasses[doc.auditPasses.length - 1].pass;
    const tasks = loadStore(config.storePath);
    const taken = new Set(tasks.map((task) => task.id));
    const created: Task[] = [];
    for (const finding of late) {
      const task = buildFindingTask(finding, slug, against, taken, tasks);
      tasks.push(task);
      taken.add(task.id);
      created.push(task);
    }
    saveStoreAndWarn(tasks, config);
    recordEvents(config, 'audit', created.map((task) => subjectOf(task, `recorded unreviewed by ${slug} against pass ${against}: ${truncateLine(task.title, 60)}`)));
    console.log(`${created.length} finding(s) recorded, unreviewed, against pass ${against} — no pass appended, so recorded clause verdicts stand`);
    console.log('Next: `npm run tasks -- triage` walks them, with a separate actor. You file findings; you never promote them');
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

  // `deferred` needs the same hold `met` does, for the opposite reason: `met`
  // is a completion claim and `deferred` is a scope decision, and neither is
  // recordable on a shrug. Without this, `deferred` would just be a cheaper
  // way to say `unmet`.
  const unevidenced = verdicts.filter((verdict) => (verdict.status === 'met' || verdict.status === 'deferred') && !hasVisibleContent(verdict.evidence));
  if (unevidenced.length > 0) {
    console.error(
      `error: ${unevidenced.map((verdict) => (verdict.status === 'met' ? `clause ${verdict.clause} is met with no evidence` : `clause ${verdict.clause} is deferred with no reason`)).join('; ')} — pass --evidence N="..." naming what you checked or why the goal still holds, so the next pass can re-run it`,
    );
    process.exitCode = 1;
    return;
  }

  const findings = filedFindings(parsed.findings);
  if (findings === null) return;

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
  let deferredCreated = 0;
  for (const verdict of verdicts) {
    const deferred = verdict.status === 'deferred';
    if (verdict.status !== 'unmet' && !deferred) continue;
    const baseId = `${slug}-clause-${verdict.clause}`;
    if (tasks.some((task) => task.id === baseId && task.state === 'open')) continue;
    const id = taken.has(baseId) ? `${baseId}-pass-${passNumber}` : baseId;
    const clauseText = doc.proofClauses.find((clause) => clause.id === verdict.clause)?.text ?? '';
    const undelivered = createTask(
      {
        id,
        seq: nextSeq(tasks),
        title: `${deferred ? 'Deferred' : 'Unmet'} deliverable clause ${verdict.clause}: ${clauseText}`,
        state: 'open',
        kind: 'undelivered',
      },
      {
        severity: 'high',
        // A deferred clause converts rather than staying owed: `spec: null` is
        // the store's existing shape for "tracked, not a member of any spec" —
        // render already prints it as `(deferred)` — so the record leaves
        // merge-ready's spec leg the same way it left the clauses leg, without
        // a second field to say so. `source.spec` still names the spec it fell
        // out of, which is where an owner search over that spec finds it.
        spec: deferred ? null : slug,
        clause: verdict.clause,
        files: parsed.clauseFiles.get(verdict.clause) ?? [],
        deliverable: clauseText,
        evidence: verdict.evidence,
        source: { spec: slug, pass: passNumber },
      },
    );
    tasks.push(undelivered);
    taken.add(id);
    created.push({ task: undelivered, note: `created by ${slug} pass ${passNumber} for ${deferred ? 'deferred' : 'unmet'} clause ${verdict.clause}` });
    if (deferred) deferredCreated++;
    else undeliveredCreated++;
  }

  let findingsCreated = 0;
  for (const finding of findings) {
    const task = buildFindingTask(finding, slug, passNumber, taken, tasks);
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
  if (deferredCreated > 0) console.log(`${deferredCreated} clause(s) deferred — tracked as undelivered work with no spec, no longer outstanding against ${slug}`);
  if (ungraded.length > 0) console.log(`${ungraded.length} clause(s) recorded unknown — nobody graded them: ${ungraded.join(', ')}. No undelivered task was created, because an ungraded clause is not a broken promise`);
  if (findingsCreated > 0) console.log(`${findingsCreated} finding(s) recorded, unreviewed`);
  console.log(nextAfterPass(undeliveredCreated > 0 || ungraded.length > 0));
}

// The last step of the auditor's brief, said by the command that completes
// the step before it. Of the two passes carrying the friction log as prose
// somewhere in the brief, one wrote nothing; the pass that had it as a
// numbered step wrote it.
export function nextAfterPass(outstanding: boolean): string {
  return `Next: log what this audit cost you in .planning/agent-feedback/tool-friction.md, dated, then commit${outstanding ? '. This pass leaves a clause outstanding — `npm run tasks -- next` is what picks it up' : ''}`;
}
