# audit-splits-at-its-seam

## Deliverable

`scripts/tasks/audit.ts` is 1165 lines carrying four registered concepts, and the report this
repository built for exactly that condition has been firing against it for three audits with no seam
drawn. There is one seam in the file and it is not subtle: half of it generates the auditor's brief
and half of it files a recorded pass. The two halves share exactly one function today. This branch
draws that seam and moves nothing else — no behaviour changes, no clause of any other spec changes
meaning, and the assertion that it is a pure move is the existing test bodies passing unchanged on
the other side of a module boundary.

It is filed as an enabler rather than a tidy-up. `brief-builds-the-manifest` and
`gate-believes-the-branch` both edit brief generation, and without the seam they queue on one file.

Proof:

- [c1] Generating the auditor's brief and filing a recorded pass live in different modules.
  `scripts/tasks/auditPrompt.ts` owns everything the brief needs in order to be generated;
  `scripts/tasks/audit.ts` owns everything that reads a filled-in pass and writes it to the store
  and the spec document. The rule is the invariant, not the list: **if removing a function would
  stop a brief from being printed, it belongs to the brief module; if removing it would stop a pass
  from being filed, it belongs to the filing module.** As illustration of that rule and not as its
  extent — `cmdAuditPrompt`, the mutation-manifest writer, the pass-file skeleton, proof target
  resolution, the suite-title index, the tool list and the ownership survey generate the brief;
  `cmdImport`, `parseAuditArgs`, `parseAuditFile`, `AUDIT_USAGE`, the interactive clause walk,
  finding assembly and `cmdAudit` file a pass. A function the rule does not decide is an open
  question below, not a coin toss.
  proof: `grep -n "^export function cmdAuditPrompt\|^export function mutationManifest\|^export function resolveTarget\|^export function auditArgsSkeleton" scripts/tasks/audit.ts` returns nothing, and the same grep for `^export async function cmdAudit\|^export function cmdImport\|^export function parseAuditArgs` over `scripts/tasks/auditPrompt.ts` returns nothing.

- [c2] No test is lost, renamed or weakened by the move. Every test that ran against
  `scripts/tasks/audit.ts` before this branch still runs after it, under the same name, asserting
  the same thing, in whichever of the two test files now owns it. A move that quietly drops a case
  is the failure mode this clause exists to catch, and a green suite does not detect it — only the
  count and the names do.
  proof: `scripts/tasks/audit.test.ts` and `scripts/tasks/auditPrompt.test.ts` together run the same
  number of tests `scripts/tasks/audit.test.ts` ran at this branch's base, and the two sorted lists
  of test names are identical. Record both numbers in the pass.
  proof: vitest `scripts/tasks/audit.test.ts scripts/tasks/auditPrompt.test.ts`

- [c3] The two modules do not import each other. A seam that both sides reach across is not a seam,
  and the audit that keeps firing on this file is measuring exactly that. Today there is one real
  cross-reference — `cmdAudit` calls `resolveDiffRange` — and it has to land somewhere that both
  halves may read without either depending on the other. Where it lands is the open question below;
  that it does not become a mutual import is the clause.
  proof: at most one of `grep -n "from './auditPrompt'" scripts/tasks/audit.ts` and
  `grep -n "from './audit'" scripts/tasks/auditPrompt.ts` returns a line. Both returning a line is
  the cycle this clause forbids; one is the one-way import the open question sanctions.

- [c4] `docs/audits/systems.json` describes where the code actually is. A concept's registered paths
  follow the functions that implement it, so a concept whose implementation now spans both files
  says so and a concept whose implementation moved wholly is re-pointed. `generated auditor brief`
  and `proof target resolution` move; `record fault` stays; `clause deferral` is the one that
  genuinely spans both, because its wording lives in the pass-file skeleton and its behaviour lives
  in the interactive walk.
  proof: `npm run audit-status`'s two-concept report names `scripts/tasks/audit.ts` with strictly
  fewer concepts than the four it carried at this branch's base, names `scripts/tasks/auditPrompt.ts`
  with the rest, and adds no path that was not already in that report. Record the before and after
  counts for both files in the pass. The comparison is against this file's own base, not against
  whichever path happens to lead the report — `scripts/lib/taskStore.ts` carried five concepts before
  this branch and still does, and nothing here was ever going to change that.

## Goal

Make brief generation a file two branches can edit at once, and stop a 1165-line module from being
the reason three HIGHs run in series.

## Decisions

- No new capability is registered. The split adds nothing the system could not already do; it moves
  two existing concepts to the file that now implements them. Registering a `brief generation`
  concept would be a third name for what `generated auditor brief` already owns.

- `scripts/tasks/audit.test.ts` splits alongside its source rather than staying whole. A 1891-line
  test file that drives two modules is the same defect one level up, and the seam is only real if
  the tests can be run separately.

- The move is proven by the tests it does not change, not by new ones. Writing fresh tests for moved
  code would assert the new arrangement rather than the preserved behaviour, and a pure move whose
  proof is a new test is indistinguishable from a rewrite. c2 is therefore about counts and names,
  which is what a dropped case actually shows up in.

## Open questions

- Where `resolveDiffRange` lands. It stays in the filing module and the brief module imports it; or
  it moves to the brief module and the filing module imports it; or it moves down below both. Either
  of the first two satisfies c3 as written, since c3 forbids a mutual import and not a one-way one —
  so the cheapest answer is to pick the direction and stop. Moving it down is the tidier shape and
  is **not** free: the obvious floor is `scripts/lib/git.ts`, which `docs/audits/systems.json` gives
  to Testing procedure, so that route has a Task-system branch writing another system's file and
  needs that recorded as a decision rather than done in passing. Pick the one-way import unless
  reading both call sites says the shared thing is bigger than one function.

- Whether `printOwnership` and `diffChangedFiles` are brief generation or a third thing. They survey
  the diff rather than render the brief, and `cmdAudit` does not use them today. c1's rule puts them
  with the brief because removing them stops a brief from printing; if reading them says they are a
  survey both halves will want, say so rather than following the rule off a cliff.
