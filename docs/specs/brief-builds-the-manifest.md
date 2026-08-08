# brief-builds-the-manifest

## Deliverable

The auditor's brief already holds everything a mutation manifest is built from — the spec's proof
targets, the diff range, and the test tree — and still hands the auditor a blank. Eight recorded
passes across four specs in one 3.5-hour run each spent about ten minutes joining those three by
hand; roughly eighty minutes, the single largest repeated cost in the friction log. The join is
mechanical and the brief is where it belongs.

The reason it does not happen is one regex. `resolveTarget` accepts only `vitest <file> "<name>"`,
returns `null` for anything else, and `mutationManifest` skips a `null` without a word — so the
form nearly every clause in this repository actually writes, a target naming test files and no test
name, produces neither an entry nor a complaint. This branch makes a target that names files
resolve to the tests in those files, and makes every target that still cannot resolve say so.

The invariant across all five clauses is the same one: **the brief never asks the auditor to
reconstruct something the brief already knows, and never discards an input without saying it did.**
That second half is what turns the first from a convenience into a contract — a manifest that
silently omits half a spec's targets is worse than no manifest, because the auditor has no way to
tell an empty target list from an unread one.

Two folded records are the same invariant one layer down, in the filing half of the same command:
a finding's own fields are taken untrimmed, so a whitespace-only value satisfies a required check
and the guard reports nothing; and `--args-from` refuses a bare slug on the file's first line with
a message that is true and unactionable.

Proof:

- [c1] A proof target that names test files and no test name resolves to the tests declared in
  those files. The property is that a target resolves to whatever the auditor would run for it —
  naming a file means naming its tests, and naming more than one file means naming all of theirs,
  because a target carrying two paths is a form this repository's own specs already use. Which
  surface forms count as "names files" is the open question below; that no form a spec actually
  writes today is silently unparseable is the clause.
  proof: over every `proof:` line in `docs/specs/*.md` whose value begins `vitest`, count those
  that yield at least one manifest entry. Record the count at this branch's base and at its head,
  and record the total number of such lines. At head every target the branch decides names test
  files is in that set, and every target that resolved at base still does — a resolver that gains
  the new form by losing the old one meets neither half.
  proof: vitest scripts/tasks/auditPrompt.test.ts

- [c2] No proof target is discarded in silence. For every target a clause writes, the brief emits
  either a manifest entry or a named omission carrying that target's text and why it did not
  resolve. There is no third outcome, and in particular no path where a target is read and then
  dropped without appearing in either list — which is what `resolveTarget` returning `null` does
  today. The count the brief reports is over targets, not over the subset it happened to
  understand.
  proof: over the same `docs/specs/*.md` corpus as c1, every `vitest` target appears in exactly one
  of the manifest entries or the omitted list, with the two counts summing to the corpus total.
  Record all three numbers.
  proof: vitest scripts/tasks/auditPrompt.test.ts

- [c3] Every reason the brief gives for an unresolved target names a form that would resolve. The
  present messages name what failed and never what would succeed, which leaves a reader who has
  just written a clause with no way to fix it without reading the parser. Each distinct failure the
  brief can report — including the unparseable case c2 adds — states the writable form for that
  case. The clause is over the set of reachable messages, not over a list of them: a failure state
  added later without a remedy sentence is a violation of this clause.
  proof: enumerate every string the brief can print for a target that did not produce an entry, by
  reading the code that produces them, and show each names a target form. Record the enumeration in
  the pass so a later reader can check it against the code's failure states.
  proof: vitest scripts/tasks/auditPrompt.test.ts

- [c4] A finding's title, deliverable and evidence are trimmed where they are assembled, so a
  whitespace-only value is refused by the same guard that refuses an absent one. The guard already
  tests truthiness and is correct; the value reaching it untrimmed is the defect, and the fix goes
  at the assignment and not at the guard. The property is that no required field of a finding can
  be satisfied by whitespace, by any route that assembles one.
  proof: vitest scripts/tasks/audit.test.ts

- [c5] An `--args-from` parse error names an action its reader can take. A value line before any
  flag is reported today with a true and unactionable sentence; the reader has just written a whole
  pass file and cannot tell from the message that the slug belongs on the command line. Where the
  offending line is a bare spec slug — the one value a reader plausibly puts there that is not a
  flag — the message says so. Naming the likely cause is the clause; the slug is the instance that
  motivates it.
  proof: vitest scripts/tasks/audit.test.ts

## Goal

Stop the brief from making an auditor rebuild the join it already has the inputs for, and make
every input it declines to use say so out loud.

## Decisions

- No new capability is registered. `proof target resolution` is already registered to the Task
  system over `scripts/tasks/auditPrompt.ts` and produced by `targets-resolve-across-files`; making
  it resolve a second target form extends that concept rather than adding one. A second concept
  named for the manifest would be a new name for the thing `generated auditor brief` and
  `proof target resolution` already divide between them.

- The write grant is widened from `auditPrompt.ts` to include `scripts/tasks/audit.ts` and
  `scripts/tasks/audit.test.ts`. c4 and c5 are folded records whose fix sites were recorded as
  `audit.ts` before `audit-splits-at-its-seam` drew the seam, and both stayed on the filing side of
  it: the untrimmed assignment is `audit.ts:192`/`:207` and the parse error is `audit.ts:244`. The
  fold was correct and the grant was written against the pre-split file list. No other branch in
  this push writes `audit.ts`.

- c1 and c2 are two clauses rather than one because they fail independently. A resolver that
  handles file-only targets still discards every other unparseable form silently, and a brief that
  reports every omission is an improvement even for targets it will never resolve. Merging them
  would let a branch satisfy the visible half and leave the silent-drop path intact, which is the
  half that made the defect invisible for eight passes.

## Open questions

- Which surface forms of a target count as "names test files". At minimum a bare path and a
  space-separated list of paths, since `audit-splits-at-its-seam` c2 writes two paths in one
  target. Backtick-wrapped paths also appear in the corpus, because a spec is markdown and an
  author writes code spans. Survey `docs/specs/*.md` for the `proof:` lines that begin `vitest`,
  report the distinct shapes and their counts in the pass, and decide from the corpus rather than
  from a guess — a form appearing once may be a typo worth refusing loudly rather than a dialect
  worth parsing.

- Whether a file-only target that names a file with no tests is an omission or an empty success.
  Both are defensible: it resolved, and it produced nothing to run. Pick one and say why. The
  constraint from c2 is only that it cannot be silent.

- Whether the whole-corpus count c1 and c2 ask for should be produced by a script the branch
  leaves behind or by an ad-hoc read at pass time. `npm run inspect` exists for exactly the second
  and leaves no file; prefer it unless the count is something a later pass will want to re-run, in
  which case it is a test and belongs in the suite.
