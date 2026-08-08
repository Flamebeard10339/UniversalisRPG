import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tsxCli } from '../lib/tsxCli';
import { hasVisibleContent, nextAfterPass, parseAuditArgs, parseAuditFile } from './audit';
import { auditArgsSkeleton } from './auditPrompt';
import { appendEvent, enclosingGitFixture, fixture, firstListedId, repoRoot, script, type Run } from './cliFixtures';

describe('tasks CLI', () => {
  it('import parses H/M/L findings out of an audit doc into unreviewed tasks, and is idempotent on re-run', () => {
    fixture(({ tasks, dir }) => {
      const docPath = path.join(dir, 'runtime-2026-08-01.md');
      writeFileSync(docPath, ['## H1 — a real bug', 'src/runtime/save.ts:88 is where it lives.', '', '## L1 — a minor thing', 'body.'].join('\n'), 'utf8');

      const first = tasks('import', docPath, '--fault', 'contract');
      expect(first.status).toBe(0);
      expect(first.stdout).toContain('imported 2 finding(s)');

      const shown = tasks('show', 'runtime-2026-08-01-h1');
      expect(shown.stdout).toContain('[finding/unreviewed/high]');
      expect(shown.stdout).toContain('system: Runtime');
      expect(shown.stdout).toContain(`files: ${docPath}#H1`);

      const second = tasks('import', docPath, '--fault', 'contract');
      expect(second.stdout).toContain('imported 0 finding(s)');
      expect(second.stdout).toContain('2 already present, skipped');
    });
  });

  it('audit records a pass over a spec whose clauses carry the same tag twice, naming the ambiguity', async () => {
    await fixture(async ({ dir, tasks, audit }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      writeFileSync(specPath, readFileSync(specPath, 'utf8').replace('- The first clause holds.\n- The second clause holds.', '- [c1] The first clause holds.\n- [c1] The second clause holds.'), 'utf8');
      const result = await audit('demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked');
      // A typo in a heading used to stop an auditor filing anything at all.
      // doctor reports the identical condition at exit 0, so this was one
      // fact with two polarities, refusing on the write path.
      expect(result.status).toBe(0);
      expect(result.stderr).toContain('tags more than one proof clause [c1]');
      expect(result.stderr).toContain('cannot say which one it graded');
      expect(readFileSync(specPath, 'utf8')).toContain('### Pass 1');
      expect(tasks('doctor').stdout).toContain('tags more than one proof clause [c1]');
    });
  });

  it('audit records a pass over a spec with no proof clauses, saying it graded nothing', async () => {
    await fixture(async ({ dir, audit }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      writeFileSync(specPath, '# Demo spec\n\n## Deliverable\n\nSomething this branch promises.\n', 'utf8');
      const result = await audit('demo-spec');
      expect(result.status).toBe(0);
      expect(result.stderr).toContain('has no Proof: clauses');
      expect(readFileSync(specPath, 'utf8')).toContain('### Pass 1');

      // A --proof against a clauseless spec is a typo by definition, and
      // the zero-clause escape hatch above does not excuse it.
      const typo = await audit('demo-spec', '--proof', '1=met', '--evidence', '1=checked');
      expect(typo.status).toBe(1);
      expect(typo.stderr).toContain('its clauses are (none)');
    });
  });

  // The verdict-wiping trap, closed: filing findings used to append a pass
  // that graded nothing, and the standing reads from the latest pass only —
  // so recorded verdicts were reset to unknown by the act of filing, twice,
  // on the branch that recorded the friction.
  it('audit with findings and no proofs files the findings without appending a pass, so verdicts stand', async () => {
    await fixture(async ({ dir, tasks, audit }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      await audit('demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      const before = readFileSync(specPath, 'utf8');

      const result = await audit('demo-spec', '--finding', 'a late finding', '--severity', 'low', '--fault', 'contract', '--system', 'Runtime', '--deliverable', 'fix it', '--evidence', 'observed live');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('no pass appended, so recorded clause verdicts stand');
      expect(readFileSync(specPath, 'utf8')).toBe(before);
      expect(readFileSync(specPath, 'utf8')).not.toContain('### Pass 2');

      const standing = tasks('spec', 'show', 'demo-spec');
      expect(standing.stdout).toContain('clause standing (latest pass 1): no clause outstanding');

      const filed = tasks('list', '--state', 'unreviewed');
      expect(filed.stdout).toContain('a late finding');
    });
  });

  // The two remaining doors into the verdict-wiping trap, closed: a typo'd
  // clause number and an abandoned interactive walk each used to record a
  // full all-unknown pass, and the standing reads from the latest pass only.
  it('audit refuses a --proof naming no clause, so a typo cannot record an all-unknown pass', async () => {
    await fixture(async ({ dir, tasks, audit }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      await audit('demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      const before = readFileSync(specPath, 'utf8');

      const typo = await audit('demo-spec', '--proof', '99=met', '--evidence', '99=x');
      expect(typo.status).toBe(1);
      expect(typo.stderr).toContain('names no clause in demo-spec: c99');
      expect(typo.stderr).toContain('its clauses are c1, c2');

      const nan = await audit('demo-spec', '--proof', 'c1=met', '--evidence', '1=x');
      expect(nan.status).toBe(1);
      expect(nan.stderr).toContain('(not a number)');

      expect(readFileSync(specPath, 'utf8')).toBe(before);
      expect(tasks('spec', 'show', 'demo-spec').stdout).toContain('clause standing (latest pass 1): no clause outstanding');
    });
  });

  it('audit on exhausted stdin refuses to record a pass that graded nothing', async () => {
    await fixture(async ({ dir, tasks, audit }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      await audit('demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      const before = readFileSync(specPath, 'utf8');

      const abandoned = await audit('demo-spec');
      expect(abandoned.status).toBe(1);
      expect(abandoned.stderr).toContain('graded no clause');
      expect(readFileSync(specPath, 'utf8')).toBe(before);
      expect(tasks('spec', 'show', 'demo-spec').stdout).toContain('clause standing (latest pass 1): no clause outstanding');
    });
  });

  // The one call site the audit found unguarded: cmdAudit resolved
  // --base-branch's merge-base with a bare git call and no catch, so a
  // typo'd base name threw a raw Node stack instead of a diagnostic — the
  // exact defect Slice 1 fixed for `check` one command over.
  it('audit records a pass whose range this checkout could not compute, as unresolved rather than invented', async () => {
    await fixture(async ({ dir, audit }) => {
      const result = await audit('demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--base-branch', 'no-such-base-branch-xyz');
      expect(result.status).toBe(0);
      expect(result.stderr).toContain('could not resolve a merge-base');
      expect(result.stderr).not.toContain('    at ');
      expect(result.stderr).not.toContain('Command failed');
      // Recorded, and honest about what it could not determine — never a
      // placeholder sha a later reader would take for a fact.
      const written = readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8');
      expect(written).toContain('- base: `(unresolved)`');
      expect(written).toContain('- proof 1: met');
    });
  });

  function walkClauses(dir: string, input: string): Run {
    const globals = ['--store', path.join(dir, 'tasks.jsonl'), '--systems', path.join(dir, 'systems.json'), '--specs-dir', path.join(dir, 'specs'), '--branch', 'demo-spec'];
    const result = spawnSync(process.execPath, [tsxCli, script, 'audit', 'demo-spec', ...globals], { cwd: repoRoot, encoding: 'utf8', input });
    return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
  }

  it('audit\'s interactive clause walk holds a met verdict until evidence is typed, and it survives to the spec file', () => {
    fixture(({ dir }) => {
      const result = walkClauses(dir, 'met\n\nmeasured 70ms\nmet\nread the diff\n');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('evidence (required for met)');
      const specText = readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8');
      expect(specText).toContain('- proof 1: met — measured 70ms');
      expect(specText).toContain('- proof 2: met — read the diff');
    });
  });

  it('audit\'s interactive clause walk offers unknown as a fourth answer and leaves its evidence optional', () => {
    fixture(({ dir }) => {
      const result = walkClauses(dir, 'unknown\n\nunmet\n\n');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('met/unmet/unknown/deferred?');
      const specText = readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8');
      expect(specText).toContain('- proof 1: unknown\n');
      expect(specText).toContain('- proof 2: unmet\n');
    });
  });

  it('audit\'s interactive clause walk re-asks rather than accepting an answer outside the four verdicts', () => {
    fixture(({ dir }) => {
      const result = walkClauses(dir, 'probably\nunknown\n\nunknown\n\n');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('type "met", "unmet", "unknown" or "deferred"');
      expect(readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8')).toContain('- proof 1: unknown');
    });
  });

  it('audit\'s interactive clause walk holds a deferred verdict until a reason is typed, and it survives to the spec file', () => {
    fixture(({ dir }) => {
      const result = walkClauses(dir, 'deferred\n\nthe goal still holds without it\nmet\nread the diff\n');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('reason (required for deferred)');
      const specText = readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8');
      expect(specText).toContain('- proof 1: deferred — the goal still holds without it');
      expect(specText).toContain('- proof 2: met — read the diff');
    });
  });

  // The third route the visible-content guard has to hold on: a lone
  // zero-width space typed at the prompt re-asks the same way a blank
  // answer does, rather than being accepted as a truthy, unreadable reason.
  it('audit\'s interactive clause walk re-asks on an invisible-only reason, and accepts once real content follows it', () => {
    fixture(({ dir }) => {
      const result = walkClauses(dir, 'deferred\n\n​\nreal reason\nmet\nread the diff\n');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('reason (required for deferred)');
      const specText = readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8');
      expect(specText).toContain('- proof 1: deferred — real reason');
      expect(specText).toContain('- proof 2: met — read the diff');
    });
  });

  it('audit\'s interactive clause walk ends on exhausted input and grades what it never reached unknown', () => {
    fixture(({ dir }) => {
      const result = walkClauses(dir, 'unmet\n');
      expect(result.status).toBe(0);
      const specText = readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8');
      expect(specText).toContain('- proof 1: unmet');
      expect(specText).toContain('- proof 2: unknown');
    });
  });

  it('audit refuses a --finding with no --deliverable, recording nothing', async () => {
    await fixture(async ({ tasks, audit }) => {
      const result = await audit('demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--finding', 'undeliverable bug', '--severity', 'high');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('needs --deliverable');
      expect(tasks('list', '--kind', 'finding').stdout).toContain('0 task(s)');
    });
  });

  it('audit refuses a --finding with no --evidence, recording nothing', async () => {
    await fixture(async ({ tasks, audit }) => {
      const result = await audit('demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--finding', 'unevidenced bug', '--severity', 'high', '--deliverable', 'fix it somehow');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('needs --evidence');
      expect(tasks('list', '--kind', 'finding').stdout).toContain('0 task(s)');
    });
  });

  // c4: `filedFindings` tests truthiness — a finding must say what is broken
  // and what fixing it would mean — and a whitespace-only string is truthy,
  // so `--deliverable "   " --evidence "   "` used to pass both guards and
  // file a finding whose two required halves were blank.
  it('c4: audit refuses a --finding whose --deliverable or --evidence is only whitespace, recording nothing', async () => {
    await fixture(async ({ tasks, audit }) => {
      const graded = ['--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked'];
      const blankDeliverable = await audit('demo-spec', ...graded, '--finding', 'blank deliverable', '--severity', 'high', '--deliverable', '   ', '--evidence', 'it is broken');
      expect(blankDeliverable.status).toBe(1);
      expect(blankDeliverable.stderr).toContain('needs --deliverable');

      const blankEvidence = await audit('demo-spec', ...graded, '--finding', 'blank evidence', '--severity', 'high', '--deliverable', 'fix it somehow', '--evidence', '  \t  ');
      expect(blankEvidence.status).toBe(1);
      expect(blankEvidence.stderr).toContain('needs --evidence');

      expect(tasks('list', '--kind', 'finding').stdout).toContain('0 task(s)');
    });
  });

  // c4: trimmed at the assignment in parseAuditArgs, not at the guard —
  // --args-from joins a continuation line onto the one above it with a
  // newline, so a finding's evidence is routinely a paragraph and only the
  // block's own outer whitespace is meant to come off.
  it('c4: parseAuditArgs strips a finding\'s --deliverable and --evidence of their outer whitespace only', () => {
    const parsed = parseAuditArgs(['demo-spec', '--finding', 'a finding', '--severity', 'low', '--deliverable', '  guard the null case  ', '--evidence', '  save.ts:88 dereferences\n\n  before the null check  ']);
    expect(parsed.errors).toEqual([]);
    expect(parsed.findings[0].deliverable).toBe('guard the null case');
    expect(parsed.findings[0].evidence).toBe('save.ts:88 dereferences\n\n  before the null check');
  });

  it('audit carries a --finding\'s --evidence onto the finding task, where triage reads it', async () => {
    await fixture(async ({ tasks, audit }) => {
      await audit('demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--finding', 'a real bug', '--severity', 'high', '--fault', 'contract', '--deliverable', 'guard the null case', '--evidence', 'save.ts:88 dereferences before the null check');
      const shown = tasks('list', '--kind', 'finding', '--state', 'unreviewed');
      const id = firstListedId(shown.stdout);
      expect(tasks('show', id).stdout).toContain('evidence: save.ts:88 dereferences before the null check');
    });
  });

  it('--evidence stays clause-scoped before any --finding and finding-scoped after one, the way --file does', async () => {
    await fixture(async ({ tasks, audit }) => {
      await audit(
        'demo-spec',
        '--proof',
        '1=unmet',
        '--evidence',
        '1=the clause did not hold',
        '--proof',
        '2=met',
        '--evidence',
        '2=clause 2 checked',
        '--finding',
        'a separate bug',
        '--severity',
        'low',
        '--fault',
        'contract',
        '--deliverable',
        'fix the separate bug',
        '--evidence',
        'the finding has its own evidence',
      );
      expect(tasks('show', 'demo-spec-clause-1').stdout).toContain('evidence: the clause did not hold');
      const id = firstListedId(tasks('list', '--kind', 'finding', '--state', 'unreviewed').stdout);
      expect(tasks('show', id).stdout).toContain('evidence: the finding has its own evidence');
    });
  });

  it('clause-shaped evidence after a finding still goes to the clause rather than overwriting the finding', async () => {
    await fixture(async ({ tasks, audit }) => {
      const result = await audit('demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=unmet', '--finding', 'some bug', '--severity', 'low', '--fault', 'contract', '--deliverable', 'fix it', '--evidence', 'broken here', '--evidence', '2=the clause did not hold');
      expect(result.status).toBe(0);
      expect(tasks('show', 'demo-spec-clause-2').stdout).toContain('evidence: the clause did not hold');
      const id = firstListedId(tasks('list', '--kind', 'finding', '--state', 'unreviewed').stdout);
      expect(tasks('show', id).stdout).toContain('evidence: broken here');
    });
  });

  it('audit refuses a second bare finding evidence instead of silently replacing the first', async () => {
    await fixture(async ({ tasks, audit }) => {
      const result = await audit('demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--finding', 'some bug', '--severity', 'low', '--fault', 'contract', '--deliverable', 'fix it', '--evidence', 'first evidence', '--evidence', 'replacement evidence');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('already has evidence');
      expect(tasks('list', '--kind', 'finding').stdout).toContain('0 task(s)');
    });
  });

  // The audit scanner reads flags positionally, so a finding field written
  // before the --finding it belongs to used to fall through every branch
  // and vanish: the pass recorded a finding with no severity, and said so
  // only later, about a value the caller did supply.
  it('audit refuses a finding field written before the --finding it describes, and an unknown flag by name', async () => {
    await fixture(async ({ tasks, audit }) => {
      const early = await audit('demo-spec', '--severity', 'high', '--finding', 'some bug', '--deliverable', 'fix it', '--evidence', 'it is broken');
      expect(early.status).toBe(1);
      expect(early.stderr).toContain('--severity describes a finding, and no --finding has been opened yet');

      const unknown = await audit('demo-spec', '--totallyfakeflag', 'x');
      expect(unknown.status).toBe(1);
      expect(unknown.stderr).toContain('unknown flag: --totallyfakeflag');

      expect(tasks('list', '--kind', 'finding').stdout).toContain('0 task(s)');
    });
  });

  it('audit carries a --finding\'s --deliverable onto the finding task it creates', async () => {
    await fixture(async ({ tasks, audit }) => {
      await audit('demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--finding', 'a real bug', '--severity', 'high', '--fault', 'contract', '--deliverable', 'guard the null case', '--evidence', 'null deref on an empty save');
      const shown = tasks('list', '--kind', 'finding', '--state', 'unreviewed');
      const id = firstListedId(shown.stdout);
      expect(tasks('show', id).stdout).toContain('deliverable: guard the null case');
    });
  });

  it('audit records a clause nobody graded as unknown instead of refusing the pass', async () => {
    await fixture(async ({ dir, audit }) => {
      const result = await audit('demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('recorded pass 1 for demo-spec: outstanding: c2 (unknown)');
      expect(result.stdout).toContain('1 clause(s) recorded unknown — nobody graded them: c2');
      expect(readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8')).toContain('- proof 2: unknown');
    });
  });

  it('an unknown clause creates no undelivered task, because nobody looked is not a broken promise', async () => {
    await fixture(async ({ tasks, audit }) => {
      await audit('demo-spec', '--proof', '1=unmet', '--evidence', '1=it fails');
      expect(tasks('show', 'demo-spec-clause-1').stdout).toContain('[undelivered/open/high]');
      const missing = tasks('show', 'demo-spec-clause-2');
      expect(missing.stdout).toContain('no such task: demo-spec-clause-2');
    });
  });

  it('audit takes unknown as an explicit verdict and never renders it as unmet', async () => {
    await fixture(async ({ dir, audit }) => {
      const result = await audit('demo-spec', '--proof', '1=unknown', '--proof', '2=unmet', '--evidence', '2=it fails');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('outstanding: c1 (unknown), c2 (unmet)');
      const specText = readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8');
      expect(specText).toContain('- proof 1: unknown');
      expect(specText).toContain('- proof 2: unmet — it fails');
    });
  });

  it('audit refuses a met verdict with no evidence, naming the clause, and records nothing', async () => {
    await fixture(async ({ dir, audit }) => {
      const result = await audit('demo-spec', '--proof', '1=met', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('clause 1 is met with no evidence');
      expect(readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8')).not.toContain('## Audit passes');
    });
  });

  it('unmet and unknown need no evidence, because neither is a completion claim', async () => {
    await fixture(async ({ audit }) => {
      const result = await audit('demo-spec', '--proof', '1=unmet', '--proof', '2=unknown');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('outstanding: c1 (unmet), c2 (unknown)');
    });
  });

  it('audit refuses a --proof value that is not one of the three verdicts, naming what it got', async () => {
    await fixture(async ({ dir, audit }) => {
      const result = await audit('demo-spec', '--proof', '1=probably', '--proof', '2=unknown');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('--proof 1=probably');
      expect(result.stderr).toContain('met, unmet or unknown');
      expect(readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8')).not.toContain('## Audit passes');
    });
  });

  // c19. The worker's half of the generated-brief rule the auditor's half
  // has had all along: what a dispatcher hand-writes is a copy of the record
  // that drifts from it, so the record renders itself.
  it('work-prompt names the task\'s deliverable, grant, requirements and clause standings', async () => {
    await enclosingGitFixture(async ({ tasks, audit }) => {
      tasks('add', 'the dependency', '--id', 'dep', '--spec', 'demo-spec');
      tasks('done', 'dep');
      await audit('demo-spec', '--proof', '1=unmet', '--evidence', '1=it does not actually hold', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      tasks('edit', 'demo-spec-clause-1', '--writes', 'src/runtime/save.ts,src/runtime/invented-by-a-planner.ts', '--requires', 'dep', '--deliverable', 'the first clause is delivered', '--evidence', 'the audit graded it unmet');

      const result = tasks('work-prompt', 'demo-spec-clause-1');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('You are implementing demo-spec-clause-1 on branch demo-spec.');
      expect(result.stdout).toContain('deliverable: the first clause is delivered');
      expect(result.stdout).toContain('evidence: the audit graded it unmet');
      // Every requirement with why it does or does not hold the task up —
      // "requirements and whether they are closed" is the whole point of
      // printing them rather than the ids alone.
      expect(result.stdout).toContain('requires: dep (done)');

      // The grant resolved against the tree is what a worker checks a
      // forecast against: a path nobody opened matches nothing, and saying
      // so is what makes the invitation to refuse actionable rather than
      // polite.
      expect(result.stdout).toContain('- src/runtime/save.ts\n');
      expect(result.stdout).toContain('- src/runtime/invented-by-a-planner.ts — matches no tracked file');

      // The clause this record discharges, at its latest standing — and not
      // the spec's other clause, which is somebody else's brief.
      expect(result.stdout).toContain('1. [unmet] The first clause holds.');
      expect(result.stdout).not.toContain('The second clause holds.');
    });
  });

  // The record kind the brief is actually generated for. `doctor` errors on
  // a `clause` outside an `undelivered` record, so reading `clause` alone
  // made this unreachable for every ordinary task: the record block printed
  // the clauses and the clause block, eight lines later, said none were
  // recorded. The test above uses an `undelivered` fixture and so only ever
  // exercised the path that already worked.
  it('work-prompt reads the clauses an ordinary task discharges, not only an undelivered record\'s own', async () => {
    await fixture(async ({ tasks, audit }) => {
      await audit('demo-spec', '--proof', '1=unmet', '--evidence', '1=it does not actually hold', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      tasks('add', 'a slice', '--id', 'slice', '--spec', 'demo-spec', '--discharges', 'c2,c1');

      const result = tasks('work-prompt', 'slice');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('discharges: c1, c2');
      expect(result.stdout).not.toContain('none recorded on this record');
      expect(result.stdout).toContain('1. [unmet] The first clause holds.');
      expect(result.stdout).toContain('2. [met] The second clause holds.');
    });
  });

  it('work-prompt names the claim, grant-correction and concept-registration steps a worker owes before writing code', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec', '--system', 'Runtime', '--produces', 'a policy module');

      const result = tasks('work-prompt', 'a-member');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('npm run tasks -- start a-member --actor <you>');
      expect(result.stdout).toContain('npm run tasks -- edit a-member --writes');
      expect(result.stdout).toContain('npm run tasks -- concept');
      expect(result.stdout).toContain('produced by a-member');
      // The registration step is the one a `produces` claim looks like it
      // already discharged and does not — workflow.md step 5 puts the
      // judgement on the worker, so the brief has to name both.
      expect(result.stdout).toContain('produces: a policy module');
      expect(result.stdout).toContain('a forecast, not a registration');
    });
  });

  it('work-prompt invites refusal of the grant it prints', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec', '--writes', 'src/runtime/save.ts');

      const result = tasks('work-prompt', 'a-member');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('You may refuse this grant');
      // An invitation with no verb behind it is a courtesy. Both exits are
      // named, because "stop, it is not mine" and "decline, it should not be
      // done" are different answers.
      expect(result.stdout).toContain('npm run tasks -- stop a-member');
      expect(result.stdout).toContain('npm run tasks -- decline a-member --reason');
    });
  });

  it('work-prompt refuses an id the store does not hold, without inventing a brief', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');

      const result = tasks('work-prompt', 'no-such-record');
      // A read answers, the way audit-prompt answers an unknown spec. What
      // it must not do is print a brief anyway: a dispatch instruction for a
      // record nobody holds is the one output here that would be invented.
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('no such task: no-such-record');
      expect(result.stdout).not.toContain('You are implementing');
      expect(result.stdout).not.toContain('Write grant');
      expect(result.stdout).not.toContain('Three things the workflow puts on you');
    });
  });

  // A dispatcher on a planning branch holds the spec slug and nothing else —
  // the branch just wrote it — and `work-prompt <slug>` answered "no such
  // task" with five records fuzzy-matched on substrings of their titles.
  it('work-prompt takes the spec slug a dispatcher knows and briefs its next unblocked member', () => {
    fixture(({ tasks }) => {
      tasks('add', 'the first slice', '--id', 'first-slice', '--spec', 'demo-spec');
      tasks('add', 'the second slice', '--id', 'second-slice', '--spec', 'demo-spec');

      const result = tasks('work-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('resolved the spec demo-spec -> first-slice, its next open, unblocked member (1 more behind it: second-slice)');
      expect(result.stdout).toContain('You are implementing first-slice on branch demo-spec.');
      expect(result.stdout).toContain('npm run tasks -- start first-slice --actor <you>');
    });
  });

  it('work-prompt prefers an exact task id to a spec file of the same name', () => {
    fixture(({ tasks }) => {
      // A record that holds a write grant is work, whatever it is called, so
      // sharing a name with a spec file must not redirect away from it.
      tasks('add', 'named after its spec', '--id', 'demo-spec', '--spec', 'demo-spec', '--writes', 'src/runtime/save.ts');
      tasks('add', 'a slice', '--id', 'a-slice', '--spec', 'demo-spec');

      const result = tasks('work-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('You are implementing demo-spec on branch demo-spec.');
      expect(result.stdout).not.toContain('resolved the spec demo-spec');
      expect(result.stdout).not.toContain('You are implementing a-slice');
    });
  });

  // The shape eleven specs carry, and the one the slug fix would otherwise
  // have walked straight into: `work-prompt audit-loop-costs-less` briefed a
  // BLOCKED container whose four waiting requirements were the members ready
  // to pick up, then asked for the write grant that got the last root task
  // declined.
  it('work-prompt briefs a member rather than the root record its own spec blocks', () => {
    fixture(({ tasks }) => {
      tasks('add', 'the first slice', '--id', 'first-slice', '--spec', 'demo-spec', '--writes', 'src/runtime/save.ts');
      tasks('add', 'the second slice', '--id', 'second-slice', '--spec', 'demo-spec', '--writes', 'src/ui/app.ts');
      tasks('add', 'the whole picture', '--id', 'demo-spec', '--spec', 'demo-spec', '--requires', 'first-slice,second-slice');

      const result = tasks('work-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('demo-spec is demo-spec\'s root record');
      expect(result.stdout).toContain('blocked by its own spec and is not work');
      expect(result.stdout).toContain('Briefing first-slice, its next open, unblocked member (1 more behind it: second-slice)');
      expect(result.stdout).toContain('You are implementing first-slice on branch demo-spec.');
      // The container's context is not thrown away, it is pointed at.
      expect(result.stdout).toContain('npm run tasks -- show demo-spec');
      // What the old brief said, and must not say again: the root record is
      // never dispatched as work, and its own spec's members never read as
      // outside blockers.
      expect(result.stdout).not.toContain('You are implementing demo-spec on branch');
      expect(result.stdout).not.toContain('BLOCKED');
    });
  });

  // A prefix is one keystroke from the exact id and lands on the same record,
  // so guarding only the exact path left `work-prompt audit-loop` reproducing
  // all three misdirections verbatim.
  it('work-prompt redirects away from a root record reached by a fragment, not only by its exact id', () => {
    fixture(({ tasks }) => {
      tasks('add', 'a slice', '--id', 'a-slice', '--spec', 'demo-spec', '--writes', 'src/runtime/save.ts');
      tasks('add', 'the whole picture', '--id', 'demo-spec', '--spec', 'demo-spec', '--requires', 'a-slice');

      // A fragment that is neither the exact id nor a spec file name, and
      // that `resolveTaskIds` resolves to the root record by prefix.
      const result = tasks('work-prompt', 'demo-spe');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('demo-spec is demo-spec\'s root record');
      expect(result.stdout).toContain('You are implementing a-slice on branch demo-spec.');
      expect(result.stdout).not.toContain('You are implementing demo-spec on branch');
      expect(result.stdout).not.toContain('BLOCKED');
    });
  });

  it('work-prompt falls back to the root record only when its spec holds no other record', () => {
    fixture(({ tasks }) => {
      tasks('add', 'the whole picture', '--id', 'demo-spec', '--spec', 'demo-spec');

      const undecomposed = tasks('work-prompt', 'demo-spec');
      expect(undecomposed.status).toBe(0);
      expect(undecomposed.stdout).toContain('demo-spec has no member besides its own root record');
      expect(undecomposed.stdout).toContain('You are implementing demo-spec on branch demo-spec.');

      // Decomposed but every member blocked — `audit-brief-arrives-complete`,
      // whose four members all wait behind another spec. Standing in the
      // container for them here would reintroduce the whole defect: what the
      // dispatcher needs is which member waits on what.
      tasks('add', 'a blocked slice', '--id', 'blocked-slice', '--spec', 'demo-spec', '--requires', 'lands-elsewhere-first');
      const blocked = tasks('work-prompt', 'demo-spec');
      expect(blocked.stdout).toContain('blocked-slice waits on lands-elsewhere-first (missing)');
      expect(blocked.stdout).not.toContain('You are implementing');
    });
  });

  it('work-prompt says why a spec has no member to brief rather than printing nothing', () => {
    fixture(({ tasks }) => {
      const empty = tasks('work-prompt', 'demo-spec');
      expect(empty.stdout).toContain('demo-spec is a spec, and it has no open, unblocked member to brief');
      expect(empty.stdout).toContain('demo-spec has no member tasks');
      expect(empty.stdout).not.toContain('You are implementing');

      // The other cause of the same silence, and a different next move: the
      // member exists and is held by a requirement nothing has closed.
      tasks('add', 'a blocked slice', '--id', 'blocked-slice', '--spec', 'demo-spec', '--requires', 'never-lands');
      const blocked = tasks('work-prompt', 'demo-spec');
      expect(blocked.stdout).toContain('blocked-slice waits on never-lands (missing)');
      expect(blocked.stdout).not.toContain('You are implementing');
    });
  });

  it('work-prompt names the branch this spec was last written from', () => {
    fixture(({ tasks, dir }) => {
      tasks('add', 'a member', '--id', 'a-member', '--spec', 'demo-spec');
      appendEvent(dir, { branch: 'claude/earlier-4f21a0', spec: 'demo-spec', id: 'a-member' });
      appendEvent(dir, { branch: 'claude/later-9c1d3e', spec: 'demo-spec', id: 'a-member' });
      appendEvent(dir, { branch: 'claude/another-spec-7b02', spec: 'some-other-spec' });

      const result = tasks('work-prompt', 'a-member');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('demo-spec was last written from branch claude/later-9c1d3e.');
      expect(result.stdout).not.toContain('claude/earlier-4f21a0');
      expect(result.stdout).not.toContain('claude/another-spec-7b02');
      // It states the fact and stops. A worktree's environment belongs to
      // whoever spawned it, and a brief that starts repairing one is a
      // second, unowned copy of that job.
      expect(result.stdout).not.toContain('git reset');
      expect(result.stdout).not.toContain('node_modules');
    });
  });

  it('audit records a pass, creates an undelivered task for an unmet clause, and records findings unreviewed', async () => {
    await fixture(async ({ tasks, dir, audit }) => {
      const result = await audit(
        'demo-spec',
        '--proof',
        '1=met',
        '--evidence',
        '1=clause 1 checked',
        '--proof',
        '2=unmet',
        '--evidence',
        '2=it does not actually hold',
        '--file',
        '2=src/runtime/save.ts:88',
        '--finding',
        'a fresh bug',
        '--severity',
        'medium',
        '--fault',
        'tooling',
        '--system',
        'Runtime',
        '--deliverable',
        'add a guard before dereferencing',
        '--evidence',
        'save.ts:88 dereferences before the null check',
        '--file',
        'src/runtime/save.ts:1',
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('recorded pass 1');
      expect(result.stdout).toContain('1 undelivered task(s)');
      expect(result.stdout).toContain('1 finding(s) recorded, unreviewed');

      const specText = readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8');
      expect(specText).toContain('## Audit passes');
      expect(specText).toContain('- proof 2: unmet — it does not actually hold');

      const undelivered = tasks('show', 'demo-spec-clause-2');
      expect(undelivered.stdout).toContain('[undelivered/open/high]');
      expect(undelivered.stdout).toContain('spec: demo-spec');
      expect(undelivered.stdout).toContain('files: src/runtime/save.ts:88');

      // Not a member — but no longer invisible either: the finding this
      // spec's audit filed is listed in its own awaiting-triage section.
      const finding = tasks('spec', 'show', 'demo-spec');
      expect(finding.stdout).toContain('1 member(s):');
      expect(finding.stdout).not.toContain('2 member(s)');
      expect(finding.stdout).toContain("unreviewed finding(s) filed by this spec's audits, awaiting triage (not members):");
      expect(finding.stdout).toContain('a fresh bug');

      const listed = tasks('list', '--spec', 'demo-spec');
      expect(listed.stdout).toContain('a fresh bug');
      expect(listed.stdout).toContain("(filed by this spec's audit — awaiting triage)");

      // next reports the count but never offers a finding as work.
      const next = tasks('next', '--spec', 'demo-spec');
      expect(next.stdout).toContain("1 unreviewed finding(s) filed by demo-spec's audits await triage");
      expect(next.stdout).not.toContain('a fresh bug');
    });
  });

  // The CLI's generic parser already refuses a flag the usage never names,
  // so this defends the exported scanner itself: called directly, it used
  // to record any unknown flag's value as a file with no error.
  it('parseAuditArgs refuses an unknown flag after a --finding by name, instead of recording its value as a file', () => {
    const parsed = parseAuditArgs(['demo-spec', '--finding', 'a finding', '--severity', 'low', '--note', 'stray']);
    expect(parsed.errors).toEqual(['unknown flag --note after --finding "a finding" — a finding takes --severity, --system, --fault, --deliverable, --evidence and --file']);
    expect(parsed.findings[0].files).toEqual([]);
  });

  // The clause-scoped `N=value` shape is assembled in one place — `clauseScoped`
  // — regardless of which transport handed it the raw string, so a
  // whitespace-only value is caught there rather than by every reader of the
  // map it fills. Interior structure survives: only the outer whitespace goes.
  it('trims a clause-scoped value\'s outer whitespace to nothing, but leaves interior lines and words alone', () => {
    const whitespaceOnly = parseAuditArgs(['demo-spec', '--proof', '1=met', '--evidence', '1=   ']);
    expect(whitespaceOnly.evidence.get(1)).toBe('');

    const padded = parseAuditArgs(['demo-spec', '--proof', '1=met', '--evidence', '1=  checked directly  ']);
    expect(padded.evidence.get(1)).toBe('checked directly');

    const multiline = parseAuditArgs(['demo-spec', '--proof', '1=met', '--evidence', '1=\nfirst line\nsecond line\n']);
    expect(multiline.evidence.get(1)).toBe('first line\nsecond line');
  });

  it('--file on a proof clause carries multiple paths onto its undelivered task, and stays separate from a finding\'s own --file', async () => {
    await fixture(async ({ tasks, audit }) => {
      await audit(
        'demo-spec',
        '--proof',
        '1=unmet',
        '--evidence',
        '1=nope',
        '--file',
        '1=src/runtime/save.ts:88',
        '--file',
        '1=src/runtime/save.test.ts',
        '--proof',
        '2=met',
        '--evidence',
        '2=clause 2 checked',
        '--finding',
        'unrelated finding',
        '--severity',
        'low',
        '--fault',
        'contract',
        '--deliverable',
        'unrelated fix',
        '--evidence',
        'unrelated breakage',
        '--file',
        'src/ui/foo.ts:1',
      );
      const undelivered = tasks('show', 'demo-spec-clause-1');
      expect(undelivered.stdout).toContain('files: src/runtime/save.ts:88, src/runtime/save.test.ts');
      expect(undelivered.stdout).not.toContain('src/ui/foo.ts:1');
    });
  });

  it('an unmet clause with no --file leaves the undelivered task with no files, unchanged', async () => {
    await fixture(async ({ tasks, audit }) => {
      await audit('demo-spec', '--proof', '1=unmet', '--evidence', '1=nope', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      const undelivered = tasks('show', 'demo-spec-clause-1');
      expect(undelivered.stdout).not.toContain('files:');
    });
  });

  it("audit's undelivered task can be declined, and the decline says the clause is abandoned rather than discharged", async () => {
    await fixture(async ({ tasks, audit }) => {
      await audit('demo-spec', '--proof', '1=unmet', '--evidence', '1=nope', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      const result = tasks('decline', 'demo-spec-clause-1', '--reason', 'the spec that promised it is superseded');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('declining it abandons the clause, it does not discharge it');

      const shown = tasks('show', 'demo-spec-clause-1').stdout;
      expect(shown).toContain('[undelivered/declined/high]');
      expect(shown).toContain('reason: the spec that promised it is superseded');
      expect(shown).toContain('closed: ');
    });
  });

  it('a second unmet pass for the same clause reuses the open undelivered task rather than duplicating it', async () => {
    await fixture(async ({ tasks, audit }) => {
      await audit('demo-spec', '--proof', '1=unmet', '--evidence', '1=first', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      await audit('demo-spec', '--proof', '1=unmet', '--evidence', '1=still not', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      // Counted over the records, not over the report: `spec show` now names
      // the owner of every clause standing as well as listing the members, so
      // one record legitimately appears in two places.
      const undelivered = tasks('list', '--kind', 'undelivered', '--spec', 'demo-spec');
      expect((undelivered.stdout.match(/demo-spec-clause-1/g) ?? []).length).toBe(1);
      expect(undelivered.stdout).toContain('1 task(s)');
    });
  });
});

// The pass-filing half of the brief-generation describe block above: this one
// test asserts on `cmdAudit`'s own output (`nextAfterPass`), not on anything
// `auditPrompt.ts` generates, so it stays in the filing module's test file —
// under the describe name it always ran under, so a `proof:` target quoting
// its full name is not broken by which file now owns it.
describe('the brief arriving with the answers rather than the instructions', () => {
  // The step after the last one the brief can print, said by the command
  // that completes it.
  it('tasks audit names the step that follows recording a pass', async () => {
    await fixture(async ({ audit }) => {
      const met = await audit('demo-spec', '--proof', '1=met', '--evidence', '1=measured', '--proof', '2=met', '--evidence', '2=measured');
      expect(met.stdout).toContain('Next: log what this audit cost you in .planning/agent-feedback/tool-friction.md');
      // A clause left outstanding is a different next move, and `tasks next`
      // is what picks it up.
      expect(met.stdout).not.toContain('tasks -- next');
      expect(nextAfterPass(true)).toContain('npm run tasks -- next');
    });
  });
});

// c1-c4: `deferred` is a fourth verdict that costs a reason, does not count
// as outstanding, and converts the clause into a tracked `undelivered`
// record rather than deleting it.
describe('a deferred clause', () => {
  it('c2: is refused with no reason, and records nothing', async () => {
    await fixture(async ({ tasks, dir, audit }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      const before = readFileSync(specPath, 'utf8');

      const result = await audit('demo-spec', '--proof', '1=deferred', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('clause 1 is deferred with no reason');
      expect(readFileSync(specPath, 'utf8')).toBe(before);
      expect(tasks('list', '--kind', 'undelivered').stdout).toContain('0 task(s)');
    });
  });

  // Whitespace is not a reason: `--evidence N="   "` must be refused the same
  // way no `--evidence` at all is, for both a deferral and a met claim —
  // `clauseScoped` trims at the point the value is assembled, so every reader
  // downstream sees the same absence rather than each having to re-check.
  it('c2: whitespace-only evidence is refused the same way no evidence is, for met as well as deferred', async () => {
    await fixture(async ({ tasks, dir, audit }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      const before = readFileSync(specPath, 'utf8');

      const deferred = await audit('demo-spec', '--proof', '1=deferred', '--evidence', '1=   ', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      expect(deferred.status).toBe(1);
      expect(deferred.stderr).toContain('clause 1 is deferred with no reason');

      const met = await audit('demo-spec', '--proof', '1=met', '--evidence', '1=\t \t', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      expect(met.status).toBe(1);
      expect(met.stderr).toContain('clause 1 is met with no evidence');

      expect(readFileSync(specPath, 'utf8')).toBe(before);
      expect(tasks('list', '--kind', 'undelivered').stdout).toContain('0 task(s)');
    });
  });

  // The promise is "a reason a human can read", not "non-empty after
  // `.trim()`" — `.trim()` strips Unicode whitespace only, so a lone
  // zero-width or other invisible-format character survives it as a
  // non-empty string that no reader can see. Several different such
  // characters, not one, because a test that only tries the character
  // `trim()` is documented to strip cannot tell "the guard checks
  // visibility" apart from "the guard checks `.trim()`, which happens not
  // to strip this one either."
  it('c2: an invisible-only reason is refused, for several different invisible characters, not just whitespace', async () => {
    await fixture(async ({ tasks, audit }) => {
      const invisible = ['​', '‌', '‍', '­', '⁠', '﻿'];
      for (const character of invisible) {
        const deferred = await audit('demo-spec', '--proof', `1=deferred`, '--evidence', `1=${character}`, '--proof', '2=met', '--evidence', '2=clause 2 checked');
        expect(deferred.stderr).toContain('clause 1 is deferred with no reason');

        const met = await audit('demo-spec', '--proof', '1=met', '--evidence', `1=${character}${character}`, '--proof', '2=met', '--evidence', '2=clause 2 checked');
        expect(met.stderr).toContain('clause 1 is met with no evidence');
      }
      expect(tasks('list', '--kind', 'undelivered').stdout).toContain('0 task(s)');
    });
  });

  // A control character commands the renderer rather than rendering — ESC
  // can open a live ANSI sequence that paints a later reader's terminal, BEL
  // rings it — which is worse than an unreadable reason, not merely
  // equivalent to one. Only NUL happens to be caught downstream by
  // merge-ready's byte gate; BEL, ESC and DEL are not, so the guard has to
  // refuse the whole category itself.
  it('c2: a reason made only of control characters (NUL, BEL, ESC, DEL) is refused, not just invisible-format ones', async () => {
    await fixture(async ({ tasks, audit }) => {
      const control = ['\u0000', '\u0007', '\u001B', '\u007F'];
      for (const character of control) {
        const deferred = await audit('demo-spec', '--proof', `1=deferred`, '--evidence', `1=${character}`, '--proof', '2=met', '--evidence', '2=clause 2 checked');
        expect(deferred.stderr).toContain('clause 1 is deferred with no reason');
      }
      expect(tasks('list', '--kind', 'undelivered').stdout).toContain('0 task(s)');
    });
  });

  // `\p{Cf}` was a proxy for "occupies no space when rendered", and
  // thirty-seven codepoints are default-ignorable while sitting in category
  // Mn or Lo, so the proxy missed them: variation selectors (VS16, the
  // ordinary emoji-presentation selector, among them), the combining
  // grapheme joiner, the Hangul filler jamo, Khmer inherent vowel signs,
  // Mongolian free variation selectors. `\p{Default_Ignorable_Code_Point}`
  // is the property Unicode defines to mean exactly the sentence this guard
  // states, rather than a general category standing in for it.
  it('c2: a reason made only of default-ignorable characters outside category Cf is refused (VS16, CGJ, Hangul filler jamo, Khmer inherent vowel sign, Mongolian free variation selector)', async () => {
    await fixture(async ({ tasks, audit }) => {
      const defaultIgnorableOutsideCf = ['️️', '͏', 'ㅤ', '឴', '᠋'];
      for (const reason of defaultIgnorableOutsideCf) {
        const deferred = await audit('demo-spec', '--proof', '1=deferred', '--evidence', `1=${reason}`, '--proof', '2=met', '--evidence', '2=clause 2 checked');
        expect(deferred.stderr).toContain('clause 1 is deferred with no reason');
      }
      expect(tasks('list', '--kind', 'undelivered').stdout).toContain('0 task(s)');
    });
  });

  // Pass 3 evaluated and rejected these as candidates for further exclusion:
  // each is visible — occupies space when rendered — even though it looks
  // nothing like ordinary prose, and the guard must keep accepting all four.
  // Locked in here so a future narrowing pass has something to break before
  // it can land.
  it('accepts a reason that is visible but unusual: one punctuation mark, a long run of one character, a lone combining mark, or an unpaired surrogate', async () => {
    await fixture(async ({ audit }) => {
      const legitimateButUgly = ['.', 'x'.repeat(80), '́', '\ud800'];
      for (const reason of legitimateButUgly) {
        const result = await audit('demo-spec', '--proof', '1=deferred', '--evidence', `1=${reason}`, '--proof', '2=met', '--evidence', '2=clause 2 checked');
        expect(result.status).toBe(0);
      }
    });
  });

  // `Default_Ignorable_Code_Point` is broader than `Cf`, and broader is
  // where over-strictness would come from — this is what pass 4 checked and
  // reported clean, confirmed independently here rather than taken on
  // faith. Multi-script prose, an emoji sequence with a real glyph, and a
  // sequence of only joiners with no glyph at all are the three shapes that
  // would tell the two properties apart if the swap had gone wrong.
  it('does not over-exclude: multi-script prose and glyph-bearing emoji sequences are accepted, a string of bare joiners with none is refused', async () => {
    await fixture(async ({ tasks, audit }) => {
      const prose = ['原因', 'سبب', 'סיבה', 'कारण'];
      for (const reason of prose) {
        const result = await audit('demo-spec', '--proof', '1=deferred', '--evidence', `1=${reason}`, '--proof', '2=met', '--evidence', '2=clause 2 checked');
        expect(result.status).toBe(0);
      }

      // A four-person family emoji and a rainbow flag: both are chains of
      // default-ignorable ZERO WIDTH JOINERs threaded between real glyphs
      // (people, a flag, a rainbow), and accept on the strength of those
      // glyphs rather than the joiners.
      const emoji = ['👨‍👩‍👧‍👦', '🏳️‍🌈'];
      for (const reason of emoji) {
        const result = await audit('demo-spec', '--proof', '1=deferred', '--evidence', `1=${reason}`, '--proof', '2=met', '--evidence', '2=clause 2 checked');
        expect(result.status).toBe(0);
      }

      const bareJoiners = await audit('demo-spec', '--proof', '1=deferred', '--evidence', `1=${'‍'.repeat(3)}`, '--proof', '2=met', '--evidence', '2=clause 2 checked');
      expect(bareJoiners.stderr).toContain('clause 1 is deferred with no reason');
      // Every accepted deferral above reuses the one open undelivered
      // record for clause 1; the refused bareJoiners attempt adds none.
      expect(tasks('list', '--kind', 'undelivered').stdout).toContain('1 task(s)');
    });
  });

  it('hasVisibleContent: true only when a character survives stripping whitespace, Default_Ignorable_Code_Point and control (Cc) characters', () => {
    for (const invisible of [
      '',
      '   ',
      '\t\n',
      '​',
      '‌',
      '‍',
      '­',
      '⁠',
      '﻿',
      ' ​\t‍ ',
      '\u0000',
      '\u0007',
      '\u001B',
      '\u007F',
      '️️',
      '͏',
      'ㅤ',
      '឴',
      '᠋',
      '‍‍‍',
    ]) {
      expect(hasVisibleContent(invisible)).toBe(false);
    }
    expect(hasVisibleContent(null)).toBe(false);
    for (const visible of ['x', ' x ', '​x​', 'a reason a human can read', '.', 'x'.repeat(80), '́', '\ud800', '原因', '👨‍👩‍👧‍👦', '🏳️‍🌈']) {
      expect(hasVisibleContent(visible)).toBe(true);
    }
  });


  // The fix has to survive the transport that motivated it: `--args-from`
  // joins a continuation onto the flag's own line with a newline, and a
  // multi-line reason must round-trip whole — only the block's own leading
  // and trailing whitespace goes.
  it('trims only the outer whitespace of a multi-line reason read from --args-from, keeping its interior lines intact', async () => {
    await fixture(async ({ dir, tasks, audit }) => {
      const passFile = path.join(dir, 'pass.txt');
      writeFileSync(passFile, ['--proof 1=deferred', '--evidence 1=  the goal is served without it:', '  see the diff for the reasoning', '--proof 2=met', '--evidence 2=clause 2 checked'].join('\n'), 'utf8');
      const result = await audit('demo-spec', '--args-from', passFile);
      expect(result.status).toBe(0);

      const specText = readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8');
      expect(specText).toContain('- proof 1: deferred — the goal is served without it:\n  see the diff for the reasoning');

      expect(tasks('show', 'demo-spec-clause-1').stdout).toContain('the goal is served without it:');
    });
  });

  it('c3/c4: is not outstanding, and converts into a tracked undelivered record with no spec — doctor accepts it', async () => {
    await fixture(async ({ tasks, dir, audit }) => {
      const result = await audit('demo-spec', '--proof', '1=deferred', '--evidence', '1=the goal is still served without it', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('outstanding:');
      expect(result.stdout).toContain('no clause outstanding');
      expect(result.stdout).toContain('1 clause(s) deferred');

      const specText = readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8');
      expect(specText).toContain('- proof 1: deferred — the goal is still served without it');

      const standing = tasks('spec', 'show', 'demo-spec');
      expect(standing.stdout).toContain('clause standing (latest pass 1): no clause outstanding');
      expect(standing.stdout).toContain('[deferred]');

      const undelivered = tasks('show', 'demo-spec-clause-1');
      expect(undelivered.stdout).toContain('[undelivered/open/high]');
      expect(undelivered.stdout).toContain('spec: (deferred)');
      expect(undelivered.stdout).toContain('evidence: the goal is still served without it');

      // Not lost: still findable in the general backlog, not folded into
      // this spec's own member list.
      expect(tasks('list', '--deferred').stdout).toContain('demo-spec-clause-1');
      expect(tasks('spec', 'show', 'demo-spec').stdout).not.toContain('2 member(s)');

      const doctor = tasks('doctor');
      expect(doctor.status).toBe(0);
      expect(doctor.stdout).toContain('0 error(s)');
    });
  });

  it("names its owner in `spec show`, even though it left the spec's own membership", async () => {
    await fixture(async ({ tasks, audit }) => {
      await audit('demo-spec', '--proof', '1=deferred', '--evidence', '1=covered elsewhere', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      const shown = tasks('spec', 'show', 'demo-spec').stdout;
      expect(shown).toContain('owed by: demo-spec-clause-1 (open)');
    });
  });
});

describe('an audit pass read from a file', () => {
  it('reads the same flags, and lets a clause\'s evidence be a paragraph', () => {
    const { argv } = parseAuditFile(
      ['--proof 1=met', '--evidence 1=ran npm test: 914 passed.', '  and `npm run mutate` killed all six.', '--proof 2=unmet', '--evidence 2=the seam is still open'].join('\n'),
      'pass.txt',
    );
    expect(argv).toEqual([
      '--proof',
      '1=met',
      '--evidence',
      '1=ran npm test: 914 passed.\n  and `npm run mutate` killed all six.',
      '--proof',
      '2=unmet',
      '--evidence',
      '2=the seam is still open',
    ]);
  });

  it('skips blank lines and comments, so a file can be annotated', () => {
    const { argv } = parseAuditFile('# the pass for 2026-08-04\n\n--proof 1=met\n\n--evidence 1=checked\n', 'pass.txt');
    expect(argv).toEqual(['--proof', '1=met', '--evidence', '1=checked']);
  });

  it('refuses a value line that continues nothing', () => {
    const { errors } = parseAuditFile('evidence with no flag above it\n', 'pass.txt');
    expect(errors[0]).toContain('pass.txt:1: a value line before any flag');
  });

  // c5: a bare line before any flag is refused the same way regardless of
  // what it says, but a reader who has just written a whole pass and put the
  // spec slug on its own line — the one value that is plausibly there and
  // not a flag — gets told where it actually belongs, not just that the line
  // is wrong.
  it('c5: names the command-line fix when the offending line looks like a bare spec slug', () => {
    const { errors } = parseAuditFile('brief-builds-the-manifest\n--proof 1=met\n--evidence 1=checked\n', 'pass.txt');
    expect(errors[0]).toContain('pass.txt:1: a value line before any flag');
    expect(errors[0]).toContain('if "brief-builds-the-manifest" is the spec slug, it belongs on the command line');
    expect(errors[0]).toContain('npm run tasks -- audit brief-builds-the-manifest --args-from pass.txt');
  });

  it('c5: says nothing about a slug when the offending line does not look like one', () => {
    const { errors } = parseAuditFile('evidence with no flag above it\n', 'pass.txt');
    expect(errors[0]).not.toContain('belongs on the command line');
  });

  it('records a whole pass from a file, and a flag typed beside it still wins', async () => {
    await fixture(async ({ dir, tasks, audit }) => {
      const passFile = path.join(dir, 'pass.txt');
      writeFileSync(passFile, '--proof 1=met\n--evidence 1=clause 1 checked against the suite\n--proof 2=unmet\n--evidence 2=the seam is still open\n', 'utf8');
      const result = await audit('demo-spec', '--args-from', passFile);
      expect(result.status).toBe(0);

      const shown = tasks('spec', 'show', 'demo-spec').stdout;
      expect(shown).toContain('1 audit pass(es) recorded');
      expect(shown).toContain('c2 (unmet)');
      expect(tasks('show', 'demo-spec-clause-2').stdout).toContain('[undelivered/open/high]');
    });
  });

  // The second half of the name above, which nothing asserted: the file's
  // flags are parsed first and the command line's after, so a flag given in
  // both places resolves to what was typed. The transport moved; which
  // argument is the more specific one did not.
  it('lets a flag typed beside --args-from override the same flag inside it', async () => {
    await fixture(async ({ dir, tasks, audit }) => {
      const passFile = path.join(dir, 'pass.txt');
      writeFileSync(passFile, '--proof 1=met\n--evidence 1=from the file\n--proof 2=met\n--evidence 2=from the file\n', 'utf8');
      expect((await audit('demo-spec', '--args-from', passFile, '--proof', '2=unmet', '--evidence', '2=typed beside it')).status).toBe(0);

      const shown = tasks('spec', 'show', 'demo-spec').stdout;
      expect(shown).toContain('c2 (unmet)');
      expect(shown).not.toContain('c2 (met)');
      expect(tasks('show', 'demo-spec-clause-2').stdout).toContain('[undelivered/open/high]');
    });
  });

  // The skeleton carries one line per clause and every value empty. It stops
  // the same way an unaimed manifest does — by name, before anything is
  // recorded — rather than filing a pass that graded a clause with nothing.
  it('the generated pass file names every clause and is refused until its values are filled in', async () => {
    await fixture(async ({ dir, audit }) => {
      const passFile = path.join(dir, 'pass.txt');
      writeFileSync(passFile, auditArgsSkeleton('demo-spec', [{ id: 1, text: 'The first clause holds.', proofTargets: [] }, { id: 2, text: 'The second clause holds.', proofTargets: [] }], 4), 'utf8');
      const text = readFileSync(passFile, 'utf8');
      expect(text).toContain('npm run tasks -- audit demo-spec --args-from');
      expect(text).toContain('# Pass 4 on demo-spec');
      expect(text).toContain('# [c1] The first clause holds.');
      expect(text.match(/^--proof \d+=$/gm)).toHaveLength(2);
      // The finding block is commented, so an unfilled file files no finding.
      expect(text).toContain('# --severity high|medium|low');

      const result = await audit('demo-spec', '--args-from', passFile);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('names no verdict');
      expect(readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8')).not.toContain('## Audit passes');
    });
  });

  it('says which file it could not read rather than recording an empty pass', async () => {
    await fixture(async ({ dir, audit }) => {
      const result = await audit('demo-spec', '--args-from', path.join(dir, 'absent.txt'));
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('--args-from could not read');
    });
  });
});
