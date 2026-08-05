# git-facts-as-data

## Deliverable

The tooling suite stops paying a real subprocess per test case. `scripts/lib/git.ts` becomes an
installable seam in the shape `scripts/tasks/prompt.ts` already uses, the four remaining raw git
call sites move behind it, and the fixtures that build throwaway repositories hand their git facts
in as data instead. A named handful of tests keeps spawning real git and a real CLI, because that
is what proves the seam matches the world; every other case reads the decision rather than the
world.

This branch is the one `pass2-c-m5` was declined into — "re-file it against the branch that next
has reason to open that file" — so it also settles the design question that decline left open and
closes `cl-l3-seam-remainder`.

Proof:

- [c1] `scripts/lib/git.ts` exposes an install point and a fake built from plain data; with a fake
  installed, a command that reads git spawns no `git` process, demonstrated by a test that fails if
  one is spawned.
- [c2] `handoff.ts` reads commit messages through the seam rather than its own `execFileSync`, and
  the choice between leaking git's `--format` string through the seam and moving commit-message
  parsing into `git.ts` is made once, recorded in `## Decisions`, and applied.
- [c3] The four raw call sites named by `pass2-c-m5` — `status --porcelain`, `log --format=%H` over
  the store, `diff --name-only`, and handoff's `log -N` — are behind the seam, and
  `cl-l3-seam-remainder` is closed against this branch.
- [c4] `scripts/tasks/cliFixtures.ts` offers a fixture that supplies git facts as data, and
  `handoff.test.ts`'s seven `gitFixture` cases use it. Every assertion those cases make today still
  holds.
- [c5] The tests that must observe the real world still do, named as such and not merely surviving
  by accident: `scripts/lib/git.test.ts` keeps exercising real git, and the merge-semantics cases in
  `handoff.test.ts` that prove `.gitattributes` `merge=union` behaviour keep building real
  repositories, because a fake cannot prove git's merge driver.
- [c6] `scripts/modportal.ts` grows a `run(args)` entry the way `scripts/tasks.ts` has one, and
  `modportal.test.ts` calls it in-process instead of spawning the tsx CLI ten times.
- [c7] `npm test` completes in under 15s wall clock on the measuring machine, down from 22.2s, and
  no file in `scripts/` spawns git or the tsx CLI outside the sets named in c5.
- [c8] A concept is registered over `scripts/lib/git.ts`, which today no concept claims.

## Decisions

- **Scope is the mechanism, not the file.** The reported symptom was `handoff.test.ts`. Measured
  2026-08-05: deleting that file outright takes the suite from 22.2s to 19.7s, so the file is worth
  2.5s of a 22s wall and is not the problem. `src/` — the game — is 34 files and 4.3s; `scripts/` is
  34 files and 20.9s. The whole wall is tooling tests paying subprocesses, so the contract is
  written against that cost wherever it sits.
- **Extends the git seam; does not create one.** `scripts/lib/git.ts` exists and six modules import
  it. This branch adds an install point to it and finishes the routing that `pass2-c-m5` named,
  rather than introducing a second abstraction beside it — that finding was declined for growing
  duplication, and a parallel seam would repeat it.
- **Reuses the prompter's seam shape.** `installPrompter`/`activePrompter` in
  `scripts/tasks/prompt.ts` is the repository's settled answer to "an effect the tests need to hand
  in as data". The git seam takes the same shape so there is one pattern to learn, not two.
- **`modportal` is in scope for a different reason than the rest.** Its 19.2s is ten tsx CLI spawns,
  not git, so it is not the same defect. It is included because after clauses 1-5 it becomes the
  tallest pole in the suite, and clause 7's wall is unreachable without it.
- **`specCmds.test.ts` is out of scope.** It is 10.7s over 40 tests with no spawns at all — an
  in-process cost with a different cause. Filed separately rather than swept in here, so this
  branch's promise stays checkable.
- **The 5-minute budget is not breached.** At 22.2s the suite is well inside `CLAUDE.md`'s limit, so
  this is drift prevention rather than a fire. The value is that a spawn-per-case habit is what took
  `scripts/tasks.test.ts` to 84s of an 89s suite before `audit-loop-costs-less` split it.

## Open questions

- Whether the audit brief should surface `npm test`'s wall and largest-file share so this drift is
  caught by the loop rather than by a person noticing. That question already exists as the deferred
  `audit-prompt-drift-and-isolation`, together with the vitest-isolation question, and is
  deliberately not promised here.
