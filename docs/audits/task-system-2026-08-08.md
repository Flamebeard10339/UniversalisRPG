# Task system — first whole-system sweep

Reviewed at `6895198` (`main`), 2026-08-08. Nine independent auditors over disjoint regions of
`scripts/tasks.ts`, `scripts/tasks/`, the eight task-workflow libs in `scripts/lib`, the two JSONL
stores, and the prose that governs them. Commissioned by the author's ruling of 2026-08-08, which
paused the task-system final push after phase 3.5.

Until this document, `docs/audits/systems.json` recorded `"lastAudit": null` for this system. Every
other system carries a SHA. This is the first sweep.

---

## 0. What this audit was told not to assume, and what the numbers say

The commissioning ruling names its own prior error: *"What the audit should NOT take as its premise:
that HIGHs are appearing faster than they close … The orchestrator reported 13 earlier from a grep
that counted wrapped output lines rather than records, and that wrong number is what the pause was
argued from."*

Counted directly from `docs/tasks.jsonl` at `6895198`:

| | count |
|---|---|
| live Task-system HIGH records | 8 |
| — of which `open task` (planned phase 4–6 work, not discoveries) | 4 |
| — of which `unreviewed finding` (actual discoveries) | 4 |
| live HIGH across all six other systems combined | 22 |

**The premise does not hold.** HIGH findings are not accumulating on this system faster than they
close, and half of what looks like a HIGH backlog is the plan for the work that was paused.

The real signal is different, and worse.

---

## 1. The measurement that reframes everything

| corpus | lines |
|---|---|
| `src/**` non-test — **the game** | 7,101 |
| `src/**` including tests | 15,473 |
| Task system non-test | **8,478** |
| Task system including tests | **19,728** |
| `docs/**` + `.planning/**` markdown — process prose | 27,953 |

The tool that manages the work is 19% larger than the work, in source, and 27% larger counting
tests. The prose about the process is larger than both.

Three corroborating counts:

- **Registered concepts.** Task system: 22. Every other system combined: 21.
  (DSL load path 6, Testing procedure 6, Contribution system 5, Runtime 4, UI 0, Build 0.)
- **Store share.** 254 of 792 records ever filed (32.1%) name the Task system; 54 of 171 live
  records (31.6%). A third of everything this project has ever tracked is the tracker.
- **Merge cadence.** 21 of the last 25 merge commits on `main` are task-system work.

The author's v3 notes ask for a counter that fires when a capability has needed 5+ rounds of work,
so it can be rethought instead of patched again. Applied to the task system as a whole, that
counter fired some time ago. §3 computes it per capability.

---

## 2. What the tool is for, and whether it delivers it

The system is not a failure and this audit does not read as one. Three things it does are load-bearing
and have no cheaper substitute:

- **Generated briefs.** `work-prompt` / `audit-prompt` / `plan-prompt` replaced hand-written ones
  after "three sessions proved instruction does not survive context pressure: agents told about
  `audit-prompt` still fabricated briefs." The delegation log attributes the second half's quality
  jump — workers refusing bad prescriptions, catching planner errors, disclosing scope corrections —
  to briefs that invite refusal, not to a better model.
- **The event log.** 2,247 events carrying who, when, branch, head and what changed. It is the only
  artifact in the repository that reliably answers "why is it like this", and it was cut once and
  reinstated when the measurement justifying the cut was shown wrong.
- **Audits themselves.** The delegation record's own arithmetic: a fix round cost ~1.07M subagent
  tokens and produced a branch that was still not mergeable; two audit rounds cost ~1.18M and
  produced the finding that the real defect was structural. *"The audits were the better spend."*

What the tool does **not** deliver is the thing it was widened to deliver on 2026-08-02: safe
parallel work. That is §4.

---

## 3. Recurrence — the counter, computed retrospectively

| capability | rounds | status |
|---|---|---|
| **Which spec does this branch own** (`resolveActiveSpec`, `authoredAsPlan`, `specToGrade`, `decideSpec`) | **6** | Deleted rather than patched a seventh time — and the branch that deleted it shipped a live deadlock (§4.2). |
| **The generated audit brief / mutation manifest** | **5** | "Fixed" by `brief-builds-the-manifest`; the newest failure mode (684-entry manifests) is quantitatively worse than the first (blank ones). |
| **Clause standing across audit passes** | **5** | Believed closed; a further independent copy of the "latest pass only" bug surfaced twice after the fix. |
| **Write-grant / dispatch-collision detection (`tasks plan`)** | **4, unresolved** | Never redesigned. The last round *avoided* it — three members serialised onto one branch rather than dispatched in parallel. |
| `scripts/tasks/mergeReady.ts` as a file | **6+ branches** | Not a capability — the single site every other recurring class lands on. |

The pattern the history makes precise: after `task-system-refactor` (2026-08-03) the tool stopped
being redesigned and started being re-patched in the same four places, and **each fix's own audit
found the next narrower bug in the same mechanism.**

The one move that has consistently worked here is **deletion**. Every retirement in the log follows
one shape — build a mechanism, discover under real multi-agent load that its premise does not hold
in this repository, and cut it rather than harden it: the merge gate, the deliverable freeze,
verdict-to-clause-hash binding, `spec amend`, `check`'s hard failures, the `--planning` flag that was
never built, the second mechanism proposed to cross-check the first spec inference, the worktree
repair machinery. The single reinstatement — the event log, cut on a bad `git log -S` measurement
and restored once redone — is the exception that shows the process self-corrects.

---

## 4. The diagnosis, corrected

The commissioning ruling names two structural failures. The first one is **not what it was thought
to be**, and the correction matters because it changes what to build.

### 4.1 `tasks plan` is not structurally blind. The record it read was false.

The ruling states: *"`tasks plan` graded the phase 3 set 'no overlap, no unstated dependency'
immediately before two of those branches collided in five shared files, because `plan` reads
forecast paths and cannot know what a fix will need."*

Reproduced against the three branches' actual common ancestor, `fbf475f`:

```
plan: 3 task(s), 3 with a write grant this check can read, 3 of those a commitment
no overlap, no unstated dependency, no duplicated interface.
```

All three Phase 3 grants were **`commitment`**, not `forecast`, at the planning commit `8c12842`.
The forecast/commitment softening — the mechanism the ruling blames — never engaged. `weigh` would
have returned `defect` for any overlap it saw. It saw none because none was declared:

| task | declared at dispatch | actually wrote |
|---|---|---|
| `dropped-and-failed-clauses-differ` | 4 files (`specDoc.ts`, `specCmds.ts`, + tests) | 20 — **10% recall** |
| `a-move-never-strands-a-question` | 4 files (`records.ts`, `triage.ts`, + tests) | — |

All five colliding files were among the 18 that `dropped-and-failed-clauses-differ` added *after*
dispatch. Re-run today against the corrected grants, the same command prints the collision exactly:
`[defect] … both write scripts/tasks/commands.ts, records.test.ts, records.ts, triage.test.ts,
triage.ts`.

**So `plan`'s predicates are correct and its inputs are not.** The real defects are three, and each
is small:

1. **`--grant commitment` is settable at `add`, on a record nobody has started.**
   `resolveGrant` (`scripts/tasks/records.ts:78`) honours the flag unconditionally and cannot tell
   `add` from `edit`. The one field whose entire job is to say "someone has read this region" is
   settable by the party it exists to distrust. All three Phase 3 records were born `commitment` at
   the planning commit.
2. **`plan` fires once, at the moment its input is least accurate** — before dispatch, when the
   grant is a planner's guess. Measured grant accuracy at that moment across this push is 10–50%.
   The corrected grant arrives *during* the run, and nothing re-grades it.
3. **Nothing ever compares a grant to the diff that was actually produced.** Verified directly:
   `task.grant` is read at exactly five non-test sites — `planCheck` (to soften its own report),
   `render` and `workPrompt` (to display it), `checkStore` (one warning about an empty grant), and
   `records.ts:97` (to print a reminder). Neither `tasks start`, nor `tasks done --commit`, nor
   `merge-ready` compares `writes` against the commit. The workflow asks a human to do this by hand:
   *"If the diff diverges from the grant, correct the record and say so in the commit body."*

That is the whole of the seven-out-of-seven story. It is not a check that cannot work. It is a
promise with no observation point, graded at the one moment nobody could have kept it.

### 4.2 "These two files must agree" — the data exists and the render discards it

The deadlock: `a8fd3e6` deleted the inference inside `resolveActiveSpec` and left
`auditPrompt.ts:568` still calling it. `merge-ready` blocked on a clause only `audit-prompt` could
clear; `audit-prompt` declared the diff foreign and refused to write the manifest.

`tsc` could not catch it and neither could a deleted-export detector: `resolveActiveSpec`'s
signature at `context.ts:219` is unchanged. Only the body narrowed. **The break is behavioural with
no type surface.**

But the repository already computes what would have shown it. `architecture.ts` walks every import
edge in the tree. Run today:

```
$ npm run tasks -- where scripts/tasks/context.ts
  imports across a system boundary:
    scripts/lib/git.ts (Testing procedure)
    scripts/lib/systems.ts (Testing procedure)
```

Fifteen files in the tree import `context.ts`. `tasks where` prints **none** of them, because
`regionView.importedBy` (`scripts/lib/architecture.ts:244`) filters callers down to *cross-system*
ones — and every file in the task system is in one system. The one query designed to answer "what
else touches this" is blind precisely inside a directory, which is the only place a same-directory
sibling caller can live.

The fix is to delete one filter clause and label cross-boundary callers instead of filtering to
them. The branch's own hand-survey of `resolveActiveSpec`'s seven callers *did* enumerate
`auditPrompt.ts` — and classified it "informational WARNING/no-op, never a write, never a pass
filer." That classification was wrong: the WARNING gated whether the manifest and pass file were
written at all. **The survey was done, by hand, correctly enumerated, and wrong in the direction of
harmless — and nothing checks a survey.**

### 4.3 The unifying shape: ten relations that must agree, one that is enforced

`CLAUDE.md` states the rule: *"Do not create systems that are required to be manually kept in
sync."* Every failure in this audit is an instance of breaking it.

| # | must agree | enforced by |
|---|---|---|
| 1 | `docs/workflow.md` ↔ the CLI's behaviour | nothing — the doc asserts a disagreement "is a defect in one of them" |
| 2 | a lesson's prose ↔ the command it names | nothing — `worker/file-findings` teaches `tasks add --kind finding` without `--fault`, which the command now refuses |
| 3 | `CLAUDE.md` ↔ its own tested source | nothing — **and it has already drifted** (§4.4) |
| 4 | a record's `system` ↔ the system owning its `writes` | nothing — the Phase-6 invisibility |
| 5 | a record's `writes` ↔ the diff it produced | nothing — §4.1 |
| 6 | a spec's `- [cN]` lines ↔ records' `clause`/`discharges` | reconciled at 2 of 9 call sites (§5.1) |
| 7 | `produces` forecasts ↔ registered `concepts` | nothing — **86 of 104 (83%) distinct claims never registered** |
| 8 | two source files that must agree | nothing — §4.2 |
| 9 | `AGENTS.md` ↔ the source tree | nothing — it still names `src/game/contentDsl/`, deleted |
| 10 | `docs/specs/*.md` ↔ the store | nothing, and it cannot shrink (§5.4) |

`npm run layer-check` is the counter-example that proves the point. It *is* a two-artifact
agreement check — imports against layer order — it is cheap, it runs in CI, it has never been the
subject of a finding, and nobody complains about it. The repository knows how to build these. It
has built exactly one.

### 4.4 The exhibit

`CLAUDE.md:26`, under "Wisdom that reduces audit issues":

> Enforce where a value is assembled, not where it is **written**

`scripts/tasks/briefLessons.ts:85`, the `planner/guard-placement` lesson printed live into every
planner's brief and pinned verbatim by `planPrompt.test.ts:106`:

> Enforce where a value is assembled, not where it is **read**.

The tested copy states the lesson. The hand-copied one in the repository's own governing document
is nearly a tautology — "assembled" and "written" are the same moment — and says nothing. One
sentence, two homes, no link, and the copy that governs every agent is the one that drifted.

---

## 5. Findings

Filed under the `## H1` / `## M2` / `## L3` convention `tasks import` reads. Ordered so that the
first four retire the most of the rest. Every finding below was reproduced unless it says
`unconfirmed`.

Findings that only **confirm an already-open record** are listed in §5.9 and are deliberately not
re-filed — the store already carries them, and the duplicate pile is itself one of this audit's
findings.

## H1 — The store is rewritten whole with no lock, so a concurrent write loses records and a concurrent read answers short

`saveStore` (`scripts/lib/taskStore.ts:481`) is `writeFileSync` over the entire 1.4 MB file. Every
write verb is `loadStore` → mutate → `saveStore`: no lock, no compare-and-swap, no staging file, no
re-read.

**Lost writes.** Eight concurrent `tasks add` against a copy of the live store: eight `added …`
lines, zero errors, eight `add` events in `docs/events.jsonl`, **three records on disk**, and
`doctor` reports 0 errors. Independently reproduced at three writers: three successes, one record.
Staggering shows the window — 0 s offset loses records, 0.2 s offset does not — so the hazard is
precisely "writers dispatched together", which is what an orchestrator does.

**Torn reads — and this is the mechanism behind the reported symptom.** `writeFileSync` truncates
and then streams; a reader inside that window sees a *prefix*. When the prefix ends on a newline
every line in it is valid, so `parseStoreTolerantly` — which `readStore` uses for every read
command — has nothing to report. Measured with two writers and one reader loop:
`reads 1826, reads answering short 1825, short reads with no skip message at all 803,
fewest records seen 0`. Write window p50 2.89 ms / max 9.95 ms against a 3.40 ms read.

That is a store that is short, self-consistent, silent, and exit-0 — which is exactly
*"agents are constantly reading the store and discovering stale or incomplete information."*
The symptom is not stale records. It is a truncated file.

`docs/workflow.md:135-140` states the write hazard in prose and tells humans to serialise filing by
hand. It understates it in two ways: it does not mention reads at all, and **nothing detects the
loss afterwards** — `doctor` never opens the event log, so the one witness that kept all eight
records is never asked. Reconciling the two live files directly finds 4 ids the log knows and the
store does not.

**Fix, in order of cost.** Ten lines in one function: write to `.tmp` and `rename` (atomic, ends the
torn read), and re-read-and-compare before writing (ends the lost write). No caller changes. This
retires H8's persistence, M6, the manual serialisation rule, and the reason §6.1 exists.

## H2 — A write grant is a promise with no observation point, and it is graded at the one moment nobody could have kept it

Three separate defects, one mechanism. See §4.1 for the full reproduction.

1. `resolveGrant` (`scripts/tasks/records.ts:78`) honours `--grant commitment` unconditionally and
   cannot tell `add` from `edit`, so a planner can record a commitment on a region nobody has read.
   All three Phase 3 records were born `commitment` at planning commit `8c12842`.
2. `checkPlan` runs once, before dispatch, when the grant's measured accuracy is 10–50%. The
   corrected grant arrives during the run and nothing re-grades it. `tasks edit --writes` already
   calls `reportPriorArtOnWrites`, which *did* name the collider — as line 59 of 233 lines of
   untagged prior art.
3. `task.grant` is read at five non-test sites and `writes` is compared to a real diff at none.
   Neither `tasks start`, nor `tasks done --commit`, nor `merge-ready` ever asks whether the branch
   wrote what it promised.

**Fix.** Refuse `--grant commitment` on a record that has never been started. Call `checkPlan` from
inside `reportPriorArtOnWrites` and print defects *above* the prior-art wall, so the check fires at
the moment the record becomes true. And have `tasks done --commit <rev>` report grant-versus-diff:
it has both in hand, the workflow already asks a human to do it by eye, and recording the delta is
also the only cheap answer to §6.8.

## H3 — `tasks where` discards same-system callers, so the one query that could show a sibling caller is blind exactly where siblings live

`regionView.importedBy` (`scripts/lib/architecture.ts:244`) filters callers down to cross-system
ones. Fifteen files in the tree import `scripts/tasks/context.ts`; `tasks where
scripts/tasks/context.ts` prints none of them — including `scripts/tasks/auditPrompt.ts:568`, the
exact call site left behind when `a8fd3e6` narrowed `resolveActiveSpec`'s body, which produced the
`merge-ready` / `audit-prompt` deadlock.

`tsc` cannot catch this class and neither could a deleted-export detector: the signature at
`scripts/tasks/context.ts:219` is unchanged. Only the body narrowed. The break is behavioural with
no type surface, which is why the branch's own by-hand survey of all seven callers enumerated
`auditPrompt.ts` and classified it "informational WARNING/no-op, never a write, never a pass
filer" — a classification that was wrong, in the direction of harmless, and that nothing checks.

**Fix.** Delete the `byPath.get(to)?.system !== candidate.system` clause and label cross-boundary
callers instead of filtering to them. One clause.

## H4 — A record's `system` is never checked against the system that owns its own paths

`--system` is validated only against the list of names in `docs/audits/systems.json`
(`scripts/tasks/context.ts:339-347`). `ownerOf` (`scripts/lib/systems.ts:172-181`) is a pure
function over the already-loaded manifest that resolves a path to its owning system, and is already
used for the reverse direction by `tasks where` — and never for this.

Reproduced: `tasks add … --system "Testing procedure" --writes scripts/lib/taskStore.ts` succeeds
with **zero warning**, while printing 33 lines of prior art on that file, nearly all of it filed
under "Task system".

Surveyed over the live store: of 146 open records carrying both a system and at least one path,
**8 are clean, unambiguous mis-filings** — every path resolving to one system, and not the declared
one. Four of the eight are task-system tooling records filed as "Testing procedure", which is the
same failure as the flagship case:

`every-system-owns-its-files-by-name` — the record whose deliverable is *"stamp the freeze SHA onto
the Task system entry"* — is filed `Testing procedure` / `medium`, and is confirmed absent from
`tasks list --system "Task system" --severity high`. It is also `kind: task`, so `roadmap`'s
"FINDINGS — could redden an audit" section would never show it either.

The previous orchestrator diagnosed this exactly, in a `note` event attached to that very record,
and the record's fields were never corrected. **A correct diagnosis recorded next to the defect it
describes is not a fix.** That is the clearest single argument in this audit for enforcing rather
than narrating.

**Fix.** One warning-level comparison — `task.system` against
`ownerOf` over `writes ∪ files` — added either to `reportPriorArtOnWrites` (stops new ones at
authorship) or to `checkStore` (catches the eight already filed). Both is better. A warning, never
a refusal: some records legitimately span systems.

## H5 — `clauseStandings` is reconciled against the store at two of nine call sites

`clauseStandings` (`scripts/lib/specDoc.ts:286`) takes the *document's current* clause list and
returns verdicts only for ids still in it. Two callers — `scripts/tasks/mergeReady.ts:337-342` and
`scripts/tasks/records.ts:794` — separately rebuild the clause-id set from the store's own
`discharges`/`clause` fields and fall back to `unknown`. The other seven, including the
human-facing `tasks spec show`, do not.

Reproduced twice in a scratch fixture:

- **Deletion.** Removing a graded clause's bullet from the markdown makes `tasks spec show` print
  `clause standing (composed over 1 pass(es)): no clause outstanding` two lines above a member list
  still showing that clause's task as `[undelivered/open/high]`. `doctor` reports 0 errors.
- **Rewording.** Rewriting a clause's text while keeping its `[c1]` tag silently reattaches the old
  verdict to the new text, while the undelivered record keeps the original snapshot. Two live,
  disagreeing statements of what clause 1 is.

**Fix.** Make `clauseStandings` take the store's clause ids as a required input, the way
`mergeReady.specStanding` already had to invent for itself. Closes all seven sites in one change.

## H6 — `--args-from` classifies a line by its prefix rather than by parser position, so an audit files silently corrupted evidence

`parseAuditFile` (`scripts/tasks/audit.ts:240-259`) drops every blank and `#`-prefixed line
unconditionally (`:245`) and treats every `--`-prefixed line as a new flag unconditionally (`:246`),
whether or not a value is currently open. `AUDIT_USAGE` documents the rule as "any unprefixed line
continuing the value above it" and mentions neither carve-out.

Reproduced twice, both exiting 0 with a success message:

- A `#4521 for background…` line mid-evidence is **silently deleted** from the filed record.
- A `--file 3=src/example.ts:10 and confirm the crash` line mid-evidence truncates the evidence and
  lands its tail in `files[]` as a bogus reference with an embedded newline.

This is the silent sibling of the already-open `task-system-refactor-pass2-b-l1` (an `--evidence`
beginning `<digits>=` is captured as clause evidence). That one refuses loudly; these two file
successfully with corrupted data. `--args-from` is the **one filing route for a branch audit**, so
this is the mechanism by which an audit's findings get quietly lost.

**Fix.** Track parser position: only classify a line as a flag-opener at top level. One change
retires all three manifestations.

## H7 — 104 of 792 records share a `seq`, and `seq` is the sole tie-break in every queue

Measured on the shipped store: 792 records, 727 distinct `seq`, **39 colliding values across 104
records**. `nextSeq` (`scripts/lib/taskStore.ts:491`) is max+1 over what one branch can see, so two
branches produce the same number.

`seqRank` is the only tie-break in all four queues. Reversing the input array diverges `listQueue`
at index 17 of 171 and `unreviewedQueue` — the queue `tasks triage` walks — at index 9 of 27.

`scripts/lib/orderIndependence.test.ts` exists to forbid exactly this and passes, because its
fixture gives every record a distinct `seq` — a precondition its own header states at line 9 and
the live data violates 104 times. The comment at `scripts/lib/taskStore.ts:493` calling collisions
"harmless, because `seq` orders a queue and does not identify a record" is false: ordering a queue
is the entire job it has, and `:519`'s "oldest first" is actually id-alphabetical for those 104.

**Fix.** Either make the tie-break total (`seq`, then id) — two lines, and it makes the existing
test's property true of the live data — or take `seq`'s job back to the event log's own append
order under §6.1.

## H8 — A duplicate id answers two different ways inside one command

`resolveIds.ts:21` uses `Array.find` (first match); `scripts/lib/taskStore.ts:572` builds
`new Map(pairs)` (last match). Reproduced with one id present twice: `tasks show zz-dup-dep` prints
`[task/done]` while `tasks show zz-waiter` prints `requires: zz-dup-dep (waiting)` — two answers,
one store read. `tasks edit` reaches only the first copy and `saveStore` writes both back forever.
`doctor` reports `[error] duplicate id` and **exits 0**.

`.gitattributes:14-16` justifies excluding the store from `merge=union` on the stated grounds that
"every read answers from the first copy forever". Every `byId` read answers from the last. The
reasoning that shaped a merge strategy is wrong about the behaviour it was reasoning about.

There are zero duplicate ids in the store today; this is a latent hazard, not a live one.

## H9 — `CLAUDE.md`'s own wisdom line has drifted from the tested source it was copied from

`CLAUDE.md:26` — *"Enforce where a value is assembled, not where it is **written**"*.
`scripts/tasks/briefLessons.ts:85`, printed into every planner brief and pinned verbatim by
`scripts/tasks/planPrompt.test.ts:106` — *"Enforce where a value is assembled, not where it is
**read**."*

"Assembled" and "written" are the same moment, so the governing document's copy states nothing. The
tested copy states the lesson. See §4.3 for the nine other relations of this shape and §4.4 for why
this one is the exhibit.

## H10 — `merge-ready` discards the lines it could not parse, changing what the branch is graded on

`scripts/tasks/mergeReady.ts:279` — `return parseStoreTolerantly(text, …).tasks;` — is the only
tolerant-parse call site in the tree that throws away `skipped`. `context.ts` buffers it; `doctor.ts`
sets an exit code on it.

A skipped line on the **base** side makes `baseById.get(id)` undefined, so the record reads as
added-by-this-branch and its spec enters `declaredSpecs`. A skipped line on the **current** side
removes a spec from what the branch is graded on. `docs/workflow.md:93-94` promises the gate
*"fails loudly rather than reading that as 'declares nothing' — the gate never guesses"*;
`readable: false` covers only a wholly unreadable file, not a per-line skip.

Code path exact; behavioural half **unconfirmed** — running `merge-ready` was forbidden during this
concurrent sweep.

## H11 — The git seam destroys the reason for every failure, and four call sites turn "git could not answer" into a positive claim

`scripts/lib/git.ts` is a disciplined seam: fifteen facts, every one nullable, twenty-five tests
pinning what "git said no" looks like — unborn HEAD, no merge base, unreachable rev, buffer
overflow. The layer above spends that discipline. `raw()` (`scripts/lib/git.ts:38-42`) sets
`stdio[2] = 'ignore'` and discards the exit code, so **fifteen distinguishable failures arrive as
one indistinguishable `null`**, and four of the twenty-two call sites coalesce that `null` into a
benign default (`?? []`, `|| '(none)'`).

Consequence: `merge-ready` can print `tree ok — pass, nothing uncommitted` and "the base has not
moved" in a directory where git cannot answer at all.

The same shape repeats as bare `catch { return null }` — **15 swallowed catches across 9 files** in
the non-test region. In every one the reason exists for exactly one stack frame and is then
destroyed. **No subprocess in the region sets a timeout, anywhere.**

This is the direct answer to *"the system fails to reliably log its own errors."* It does not fail
to log them. It destroys them at the seam, one frame after they are known, and then answers
confidently from the default.

## H12 — Flag arity is parsed out of documentation prose, so two commands accept a flag they do not have

`flagArities` (`scripts/tasks/cli.ts:27`) is a regexp over the usage *string*, and this repository's
usage strings carry rich explanatory parentheticals. The guard against prose applies only to the
token *after* a flag, never to the flag token itself — so any `--word` named inside a parenthetical
enters the accepted vocabulary with an arity read off the next English word.

Reproduced:

```
$ npm run tasks -- list --trigger "some condition"
… entire unfiltered list …                                              exit 0
$ npm run tasks -- list --nonsense foo
error: unknown flag: --nonsense
  `list` takes: --state, --severity, --system, --spec, --kind, --deferred, --unspecced, --triggered, --trigger
```

`--trigger` belongs to `decline`, not `list`. The value is silently discarded **and the refusal path
advertises the flag by name.** Same for `tasks decision "…" --op note`. A sweep over all 41
registered verbs finds exactly `list: [trigger]` and `decision: [op]`.

`scripts/tasks/context.ts:9-11` and `scripts/tasks/commands.ts:203` both promise *"a flag not named
there is an error, never a silent no-op."* A declared arity table beside each usage string — one
line per command — makes both promises true and makes `reportUnknownFlags` exact rather than
prose-derived.

## H13 — A repeated flag silently keeps the last value

`scripts/tasks/cli.ts:90` — `flags[key] = value` into a `Record<string, string>`. There is nowhere
for a second value to go and nothing notices one arriving.

```
$ npm run tasks -- list --state open --state declined
222 task(s) — … declined: 222
$ npm run tasks -- list --state declined
222 task(s) — … declined: 222
```

Identical, exit 0, no message on either stream. An agent writing `--state open --state in-progress`
to mean a union gets a plausible, complete-looking, wrong list. Same class as H12: one rule — *every
argument the parser accepts must reach the command body, or be an error* — closes both.

## H14 — `doctor` classifies nine conditions as `error` and exits 0 on every one of them

`scripts/tasks/doctor.ts:97-101` is the only non-zero path and it fires on unparseable lines alone.
But `checkStore` (`scripts/lib/taskStore.ts:785-819`) does not classify along malformed-versus-
semantic; it classifies `error` versus `warning`, and its `error` set is dominated by **broken
references**: a system name not in `systems.json`, a spec with no file, a `requires` naming nothing,
a duplicate id, a dependency cycle.

Those are not disagreements about the work. They are the store having drifted out of sync with the
tree — precisely the staleness class this audit exists over. Every one is reported and none fails
anything. The behaviour is pinned by its own test (`scripts/tasks/doctor.test.ts:10-23`), which
asserts `status === 0` alongside `[error] a has a system not in systems.json: Nonexistent`.

A record filed under a system name that does not exist is invisible to every `--system` query —
which is the reported visibility failure with the field left blank instead of wrong. Making the
*reference* errors fail (and leaving the semantic warnings reporting) would make the CI leg the
first automated check in the repository that a record still points at something real.

## H15 — `tasks log` reports "no events recorded yet" over a log whose every line failed to parse

`scripts/tasks/handoff.ts:85` branches on `events.length` alone. Its own comment two lines above
argues that an empty log and a filter matching nothing are different answers — and then collapses a
third case, *the log exists and none of it parsed*, into the second.

```
$ printf 'not json\n' > <scratch>/events.jsonl
$ npm run tasks -- log --store <scratch>/tasks.jsonl
no events recorded yet in …\events.jsonl
skipped 1 unreadable event line(s) — everything above is the rest of the log: …
exit=0
```

The store draws this three-way distinction correctly at `scripts/tasks/context.ts:161-173`. One call
site catching up with a pattern the region already has.

## H16 — `merge-ready`'s `tree` leg is red at exactly the moment the gate is meant to run

`scripts/tasks/mergeReady.ts:155-160` fails on any dirty path — which is the state the documented
merge procedure guarantees, since the gate is run before committing. The comment three lines above
(`:149-151`) denies that the leg fails at all. Its own test asserts that it does.

A leg that is red by construction trains every reader to discount the gate's output, which is the
one output that is supposed to be read literally.

## M1 — `tasks plan`'s duplicate-capability check can fire on 0.6% of the pairs it is meant to catch

`checkPlan` (`scripts/lib/planCheck.ts:164`) matches producer names at `exact` and `contains`
strength and skips `word`. Over the live store: 129 distinct producer names, `exact: 0`,
`contains: 1`, `word: 159`. So the check fires on 1 of 160 related pairs. `"write grant"` versus the
registered `"writes grant"` grades `word` and is skipped.

Compounding it: **86 of 104 distinct `produces` claims (83%) were never registered as a concept**,
so the vocabulary the query reads is mostly unpromoted forecasts. `scripts/lib/producers.ts:91-95`
already prescribes the fix in its own comment — path is the primary index, name secondary — and
`checkPlan` uses only the name.

## M2 — An unknown enum *value* deletes a record from every read, while an unknown *field* is preserved

Forward compatibility is asymmetric (`scripts/lib/taskStore.ts:215`): `extra` preserves an unknown
field, but an unknown value in `state`/`kind`/`severity`/`grant`/`fault`/`decider`/`departure`
throws, and the tolerant reader drops the whole record. Reproduced: `tasks show
aaa-newer-branch-state` answers **"no such task"** with a did-you-mean list and exit 0, disclosing
the real cause eight lines below the wrong answer.

This is the cross-branch case: a branch that adds a vocabulary value makes its records invisible to
every older checkout rather than merely unrecognised. The write half is correct (`add` exits 1,
`doctor` exits 1).

## M3 — `tasks next` accepts flag values that `tasks list` refuses, and then blames the wrong thing

`scripts/tasks/records.ts:616` casts `args.flags.severity as Severity | undefined` with no
validation. `tasks next --severity HIGH` answers "no open, unblocked tasks in spec X" and exits 0;
`tasks list --severity HIGH` refuses. The same gap on `--system` makes `tasks list --system "Task
System"` (wrong case) print 0 records and then blame **branch scoping** — a confidently wrong
diagnosis of a typo, and the same visibility class as H4.

## M4 — The collision is printed, untagged, as line 59 of 233

`reportPriorArtOnWrites` (`scripts/tasks/architectureCmds.ts:208`) fires automatically on every
`--writes` edit and did name the Phase 3 collider — buried in an undifferentiated wall.
`tasks where scripts/tasks/` is **711 lines carrying 104 rulings**, and that directory-level query
is what `plan-prompt` runs at workflow step 1. The step designed to prevent re-litigation is
guaranteed to be skimmed. `collapseClosed` already exists for this and has exactly one caller;
`printWhere` is not it.

## M5 — `Testing procedure` declares `scripts/lib` whole, which manufactures 22 of the 34 shared-file lines

`audit-status`'s shared-file report is 34 lines. Twelve are the deliberate, documented `src/content`
double coverage. **Twenty-two come from one entry**: `Testing procedure` declaring the directory
`scripts/lib` among seventeen otherwise file-level paths, while `Task system` declares specific
files inside it. `systems.json`'s own note already confesses this as an open L4.

This is also the likely mechanism behind H4's four "Testing procedure" mis-filings: a human picking
`--system` by eye sees `scripts/lib` under Testing procedure and picks wrong. Fixing one line takes
the report from wallpaper to signal.

## M6 — `tasks audit` derives its pass number from a read and then rewrites the spec file

`scripts/tasks/audit.ts:487` computes `passNumber = doc.auditPasses.length + 1` from a read, then
`writeFileSync`s the spec file — H1's defect one file over. Clause standings compose over recorded
passes, so a lost pass silently reverts verdicts. `cmdAudit` also makes three sequential
non-atomic writes (store, spec file, event log). **Unconfirmed** — reproducing it needs two real
audit filings, which this sweep was not permitted to make.

## M7 — The skipped-line footer is not on every exit path, and counts reads rather than lines

`scripts/tasks/commands.ts:279` uses `.finally` on the async branch and has no `try/finally` on the
sync one, so a synchronous throw skips the disclosure entirely (structural absence exact,
reachability unconfirmed). The buffer also accumulates per `readStore` *call*, so `spec show`,
which reads twice, reports one bad line as "skipped 2 unparseable store line(s)". Every read over a
partial store exits 0 with the disclosure printed *after* the answer.

## M8 — A spec cannot retire, so `docs/specs/` can only grow

34 of 59 spec files (58%) are fully historical. `checkStore` (`scripts/lib/taskStore.ts:808`)
requires every closed record's non-null `spec` to name a live file forever, because `departFromSpec`
clears `spec` only on departure and never on ordinary close. Deleting the 34 would strand **336
closed records** as 336 `doctor` errors, 55 of which also carry `--discharges`. `spec remove` — the
one command that could detach them — refuses once the file is gone.

Extends the already-open `stranded-spec-members-have-no-repair` with the count and the reason.

## M9 — `AGENTS.md` describes a directory that no longer exists

`AGENTS.md:18-19` says content is parsed by `src/game/contentDsl/`. `src/game` does not exist.
`CLAUDE.md:38` correctly names `src/grammar` + `src/content`. Two agent-facing files, one subsystem,
nothing moving them together.

## M10 — `docs/workflow.md`'s fuzzy-id list is incomplete in the direction that matters

`docs/workflow.md:13-15` names `show/edit/start/stop/done/decline/promote` as the verbs accepting a
prefix or substring and says "everywhere else … an id is exact." `resolveTaskIds` is also called
from `cmdDefer`, `cmdRetriage`, `cmdRedirect`, `cmdAsk` and `cmdQuestion`'s `--blocks`. The
`spec add`/`remove` half of the claim is correct. No functional risk — ambiguity still refuses —
but the doc that claims to be kept current is not.

## M11 — The same protocol sentences are hand-authored in `docs/workflow.md` and in the brief templates

Roughly 450–500 words of behavioural assertion exist as independent prose in `docs/workflow.md` and
in one to four of `planPrompt.ts` / `orchestratePrompt.ts` / `workPrompt.ts` / `commands.ts`'s usage
strings — `docs/workflow.md:48-49` and `scripts/tasks/planPrompt.ts:70` share a word-for-word
sentence about `tasks plan`. All copies currently agree. H9 is the proof that this structure drifts
silently, and the merge-ready leg list is hand-copied in five places.

## M12 — `--writes "a b"` is accepted as one malformed path, and is then invisible to the check built to catch it

`splitList` (`scripts/tasks/context.ts:258`) splits on comma only, with no validation that a
resulting path is real or singular. Two `done` records literally carry
`writes: ["scripts/migrate-saves.ts scripts/migrate-saves.test.ts"]` — a space where a comma was
meant. `pathsOverlap`'s prefix-containment check (`scripts/lib/systems.ts:61`) cannot match that
string against either real path, so a grant typed this way declares nothing `tasks plan` can grade,
while looking populated.

Same class as H2: a grant that is false while appearing complete. Validating each path against the
tree at `--writes` time — the tree is already loaded there for `reportPriorArtOnWrites` — closes it.

## M13 — Nearly half of all recorded history is anonymous

1,055 of 2,247 events (**47.0%**) carry `by: null`, the silent default when `--actor` is omitted
(`scripts/tasks/context.ts:39`). No verb requires it. `tasks log` is the artifact this repository
leans on hardest for "why is it like this", and half of it cannot say who.

Cheap to fix: default the actor from an environment variable, or refuse a write verb without one.

## L1 — `work-prompt` re-asserts the grant kind as unconditional prose after printing it correctly

`printGrant` (`scripts/tasks/workPrompt.ts:54`) renders the actual grant; `printObligations`
(`:112`) then tells every worker its grant is a forecast, thirty lines later, regardless.

## L2 — The concept-overlap report prints case-folded keys as if they were paths

`scripts/lib/systems.ts:255-260` — `audit-status` reports `scripts/lib/specdoc.ts` and
`scripts/tasks/auditprompt.ts`, which name nothing on a case-sensitive filesystem.

## L3 — A never-swept system has no change volume to report

`scripts/audit-status.ts:65` derives "commits changed since last sweep" from `lastAudit`, so the one
system with `lastAudit: null` — the Task system, until this document — is the one the report says
nothing about.

## L4 — Nine verbs and the interactive triage walk each hand-roll the same wrapper

Nine of `records.ts`'s sixteen `cmdX` functions (`scripts/tasks/records.ts:712-1123`) repeat
resolve-ids → precheck → mutate → save → record-events → print, and `scripts/tasks/triage.ts:36-96`
carries a second independent copy of five of them. The domain logic underneath is genuinely shared
(`transition`, `writeAskedQuestion`, `pass2Promotion`); only the plumbing is duplicated. One
`applyRecordChange` parameterised by precheck/mutate closures would collapse ~280 lines to ~90 plus
a ~40-line helper, and would let the interactive forms call the same path as the batch verbs.

## L5 — No command answers "what is open about this file"

`tasks where <path>` prints prior art across every state with no `--state` filter; `tasks list`
filters by state/severity/system/spec/kind with no path filter. Nothing joins them — which
compounds H4, since `list --system <owner>` is unreliable when the `system` field itself may be
wrong.

## L6 — `check-commit-msg` is absent from the CLI's own root usage line

`scripts/tasks/commands.ts:20`'s hand-maintained `USAGE` constant omits a real, working verb. Every
other summary in that file is derived from the `COMMANDS` table; this one is not.

### 5.9 Confirmed, already filed — not re-filed

| existing record | what this sweep adds |
|---|---|
| `the-generated-mutation-manifest-expands-one-file-only-target` (unreviewed/high) | Quantified: `a-branch-is-told-which-spec-it-owes.md` generates **684** entries, `a-move-never-strands-a-question.md` 507, against 28 for a spec using quoted per-test targets. **0% usable** — every entry ships an unaimed sentinel. Hand-built replacements in 5+ consecutive passes at 10–30 min each. |
| `stranded-spec-members-have-no-repair` (open/medium) | Now quantified as M8: 34 files, 336 stranded records. Severity is understated. |
| `the-worker-and-auditor-lessons-still-say-tasks-add-kind-find` (unreviewed/medium) | Confirmed: 1 of 19 lessons names a drifted command. The other 18 are clean. |
| `triage-writes-state-directly-in-three-places-bypassing-trans` (open/low) | **Already fixed** by `2ed2f96`; the record is stale and should be closed. Its `files` field still names `scripts/tasks.ts`, now a 12-line shim. |
| `max-lesson-count-is-a-quota-of-the-shape-claude-md-retired-o` (unreviewed/medium) | **Refuted.** It is enforced (`auditPrompt.test.ts:1017-1021`) and it measures a flat count, not the gameable ratio the comment budget measured. Recommend declining. |
| `a-branch-is-told-which-spec-it-owes-pass1-tasks-plan-does-no` (unreviewed/high) | Confirmed live and correctly disclosed; the STOP note explaining that fixing it would redden CI is right. This is a clause amendment, not a defect fix. |
| `a-record-cannot-leave-the-store-unrecorded` (open/high) | Its reconciliation is the right mechanism, but it scopes itself to removal-by-drop and **excludes concurrency**. H1's four log-known/store-missing ids are in its blind spot. |

---

## 6. The v3 requirements, assessed against measurement

The author's notes in `.planning/.scratch.md` list seven requirements for the next iteration. Each
is answered here against what this sweep measured, not against the design's own merits.

### 6.1 "Concurrent agents without corrupting the store" — **confirmed, and worse than stated**

Reproduced directly. Three concurrent `npm run tasks -- add` against one store:

```
records before: 792
records after:  793   (expected 795)
probes that survived in the STORE:  race-probe-gamma
probes recorded in the EVENT LOG:   3
```

All three commands printed `added …` and exited 0. **Two records were lost with no error**, and the
store and the event log now disagree permanently with nothing able to detect it.

`saveStore` (`scripts/lib/taskStore.ts:481-485`) is a bare `writeFileSync` of the whole file — no
lock, no temp-file-and-rename, no compare-and-swap, not even a re-read before write. A reader can
also observe a truncated file mid-write. `docs/workflow.md` states the hazard in prose — *"Filing is
the one step that cannot be concurrent"* — and nothing enforces it. Nine agents ran in this worktree
during this audit; the only reason nothing was lost is that they were told not to write.

**The author's instinct is right and the measurement supports it in an unexpected way: the event log
survived all three writes.** `appendFileSync` with three concurrent appenders kept every record; the
whole-file rewrite kept one. That is the strongest argument for the v3 direction, and it is
empirical rather than theoretical.

But **the redesign is not the first move**, for three reasons:

1. **The cheap fix closes the loss today.** An advisory lock (or write-temp-then-rename with a
   re-read-and-retry on mtime change) around `saveStore` is tens of lines and ends silent data loss
   in every scenario above. It should land regardless of what happens to the store's shape.
2. **The cross-branch half is already largely solved and was measured.**
   `the-task-store-survives-parallel-branches` sorted the store by id; verified here — 792 records,
   zero out-of-order positions, every record carrying `seq`. Two branches editing different records
   already merge clean. The residual is *adjacent-line* changes, which is a much smaller problem
   than "three unmergeable rewrites."
3. **`merge=union` on an editable store has already been tried and rejected here, with a written
   reason** (`.gitattributes`): it silently produced a duplicate record under one id, clean exit,
   green CI — *"worse than the conflict it was configured to avoid."*

Point 3 is where the per-field `t` clause earns its keep: under an append-only log with last-write-
wins per field, a duplicate append is not a duplicate record, it is two events resolved by
timestamp. So the design does answer the objection that killed union merge. **And it dissolves a
manual-sync relation rather than adding one** — if the store is a projection of the log, the two
cannot disagree by construction, which retires the whole of the open spec
`a-record-cannot-leave-the-store-unrecorded` (whose deliverable is a reconciliation between them).

The cost is the "grep still works" clause. A projection that is committed is a derived artifact in
the tree, which is only safe if the tool rewrites it on every write and never asks a human to.
That is achievable — `saveStore` already rewrites the whole file every time — but it must be the
rule, not a convention.

**Recommendation.** Lock the write now. Take the event-log store as a deliberate later branch, and
take it whole: append-only, `merge=union`, per-field last-write-wins on `t`, and a projection the
tool regenerates on every command that writes. Do not take it as a patch to the current store.

### 6.2 "A single way to log an issue, with dedupe before filing" — **confirmed; already specced**

There are **ten channels** for "something we learned":

| channel | size | machine-readable | dedupes |
|---|---|---|---|
| `docs/tasks.jsonl` | 792 records / 1.41 MB | yes | no |
| `docs/events.jsonl` | 2,247 events / 907 KB | yes | no |
| `.planning/agent-feedback/tool-friction.md` | 1,660 lines, 47 session entries | no | no |
| `.planning/agent-feedback/audit-tooling-friction.md` | 26 lines — a scaffold with zero entries | no | — |
| `docs/audits/*.md` | 10,492 lines over 35 files | no | no |
| `docs/audits/systems.json` `note` fields | 12,605 chars of embedded audit prose | half | no |
| `docs/specs/*.md` `## Decisions` | 58 of 60 spec files | no | no |
| `docs/dsl-rewrite/delegation-experiments.md` | 437 lines | no | no |
| `postmortem.md` + `backlog-process-review.md` | 357 lines | no | no |
| commit bodies | ~every commit | no | no |

Nothing dedupes anywhere. `tasks import`'s key is `${basename}-${code}` — it detects re-importing
*one document twice* and cannot see across two documents describing one defect. The three
independent pass-2 audits of `task-system-refactor` each filed the same task-id-resolution gap;
`-a-m3`, `-b-m3` and `-c-m3` are all still open today.

The open HIGH `one-query-over-the-channel-and-the-second-place-retired` already specifies exactly
this — one query over the channel, `tool-friction.md` deleted, `audit.ts` step 8 stops telling
auditors to write prose into a markdown file. It is phase 4 of the paused push. **It is the right
design and it should be resumed.**

### 6.3 "Durable, automatic process lessons" — **confirmed gap, partly specced**

Every lesson in `briefLessons.ts` is hand-authored into one of four `const` arrays. There is no
`tasks lesson add`, no route from a finding to a lesson, and no recurrence counter anywhere.
One of nineteen lessons already names a command whose flags have drifted (`worker/file-findings`
teaches `tasks add --kind finding`, which the command now refuses without `--fault`).

`docs/specs/a-lesson-is-folded-from-its-own-log.md` designs the fix — an append-only
`docs/lessons.jsonl` under `merge=union`, folded by a pure function into the arrays — and is
unstarted. Note its own Open Questions flag a three-way collision: two *other* specs
(`a-lesson-has-a-handle-that-survives-rewording-it`, built and unmerged on `claude/lesson-handle`,
and `a-lesson-can-be-retired-and-the-retirement-is-recorded`) also intend to write
`briefLessons.ts`. That needs a ruling before any of the three is dispatched.

**The half nothing addresses is the one the author named directly**: *"Me forgetting to tell them
about `npm run tasks -- *-prompt ...` can't be the failure mode."* Today lessons arrive only if the
dispatcher remembers to say "run `work-prompt <id>` and do what it says". There is no fallback for
an agent told "just fix X". That is a `CLAUDE.md` line, not a code change, and §7 proposes it.

### 6.4 "No infinitely appended markdown; dissolve finished specs" — **confirmed, and currently impossible**

34 of 59 spec files (58%) are fully historical. They cannot be deleted: `checkStore` requires every
closed record's non-null `spec` to name an existing file forever, because `departFromSpec` only
clears `spec` on departure and never on an ordinary close. Deleting the 34 today would strand
**336 closed records** as 336 `doctor` errors, 55 of which carry `--discharges` and would produce a
second error wave. And `spec remove` — the one command that could detach a record — refuses once
the file is gone, so it needs the file it is trying to remove. This is already filed as
`stranded-spec-members-have-no-repair`.

**A spec cannot currently retire.** That is why `docs/specs/` only grows, and it is a five-line fix
in the wrong direction from where anyone has been looking: let a closed record keep its spec *slug*
as history without requiring the file to exist.

### 6.5 & 6.6 "Claim the spec" and "multiple specs per branch" — **one fixed, one not**

Multiple specs per branch is genuinely fixed. `BranchStanding.specs` is a real collection; the
heuristics (`specToGrade`, `authoredAsPlan`, `specAddsClauseId`, `decideSpec`) are deleted.

"Claim spec" is **not** built. There is no `claim` verb. What replaced inference is `--spec`, a
branch-name match against a real file, and a CI-only derivation from the branch's own store diff.
That derivation is better evidence than the old guess — a changed task record *is* the branch's diff
— but it is still derived, and one caller still exits 0 with no usable answer on an ambiguous spec
(`cmdPlan`, `architectureCmds.ts:57-60`), deliberately, because making it refuse would redden CI on
every PR. The resulting clause sits open and high-severity on an already-merged spec.

The author's instinct ("most inference-based systems should just be simplified") is the one the
repository's own history most strongly supports: this capability took **six rounds**, and the only
round that held was the one that deleted rather than fixed.

### 6.7 "A counter that fires when a capability needs 5+ rounds" — **the highest-value item**

This is the requirement that would have prevented the other six, and §3 shows it can be computed
from data that already exists: the event log, the store's `produces`/`concepts`, and 47 sessions of
`tool-friction.md`. What is missing is not the data but a **handle** — a stable identity a
recurrence can be appended to.

The design is already written and correct. `a-recurrence-is-appended-and-filing-shows-what-already-claim`
(open, HIGH, phase 4) reasons it out in its own deliverable: *"Nothing is incremented anywhere: a
counter is a field concurrent branches edit by construction … the derivation of the count belongs to
the query."* That is exactly right, and it is the same conclusion the store-race reproduction in
§6.1 reaches from the other direction.

Two things this audit adds to it:

- **The counter should also count *capabilities*, not only frictions.** The Task system holds 22 of
  the repository's 43 registered concepts. Concept count per system, tracked over time, is the
  cheapest available proxy for "this system is growing faster than it is being used", and
  `audit-status` already computes it.
- **83% of `produces` claims never become concepts** (86 of 104 distinct names). Any recurrence
  query keyed on capability name will read a vocabulary that is mostly unregistered forecasts.
  Key it on **path**, not name — `producers.ts:91-95` already says so in its own comment, and
  `checkPlan` does not do it.

### 6.8 "No way to know whether any of this is easy for the agents"

This is the one requirement with no design behind it, and it is answerable more cheaply than the
others. Three measurements already exist and are not collected:

- **Grant drift.** `tasks done --commit <rev>` has both the grant and the diff in hand. Recording
  the delta per task gives a real distribution of how wrong a forecast is (this audit's sample:
  10–50% recall). That is §7's first recommendation and it doubles as the answer here.
- **Direct-edit rate.** How often an agent bypasses the CLI and edits `docs/tasks.jsonl` by hand is
  measurable from commits that change the store without a matching `docs/events.jsonl` change.
- **Refusals.** The refusal invitation demonstrably works — the delegation log records real,
  correct refusals at rows 39, 48a, 51, 53, 54, 57, and no case of a planner overriding one. That
  is the tool's single best-evidenced mechanism and it is worth protecting from any redesign.


---

## 7. What to do

The repository's own rule for reading a finding list applies here: *"ask what single change retires
the most of the list, and build that seam first."* Ordered by that, not by severity.

### 7.1 Five small changes, first, before anything else is planned

Each is a few lines. Together they retire eleven of the sixteen HIGH findings and both failures the
commissioning ruling named. None requires a design decision.

| # | change | file | retires |
|---|---|---|---|
| 1 | `saveStore` writes `.tmp` then `rename`s; re-read and compare before writing | `scripts/lib/taskStore.ts:481` | **H1** (lost writes, torn reads), H8's persistence, M6, and the reason filing is serialised by hand |
| 2 | Drop the `byPath.get(to)?.system !== candidate.system` clause; label cross-boundary callers instead of filtering to them | `scripts/lib/architecture.ts:244` | **H3** — makes `tasks where` able to show the sibling caller that produced the deadlock |
| 3 | Compare a record's `system` against `ownerOf` over its `writes ∪ files`; warn, never refuse | `scripts/tasks/context.ts:339` and/or `scripts/lib/taskStore.ts:785` | **H4** — the Phase-6 invisibility and the eight live mis-filings |
| 4 | Make the queue tie-break total: `seq`, then `id` | `scripts/lib/taskStore.ts:519` | **H7** — and it makes `orderIndependence.test.ts`'s property true of the live data for the first time |
| 5 | Replace `flagArities`' prose regexp with a declared arity table beside each usage string; reject a repeated flag | `scripts/tasks/cli.ts:27`, `:90` | **H12, H13** — and makes `commands.ts:203`'s "never a silent no-op" true |

Change 1 is the highest value-to-cost ratio in this audit: ten lines in one function, no caller
changes, and it ends the failure that has been silently corrupting every parallel session.

### 7.2 Give the write grant an observation point

This is the seven-out-of-seven fix, and it is three changes in one branch (**H2**):

- **Refuse `--grant commitment` on a record that has never been started.** The field's only job is
  to record that someone read the region; the planner must not be able to assert it.
- **Call `checkPlan` from inside `reportPriorArtOnWrites`**, printing defects *above* the prior-art
  wall, so the collision check fires when the worker corrects its grant rather than when the planner
  guesses it. Reuses `checkPlan` verbatim and adds no concept.
- **Have `tasks done --commit <rev>` report grant-versus-diff.** It holds both. `docs/workflow.md`
  already asks a human to do this by eye. Recording the delta also produces the first real
  measurement of how wrong a forecast is, which is the only cheap answer to §6.8.

Then collapse `tasks where <directory>` with the `collapseClosed` that already exists and has one
caller (**M4**). 711 lines carrying 104 rulings is not a survey a planner reads, and workflow step 1
runs exactly that query.

### 7.3 Let `doctor` fail on a broken reference

`checkStore` already classifies nine conditions as `error` and `doctor` exits 0 on all of them
(**H14**). The reference errors — a system name not in `systems.json`, a spec with no file, an
unresolved `requires`, a duplicate id, a dependency cycle — are not semantic disagreements about the
work. They are the store having drifted out of sync with the tree, which is this audit's subject.

Fail on those; keep reporting the rest. That makes the CI leg the first automated check in this
repository that a record still points at something real. Land it together with M8, because a spec
must be able to retire before "a spec with no file" is an error anyone can clear.

### 7.4 Resume phases 4–6 — the paused plan is well aimed

The paused plan already answers four of the seven v3 requirements, and its designs are right. Two
deserve saying out loud:

- `a-recurrence-is-appended-and-filing-shows-what-already-claim` independently reached the same
  conclusion this audit's store reproduction reaches from the other side: *"Nothing is incremented
  anywhere: a counter is a field concurrent branches edit by construction."* Append the occurrence,
  derive the count.
- `one-query-over-the-channel-and-the-second-place-retired` deletes `tool-friction.md` and stops
  `audit.ts` step 8 sending auditors to write prose into a markdown file. That is the "single way to
  log an issue" requirement, already specced.

Two corrections to make before dispatching them:

- **Re-file `every-system-owns-its-files-by-name` as `Task system` / `high`.** It is the phase-6
  branch that stamps the freeze, it is invisible to the query anyone surveying this work runs, and
  the previous orchestrator recorded that fact in a note attached to the record without changing the
  record. Fix the fields, not the narration.
- **Rule on the three-way `briefLessons.ts` collision** before any lesson work is dispatched:
  `a-lesson-is-folded-from-its-own-log`, `a-lesson-has-a-handle-that-survives-rewording-it` (built,
  unmerged on `claude/lesson-handle`) and `a-lesson-can-be-retired-and-the-retirement-is-recorded`
  all intend to write that one file. That is the exact shape that produced the Phase 3 collision.

### 7.5 Do not rebuild the store yet

The event-sourced store is the right destination and the reasoning behind it is sound (§6.1). It is
not the right next move, for one measured reason and one design reason.

**Measured:** the failure losing data today is `writeFileSync`, not JSONL. The id-sorted file merges
well, `taskStore.test.ts` pins the boundary precisely, and the residual conflicts *loudly*. Change 1
in §7.1 closes the loss without touching the format.

**Design:** per-field last-writer-wins makes the merge rule silent. Today two branches editing one
record produce a conflict a human adjudicates. Under `merge=union` with a `t` clause they produce a
resolution nobody sees. **If v3 is built it needs a contested-field report as a first-class output,
or it re-creates by design the exact class of defect this audit is about.** Two further constraints
to carry: the fold must read the log and nothing else, or the two authorities return; and 212 of 792
records carry no event at all, so the fold needs a genesis snapshot.

### 7.6 The thing to stop doing

Capabilities are being built ahead of their use, and the evidence is not anecdotal:

- `decider` is populated on **0 of 792** records. `tasks question` has been used zero times since it
  was built — the single `question` record predates the field.
- `claimed`/`claimedBy` shipped in a commit whose own body ends *"Nothing writes these fields yet."*
  (They are wired now; this one came good.)
- **86 of 104 distinct `produces` claims (83%)** were never registered as a concept.
- The Task system holds **22 of the repository's 43** registered concepts.
- 32% of every record ever filed is about the tracker, and `docs/tasks.jsonl` and
  `docs/events.jsonl` are the two most-committed files in the repository, ahead of every game source
  file.

The v3 note asks for a counter so a capability needing 5+ rounds can be rethought rather than
patched again. That counter is worth building — but its answer already exists (§3), and it says four
capabilities are past the threshold. The lesson this repository's own history teaches most clearly
is that **the move that works here is deletion**: every retirement in the log followed it, and the
one capability that finally held is the one that was deleted rather than fixed a seventh time.

---

## 8. On the freeze

Phase 6 stamps a freeze on this system. This audit's answer: the freeze is right, and §7.1–§7.3
should land inside it rather than after it.

The case is not that the system is bad. §2 is honest — the generated briefs, the event log and the
audit loop are load-bearing and have no cheaper substitute, and the refusal invitation is the
best-evidenced mechanism in the repository: the delegation log records real, correct refusals at
rows 39, 48a, 51, 53, 54 and 57, and no case of a planner overriding one. The test suite is fine
(1,050 tests, 24.8 s wall, zero tests above 4,000 ms, green under eight concurrent agents), the
in-process fixture fix already landed, and the store's referential integrity came back clean on
every check in §9 — including zero evidence of anyone routing around the tool.

The case for the freeze is arithmetic. The tool is 19,728 lines against a 15,473-line game that is
not yet playable. It has absorbed 21 of the last 25 merges. Its four most-reworked capabilities have
taken six, five, five and four rounds — the fourth (`tasks plan`) still unresolved, and last handled
by *avoiding* parallelism rather than fixing the check.

What §7.1–§7.3 buy is that the frozen system is one that **cannot silently lose a record, cannot
silently answer short, cannot silently accept a flag it does not have, and cannot silently hide a
record from the query meant to find it.** Those four failures are what made this system expensive to
operate. None of them needs a redesign. Freeze after them, not before.

---

## 9. What the store data says — including the good news

Counted directly over 792 records and 2,247 events, with throwaway scripts rather than through the
CLI whose filters are themselves under audit.

**Clean. Every one of these was checked and came back zero:**

| checked | result |
|---|---|
| duplicate ids | 0 |
| `requires` naming a record that does not exist | 0 |
| records naming a spec with no file / spec files no record names | 0 / 0 |
| `discharges` numbers with no matching `- [cN]` in the named spec | 0 |
| `closedCommit` values unreachable in this repo | 0 (159/159 resolve) |
| open or unreviewed records older than two weeks | 0 |
| **agents hand-editing task content into the store, bypassing the tool** | **0** |

That last one is the author's direct question and the answer is unambiguous. Cross-verified two
independent ways — per-record event coverage, and a per-commit check that every commit touching
`docs/tasks.jsonl` also touched `docs/events.jsonl` — **412 of 413 commits pair correctly**, the one
exception being a reviewed schema migration. Four records were hand-*deleted* from the file, which
is what happens when no `tasks remove` verb exists; no content was ever hand-inserted.

So the friction is not that agents route around the tool. They do not.

**Volume, in context.** Task-system records are 32% of everything ever filed, and task-system code
churn is ~34% of commit volume over the weeks it has existed — proportional to its usage share
rather than runaway. But `docs/tasks.jsonl` and `docs/events.jsonl` are the **#1 and #2
most-committed files in the entire repository**, ahead of every game source file, and
`scripts/tasks.ts` is twice as hot as any other code file.

**Duplicates, measured.** 18 records — 8.1% of all declines — were filed and then caught as
duplicates at triage. The open queue is clean because triage is doing the work that prevention is
not. That is the size of the pile the v3 dedupe rule would prevent, and it is smaller than the
narrative suggests.

## 10. One finding this audit retracted, and why it matters

The store-data auditor filed one HIGH: *"`departure` has been null in 811 of 811 historical
occurrences despite 88 recorded set-calls"* — presented with a reproduction, a `git log --all -p`
command, and a cross-check of 86 specific ids. It concluded the store's read-modify-write race was
silently swallowing that field on every write, and offered it as a likely contributor to the
seven-of-seven grant corrections.

It is wrong, and checking it took one command. `departure` landed on 2026-08-07 in `504af12`. Of the
259 `spec-defer` / `spec-remove` / `triage` events in all of history, exactly **one** occurred after
that commit — and it was a `promote`, which adds a record to a spec rather than departing it from
one. `departFromSpec` has had essentially zero opportunities to fire since the field existed.
811 of 811 null is exactly the expected value.

This is recorded because it is the same failure the commissioning ruling had already caught itself
making: *"The orchestrator reported 13 earlier from a grep that counted wrapped output lines rather
than records, and that wrong number is what the pause was argued from."* Both are a real
measurement over the wrong denominator, delivered with more confidence than the evidence carried.
Two occurrences in one week, from two different agents, on the same repository.

The lesson is not "audit harder". It is that **a count is not evidence until its denominator is
stated**, and that the cheapest defence is the one that worked here: before filing a
never-happened claim, ask when the thing could first have happened.
