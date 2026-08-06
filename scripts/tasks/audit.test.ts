import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tsxCli } from '../lib/tsxCli';
import { parseManifest, refusalsFor } from '../mutate';
import { auditArgsSkeleton, hasVisibleContent, indexSuiteTitles, manifestNotes, mutationManifest, nextAfterPass, UNAIMED_FILE, UNRETARGETED, parseAuditArgs, parseAuditFile, parseCommitLog, slugStanding, slugStandingLines, toolLines, unresolvedTarget, type SlugStanding, type TargetResolution } from './audit';
import { appendEvent, firstListedId, fixture, gitFixture, relevantFilesBlock, repoRoot, script, stepsBlock, type Run } from './cliFixtures';

describe('tasks CLI', () => {
  it('import parses H/M/L findings out of an audit doc into unreviewed tasks, and is idempotent on re-run', () => {
    fixture(({ tasks, dir }) => {
      const docPath = path.join(dir, 'runtime-2026-08-01.md');
      writeFileSync(docPath, ['## H1 — a real bug', 'src/runtime/save.ts:88 is where it lives.', '', '## L1 — a minor thing', 'body.'].join('\n'), 'utf8');

      const first = tasks('import', docPath);
      expect(first.status).toBe(0);
      expect(first.stdout).toContain('imported 2 finding(s)');

      const shown = tasks('show', 'runtime-2026-08-01-h1');
      expect(shown.stdout).toContain('[finding/unreviewed/high]');
      expect(shown.stdout).toContain('system: Runtime');
      expect(shown.stdout).toContain(`files: ${docPath}#H1`);

      const second = tasks('import', docPath);
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

      const result = await audit('demo-spec', '--finding', 'a late finding', '--severity', 'low', '--system', 'Runtime', '--deliverable', 'fix it', '--evidence', 'observed live');
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

  it('audit carries a --finding\'s --evidence onto the finding task, where triage reads it', async () => {
    await fixture(async ({ tasks, audit }) => {
      await audit('demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--finding', 'a real bug', '--severity', 'high', '--deliverable', 'guard the null case', '--evidence', 'save.ts:88 dereferences before the null check');
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
      const result = await audit('demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=unmet', '--finding', 'some bug', '--severity', 'low', '--deliverable', 'fix it', '--evidence', 'broken here', '--evidence', '2=the clause did not hold');
      expect(result.status).toBe(0);
      expect(tasks('show', 'demo-spec-clause-2').stdout).toContain('evidence: the clause did not hold');
      const id = firstListedId(tasks('list', '--kind', 'finding', '--state', 'unreviewed').stdout);
      expect(tasks('show', id).stdout).toContain('evidence: broken here');
    });
  });

  it('audit refuses a second bare finding evidence instead of silently replacing the first', async () => {
    await fixture(async ({ tasks, audit }) => {
      const result = await audit('demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--finding', 'some bug', '--severity', 'low', '--deliverable', 'fix it', '--evidence', 'first evidence', '--evidence', 'replacement evidence');
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
      await audit('demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--finding', 'a real bug', '--severity', 'high', '--deliverable', 'guard the null case', '--evidence', 'null deref on an empty save');
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

  it('audit-prompt prints a ready-to-use auditor prompt for a spec', async () => {
    await fixture(async ({ dir, tasks, audit }) => {
      writeFileSync(path.join(dir, 'specs', 'demo-spec.md'), '# Demo spec\n\n## Deliverable\n\nSomething this branch promises.\n\nProof:\n\n- [c1] The first clause holds.\n  proof: command node --version\n- [c2] The second clause holds.\n\n## Decisions\n\n## Open questions\n\nNone.\n', 'utf8');
      tasks('add', 'prove the runtime behavior', '--id', 'runtime-proof', '--spec', 'demo-spec', '--severity', 'high', '--system', 'Runtime', '--files', 'src/runtime/runtime.ts:1', '--deliverable', 'runtime behavior is proven');
      await audit('demo-spec', '--proof', '1=met', '--evidence', '1=measured directly', '--proof', '2=met', '--evidence', '2=clause 2 checked');

      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('You are auditing demo-spec on branch demo-spec.');

      // Every step an auditor takes is one numbered line, in the order it is
      // taken, above the data the steps act on. Three recorded passes read a
      // brief whose filing instructions were three prose blocks at the bottom
      // and whose ordering had to be inferred.
      expect(result.stdout).toContain('Steps, in order.');
      expect(stepsBlock(result.stdout)).toMatch(/1\. Read [^\n]*demo-spec\.md in full\./);
      expect(stepsBlock(result.stdout)).toContain('6. Run `npm run tasks -- merge-ready`');
      // Step 7 is asserted where the standing is controlled. This fixture
      // takes its diff range from whichever repository the suite is running
      // in, so the pass recorded above is its own ancestor whenever base and
      // head are one commit — every run on the branch this work merges into —
      // and the brief then correctly refuses to offer a pass file.
      expect(stepsBlock(result.stdout)).toMatch(/7\. (File the pass\.|Do not file a pass\.)/);

      // The checklist and the regression question live in the generated
      // prompt, not in CLAUDE.md — a hand-copied brief is what trained
      // agents to fabricate their own.
      expect(stepsBlock(result.stdout)).toContain('is anything worse than before this branch?');
      expect(result.stdout).toContain('scope drift;');
      expect(result.stdout).toContain('tests that repeat the implementation\'s assumptions;');
      expect(result.stdout).toContain('comments that restate self-documenting code;');
      expect(result.stdout).toContain('appends no pass, so a late finding never erases a recorded verdict');

      // Under the header, not merely somewhere in the output: this path
      // also prints under `Member tasks:`, so a `toContain` on the path
      // alone passed with the whole relevant-files computation replaced by
      // an empty list. The `:1` locator is stripped — the list is of
      // openable paths, not evidence references.
      expect(relevantFilesBlock(result.stdout)).toContain('- src/runtime/runtime.ts\n');
      expect(relevantFilesBlock(result.stdout)).not.toContain('- src/runtime/runtime.ts:1\n');

      expect(result.stdout).toContain('Proof clauses:');
      expect(result.stdout).toContain('[c1] The first clause holds.');
      expect(result.stdout).toContain('proof: command node --version');
      // Clause 1 carries a proof target — the guidance names both shapes
      // rather than presuming the logic one.
      expect(result.stdout).toContain('if it names pure logic or an API');
      // Clause 2 carries none — Slice 3's human-verification callout, and
      // Slice 6's guidance that actually distinguishes the UI case from
      // the logic case rather than repeating one blanket sentence.
      expect(result.stdout).toContain('[c2] The second clause holds.');
      expect(result.stdout).toContain('no proof target — requires human verification');
      expect(result.stdout).toContain('UI work');
      expect(result.stdout).toContain('1 of 2 clause(s) have no proof target');

      expect(result.stdout).toContain('Latest audit pass: pass 1');
      expect(result.stdout).toContain('- runtime-proof  [task/open/high]  Runtime  prove the runtime behavior');
      expect(result.stdout).toContain('src/runtime/runtime.ts:1');
      expect(result.stdout).toContain('npm run mutate');
      // The prompt must not instruct an auditor in a rule the tool does not
      // have. Promotion at pass 2+ was removed from the tool; the prompt
      // asked for it anyway, on every invocation, for every future auditor.
      expect(result.stdout).not.toContain('Do not promote pass-2+ findings.');
      // The brief and workflow.md step 8 describe one rule from two sides, so
      // they have to agree on the pass asymmetry: an auditor never promotes,
      // and the triage step that does treats pass 1 differently from pass 2+.
      expect(result.stdout).toContain('You file findings; you never promote them');
      expect(result.stdout).toContain('first-pass findings are promoted without a walk');
      expect(result.stdout).toContain('from pass 2 on, promotion extends what the spec already owes');
      expect(result.stdout).not.toContain('at any pass');
    });
  });

  it('audit-prompt shows each clause its latest verdict, spelling out that unknown means nobody looked', async () => {
    await fixture(async ({ tasks, audit }) => {
      await audit('demo-spec', '--proof', '1=met', '--evidence', '1=measured directly');

      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('latest verdict: met — measured directly');
      expect(result.stdout).toContain('latest verdict: unknown — nobody has graded this clause');
      expect(result.stdout).toContain('Latest audit pass: pass 1');
      expect(result.stdout).toContain('outstanding: c2 (unknown)');
      expect(stepsBlock(result.stdout)).toContain('unknown  — nobody looked. Recording unmet instead hides that nothing was verified.');
      expect(stepsBlock(result.stdout)).toContain('deferred — you checked, it fails, and the goal above still holds without it.');
      expect(result.stdout).not.toMatch(/\d+\/\d+ met/);
    });
  });

  it('audit-prompt calls every clause unknown when no pass has been recorded', () => {
    fixture(({ tasks }) => {
      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Latest audit pass: none recorded');
      expect(result.stdout).toContain('outstanding: c1 (unknown), c2 (unknown)');
    });
  });

  // c5/M9: the diff range must be real, resolved SHAs — not a label — and
  // base and head must actually differ. `fixture`'s audit-prompt call runs
  // in-process, so its git resolution lands on whatever repository the test
  // suite itself happens to be checked out in; proving a real, non-degenerate
  // range needs its own dedicated repo instead, where the divergence is
  // ours to control.
  it('audit-prompt prints a real, resolved diff range from its own dedicated repo', () => {
    gitFixture(({ commit, tasks }) => {
      commit('A commit on demo-spec, after branching from main.');

      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      const diffRange = /Diff range: ([0-9a-f]{40})\.\.([0-9a-f]{40})/.exec(result.stdout);
      expect(diffRange).not.toBeNull();
      expect(diffRange![1]).not.toBe(diffRange![2]);
    });
  });

  it('audit-prompt says it could not resolve the diff range, and never invents one', () => {
    fixture(({ tasks }) => {
      const result = tasks('audit-prompt', 'demo-spec', '--base-branch', 'no-such-base-xyz');
      // handoff answered the identical condition at exit 0 all along, which
      // is what made this refusal avoidable rather than intrinsic. The
      // placeholder half of the original claim is the part that mattered and
      // it still holds: no range is better than a made-up one.
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('no-such-base-xyz');
      expect(result.stdout).not.toContain('(unknown base)');
      expect(result.stdout).not.toContain('(unknown head)');
      expect(result.stdout).not.toContain('Diff range:');
    });
  });

  it('audit-prompt falls back to the diff\'s changed files so relevant files survives a spec with no members', () => {
    gitFixture(({ commit, tasks }) => {
      commit('A commit on demo-spec, after branching from main.');

      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Member tasks:\n- none');
      // The file this commit added, named under the header. Asserting only
      // that `- none` is absent passed with the print loop dropped, which
      // leaves the header with nothing under it at all.
      expect(relevantFilesBlock(result.stdout)).toMatch(/- file-[^\n]+\.txt\n/);
    });
  });

  // c19. The worker's half of the generated-brief rule the auditor's half
  // has had all along: what a dispatcher hand-writes is a copy of the record
  // that drifts from it, so the record renders itself.
  it('work-prompt names the task\'s deliverable, grant, requirements and clause standings', async () => {
    await fixture(async ({ tasks, audit }) => {
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
    expect(parsed.errors).toEqual(['unknown flag --note after --finding "a finding" — a finding takes --severity, --system, --deliverable, --evidence and --file']);
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

  it('hasVisibleContent: true only when a character survives stripping whitespace, invisible-format (Cf) and control (Cc) characters', () => {
    for (const invisible of ['', '   ', '\t\n', '​', '‌', '‍', '­', '⁠', '﻿', ' ​\t‍ ', '\u0000', '\u0007', '\u001B', '\u007F']) {
      expect(hasVisibleContent(invisible)).toBe(false);
    }
    expect(hasVisibleContent(null)).toBe(false);
    for (const visible of ['x', ' x ', '​x​', 'a reason a human can read', '.', 'x'.repeat(80), '́', '\ud800']) {
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

// c5/c6: a spec carries a goal, the brief prints it, and the step where
// verdicts are assigned asks the question that licenses a deferral.
describe("a spec's goal", () => {
  it('c5: is printed by audit-prompt without opening the file', async () => {
    await fixture(async ({ dir, tasks }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      writeFileSync(specPath, readFileSync(specPath, 'utf8').replace('## Decisions', '## Goal\n\nKeep the gate honest without losing the honest way to drop scope.\n\n## Decisions'), 'utf8');
      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Goal: Keep the gate honest without losing the honest way to drop scope.');
    });
  });

  it('says plainly that none is recorded, rather than staying silent, when the spec carries no ## Goal', async () => {
    await fixture(async ({ tasks }) => {
      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Goal: (none recorded');
    });
  });

  it('c6: the step where verdicts are assigned asks whether the goal still holds before a clause is dropped', async () => {
    await fixture(async ({ tasks }) => {
      const result = tasks('audit-prompt', 'demo-spec');
      expect(stepsBlock(result.stdout)).toContain('Ask this before recording unmet: does the goal still hold if this clause is never met?');
    });
  });
});

// Twelve --proof/--evidence pairs carrying test names, mutation verdicts and
// probe output ran past the Windows 8191-character command line in two
// separate sessions, and the pass after them compressed its evidence to fit.
// Only the transport moves: the same parser, the same one store write.
// A target naming a test that does not exist is worse than no target:
// `vitest -t "<no such name>"` skips every test and exits 0, so an auditor
// following the brief gets a green run that asserted nothing. Measured at 40
// of 49 on this spec's own first pass, and unobservable until someone tried
// to run one.
describe('a proof target that names no test', () => {
  // A real test file: titles, but also an assertion argument and a comment
  // carrying strings that are not titles. The first fixture here made every
  // string a title, which is exactly why none of these tests could see the
  // checker matching the whole file rather than the titles in it.
  const file = [
    '// a comment mentioning a phrase nobody named a test after',
    "it('a test that exists', () => {",
    "  expect(report).toContain('a phrase asserted but never named');",
    '});',
    "it('one with an apostrophe in doctor\\'s name', () => {});",
    "it.each([1])('a parameterised title', () => {});",
  ].join('\n');
  const read = (): string => file;
  // The wide search is a vitest run. Every case here is about the narrow
  // read, so it is answered from a stub — a suite that holds nothing.
  const searchesNothing = (): string[] => [];

  it('says so, and says why a green run would not have caught it', () => {
    const note = unresolvedTarget('vitest a.test.ts "a test nobody wrote"', read, searchesNothing);
    expect(note).toContain('no test by this name exists anywhere');
    expect(note).toContain('exit 0');
  });

  it('stays quiet on a target that resolves', () => {
    expect(unresolvedTarget('vitest a.test.ts "a test that exists"', read)).toBeNull();
    expect(unresolvedTarget('vitest a.test.ts "a parameterised title"', read)).toBeNull();
  });

  // The hole this checker was installed to close, reopened one level up: a
  // target naming an assertion argument or a comment read as resolved, and
  // `vitest -t` on it still skips every test and exits 0. A guard that fails
  // in the direction that hides recurrence is worse than none.
  it('reads titles only, so an assertion argument or a comment is not a resolved target', () => {
    expect(unresolvedTarget('vitest a.test.ts "a phrase asserted but never named"', read, searchesNothing)).toContain('no test by this name exists anywhere');
    expect(unresolvedTarget('vitest a.test.ts "a phrase nobody named a test after"', read, searchesNothing)).toContain('no test by this name exists anywhere');
  });

  // The subtlety that would make the check lie: a title carrying an
  // apostrophe is escaped in the source and is not at runtime, and a check
  // that cried wolf over those would be one readers learn to skip.
  it('does not cry wolf over a title whose apostrophe is escaped in the source', () => {
    expect(unresolvedTarget(`vitest a.test.ts "one with an apostrophe in doctor's name"`, read)).toBeNull();
  });

  it('a target naming a file absent from the checkout is reported as a missing file', () => {
    expect(unresolvedTarget('vitest gone.test.ts "anything"', () => null)).toContain('names no file in this checkout');
  });

  it('has nothing to say about a target that is not a vitest one', () => {
    expect(unresolvedTarget('command npm run layer-check', read)).toBeNull();
  });

  // The suite split moved tests between files and renamed none of them, so
  // the title a stale target names is far more often somewhere else than
  // gone. Reported as an absence, that split reads as a wall of false
  // alarms, which is what teaches an auditor to stop reading the check.
  it('a target whose title lives in another file is told where it actually is', () => {
    const note = unresolvedTarget('vitest a.test.ts "a test nobody wrote"', read, () => ['scripts/tasks/records.test.ts']);
    expect(note).toContain('scripts/tasks/records.test.ts');
    expect(note).toContain('not in a.test.ts');
  });

  it('a title that exists nowhere is reported differently from one that merely moved', () => {
    const moved = unresolvedTarget('vitest a.test.ts "a test nobody wrote"', read, () => ['b.test.ts']);
    const nowhere = unresolvedTarget('vitest a.test.ts "a test nobody wrote"', read, () => []);
    expect(nowhere).toContain('no test by this name exists anywhere');
    expect(nowhere).toContain('exit 0');
    expect(nowhere).not.toEqual(moved);
  });

  it('a target that resolves in the file it names never pays for a wider search', () => {
    let searches = 0;
    const search = (): string[] => {
      searches++;
      return [];
    };
    expect(unresolvedTarget('vitest a.test.ts "a test that exists"', read, search)).toBeNull();
    expect(searches).toBe(0);
    expect(unresolvedTarget('vitest gone.test.ts "anything"', () => null, search)).toContain('names no file in this checkout');
    expect(searches).toBe(0);
    expect(unresolvedTarget('vitest a.test.ts "a test nobody wrote"', read, search)).not.toBeNull();
    expect(searches).toBe(1);
  });

  // A checkout that cannot list its own suite knows less than one that can,
  // and saying "nowhere" on its behalf would be the false absence this
  // whole escalation exists to remove.
  it('says the suite could not be listed rather than calling a title absent on a failed search', () => {
    expect(unresolvedTarget('vitest a.test.ts "a test nobody wrote"', read, () => null)).toContain('could not be listed');
  });

  it('indexes a vitest listing by the leaf title, under a path relative to the repo', () => {
    const listing = JSON.stringify([
      { name: 'tasks CLI > work-prompt briefs a member', file: path.join(repoRoot, 'scripts', 'tasks', 'records.test.ts') },
      { name: 'an outer > an inner > work-prompt briefs a member', file: path.join(repoRoot, 'scripts', 'tasks', 'workPrompt.test.ts') },
    ]);
    expect(indexSuiteTitles(listing)?.get('work-prompt briefs a member')).toEqual(['scripts/tasks/records.test.ts', 'scripts/tasks/workPrompt.test.ts']);
    expect(indexSuiteTitles('not json at all')).toBeNull();
    expect(indexSuiteTitles(null)).toBeNull();
  });
});

// What the brief left an auditor to find out alone, measured over two passes:
// 191 seconds running six test files to learn their names, the mutate manifest
// format hunted across three commands and hand-written 74 lines at a time, and
// the diff stat, commit list, decisions and `tasks where` all fetched by hand,
// twice. None of it is judgment; all of it is derivable from what the brief
// has already read.
describe('the brief arriving with the answers rather than the instructions', () => {
  const resolves = (name: string, file = 'scripts/tasks/audit.test.ts'): TargetResolution => ({ state: 'found', file, name });

  it('a manifest entry runs the test its clause names, in the file that test lives in', () => {
    const { entries } = mutationManifest(
      [
        { id: 1, targets: ['vitest scripts/tasks/audit.test.ts "the first test"'] },
        { id: 2, targets: ['vitest scripts/tasks.test.ts "a test that moved"'] },
      ],
      (target) => (target.includes('moved') ? { state: 'moved', file: 'scripts/tasks.test.ts', name: 'a test that moved', foundIn: ['scripts/tasks/records.test.ts'] } : resolves('the first test')),
    );

    expect(() => parseManifest(JSON.stringify(entries))).not.toThrow();
    expect(entries[0]).toMatchObject({ name: 'c1 the first test', tests: ['scripts/tasks/audit.test.ts'], test: 'the first test', replace: '' });
    // A moved target runs against the file it actually lives in, which is
    // the whole reason the wide search exists.
    expect(entries[1].tests).toEqual(['scripts/tasks/records.test.ts']);
  });

  it('the manifest offers no guess at which line a clause is about', () => {
    const { entries } = mutationManifest([{ id: 1, targets: ['vitest scripts/tasks/audit.test.ts "the first test"'] }], () => resolves('the first test'));

    expect(entries[0].file).toBe(UNAIMED_FILE);
    expect(entries[0].find).toBe(UNRETARGETED);
    expect(Object.keys(entries[0])).not.toContain('note');
    // Both sentinels are refused, and the unreadable file is refused first —
    // so an entry aimed at a line but not at a file cannot run either.
    const refusals = refusalsFor(entries, { read: (file) => { throw new Error(`ENOENT: ${file}`); }, write: () => undefined });
    expect(refusals[0]).toContain('c1 the first test');
    expect(refusals[0]).toContain(UNAIMED_FILE);
  });

  // A caption saying "aim this first" cannot stop a run; the artifact can.
  it('a manifest entry nobody has aimed is refused by mutate rather than run green', () => {
    const { entries } = mutationManifest([{ id: 1, targets: ['vitest scripts/tasks/audit.test.ts "the first test"'] }], () => resolves('the first test'));

    // Aimed at a real file and still not at a line: the `find` sentinel is
    // what refuses, so aiming half an entry cannot run either.
    const halfAimed = [{ ...entries[0], file: 'scripts/tasks/audit.ts' }];
    const refusals = refusalsFor(halfAimed, {
      read: () => 'const answered = derive(brief);\nconst second = alsoDerived(brief);\n',
      write: () => undefined,
    });
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toContain('does not contain the find text');
    expect(refusals[0]).toContain('c1 the first test');

    // And the same entry, aimed, is accepted — so the refusal is the unaimed
    // field and not something else about the shape.
    expect(refusalsFor([{ ...halfAimed[0], find: 'const answered = derive(brief);' }], { read: () => 'const answered = derive(brief);\n', write: () => undefined })).toEqual([]);
  });

  it('an unresolved target is named as omitted rather than emitted into the manifest', () => {
    const { entries, omitted } = mutationManifest(
      [{ id: 1, targets: ['vitest a.test.ts "gone"', 'vitest scripts/tasks/audit.test.ts "here"'] }],
      (target) => (target.includes('gone') ? { state: 'nowhere', file: 'a.test.ts', name: 'gone' } : resolves('here')),
    );

    // parseManifest refuses a manifest as a whole, so one entry the brief
    // could not complete would cost the auditor every entry beside it.
    expect(entries).toHaveLength(1);
    expect(omitted).toEqual(['c1: vitest a.test.ts "gone" — no test by this name exists anywhere']);
    expect(() => parseManifest(JSON.stringify(entries))).not.toThrow();
  });

  it('says which fields of the manifest are derived and which the auditor still owes', () => {
    const notes = manifestNotes(11, '/tmp/mutations-demo.json').join('\n');
    expect(notes).toContain('`name`, `tests` and `test` are derived');
    // Four passes aimed an entry as the tool suggested and four got a kill
    // that was not the clause proving itself. The notes offer no suggestion
    // to aim by, and say which judgement is the auditor's.
    expect(notes).toContain('`file` and `find` are yours, and are the whole judgement');
    expect(notes).not.toContain('candidate');
    expect(notes).toContain('A kill by any other line is the suite noticing something, not this clause proving itself.');
  });

  // The guard used to read `startsWith('WARNING:')` over prose owned by
  // another function, so the one standing that makes the same claim without
  // the word still shipped a full manifest — and rewording either warning
  // would have re-enabled it with nothing failing.
  it('decides the range belongs to this slug from the standing itself, not from how it is worded', () => {
    const of = (over: Partial<SlugStanding>): boolean =>
      slugStanding({ slug: 'demo-spec', branch: 'demo-spec', branchSpec: 'demo-spec', base: 'abc1234', lastPassHead: null, lastPassMerged: false, ...over }).rangeIsThisSlugs;

    expect(of({})).toBe(true);
    expect(of({ branchSpec: 'another-spec' })).toBe(false);
    // Nothing relates the slug to the branch — the standing pass 2 found
    // shipping a manifest, because its line carries no WARNING prefix.
    expect(of({ branchSpec: null })).toBe(false);
    expect(of({ lastPassHead: 'def5678', lastPassMerged: true })).toBe(false);
  });

  it('offers no manifest at all in a brief that has just warned the diff is not this slugs', () => {
    fixture(({ dir, tasks }) => {
      writeFileSync(path.join(dir, 'specs', 'another-spec.md'), '# Another spec\n\n## Deliverable\n\nA promise made on some other branch.\n\nProof:\n\n- The other clause holds.\n\n## Decisions\n\n## Open questions\n\nNone.\n', 'utf8');

      const { stdout } = tasks('audit-prompt', 'another-spec');
      expect(stdout).toContain('WARNING: this branch is working demo-spec');
      // Every line it could break belongs to work these clauses do not
      // describe, so offering it as runnable is the c7 defect one layer down.
      expect(stdout).toContain('No mutation manifest: the diff above is not another-spec\'s');
      expect(stdout).not.toContain('mutations-another-spec.json');
    });
  });

  it('the brief names the commits in its diff range and what each touched', () => {
    gitFixture(({ commit, tasks }) => {
      commit('A commit on demo-spec, after branching from main.');

      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Commits in this range:');
      expect(result.stdout).toMatch(/- [0-9a-f]{7,} A commit on demo-spec, after branching from main\.\n {4}file-[^\n]+\.txt/);
      expect(result.stdout).toContain('Diff stat:');
    });
  });

  // A subject carrying a newline used to be indistinguishable from the file
  // list under it, which would have attributed one commit's files to another.
  it('reads a commit log whose subject spans lines without losing the files under it', () => {
    expect(parseCommitLog('\0abc1234 a subject\nwith a second line\nsrc/one.ts\n\0def5678 another\nsrc/two.ts\n')).toEqual([
      { sha: 'abc1234', subject: 'a subject', files: ['with a second line', 'src/one.ts'] },
      { sha: 'def5678', subject: 'another', files: ['src/two.ts'] },
    ]);
  });

  // The brief carried the deliverable prose and the `## Decisions` section
  // inline for two passes, on the theory that a pass which had them printed
  // would not open the spec. All three passes opened it anyway — it is the
  // first thing a clause is graded against — so the sections bought 41 lines
  // and changed no behaviour. Step 1 names the file and what is in it.
  it('sends the auditor to the spec file rather than reprinting its sections', () => {
    fixture(({ dir, tasks }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      writeFileSync(specPath, readFileSync(specPath, 'utf8').replace('## Decisions\n', '## Decisions\n\n- The seam stays where it is; moving it was measured and cost more.\n'), 'utf8');

      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(stepsBlock(result.stdout)).toMatch(/1\. Read \S*[/\\]specs[/\\]demo-spec\.md in full\./);
      expect(stepsBlock(result.stdout)).toContain('`## Decisions` are settled and not to be reopened');
      expect(result.stdout).not.toContain('The seam stays where it is; moving it was measured and cost more.');
      expect(result.stdout).not.toContain('Something this branch promises.');
    });
  });

  // The brief printed three git commands with the range substituted into
  // them. An auditor holds the range from the header four lines above and
  // needs no instruction in git.
  it('does not teach git, having already printed the range', () => {
    gitFixture(({ commit, tasks }) => {
      commit('A commit on demo-spec, after branching from main.');

      const { stdout } = tasks('audit-prompt', 'demo-spec');
      expect(stdout).toMatch(/Diff range: [0-9a-f]{40}\.\.[0-9a-f]{40}/);
      expect(stdout).not.toContain('- git diff ');
      expect(stdout).not.toContain('- git log -p ');
      // A command, not the diff: an auditor wants it more than once, and a
      // printed one is a snapshot taken before they had read anything.
      expect(stdout).not.toContain('@@ ');
    });
  });

  it('the brief answers ownership and prior art for every path in its diff', () => {
    fixture(({ tasks }) => {
      tasks('add', 'An earlier claim on the save file', '--system', 'Runtime', '--files', 'src/runtime/save.ts:88');
      tasks('add', 'The task under audit', '--spec', 'demo-spec', '--files', 'src/runtime/save.ts');

      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Who owns each changed path:');
      expect(result.stdout).toContain('- src/runtime/save.ts — Runtime');
      expect(result.stdout).toContain('prior art on src/runtime/save.ts');
      expect(result.stdout).toContain('An earlier claim on the save file');
      // The two queries this section is a batched answer to, so an auditor
      // who wants one path in full knows what to run.
      expect(result.stdout).toContain('npm run tasks -- where <path>');
      expect(result.stdout).toContain('npm run tasks -- produces "<name>"');
    });
  });

  // 56 claims over 118 lines was the largest block in the brief and the one
  // an auditor cannot act on: 42 of them closed. `tasks where` still lists
  // every one for a single path, which is the reader that wants them.
  it('counts the closed claims in the brief rather than listing them, and still lists them for one path', () => {
    fixture(({ tasks }) => {
      tasks('add', 'A settled claim on the save file', '--id', 'settled-claim', '--system', 'Runtime', '--files', 'src/runtime/save.ts');
      tasks('done', 'settled-claim');
      tasks('add', 'An open claim on the save file', '--system', 'Runtime', '--files', 'src/runtime/save.ts');
      tasks('add', 'The task under audit', '--spec', 'demo-spec', '--files', 'src/runtime/save.ts');

      const brief = tasks('audit-prompt', 'demo-spec').stdout;
      expect(brief).toContain('An open claim on the save file');
      expect(brief).not.toContain('A settled claim on the save file');
      expect(brief).toContain('1 closed claim(s) not listed');

      const where = tasks('where', 'src/runtime/save.ts').stdout;
      expect(where).toContain('A settled claim on the save file');
      expect(where).not.toContain('closed claim(s) not listed');
    });
  });

  it('says how to read what mutate prints back, beside the manifest rather than in its source', () => {
    fixture(({ tasks }) => {
      const { stdout } = tasks('audit-prompt', 'demo-spec');
      expect(stdout).toContain('KILLED — the tests failed with the line broken');
      expect(stdout).toContain('SURVIVED — the tests passed with the line broken');
      expect(stdout).toContain('ERROR — the mutation did not build');
      // The column pass 2 called what made its headline measurable, and had
      // to reverse-engineer from scripts/mutate.ts to trust.
      expect(stdout).toContain('the scope column reports the chain it walked');
    });
  });

  // The format used to be prose in the brief, and two of three passes each
  // spent a call learning it anyway — one running `tasks audit` bare to read
  // its usage, one grepping `parseAuditFile`. The file removes the format
  // from the brief: the auditor opens it and fills in values.
  it('writes the pass file the auditor fills in, rather than describing its format', () => {
    fixture(({ tasks }) => {
      const { stdout } = tasks('audit-prompt', 'demo-spec');
      const written = /\n {5}(\S*audit-demo-spec-pass1\.txt)\n/.exec(stdout);
      expect(written).not.toBeNull();
      expect(readFileSync(written![1], 'utf8')).toContain('--proof 1=');
      expect(stepsBlock(stdout)).toContain(`npm run tasks -- audit demo-spec --args-from ${written![1]}`);
      // The format itself is in the file's own header, not here.
      expect(stdout).not.toContain('8191');
    });
  });

  it('names one other spec to check the standing against, not every spec in the checkout', () => {
    fixture(({ dir, tasks }) => {
      for (const slug of ['another-spec', 'a-third-spec', 'a-fourth-spec']) {
        writeFileSync(path.join(dir, 'specs', `${slug}.md`), '# A spec\n\n## Deliverable\n\nElsewhere.\n\nProof:\n\n- It holds.\n', 'utf8');
      }

      const { stdout } = tasks('audit-prompt', 'demo-spec');
      const line = stdout.split('\n').find((candidate) => candidate.startsWith('To check the standing above'))!;
      // Exactly the slugs between `one of: ` and the parenthesised fallback,
      // counted. A `<= 4` over the word "spec" passed with the cap removed,
      // which is the regression this test exists to catch admitting itself.
      const named = /one of: (.+?) \(`ls/.exec(line)![1].split(', ');
      expect(named).toHaveLength(2);
      expect(named).not.toContain('another-spec');
      expect(line).toContain('for the rest');
    });
  });

  // Both artifacts are the auditor's working copy the moment they touch one,
  // and re-reading the brief mid-pass is ordinary. Overwriting threw away an
  // aimed manifest and a part-filled pass file with nothing said.
  // A manifest is only emitted for a `proof:` target that resolves, so these
  // two need a spec whose target names a test that exists. The file is the
  // fixture's own, written beside its spec, so nothing here depends on a
  // title in the real suite staying put.
  // `passes` writes the `## Audit passes` section rather than recording one
  // through `audit`, because a recorded pass takes its head from whatever
  // repository the suite is running in — and a head equal to the range's base
  // is its own ancestor, which the brief reads as "this spec merged before
  // this branch began" and correctly answers with no manifest at all. That is
  // true on every run on the base branch, so a test that records a pass and
  // then expects a manifest passes only on a branch that is ahead. The head
  // below is a commit no repository has, so it is nobody's ancestor.
  const UNMERGED_HEAD = 'f'.repeat(40);

  const withResolvableTarget = (dir: string, passes = 0): void => {
    const testFile = path.join(dir, 'fixture.test.ts');
    writeFileSync(testFile, "it('a title the fixture owns', () => {});\n", 'utf8');
    const recorded = Array.from({ length: passes }, (_, index) =>
      `### Pass ${index + 1} — 2026-08-05\n\n- base: \`${'a'.repeat(40)}\`\n- head: \`${UNMERGED_HEAD}\`\n- proof 1: met — checked\n`).join('\n');
    writeFileSync(
      path.join(dir, 'specs', 'demo-spec.md'),
      `# Demo spec\n\n## Deliverable\n\nSomething this branch promises.\n\nProof:\n\n- [c1] The first clause holds.\n  proof: vitest ${testFile} "a title the fixture owns"\n- [c2] The second clause holds.\n\n## Decisions\n\n## Open questions\n\nNone.\n${passes > 0 ? `\n## Audit passes\n\n${recorded}` : ''}`,
      'utf8',
    );
  };

  it('keeps an artifact the auditor has already worked on rather than overwriting it', () => {
    fixture(({ dir, tasks }) => {
      withResolvableTarget(dir);
      const first = tasks('audit-prompt', 'demo-spec');
      const passPath = /\n {5}(\S*audit-demo-spec-pass1\.txt)\n/.exec(first.stdout)![1];
      writeFileSync(passPath, '--proof 1=met\n--evidence 1=half a pass, typed by hand\n', 'utf8');

      const second = tasks('audit-prompt', 'demo-spec');
      expect(readFileSync(passPath, 'utf8')).toContain('half a pass, typed by hand');
      expect(second.stdout).toContain('was left alone');
      expect(second.stdout).toContain('Delete it to regenerate against the current diff');
      // What the fields mean does not depend on who wrote the file. The kept
      // path used to suppress all four, so an auditor resuming mid-pass lost
      // the sentence that says an escalated kill is not a clause's own proof.
      expect(second.stdout).toContain('A kill by any other line is the suite noticing something');
    });
  });

  // One manifest path for every pass handed pass N+1 the manifest pass N had
  // already aimed, under a step that says to aim it — last pass's judgement
  // measured against this pass's diff, read as this pass's kills. The pass
  // file was keyed to the pass from the start; the manifest was not.
  it('gives each pass its own manifest, so no pass inherits the one before it aimed', () => {
    fixture(({ dir, tasks }) => {
      withResolvableTarget(dir);
      const first = tasks('audit-prompt', 'demo-spec').stdout;
      expect(first).toContain('mutations-demo-spec-pass1.json');

      withResolvableTarget(dir, 1);

      const second = tasks('audit-prompt', 'demo-spec').stdout;
      expect(second).toContain('mutations-demo-spec-pass2.json');
      expect(second).not.toContain('mutations-demo-spec-pass1.json');
    });
  });

  // The manifest was gated on the standing and the pass file was not, so a
  // brief that had just refused to offer a manifest still handed over the
  // file for recording a pass — against a diff whose clauses it had just
  // said these are not. That half writes tracked repo state.
  it('offers no pass file either, in a brief that has just warned the diff is not this slugs', () => {
    fixture(({ dir, tasks }) => {
      writeFileSync(path.join(dir, 'specs', 'another-spec.md'), '# Another spec\n\n## Deliverable\n\nElsewhere.\n\nProof:\n\n- [c1] It holds.\n', 'utf8');

      const { stdout } = tasks('audit-prompt', 'another-spec');
      expect(stdout).toContain('WARNING: this branch is working demo-spec');
      expect(stdout).toContain('7. Do not file a pass.');
      expect(stdout).toContain('The diff above is not another-spec\'s');
      expect(stdout).not.toContain('--args-from');
      expect(existsSync(path.join(dir, 'tmp', 'audit-another-spec-pass1.txt'))).toBe(false);
    });
  });

  // Three standings refuse a pass and they do not all say the same thing. A
  // branch nothing relates to the slug has a diff nobody can place, not one
  // known to be somebody else's — and step 7 asserting the stronger claim
  // contradicts the warning printed above it.
  it('says only what the standing says when nothing relates the slug to the branch', () => {
    const unrelated = (over: Partial<SlugStanding>): boolean =>
      slugStanding({ slug: 'demo-spec', branch: 'demo-spec', branchSpec: 'demo-spec', base: 'abc1234', lastPassHead: null, lastPassMerged: false, ...over }).rangeIsUnrelated;

    expect(unrelated({ branchSpec: 'another-spec' })).toBe(true);
    expect(unrelated({ lastPassHead: 'def5678', lastPassMerged: true })).toBe(true);
    // Nothing relates the two: refused, but not on the grounds that the diff
    // belongs to somebody else.
    expect(unrelated({ branchSpec: null })).toBe(false);
    expect(unrelated({})).toBe(false);
  });

  // Both auditors checked this list against package.json rather than trust
  // it. A derived list has nothing left to check.
  it('marks a tool whose npm script no longer exists rather than naming it as if it did', () => {
    expect(toolLines({ tasks: 'x', mutate: 'x', probe: 'x', inspect: 'x', play: 'x', 'session-timing': 'x' }).join('\n')).not.toContain('stale');
    const withoutProbe = toolLines({ tasks: 'x', mutate: 'x', inspect: 'x', play: 'x', 'session-timing': 'x' }).join('\n');
    expect(withoutProbe).toContain('package.json has no "probe" script; this entry is stale');
    // An unreadable package.json costs the check, not the list.
    expect(toolLines(null).join('\n')).not.toContain('stale');
  });

  it('makes logging tool friction a numbered step rather than a line to skip', () => {
    fixture(({ tasks }) => {
      const { stdout } = tasks('audit-prompt', 'demo-spec');
      // Of the two passes that had it as prose elsewhere in the brief, one
      // wrote nothing at all; the pass that had it as a step wrote it.
      expect(stepsBlock(stdout)).toContain('8. Log what this audit cost you');
      expect(stepsBlock(stdout)).toContain('.planning/agent-feedback/tool-friction.md');
    });
  });

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

  it('the brief names each tool an auditor may reach for, with the command that runs it', () => {
    fixture(({ tasks }) => {
      const { stdout } = tasks('audit-prompt', 'demo-spec');
      // Pass 1 grepped package.json to find out what existed. Each of these
      // is the answer to a question an auditor asks, and a name with no
      // invocation beside it is a fifth thing to go and look up.
      for (const command of ['npm run mutate -- <manifest.json>', 'npm run probe --', 'npm run inspect --', 'npm run play', 'npm run session-timing', 'npm run tasks -- where <path>']) {
        expect(stdout).toContain(command);
      }
    });
  });
});

// The range is the branch's and the clause list is the slug's, and nothing
// related the two: on `tasks-roadmap` all eleven slugs in docs/specs/ printed
// the identical range. A brief that describes the wrong diff confidently is
// worse than one that is missing a feature, because the auditor cannot tell.
describe('the slug audit-prompt is given and the branch it is run on', () => {
  it('a slug whose spec this branch does not own is reported rather than ranged silently against HEAD', () => {
    fixture(({ dir, tasks }) => {
      writeFileSync(path.join(dir, 'specs', 'another-spec.md'), '# Another spec\n\n## Deliverable\n\nA promise made on some other branch.\n\nProof:\n\n- The other clause holds.\n\n## Decisions\n\n## Open questions\n\nNone.\n', 'utf8');

      const result = tasks('audit-prompt', 'another-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('WARNING: this branch is working demo-spec, not another-spec');
      expect(result.stdout).toContain('does not contain their implementation');

      // The slug the branch does own says nothing, or the warning is noise
      // on every correct run and stops being read.
      expect(tasks('audit-prompt', 'demo-spec').stdout).not.toContain('WARNING: this branch is working');
    });
  });

  it('says a spec whose passes predate the branch point has none of its work in the diff', () => {
    const merged = slugStandingLines({ slug: 'merged-spec', branch: 'tasks-roadmap', branchSpec: 'tasks-roadmap', base: 'dcc8574001b06b5c89516f8a9afcefa8ce64163b', lastPassHead: 'c38657c001b06b5c89516f8a9afcefa8ce64163b', lastPassMerged: true });
    expect(merged.join('\n')).toContain('merged before this branch began');
    expect(merged.join('\n')).toContain('none of the work its clauses describe is in the diff');
  });

  // Silence here would be the original defect wearing a passing test: the
  // brief would still range an unrelated slug against HEAD and say nothing.
  it('says plainly when nothing relates the slug to the branch at all', () => {
    const lines = slugStandingLines({ slug: 'some-spec', branch: 'claude/cold-worktree', branchSpec: null, base: 'abc1234', lastPassHead: null, lastPassMerged: false });
    expect(lines.join('\n')).toContain('Nothing relates some-spec to claude/cold-worktree');
  });

  it('stays silent when the branch owns the slug and its passes are on this branch', () => {
    expect(slugStandingLines({ slug: 'demo-spec', branch: 'demo-spec', branchSpec: 'demo-spec', base: 'abc1234', lastPassHead: 'def5678', lastPassMerged: false })).toEqual([]);
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
