import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseManifest, refusalsFor } from '../mutate';
import { parseSpecDoc } from '../lib/specDoc';
import { describeResolution, indexSuiteTitles, manifestNotes, mutationManifest, resolveTarget, slugStanding, slugStandingLines, toolLines, UNAIMED_FILE, UNRETARGETED, unresolvedTarget, type SlugStanding, type TargetResolution } from './auditPrompt';
import { MAX_LESSON_COUNT, totalLessonCount } from './briefLessons';
import { enclosingGitFixture, fixture, gitFixture, installDataGit, isolateTmp, relevantFilesBlock, repoRoot, runInProcessAt, stepsBlock, type Run } from './cliFixtures';

describe('tasks CLI', () => {
  it('audit-prompt prints a ready-to-use auditor prompt for a spec', async () => {
    await enclosingGitFixture(async ({ dir, tasks, audit }) => {
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

  it('audit-prompt shows each clause its standing, spelling out that unknown means nobody looked', async () => {
    await enclosingGitFixture(async ({ tasks, audit }) => {
      await audit('demo-spec', '--proof', '1=met', '--evidence', '1=measured directly');

      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('standing: met — measured directly');
      expect(result.stdout).toContain('standing: unknown — nobody has graded this clause');
      expect(result.stdout).toContain('Latest audit pass: pass 1');
      expect(result.stdout).toContain('outstanding: c2 (unknown)');
      expect(stepsBlock(result.stdout)).toContain('unknown  — nobody looked. Recording unmet instead hides that nothing was verified.');
      expect(stepsBlock(result.stdout)).toContain('deferred — you checked, it fails, and the goal above still holds without it.');
      expect(result.stdout).not.toMatch(/\d+\/\d+ met/);
    });
  });

  it('audit-prompt calls every clause unknown when no pass has been recorded', () => {
    enclosingGitFixture(({ tasks }) => {
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
});

// c5/c6: a spec carries a goal, the brief prints it, and the step where
// verdicts are assigned asks the question that licenses a deferral.
describe("a spec's goal", () => {
  it('c5: is printed by audit-prompt without opening the file', async () => {
    await enclosingGitFixture(async ({ dir, tasks }) => {
      const specPath = path.join(dir, 'specs', 'demo-spec.md');
      writeFileSync(specPath, readFileSync(specPath, 'utf8').replace('## Decisions', '## Goal\n\nKeep the gate honest without losing the honest way to drop scope.\n\n## Decisions'), 'utf8');
      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Goal: Keep the gate honest without losing the honest way to drop scope.');
    });
  });

  it('says plainly that none is recorded, rather than staying silent, when the spec carries no ## Goal', async () => {
    await enclosingGitFixture(async ({ tasks }) => {
      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Goal: (none recorded');
    });
  });

  it('c6: the step where verdicts are assigned asks whether the goal still holds before a clause is dropped', async () => {
    await enclosingGitFixture(async ({ tasks }) => {
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
  const resolves = (name: string, file = 'scripts/tasks/audit.test.ts'): TargetResolution[] => [{ state: 'found', file, name }];

  it('a manifest entry runs the test its clause names, in the file that test lives in', () => {
    const { entries } = mutationManifest(
      [
        { id: 1, targets: ['vitest scripts/tasks/audit.test.ts "the first test"'] },
        { id: 2, targets: ['vitest scripts/tasks.test.ts "a test that moved"'] },
      ],
      (target) => (target.includes('moved') ? [{ state: 'moved', file: 'scripts/tasks.test.ts', name: 'a test that moved', foundIn: ['scripts/tasks/records.test.ts'] }] : resolves('the first test')),
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
      (target) => (target.includes('gone') ? [{ state: 'nowhere', file: 'a.test.ts', name: 'gone' }] : resolves('here')),
    );

    // parseManifest refuses a manifest as a whole, so one entry the brief
    // could not complete would cost the auditor every entry beside it.
    expect(entries).toHaveLength(1);
    expect(omitted).toEqual([`c1: vitest a.test.ts "gone" — no test by this name exists anywhere in the suite, and \`vitest -t\` would skip every test and exit 0 — quote the exact title of a test that exists, or drop the quotes to name every test in the file`]);
    expect(() => parseManifest(JSON.stringify(entries))).not.toThrow();
  });

  // c1/c2: a target naming a file with no quoted test name resolves to every
  // test the file declares — "naming a file means naming its tests" — and a
  // target naming more than one file resolves to the union across all of
  // them, whether the list is bare or wrapped in one pair of backticks.
  it('c1: a target naming one file with no quoted test resolves to every test that file declares', () => {
    const read = (): string => "it('first', () => {});\nit('second', () => {});\n";
    const resolutions = resolveTarget('vitest a.test.ts', read);
    expect(resolutions).toEqual([
      { state: 'found', file: 'a.test.ts', name: 'first' },
      { state: 'found', file: 'a.test.ts', name: 'second' },
    ]);
  });

  it('c1: a target naming two files, bare or backtick-wrapped, resolves to every test across both', () => {
    const read = (file: string): string => (file === 'a.test.ts' ? "it('from a', () => {});\n" : "it('from b', () => {});\n");
    const bare = resolveTarget('vitest a.test.ts b.test.ts', read);
    const backticked = resolveTarget('vitest `a.test.ts b.test.ts`', read);
    expect(bare).toEqual([
      { state: 'found', file: 'a.test.ts', name: 'from a' },
      { state: 'found', file: 'b.test.ts', name: 'from b' },
    ]);
    expect(backticked).toEqual(bare);
  });

  // c1, at the manifest itself rather than at resolveTarget in isolation: one
  // file-only target resolving to several tests must become several manifest
  // entries, not the first one found — a resolver returning an array is only
  // the whole clause if every element of it reaches the manifest.
  it('c1: one file-only target resolving to several tests becomes a manifest entry for each', () => {
    const { entries, omitted } = mutationManifest(
      [{ id: 1, targets: ['vitest a.test.ts'] }],
      () => [
        { state: 'found', file: 'a.test.ts', name: 'first' },
        { state: 'found', file: 'a.test.ts', name: 'second' },
        { state: 'found', file: 'a.test.ts', name: 'third' },
      ],
    );
    expect(entries.map((entry) => entry.name)).toEqual(['c1 first', 'c1 second', 'c1 third']);
    expect(omitted).toEqual([]);
  });

  it('c1: a single file wrapped in backticks resolves the same as the bare form', () => {
    const read = (): string => "it('a title', () => {});\n";
    expect(resolveTarget('vitest `a.test.ts`', read)).toEqual([{ state: 'found', file: 'a.test.ts', name: 'a title' }]);
  });

  // Decisions: a file-only target naming a real file with no tests is an
  // omission, not a silent success — both are defensible, but "resolved to
  // nothing" is exactly the shape a reader cannot tell apart from "was never
  // read", which is the ambiguity c2 exists to remove.
  it('c1: a file-only target naming a real file with no tests is an omission, not a silent empty success', () => {
    const resolutions = resolveTarget('vitest empty.test.ts', () => '// no tests in this file\n');
    expect(resolutions).toEqual([{ state: 'no-tests', file: 'empty.test.ts' }]);
    const { entries, omitted } = mutationManifest([{ id: 1, targets: ['vitest empty.test.ts'] }], (target) => resolveTarget(target, () => '// no tests\n'));
    expect(entries).toHaveLength(0);
    expect(omitted).toEqual(['c1: vitest empty.test.ts — empty.test.ts declares no tests — name a file that has at least one `it(...)`, or drop it from the target']);
  });

  it('c1: a file-only target naming a file absent from the checkout is reported as missing, the same way a named target is', () => {
    expect(resolveTarget('vitest gone.test.ts', () => null)).toEqual([{ state: 'no-such-file', file: 'gone.test.ts' }]);
  });

  // c2: the form this clause adds — a `vitest` target this brief cannot place
  // in either the quoted-name shape or the file-list shape — is reported by
  // name rather than silently dropped, which is what a `null` return from the
  // old `resolveTarget` did.
  it('c2: a vitest target matching no recognised form is reported as unparseable rather than dropped', () => {
    expect(resolveTarget('vitest')).toEqual([{ state: 'unparseable', target: 'vitest' }]);
    expect(resolveTarget('vitest "just a quoted name, no file"')).toEqual([{ state: 'unparseable', target: 'vitest "just a quoted name, no file"' }]);
  });

  it('c2: a target that does not open with vitest resolves to nothing, staying outside this clause\'s corpus', () => {
    expect(resolveTarget('command npm run layer-check')).toEqual([]);
  });

  // c3: every message this brief can print for an unresolved target names the
  // form that would fix it, enumerated here so a later reader can check it
  // against the code's failure states rather than re-deriving it.
  it('c3: every reported reason names the target form that would resolve it', () => {
    const messages = [
      describeResolution({ state: 'no-such-file', file: 'a.test.ts' }),
      describeResolution({ state: 'nowhere', file: 'a.test.ts', name: 'x' }),
      describeResolution({ state: 'unsearchable', file: 'a.test.ts', name: 'x' }),
      describeResolution({ state: 'no-tests', file: 'a.test.ts' }),
      describeResolution({ state: 'unparseable', target: 'vitest' }),
    ];
    expect(messages).toEqual([
      'names no file in this checkout: a.test.ts — write a target naming a file this checkout has',
      'no test by this name exists anywhere in the suite, and `vitest -t` would skip every test and exit 0 — quote the exact title of a test that exists, or drop the quotes to name every test in the file',
      'a.test.ts has no test by this name, and the suite could not be listed to say whether it moved — quote the title exactly as it is written in the file',
      'a.test.ts declares no tests — name a file that has at least one `it(...)`, or drop it from the target',
      'does not match a form this brief can resolve — write `vitest <file> "<test name>"` to name one test, or `vitest <file> [<file> ...]` (optionally wrapped in one pair of backticks) to name every test in one or more files',
    ]);
    // Each message states the writable form: a target this brief could write
    // back to the reader, quoted with backticks, appears in every one of them.
    for (const message of messages) expect(message).toMatch(/`.*`| write a target| quote the (exact title|title exactly)| name a file/);
  });

  // c1/c2, over this repository's own corpus: every `vitest`-prefixed proof
  // target any spec in docs/specs/*.md actually writes resolves to something
  // — found tests or a named omission — never to nothing. `search` is stubbed
  // to avoid a real `npx vitest list --json` subprocess, so a quoted-name
  // target whose title has moved is measured here as `nowhere` rather than
  // `moved` — a pre-existing distinction this branch does not change, and one
  // that only ever affects the quoted form. The property this test locks in
  // is c2's — nothing empty — over the whole corpus, and c1's — a real count
  // of resolved entries where there were none — over the file-only forms this
  // branch adds resolution for.
  it('c1/c2: every vitest-prefixed proof target in this repo\'s own specs resolves to at least one outcome, and the file-only forms — unresolvable before this branch — mostly resolve now', () => {
    const specsDir = path.join(repoRoot, 'docs', 'specs');
    const targets = readdirSync(specsDir)
      .filter((name) => name.endsWith('.md'))
      .flatMap((name) => parseSpecDoc(readFileSync(path.join(specsDir, name), 'utf8')).proofClauses.flatMap((clause) => clause.proofTargets ?? []))
      .filter((target) => /^vitest(\s|$)/.test(target));

    expect(targets.length).toBeGreaterThan(0);
    const neverSearches = (): string[] => [];
    let fileOnlyTotal = 0;
    let fileOnlyResolved = 0;
    for (const target of targets) {
      const resolutions = resolveTarget(target, undefined, neverSearches);
      // c2: never empty, whatever form the target takes.
      expect(resolutions.length).toBeGreaterThan(0);
      if (!target.includes('"')) {
        fileOnlyTotal++;
        if (resolutions.some((resolution) => resolution.state === 'found')) fileOnlyResolved++;
      }
    }
    // c1: before this branch, `resolveTarget` returned null for every one of
    // these — the form nearly every clause in this repository actually
    // writes — so this count was 0. It is now most of them; what remains is a
    // genuine no-such-file or unparseable target, reported rather than
    // dropped (surveyed by hand: 10 name a file this checkout does not have,
    // 2 name no file at all).
    expect(fileOnlyTotal).toBeGreaterThan(0);
    expect(fileOnlyResolved).toBeGreaterThan(fileOnlyTotal * 0.85);
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
      slugStanding({ slug: 'demo-spec', branch: 'demo-spec', declaredSpecs: ['demo-spec'], base: 'abc1234', lastPassHead: null, lastPassMerged: false, ...over }).rangeIsThisSlugs;

    expect(of({})).toBe(true);
    expect(of({ declaredSpecs: ['another-spec'] })).toBe(false);
    // Nothing relates the slug to the branch — the standing pass 2 found
    // shipping a manifest, because its line carries no WARNING prefix.
    expect(of({ declaredSpecs: [] })).toBe(false);
    // Nor could this checkout tell — the diff could not be read and no
    // branch-name route fired either, which must not read as ownership.
    expect(of({ declaredSpecs: null })).toBe(false);
    expect(of({ lastPassHead: 'def5678', lastPassMerged: true })).toBe(false);
  });

  it('offers no manifest at all in a brief that has just warned the diff is not this slugs', () => {
    enclosingGitFixture(({ dir, tasks }) => {
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

  // The brief carried the deliverable prose and the `## Decisions` section
  // inline for two passes, on the theory that a pass which had them printed
  // would not open the spec. All three passes opened it anyway — it is the
  // first thing a clause is graded against — so the sections bought 41 lines
  // and changed no behaviour. Step 1 names the file and what is in it.
  it('sends the auditor to the spec file rather than reprinting its sections', () => {
    enclosingGitFixture(({ dir, tasks }) => {
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

  // In a repo of its own, because the paths this section answers over are
  // the union of the member tasks' files and a real `git diff base..head`.
  // Run against the checkout the suite happens to sit in, the branch's own
  // commits join that union and the section grows paths the test never named.
  it('the brief answers ownership and prior art for every path in its diff', () => {
    gitFixture(({ dir, commit, tasks }) => {
      writeFileSync(path.join(dir, 'systems.json'), JSON.stringify({ unowned: { note: '', paths: ['docs', '*.md'] }, systems: [{ name: 'Runtime', paths: ['src/runtime'], lastAudit: null, lastAuditDoc: null, note: null }] }), 'utf8');
      // One path from each half of the union: session.ts is in the diff and
      // on no record, save.ts is on a member task and not in the diff.
      commit('Touch the session file on demo-spec.', ['src/runtime/session.ts']);
      tasks('add', 'An earlier claim on the save file', '--system', 'Runtime', '--files', 'src/runtime/save.ts:88');
      tasks('add', 'The task under audit', '--spec', 'demo-spec', '--files', 'src/runtime/save.ts');

      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Who owns each changed path:\n- src/runtime/save.ts — Runtime\n- src/runtime/session.ts — Runtime\n');
      // The whole heading, not a prefix of it: the joined path list is the
      // section's answer to "which paths did you ask about", and a
      // `toContain` on one name cannot tell two paths from twenty.
      expect(result.stdout).toContain('\nprior art on src/runtime/save.ts, src/runtime/session.ts:\n');
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
    enclosingGitFixture(({ tasks }) => {
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
    enclosingGitFixture(({ tasks }) => {
      const { stdout } = tasks('audit-prompt', 'demo-spec');
      expect(stdout).toContain('KILLED — that named test failed with the line broken');
      expect(stdout).toContain('SURVIVED — no test went from passing to failing');
      expect(stdout).toContain('ERROR — the mutation did not build');
      // The column pass 2 called what made its headline measurable, and had
      // to reverse-engineer from scripts/mutate.ts to trust.
      expect(stdout).toContain('the scope column reports the chain it walked');
    });
  });

  // A brief that lists the verdicts without saying what one is attributed to
  // is how `KILLED` came to be read as "the number went up" — which is the
  // reading every recorded pass in this repository has been taking on faith.
  it('says a verdict is attributed to a named test, not to a count', () => {
    enclosingGitFixture(({ tasks }) => {
      const { stdout } = tasks('audit-prompt', 'demo-spec');
      expect(stdout).toContain('attributed to a named test, never to a count');
      expect(stdout).toContain('a row that names no test is not a kill');
      expect(stdout).toContain('UNSTABLE');
      expect(stdout).toContain('Widening the scope cannot widen what counts as a kill');
    });
  });

  // The format used to be prose in the brief, and two of three passes each
  // spent a call learning it anyway — one running `tasks audit` bare to read
  // its usage, one grepping `parseAuditFile`. The file removes the format
  // from the brief: the auditor opens it and fills in values.
  it('writes the pass file the auditor fills in, rather than describing its format', () => {
    enclosingGitFixture(({ tasks }) => {
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
    enclosingGitFixture(({ dir, tasks }) => {
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
    enclosingGitFixture(({ dir, tasks }) => {
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
    enclosingGitFixture(({ dir, tasks }) => {
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
    enclosingGitFixture(({ dir, tasks }) => {
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
      slugStanding({ slug: 'demo-spec', branch: 'demo-spec', declaredSpecs: ['demo-spec'], base: 'abc1234', lastPassHead: null, lastPassMerged: false, ...over }).rangeIsUnrelated;

    expect(unrelated({ declaredSpecs: ['another-spec'] })).toBe(true);
    expect(unrelated({ lastPassHead: 'def5678', lastPassMerged: true })).toBe(true);
    // Nothing relates the two — a diff nobody can place, whether because
    // nothing was declared or because nothing could be read — is not the
    // same claim as a diff known to belong to a named other spec.
    expect(unrelated({ declaredSpecs: [] })).toBe(false);
    expect(unrelated({ declaredSpecs: null })).toBe(false);
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

  it('makes filing what the audit cost a numbered step, and sends it to the channel rather than a markdown file', () => {
    enclosingGitFixture(({ tasks }) => {
      const { stdout } = tasks('audit-prompt', 'demo-spec');
      // Of the two passes that had it as prose elsewhere in the brief, one
      // wrote nothing at all; the pass that had it as a step wrote it.
      expect(stepsBlock(stdout)).toContain('8. File what this audit cost you');
      expect(stepsBlock(stdout)).toContain('npm run tasks -- add');
      expect(stepsBlock(stdout)).toContain('--breaches <lesson-handle>');
      // The invariant, of which the deleted markdown file was one instance:
      // nothing the tooling generates may direct a report outside the store.
      // Scoped to the instructions, because the brief also echoes the branch
      // diff and a deleted path there is a fact, not a direction.
      expect(stepsBlock(stdout)).not.toContain('.planning/');
    });
  });

  it('the brief names each tool an auditor may reach for, with the command that runs it', () => {
    enclosingGitFixture(({ tasks }) => {
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
    enclosingGitFixture(({ dir, tasks }) => {
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
    const merged = slugStandingLines({ slug: 'merged-spec', branch: 'tasks-roadmap', declaredSpecs: ['tasks-roadmap'], base: 'dcc8574001b06b5c89516f8a9afcefa8ce64163b', lastPassHead: 'c38657c001b06b5c89516f8a9afcefa8ce64163b', lastPassMerged: true });
    expect(merged.join('\n')).toContain('merged before this branch began');
    expect(merged.join('\n')).toContain('none of the work its clauses describe is in the diff');
  });

  // Silence here would be the original defect wearing a passing test: the
  // brief would still range an unrelated slug against HEAD and say nothing.
  it('says plainly when nothing relates the slug to the branch at all', () => {
    const lines = slugStandingLines({ slug: 'some-spec', branch: 'claude/cold-worktree', declaredSpecs: [], base: 'abc1234', lastPassHead: null, lastPassMerged: false });
    expect(lines.join('\n')).toContain('Nothing relates some-spec to claude/cold-worktree');
  });

  // The deadlock member 4 found: on a checkout whose store diff cannot be
  // read at all and whose branch name matches no spec file, silence about
  // "could not tell" reads exactly like the confident "nothing relates"
  // case above, and a reader cannot act on either the same way — one says
  // there is an answer and it is no, the other says there is no answer yet.
  it('says it could not tell, distinctly from nothing relating, when the declared set could not be read', () => {
    const lines = slugStandingLines({ slug: 'some-spec', branch: 'claude/cold-worktree', declaredSpecs: null, base: 'abc1234', lastPassHead: null, lastPassMerged: false });
    expect(lines.join('\n')).toContain('Could not tell whether some-spec relates to claude/cold-worktree');
    expect(lines.join('\n')).not.toContain('Nothing relates');
  });

  it('stays silent when the branch owns the slug and its passes are on this branch', () => {
    expect(slugStandingLines({ slug: 'demo-spec', branch: 'demo-spec', declaredSpecs: ['demo-spec'], base: 'abc1234', lastPassHead: 'def5678', lastPassMerged: false })).toEqual([]);
  });
});

// The deadlock member 4 found and reproduced independently: on a branch
// whose name matches no spec file — every `claude/*` branch, which is most
// of them — the branch-name route above answers null, and before this fix
// that was the only signal `cmdAuditPrompt` read. It declared the diff
// foreign on a checkout `merge-ready` graded as this branch's own, and
// blocked on a pass only the refusing tool could file. `gitFixture` pins
// `main` to its own first commit and gives the branch the same name as the
// slug, so it cannot exercise this — proving the fix needs a repository
// where the branch's own store diff, not its name, is the only thing that
// can answer.
function declaredSpecFixture(run: (ctx: { dir: string; commit: (message: string) => void; tasks: (...args: string[]) => Run }) => void): void {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-audit-prompt-declared-'));
  const restoreTmp = isolateTmp(dir);
  mkdirSync(path.join(dir, 'specs'), { recursive: true });
  writeFileSync(path.join(dir, 'specs', 'demo-spec.md'), '# Demo spec\n\n## Deliverable\n\nSomething this branch promises.\n\nProof:\n\n- The first clause holds.\n\n## Decisions\n\n## Open questions\n\nNone.\n', 'utf8');
  writeFileSync(path.join(dir, 'systems.json'), JSON.stringify({ unowned: { note: '', paths: ['docs', '*.md'] }, systems: [] }), 'utf8');
  writeFileSync(path.join(dir, 'tasks.jsonl'), '', 'utf8');
  // Snapshotted into the first commit by `installDataGit`, then pinned as
  // `main` — an empty, but readable, store at the merge base, which is what
  // lets a later change to it read as this branch's own declaration rather
  // than as an unreadable diff.
  const repo = installDataGit(dir, 'claude/cold-worktree');
  repo.fork();
  const globals = ['--store', path.join(dir, 'tasks.jsonl'), '--systems', path.join(dir, 'systems.json'), '--specs-dir', path.join(dir, 'specs'), '--branch', 'claude/cold-worktree'];
  try {
    run({
      dir,
      commit: (message: string) => void repo.commit(message),
      tasks: (...args: string[]) => runInProcessAt(dir, [...args, ...globals]),
    });
  } finally {
    repo.uninstall();
    restoreTmp();
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('audit-prompt reads the same declared set merge-ready does, on a branch name that answers nothing', () => {
  it('owns a slug through its own store diff alone', () => {
    declaredSpecFixture(({ tasks, commit }) => {
      tasks('add', 'The task under audit', '--spec', 'demo-spec');
      commit('declare demo-spec');

      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('WARNING: this branch is working');
      expect(result.stdout).not.toContain('Nothing relates');
      expect(result.stdout).not.toContain('Could not tell whether');
      // Both artifacts the old deadlock refused: the manifest gate reads the
      // same standing as the pass-file gate, so proving one proves both.
      expect(result.stdout).not.toContain('No mutation manifest: the diff above is not');
      expect(stepsBlock(result.stdout)).toContain('7. File the pass.');
    });
  });

  it('warns off the branch\'s own store diff too, not only the branch-name route', () => {
    declaredSpecFixture(({ dir, tasks, commit }) => {
      writeFileSync(path.join(dir, 'specs', 'another-spec.md'), '# Another spec\n\n## Deliverable\n\nElsewhere.\n\nProof:\n\n- It holds.\n', 'utf8');
      tasks('add', 'The task under audit', '--spec', 'another-spec');
      commit('declare another-spec');

      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('WARNING: this branch is working another-spec, not demo-spec');
      expect(stepsBlock(result.stdout)).toContain('7. Do not file a pass.');
    });
  });
});

// briefs-carry-the-lessons c2: the five auditor instructions the
// 2026-08-06 orchestrated run paid for, from fourteen audit passes. Each is
// its own test naming the literal text, not a loop over `AUDITOR_LESSONS`
// itself — a loop over the array under test would still pass with the array
// emptied.
describe('audit-prompt carries the lessons a prior run paid for', () => {
  it('carries the false-proof-shape question, with its three named forms as examples', () =>
    enclosingGitFixture(({ tasks }) => {
      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.stdout).toContain('Ask what would have to break for a test to fail, and whether that is what the clause promises.');
      expect(result.stdout).toContain('a fixture that performs a second operation whose side effect produces the asserted state');
      expect(result.stdout).toContain('an expectation derived from the structure under test');
      expect(result.stdout).toContain('a test written against the class the implementation is guaranteed to handle');
    }));

  it('carries the hunt-the-next-neighbour rule', () =>
    enclosingGitFixture(({ tasks }) => {
      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.stdout).toContain('Hunt the next neighbour, not confirmation of the last fix.');
    }));

  it('carries the rule-may-be-wrong question for a twice-failed clause', () =>
    enclosingGitFixture(({ tasks }) => {
      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.stdout).toContain('When a clause has failed twice, ask whether the rule is wrong rather than whether another instance exists.');
    }));

  it('carries the over-strictness guard', () =>
    enclosingGitFixture(({ tasks }) => {
      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.stdout).toContain('Guard over-strictness at least as hard as bypass.');
    }));

  it('carries the silent-guess question', () =>
    enclosingGitFixture(({ tasks }) => {
      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.stdout).toContain('Ask the silent-guess question explicitly.');
      expect(result.stdout).toContain('Treat "none found" as real only if you looked.');
    }));
});

// c5, checked for audit-prompt: the same "instructions, not incidents" check
// workPrompt.test.ts makes for the worker's lessons. A property proven for
// one member of the family is not proven for the rest of it — this is what
// would have let three of four briefs reacquire narrative text silently.
describe('audit-prompt prints instructions, not the incidents that motivated them', () => {
  it('never prints the narrative evidence behind an auditor lesson', () =>
    enclosingGitFixture(({ tasks }) => {
      const result = tasks('audit-prompt', 'demo-spec');
      expect(result.stdout).not.toContain('clause-deferral spec');
      expect(result.stdout).not.toContain('consumed four passes');
      expect(result.stdout).not.toContain('the fourth found a real defect');
    }));
});

// c7: the briefs do not grow without bound, checked rather than felt. The
// budget is on the four lists' combined entry count, since an instruction is
// the unit a later editor adds or cuts — not on a character count, which
// would refuse a clearer sentence for being a longer one.
describe('the four briefs stay within the lesson budget the spec sets', () => {
  it('the combined lesson count this branch added is within the documented budget', () => {
    expect(totalLessonCount()).toBeLessThanOrEqual(MAX_LESSON_COUNT);
  });
});

// ORCHESTRATOR_LESSONS carries "give every dispatched agent a scratch
// filename prefix", which reaches an orchestrated run and not an auditor
// commissioned directly — which is most of them. The brief names its own.
describe('the scratch prefix an auditor is given', () => {
  it('names a prefix keyed to the spec and the pass, in the steps rather than beside them', () => {
    enclosingGitFixture(({ tasks }) => {
      const { stdout } = tasks('audit-prompt', 'demo-spec');
      expect(stepsBlock(stdout)).toContain('audit-demo-spec-pass1-<what it is>');
      expect(stepsBlock(stdout)).toContain('Concurrent auditors share that directory');
    });
  });

  it('moves the prefix with the pass, so pass 2 cannot overwrite pass 1', () => {
    enclosingGitFixture(({ tasks, dir }) => {
      const spec = path.join(dir, 'specs', 'demo-spec.md');
      writeFileSync(spec, `${readFileSync(spec, 'utf8')}
## Audit passes

### Pass 1 — 2026-08-08

- base: \`abc\`
- head: \`def\`
- proof 1: unknown
- proof 2: unknown
`, 'utf8');
      expect(stepsBlock(tasks('audit-prompt', 'demo-spec').stdout)).toContain('audit-demo-spec-pass2-<what it is>');
    });
  });
});
