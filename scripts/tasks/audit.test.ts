import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tsxCli } from '../lib/tsxCli';
import { parseAuditArgs, parseAuditFile, unresolvedTarget } from './audit';
import { appendEvent, firstListedId, fixture, gitFixture, relevantFilesBlock, repoRoot, script, type Run } from './cliFixtures';

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

  it('audit records a pass over a spec whose clauses carry the same tag twice, naming the ambiguity', () => {
    fixture(({ tasks, dir }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      writeFileSync(specPath, readFileSync(specPath, 'utf8').replace('- The first clause holds.\n- The second clause holds.', '- [c1] The first clause holds.\n- [c1] The second clause holds.'), 'utf8');
      const result = tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked');
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

  it('audit records a pass over a spec with no proof clauses, saying it graded nothing', () => {
    fixture(({ tasks, dir }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      writeFileSync(specPath, '# Demo spec\n\n## Deliverable\n\nSomething this branch promises.\n', 'utf8');
      const result = tasks('audit', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stderr).toContain('has no Proof: clauses');
      expect(readFileSync(specPath, 'utf8')).toContain('### Pass 1');

      // A --proof against a clauseless spec is a typo by definition, and
      // the zero-clause escape hatch above does not excuse it.
      const typo = tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=checked');
      expect(typo.status).toBe(1);
      expect(typo.stderr).toContain('its clauses are (none)');
    });
  });

  // The verdict-wiping trap, closed: filing findings used to append a pass
  // that graded nothing, and the standing reads from the latest pass only —
  // so recorded verdicts were reset to unknown by the act of filing, twice,
  // on the branch that recorded the friction.
  it('audit with findings and no proofs files the findings without appending a pass, so verdicts stand', () => {
    fixture(({ tasks, dir }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      const before = readFileSync(specPath, 'utf8');

      const result = tasks('audit', 'demo-spec', '--finding', 'a late finding', '--severity', 'low', '--system', 'Runtime', '--deliverable', 'fix it', '--evidence', 'observed live');
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
  it('audit refuses a --proof naming no clause, so a typo cannot record an all-unknown pass', () => {
    fixture(({ tasks, dir }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      const before = readFileSync(specPath, 'utf8');

      const typo = tasks('audit', 'demo-spec', '--proof', '99=met', '--evidence', '99=x');
      expect(typo.status).toBe(1);
      expect(typo.stderr).toContain('names no clause in demo-spec: c99');
      expect(typo.stderr).toContain('its clauses are c1, c2');

      const nan = tasks('audit', 'demo-spec', '--proof', 'c1=met', '--evidence', '1=x');
      expect(nan.status).toBe(1);
      expect(nan.stderr).toContain('(not a number)');

      expect(readFileSync(specPath, 'utf8')).toBe(before);
      expect(tasks('spec', 'show', 'demo-spec').stdout).toContain('clause standing (latest pass 1): no clause outstanding');
    });
  });

  it('audit on exhausted stdin refuses to record a pass that graded nothing', () => {
    fixture(({ tasks, dir }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      const before = readFileSync(specPath, 'utf8');

      const abandoned = tasks('audit', 'demo-spec');
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
  it('audit records a pass whose range this checkout could not compute, as unresolved rather than invented', () => {
    fixture(({ tasks, dir }) => {
      const result = tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--base-branch', 'no-such-base-branch-xyz');
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

  it('audit\'s interactive clause walk offers unknown as a third answer and leaves its evidence optional', () => {
    fixture(({ dir }) => {
      const result = walkClauses(dir, 'unknown\n\nunmet\n\n');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('met/unmet/unknown?');
      const specText = readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8');
      expect(specText).toContain('- proof 1: unknown\n');
      expect(specText).toContain('- proof 2: unmet\n');
    });
  });

  it('audit\'s interactive clause walk re-asks rather than accepting an answer outside the three verdicts', () => {
    fixture(({ dir }) => {
      const result = walkClauses(dir, 'probably\nunknown\n\nunknown\n\n');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('type "met", "unmet" or "unknown"');
      expect(readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8')).toContain('- proof 1: unknown');
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

  it('audit refuses a --finding with no --deliverable, recording nothing', () => {
    fixture(({ tasks }) => {
      const result = tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--finding', 'undeliverable bug', '--severity', 'high');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('needs --deliverable');
      expect(tasks('list', '--kind', 'finding').stdout).toContain('0 task(s)');
    });
  });

  it('audit refuses a --finding with no --evidence, recording nothing', () => {
    fixture(({ tasks }) => {
      const result = tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--finding', 'unevidenced bug', '--severity', 'high', '--deliverable', 'fix it somehow');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('needs --evidence');
      expect(tasks('list', '--kind', 'finding').stdout).toContain('0 task(s)');
    });
  });

  it('audit carries a --finding\'s --evidence onto the finding task, where triage reads it', () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--finding', 'a real bug', '--severity', 'high', '--deliverable', 'guard the null case', '--evidence', 'save.ts:88 dereferences before the null check');
      const shown = tasks('list', '--kind', 'finding', '--state', 'unreviewed');
      const id = firstListedId(shown.stdout);
      expect(tasks('show', id).stdout).toContain('evidence: save.ts:88 dereferences before the null check');
    });
  });

  it('--evidence stays clause-scoped before any --finding and finding-scoped after one, the way --file does', () => {
    fixture(({ tasks }) => {
      tasks(
        'audit',
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

  it('clause-shaped evidence after a finding still goes to the clause rather than overwriting the finding', () => {
    fixture(({ tasks }) => {
      const result = tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=unmet', '--finding', 'some bug', '--severity', 'low', '--deliverable', 'fix it', '--evidence', 'broken here', '--evidence', '2=the clause did not hold');
      expect(result.status).toBe(0);
      expect(tasks('show', 'demo-spec-clause-2').stdout).toContain('evidence: the clause did not hold');
      const id = firstListedId(tasks('list', '--kind', 'finding', '--state', 'unreviewed').stdout);
      expect(tasks('show', id).stdout).toContain('evidence: broken here');
    });
  });

  it('audit refuses a second bare finding evidence instead of silently replacing the first', () => {
    fixture(({ tasks }) => {
      const result = tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--finding', 'some bug', '--severity', 'low', '--deliverable', 'fix it', '--evidence', 'first evidence', '--evidence', 'replacement evidence');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('already has evidence');
      expect(tasks('list', '--kind', 'finding').stdout).toContain('0 task(s)');
    });
  });

  // The audit scanner reads flags positionally, so a finding field written
  // before the --finding it belongs to used to fall through every branch
  // and vanish: the pass recorded a finding with no severity, and said so
  // only later, about a value the caller did supply.
  it('audit refuses a finding field written before the --finding it describes, and an unknown flag by name', () => {
    fixture(({ tasks }) => {
      const early = tasks('audit', 'demo-spec', '--severity', 'high', '--finding', 'some bug', '--deliverable', 'fix it', '--evidence', 'it is broken');
      expect(early.status).toBe(1);
      expect(early.stderr).toContain('--severity describes a finding, and no --finding has been opened yet');

      const unknown = tasks('audit', 'demo-spec', '--totallyfakeflag', 'x');
      expect(unknown.status).toBe(1);
      expect(unknown.stderr).toContain('unknown flag: --totallyfakeflag');

      expect(tasks('list', '--kind', 'finding').stdout).toContain('0 task(s)');
    });
  });

  it('audit carries a --finding\'s --deliverable onto the finding task it creates', () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked', '--proof', '2=met', '--evidence', '2=clause 2 checked', '--finding', 'a real bug', '--severity', 'high', '--deliverable', 'guard the null case', '--evidence', 'null deref on an empty save');
      const shown = tasks('list', '--kind', 'finding', '--state', 'unreviewed');
      const id = firstListedId(shown.stdout);
      expect(tasks('show', id).stdout).toContain('deliverable: guard the null case');
    });
  });

  it('audit records a clause nobody graded as unknown instead of refusing the pass', () => {
    fixture(({ tasks, dir }) => {
      const result = tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=clause 1 checked');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('recorded pass 1 for demo-spec: outstanding: c2 (unknown)');
      expect(result.stdout).toContain('1 clause(s) recorded unknown — nobody graded them: c2');
      expect(readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8')).toContain('- proof 2: unknown');
    });
  });

  it('an unknown clause creates no undelivered task, because nobody looked is not a broken promise', () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=it fails');
      expect(tasks('show', 'demo-spec-clause-1').stdout).toContain('[undelivered/open/high]');
      const missing = tasks('show', 'demo-spec-clause-2');
      expect(missing.stdout).toContain('no such task: demo-spec-clause-2');
    });
  });

  it('audit takes unknown as an explicit verdict and never renders it as unmet', () => {
    fixture(({ tasks, dir }) => {
      const result = tasks('audit', 'demo-spec', '--proof', '1=unknown', '--proof', '2=unmet', '--evidence', '2=it fails');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('outstanding: c1 (unknown), c2 (unmet)');
      const specText = readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8');
      expect(specText).toContain('- proof 1: unknown');
      expect(specText).toContain('- proof 2: unmet — it fails');
    });
  });

  it('audit refuses a met verdict with no evidence, naming the clause, and records nothing', () => {
    fixture(({ tasks, dir }) => {
      const result = tasks('audit', 'demo-spec', '--proof', '1=met', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('clause 1 is met with no evidence');
      expect(readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8')).not.toContain('## Audit passes');
    });
  });

  it('unmet and unknown need no evidence, because neither is a completion claim', () => {
    fixture(({ tasks }) => {
      const result = tasks('audit', 'demo-spec', '--proof', '1=unmet', '--proof', '2=unknown');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('outstanding: c1 (unmet), c2 (unknown)');
    });
  });

  it('audit refuses a --proof value that is not one of the three verdicts, naming what it got', () => {
    fixture(({ tasks, dir }) => {
      const result = tasks('audit', 'demo-spec', '--proof', '1=probably', '--proof', '2=unknown');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('--proof 1=probably');
      expect(result.stderr).toContain('met, unmet or unknown');
      expect(readFileSync(path.join(dir, 'specs', 'demo-spec.md'), 'utf8')).not.toContain('## Audit passes');
    });
  });

  it('audit-prompt prints a ready-to-use auditor prompt for a spec', () => {
    fixture(({ tasks, dir }) => {
      writeFileSync(path.join(dir, 'specs', 'demo-spec.md'), '# Demo spec\n\n## Deliverable\n\nSomething this branch promises.\n\nProof:\n\n- [c1] The first clause holds.\n  proof: command node --version\n- [c2] The second clause holds.\n\n## Decisions\n\n## Open questions\n\nNone.\n', 'utf8');
      tasks('add', 'prove the runtime behavior', '--id', 'runtime-proof', '--spec', 'demo-spec', '--severity', 'high', '--system', 'Runtime', '--files', 'src/runtime/runtime.ts:1', '--deliverable', 'runtime behavior is proven');
      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=measured directly', '--proof', '2=met', '--evidence', '2=clause 2 checked');

      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('You are auditing demo-spec on branch demo-spec.');

      expect(result.stdout).toContain('Required commands (all must pass; `npm run tasks -- merge-ready` runs them together):');
      expect(result.stdout).toContain('- npm run tasks -- merge-ready');

      // The checklist and the regression question live in the generated
      // prompt, not in CLAUDE.md — a hand-copied brief is what trained
      // agents to fabricate their own.
      expect(result.stdout).toContain('Is anything worse than before this branch?');
      expect(result.stdout).toContain('scope drift;');
      expect(result.stdout).toContain('tests that repeat the implementation\'s assumptions;');
      expect(result.stdout).toContain('comments that restate self-documenting code;');
      expect(result.stdout).toContain('Deliver your results into the store');
      expect(result.stdout).toContain('files the findings without recording a pass');

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
      // The brief and workflow.md step 9 describe one rule from two sides, so
      // they have to agree on the pass asymmetry: an auditor never promotes,
      // and the triage step that does treats pass 1 differently from pass 2+.
      expect(result.stdout).toContain('You file findings; you never promote them');
      expect(result.stdout).toContain('first-pass findings are promoted without a walk');
      expect(result.stdout).toContain('from pass 2 on, promotion extends what the spec already owes');
      expect(result.stdout).not.toContain('at any pass');
    });
  });

  it('audit-prompt shows each clause its latest verdict, spelling out that unknown means nobody looked', () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=met', '--evidence', '1=measured directly');

      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('latest verdict: met — measured directly');
      expect(result.stdout).toContain('latest verdict: unknown — nobody has graded this clause');
      expect(result.stdout).toContain('Latest audit pass: pass 1');
      expect(result.stdout).toContain('outstanding: c2 (unknown)');
      expect(result.stdout).toContain('`unknown` means nobody looked');
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
  it('work-prompt names the task\'s deliverable, grant, requirements and clause standings', () => {
    fixture(({ tasks }) => {
      tasks('add', 'the dependency', '--id', 'dep', '--spec', 'demo-spec');
      tasks('done', 'dep');
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=it does not actually hold', '--proof', '2=met', '--evidence', '2=clause 2 checked');
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
  it('work-prompt reads the clauses an ordinary task discharges, not only an undelivered record\'s own', () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=it does not actually hold', '--proof', '2=met', '--evidence', '2=clause 2 checked');
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
      // already discharged and does not — workflow.md step 6 puts the
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

  it('audit records a pass, creates an undelivered task for an unmet clause, and records findings unreviewed', () => {
    fixture(({ tasks, dir }) => {
      const result = tasks(
        'audit',
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

  it('--file on a proof clause carries multiple paths onto its undelivered task, and stays separate from a finding\'s own --file', () => {
    fixture(({ tasks }) => {
      tasks(
        'audit',
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

  it('an unmet clause with no --file leaves the undelivered task with no files, unchanged', () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=nope', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      const undelivered = tasks('show', 'demo-spec-clause-1');
      expect(undelivered.stdout).not.toContain('files:');
    });
  });

  it("audit's undelivered task can be declined, and the decline says the clause is abandoned rather than discharged", () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=nope', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      const result = tasks('decline', 'demo-spec-clause-1', '--reason', 'the spec that promised it is superseded');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('declining it abandons the clause, it does not discharge it');

      const shown = tasks('show', 'demo-spec-clause-1').stdout;
      expect(shown).toContain('[undelivered/declined/high]');
      expect(shown).toContain('reason: the spec that promised it is superseded');
      expect(shown).toContain('closed: ');
    });
  });

  it('a second unmet pass for the same clause reuses the open undelivered task rather than duplicating it', () => {
    fixture(({ tasks }) => {
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=first', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      tasks('audit', 'demo-spec', '--proof', '1=unmet', '--evidence', '1=still not', '--proof', '2=met', '--evidence', '2=clause 2 checked');
      // Counted over the records, not over the report: `spec show` now names
      // the owner of every clause standing as well as listing the members, so
      // one record legitimately appears in two places.
      const undelivered = tasks('list', '--kind', 'undelivered', '--spec', 'demo-spec');
      expect((undelivered.stdout.match(/demo-spec-clause-1/g) ?? []).length).toBe(1);
      expect(undelivered.stdout).toContain('1 task(s)');
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

  it('says so, and says why a green run would not have caught it', () => {
    const note = unresolvedTarget('vitest a.test.ts "a test nobody wrote"', read);
    expect(note).toContain('a.test.ts has no test by this name');
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
    expect(unresolvedTarget('vitest a.test.ts "a phrase asserted but never named"', read)).toContain('has no test by this name');
    expect(unresolvedTarget('vitest a.test.ts "a phrase nobody named a test after"', read)).toContain('has no test by this name');
  });

  // The subtlety that would make the check lie: a title carrying an
  // apostrophe is escaped in the source and is not at runtime, and a check
  // that cried wolf over those would be one readers learn to skip.
  it('does not cry wolf over a title whose apostrophe is escaped in the source', () => {
    expect(unresolvedTarget(`vitest a.test.ts "one with an apostrophe in doctor's name"`, read)).toBeNull();
  });

  it('names a file that is not in this checkout as that, rather than as a missing test', () => {
    expect(unresolvedTarget('vitest gone.test.ts "anything"', () => null)).toContain('names no file in this checkout');
  });

  it('has nothing to say about a target that is not a vitest one', () => {
    expect(unresolvedTarget('command npm run layer-check', read)).toBeNull();
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

  it('records a whole pass from a file, and a flag typed beside it still wins', () => {
    fixture(({ tasks, dir }) => {
      const passFile = path.join(dir, 'pass.txt');
      writeFileSync(passFile, '--proof 1=met\n--evidence 1=clause 1 checked against the suite\n--proof 2=unmet\n--evidence 2=the seam is still open\n', 'utf8');
      const result = tasks('audit', 'demo-spec', '--args-from', passFile);
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
  it('lets a flag typed beside --args-from override the same flag inside it', () => {
    fixture(({ tasks, dir }) => {
      const passFile = path.join(dir, 'pass.txt');
      writeFileSync(passFile, '--proof 1=met\n--evidence 1=from the file\n--proof 2=met\n--evidence 2=from the file\n', 'utf8');
      expect(tasks('audit', 'demo-spec', '--args-from', passFile, '--proof', '2=unmet', '--evidence', '2=typed beside it').status).toBe(0);

      const shown = tasks('spec', 'show', 'demo-spec').stdout;
      expect(shown).toContain('c2 (unmet)');
      expect(shown).not.toContain('c2 (met)');
      expect(tasks('show', 'demo-spec-clause-2').stdout).toContain('[undelivered/open/high]');
    });
  });

  it('says which file it could not read rather than recording an empty pass', () => {
    fixture(({ tasks, dir }) => {
      const result = tasks('audit', 'demo-spec', '--args-from', path.join(dir, 'absent.txt'));
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('--args-from could not read');
    });
  });
});
