# tool-friction-backlog

## Deliverable

Everything in `.planning/agent-feedback/tool-friction.md` plus the planning sessions of 2026-08-04,
in one branch. It leads with discovery, because that is the gap that cost the most and the only one
whose fix was measured rather than reasoned to: asking "does this already exist" is answered today
by `tasks produces`, which matches how a capability was *spelled*, so it caught `buff engine` and
missed `per expression` against `+N <stat> per <counter>` — one grammar, two owners, surfaced only
as a `stats.ts` write collision that had to be interpreted.

The rest is not a list of unrelated papercuts. Six of the entries are one shape — a refusal or a
read that holds the information the caller needs and prints a bare rejection instead — and four
more are a summary or a record omitting the one thing it exists to carry. The friction log is the
evidence for every clause below, and each entry there is something that happened rather than
something imagined.

Proof:

- [c1] Prior art is answered by **path**, through the verbs that already answer neighbouring questions
  rather than a new one. A query takes the paths a piece of work will touch and returns everything
  that has ever claimed them, drawn from `writes` and `files`, resolving directory grants, across
  **every state including `done` and `declined`** — alongside the system that owns them, the
  concepts registered against them, and the capability claims that name them. Measured on the real
  store once built, which corrects the planning session's own claim: `combat-events`' granted paths
  return `per-grammar-dependent-stats` and `buffs-generalized`, two of the four duplications and
  both of the live ones. The closed
  `droptables-pass1-adding-any-chance-to-a-batched-action-multi` is not among them — it is recorded
  against `src/runtime/effects.ts:97`, a path `combat-events` does not grant, and it returns from a
  query on `src/runtime/effects.ts` instead. The planning session attributed all three to
  `combat-events`' own paths without checking which path each was filed against; the attribution
  was wrong and the mechanism it was offered as evidence for is not. A closed finding filed with a
  `:line` suffix being reachable at all is the half that matters, and that is what the third record
  demonstrates.
  proof: vitest scripts/tasks.test.ts "where names every task that has ever claimed the path, closed and declined ones included"
  proof: vitest scripts/tasks.test.ts "where resolves a directory grant against a path beneath it"
  proof: vitest scripts/tasks.test.ts "where answers with the owning system, the concepts on the path and the produces claims naming them"
- [c2] The planning answer names a system's public interfaces, not a count of them. `Module.exports` is
  already a `string[]` and `exportCount` is a reduction over it, so the names exist and are
  discarded at the point of display; a planner asking about a region gets the surface it would have
  to import, alongside the paths, concepts and claims for that region.
  proof: vitest scripts/tasks.test.ts "system names its exported surface instead of counting it"
- [c3] A write grant says whether it is a forecast or a commitment, and `plan` weighs the two
  differently. A grant declared before anyone has read the code is honestly a directory, and a
  directory collides with everything beneath it — measured at five defects across four independent
  roadmap tasks, and zero once narrowed to invented file paths, which trades a true record for a
  quiet check. The workflow already has the correction point, a worker narrowing its own grant at
  dispatch; what is missing is the record saying which side of that point a grant is on. This closes
  `grant-forecast-vs-commitment`.
  proof: vitest scripts/tasks.test.ts "records a grant declared at add time as a forecast, and names the command that commits it"
  proof: vitest scripts/lib/planCheck.test.ts "reports the same overlap as a note when one side is only a forecast, and names that side"
  proof: vitest scripts/tasks.test.ts "grades an overlap between two commitments as a defect and the same overlap under a forecast as a note"
- [c4] `tasks spec new` prints the capability survey rather than trusting a planner to remember it. It
  names the commands that answer "what is already here" for the region about to be specced, and the
  reminder that which capabilities the branch adds, extends, takes over or retires belongs in the
  spec's `## Decisions`. This is the nudge `tasks done` already uses for an unregistered `produces`
  claim, applied at the one moment the whole capability landscape is in view; it prints and never
  writes, because the judgement is the point.
- [c5] A read resolves the active spec when it uses one, and every read that can infer one does. Today
  the two halves fail in opposite directions: `tasks next` prints `spec inferred from the branch
  name`, which reads as ambient, and `tasks spec show` answers the same slug with usage; while
  `tasks list --state unreviewed`, which filters on no spec at all, resolves one anyway and spends
  three lines contesting it. `runList` resolves at `records.ts:295` and reads the result only at
  `records.ts:316`, under `flags.spec !== undefined`.
  Inference also has to survive a generated worktree branch, by asking the event log rather than the
  branch name. `currentSpec` tests `existsSync(docs/specs/<branch>.md)`, so a `claude/<topic>-<hash>`
  branch looks for a nested path that cannot exist, and the store fallback then needs exactly one
  spec with open members — nine qualify today, so it contests and answers nothing. The event log
  already records `branch` on every store write, so which spec a branch is working is derivable
  rather than declared, and no second place has to be kept in sync. Measured over `events.jsonl`:
  `claude/task-system-refactor-558c39` resolves `task-system-refactor`,
  `claude/roadmap-settled-work-e35b97` resolves `roadmap-shows-settled-work` — which name matching
  cannot, the branch having dropped a word — and `claude/roadmap-friction-planning-1a19bb` resolves
  `tool-friction-backlog`, whose branch name carries no signal at all. The route is the most recent
  spec written from this branch, behind an explicit `--spec` and ahead of the open-members route; a
  planning branch that wrote to ten specs answers with the one it touched last, and a cold worktree
  that has written nothing falls through to today's behaviour.
  proof: vitest scripts/tasks.test.ts "answers `spec show` with no slug the way `next` answers with no --spec"
  proof: vitest scripts/tasks.test.ts "list neither infers a spec nor mentions one, because it does not filter on one"
  proof: vitest scripts/tasks.test.ts "infers the spec this branch last wrote to, which the branch name cannot answer for a worktree"
  proof: vitest scripts/tasks.test.ts "an explicit --spec is not an inference and carries no note"
- [c6] The check fires without being asked for. Setting `--writes` on `add` or `edit` runs the clause-1
  query and prints what already claims those paths, the way `tasks done` already prints the
  `tasks concept` command for an unregistered `produces` claim. A check that must be remembered is
  skipped exactly when a session is deep in something else: it was run once in the planning
  session, and that once is the one duplication that was caught.
  proof: vitest scripts/tasks.test.ts "answers without being asked, and does not report the record against its own grant"
  proof: vitest scripts/tasks.test.ts "fires on edit as well as add, and says plainly when nothing has claimed the paths"
- [c7] A task-CLI refusal names the near miss instead of only printing usage. `tasks spec add <slug>
  --id <id>` takes positionals and `tasks add "<title>" --note` wants `--evidence`; both guesses
  come from the CLI's own vocabulary, and `docs/workflow.md` spells `--id` in the sentence above
  the one describing `spec add`. The unknown-command refusal, which already prints the verb list
  and so already knows the name is not one of them, points at `npm run audit-status`.
  proof: vitest scripts/tasks.test.ts "tells `spec add --id` that ids go here as positionals"
  proof: vitest scripts/tasks.test.ts "tells `add --note` which verb owns that flag and which of this verb takes prose"
  proof: vitest scripts/tasks.test.ts "points an npm script refused as a verb at npm run"
- [c8] A load-path tool's refusal says what it already knows. `mutate`'s find miss holds the file open
  and names the nearest line rather than repeating that the text is absent — one message covering
  line endings, escaping and whitespace drift, the three separate sessions that hit it. `probe
  --each` names a document legally, so that a variant which loads clean stops reporting as
  `stdin[3] is not a usable module id` and the advertised survey path can tell "loads" from
  "rejected".
  proof: vitest scripts/mutate.test.ts "quotes the nearest line beside what was asked for"
  proof: vitest scripts/mutate.test.ts "names a CRLF miss by showing the line ending the file carries"
  proof: vitest scripts/probe.test.ts "names a document with an id the loader accepts, so a variant that loads says so"
- [c9] A store query that cannot see a record says why. Reading the store from a ref that predates a
  branch's writes answers `0 task(s)` today, which is indistinguishable from "those records are
  gone"; the store is versioned with the code, so every query is silently ref-scoped and the answer
  must say so.
  proof: vitest scripts/tasks.test.ts "says the read is scoped to this checkout, and how much the file holds"
- [c10] A summary does not bury the class it exists to surface. `merge-ready` ends on
  `merge-ready: every leg passed` while `doctor` warnings scroll past above it — warnings whose
  entire subject is a close that exists only in the working tree and is about to be discarded. The
  count reaches the summary line without changing what fails.
  proof: vitest scripts/tasks/mergeReady.test.ts "carries doctor's warning count into the summary without changing what fails"
- [c11] `merge-ready` answers this branch's standing, not only the repository's. Its legs are all repo
  health; the questions a merge actually turns on — is the tree clean, has main moved past the
  merge base, is every spec member closed, does the latest pass leave a clause outstanding — are
  six manual reads across two tools, and the one that bites in practice, main having moved, fails
  nothing.
  proof: vitest scripts/tasks/mergeReady.test.ts "fails on main having moved, which is the one that bites and failed nothing"
  proof: vitest scripts/tasks/mergeReady.test.ts "fails on an unclosed spec, sending an open member to `tasks next` and an unreviewed finding to `tasks triage`"
  proof: vitest scripts/tasks/mergeReady.test.ts "fails on an outstanding clause, and separates one nobody graded from one left unmet"
  proof: vitest scripts/tasks/mergeReady.test.ts "fails on a dirty tree, naming the paths a cleanup would discard the closes of"
- [c12] A close carries why it closed, reachable from the record. `tasks show` prints `closed` and
  `closedCommit`; the evidence a closer recorded with `tasks note` is reachable only by someone who
  already knows it is there.
  proof: vitest scripts/tasks.test.ts "surfaces on the record the evidence a closer recorded with tasks note"
- [c13] Recording a full audit pass is not rationed by the transport. Twelve `--proof`/`--evidence`
  pairs carrying test names, mutation verdicts and probe output run past the Windows
  8191-character command line, in two separate sessions, and the droptables pass compressed its
  evidence to fit — the command asks for evidence specific enough to re-run and then rations how
  much of it there is room for. Splitting the *findings* off is already an escape and stays one
  (clause 16); splitting the *pass* is not, because a clause left ungraded records `unknown`. The
  store write is one operation and only the transport is the problem.
  proof: vitest scripts/tasks.test.ts "records a whole pass from a file, and a flag typed beside it still wins"
  proof: vitest scripts/tasks.test.ts "reads the same flags, and lets a clause's evidence be a paragraph"
- [c14] An expression is evaluated with the repository's own module resolution, its value printed, and
  no file left behind to remember to delete. Three sessions have now ended in a throwaway `.ts`
  inside the worktree: twice to render a `scripts/` view over a store the real one cannot contain,
  once to call `wrapText`/`wrapUnder`/`packGreedy` on six inputs. `npx tsx -e` with an import
  exits silently with no output and no error, and a file in the session scratchpad cannot resolve
  the repo's relative imports, so the file has to live in the tree. `npm run probe` is the
  precedent for the load path and the task CLI has no equivalent, at either size.
  proof: vitest scripts/inspect.test.ts "evaluates an expression against the repository's own module resolution"
  proof: vitest scripts/inspect.test.ts "renders a scripts/ view over records the real store does not contain"
  proof: vitest scripts/inspect.test.ts "leaves no file behind"
- [c15] The store is the path of least resistance for a judgement. `tasks decision` went unrun across a
  whole branch while twelve commit bodies carried the reasoning, because the commit had a writing
  prompt attached and the store did not.
  proof: vitest scripts/tasks.test.ts "names the tasks decision command from done and from decline"
  proof: vitest scripts/tasks.test.ts "names it from triage too, which is the third place a disposition is decided"
- [c16] What already works is not optimised away. Three behaviours survive this branch: `tasks done`
  printing the clause standing at close, `promote` naming a pass-2 finding as extending what the
  spec owes, and `tasks audit` appending no pass when it is given findings without `--proof`
  flags, so a late finding never resets a verdict. The first two are the tool declining to let a
  close look tidier than it is, at the moment the judgement is made; the third is what makes
  clause 13's remaining problem only about size.
  proof: vitest scripts/tasks.test.ts "still prints the clause standing a done closed against"
  proof: vitest scripts/tasks.test.ts "still names a pass-2 promotion as extending what the spec owes"
  proof: vitest scripts/tasks.test.ts "audit with findings and no proofs files the findings without appending a pass, so verdicts stand"
- [c17] A task records which proof clauses it discharges, and a clause standing names the task that owes
  it. `Task.clause` exists and only `audit` writes it — `records.ts:107` hardcodes `clause: null`
  and no verb offers the flag — so the entire output of a decomposition session, the map from
  clauses to owners, has nowhere to go but prose. This spec is the measurement: seventeen clauses
  and twelve members, with the mapping living in twelve `deliverable` strings that no reader can
  join, so "who owes clause 9" is a text search and "which clause has no owner" is unanswerable.
  The audit inherits the same blindness, grading a clause without knowing which slice promised it.
  proof: vitest scripts/tasks.test.ts "records them from add, reads c3 and 3 alike, and shows them back"
  proof: vitest scripts/tasks.test.ts "adds and removes the clauses a task discharges through edit"
  proof: vitest scripts/tasks.test.ts "names the owner of every clause standing, and says plainly which clause has none"
- [c18] A failing leg names the command that advances it, and a passing run names the merge. Clause 11
  makes `merge-ready` able to answer where the branch stands; this makes the answer actionable, and
  it is the missing half of the observed failure that sessions stop after the first audit and wait
  to be told to continue. There is no machine-readable "you are done" anywhere today: `spec show`
  reports standings, `doctor` fails on one condition, and `merge-ready`'s legs are all repo health,
  so a session that has just finished an audit cannot distinguish "loop again" from "hand back" and
  correctly does the safe thing. With every leg naming its next move — an outstanding clause naming
  `tasks next`, an unreviewed finding naming `tasks triage`, a moved main naming the merge of main
  into the branch, a spec whose members are all closed naming `tasks spec done` — the loop's exit
  condition becomes a command rather than a judgement, and "work until `merge-ready` is green" is
  an instruction an agent can execute without a human in the loop for each turn. It stops short of
  a `tasks merge` verb: the merge body is the one artifact whoever did the work has to write.
  proof: vitest scripts/tasks/mergeReady.test.ts "names only verbs the CLI actually has"
  proof: vitest scripts/tasks/mergeReady.test.ts "ends a green run on the two commands that finish the branch"
  proof: vitest scripts/tasks/mergeReady.test.ts "fails on an unclosed spec, sending an open member to `tasks next` and an unreviewed finding to `tasks triage`"
- [c19] A worker's brief is generated, never hand-written, the way an auditor's already is. The one
  instruction that dispatches a worker is `run npm run tasks -- work-prompt <id> and do what it
  says` — symmetric with the auditor's, and for the same reason CLAUDE.md gives for that one: a
  hand-written brief is a copy of the record that drifts from it, and composing one is where a
  planner smuggles in detail nobody asked it to hold. The brief derives from the store and the spec
  what the record already knows — the task's deliverable and evidence, its write grant, its
  `produces` forecast, what it requires and whether those are closed, the proof clauses it
  discharges and their current standing, the files the grant resolves to — and adds the three
  obligations `docs/workflow.md` puts on a worker before it writes code: claim the record, correct
  the grant against what it actually finds, and register any durable capability. It ends by
  inviting refusal, because a grant made by a planner that has not read the region is a forecast
  and the worker is the first party in the workflow able to say so. Among what it prints is one
  line of provenance — the branch this spec was last written from, read off the event log — because
  one spec is one branch, so a worktree cut from `main` after the first member has landed reads a
  store that looks current while missing what the branch has closed. It states the fact and stops:
  no comparison against the current branch, no reset command, no environment repair. Whoever
  dispatches a worker already knows which branch the work is on, and a line they can check against
  costs three lines over `loadEvents` and `filterEvents`, which exist and are tested.
  proof: vitest scripts/tasks.test.ts "work-prompt names the task's deliverable, grant, requirements and clause standings"
  proof: vitest scripts/tasks.test.ts "work-prompt names the claim, grant-correction and concept-registration steps a worker owes before writing code"
  proof: vitest scripts/tasks.test.ts "work-prompt invites refusal of the grant it prints"
  proof: vitest scripts/tasks.test.ts "work-prompt refuses an id the store does not hold, without inventing a brief"
  proof: vitest scripts/tasks.test.ts "work-prompt names the branch this spec was last written from"
  proof: vitest scripts/tasks.test.ts "work-prompt reads the clauses an ordinary task discharges, not only an undelivered record's own"

## Decisions

- **Prior art is keyed by path, not by name.** A capability name is authored prose and two authors
  will not choose the same words; a path is the same string for everyone who touches it. Names stay
  as a secondary signal through `produces`, and paths become the primary index — which inverts
  today's design, where the authoritative check is the one that depends on two people independently
  agreeing on a phrase.
- **The query must include closed records, which is why `plan` cannot be it.** `plan` grades a live
  dispatch set by construction, and the prior art that bites is in finished work: `droptables` was
  done and merged when its batched-chance rule was re-derived from scratch.
- **Branch awareness is out of scope.** The fourth duplication — a clause-tagged spec and a probe
  report sitting on a branch while the record said "not ready" — was a record that was not updated
  when the branch was cut. That is discipline, not a missing feature, and building machinery for it
  would be paying for a habit.
- **One branch, many slices.** This is one promise with a dozen independent fixes under it,
  decomposed into seven tasks over disjoint write regions before anyone works it. Keeping it one
  spec is what stops a dozen papercut branches each carrying its own audit.
- **Prior art extends the existing verbs rather than adding one.** `where <path>` already answers
  "which system owns this" and `produces <name>` answers "who claims this capability" — the same
  question asked of the manifest and of the store. A planner arriving with a feature in mind wants
  every answer at once and is rarely troubled by receiving too much, so these converge into one
  answer rather than a third command a caller has to know to run.
- **The refusal clause split in two along the system boundary, and the audit window is wider for
  it.** `probe` and `mutate` belong to Testing procedure and the rest to Task system, so the diff
  spans two systems and will be audited as such. Splitting the clause is what lets one task own each
  half outright instead of one clause having five owners across two systems. That is cheaper than
  leaving a refusal that has now cost three separate sessions unfixed while it waits for a branch of
  its own.
- **Evidence that points into git carries the SHA.** "See git history at the deletion commit" cost
  two archaeology sessions in one day. This is a convention for new records rather than a sweep over
  old ones, and it belongs here because it is the same failure as the rest: a record holding a
  pointer it declined to make usable.
- **The argv clause narrowed to the half that is still true.** It claimed splitting was no escape
  because ungraded clauses record `unknown`. That was fixed before this branch: `audit.ts:448`
  prints `no pass appended, so recorded clause verdicts stand`, and the droptables pass-2 session
  filed twelve proofs in one call and four findings in four more with verdicts intact. What survives
  is only that a *pass* cannot be split and a full one does not fit — so the clause asks for a
  transport, not a protocol, and the behaviour that saved it is pinned in clause 16 rather than left
  to be re-derived.
- **The synthetic-store clause widened to any expression.** The third occurrence was not a view over
  invented records but a single call to three wrapping helpers, and it failed the same way for the
  same reason. Specifying the larger case would have shipped something the third session still could
  not use; the promise is repo-resolved evaluation, and rendering a view over a synthetic store is
  one thing that becomes possible once it exists.
- **The four `roadmap-shows-settled-work` pass-1 findings are promoted here as members, not as a
  clause.** Their spec is merged, so they have no home to go back to, and their files —
  `scripts/tasks/render.ts` and `scripts/tasks/roadmapCmd.ts` — are touched by no other slice in
  this branch, so they cost no ordering. Three of the four are one shape, the wrapping helpers
  written three ways, which is the same genus as the rest of this branch: a read that does not say
  what it left out. They stay members because the branch's contract is what it promised, and a
  finding does not get to add to that on its own.

- **Every clause but one carries a proof target, because a target costs nothing to attach.**
  `audit.ts` is the only reader of `proofTargets` and it only prints them; the path that executed
  them was deleted after it produced a CI execution path, a 17-minute gate and a proof that proved
  nothing. So a target is a declaration to the auditor — mutation-test this named test — and not a
  red suite a worker has to read past, which is the cost `.planning/agent-swarm-theory.md` warns
  about. That is also why this branch adds no separate test-first phase: the theory's own position
  is that the audit is where prose becomes tests, and the cheap half, attaching targets before a
  baseline exists to drift from, is the half that was already built and had gone unused in 18 of 22
  specs. Clause 4 stays prose: what it promises is a judgement prompt, and any assertion over it
  would pin wording rather than a promise.
- **Clause 17 is the one clause this session's own friction created.** Every other clause came from
  the log; this one came from decomposing the spec that drains it, which is the strongest evidence
  available that it is real. Its owner is `spec-and-read-verbs-scope`, which already grants
  `records.ts` for the flag and `specCmds.ts` for the join, and takes a grant on `taskStore.ts`
  behind `record-verbs-say-back` for whatever the field turns out to be.
- **The auditor/triager contradiction was resolved in this branch's planning, not left for a
  worker.** `audit.ts` told every auditor that "promotion is the human triager's call at any pass"
  while `docs/workflow.md` step 9 promoted a first pass's HIGHs without a walk. Both were defensible
  read narrowly — the brief addresses the auditor, step 9 addresses the triager — and together they
  read as a contradiction, which is what prompted the question. A worker looking for it will not
  find it: the brief now names the actor boundary and the pass asymmetry in the same sentence, step
  9 states the same boundary from its side, and `scripts/tasks.test.ts` asserts both halves and that
  the phrase "at any pass" is gone. Fixed here rather than scoped as a clause because the cost of
  leaving it was an agent acting on the wrong rule for however long the branch takes, and the fix
  is three strings. It writes into `record-verbs-say-back`'s and `audit-pass-from-a-file`'s grants,
  which is free only because no worker had started; both grants are forecasts until a worker
  narrows them.
- **Worktree repair is not the task system's job, and clause 20 was retired for it.** It was scoped
  twice and wrong twice. First as "a spawned worktree cannot see the dispatched record", which the
  squash merge to `main` makes untrue. Then as a comparison against the current branch that printed
  a reset command and named a `node_modules` link — which is where the real cost was: a
  `git rev-parse --git-common-dir` subprocess, Windows path handling, and a platform-specific
  `mklink /J`, all to repair an environment whose owner is whoever spawns the worktree and already
  knows which branch the work is on. The measurement that settled it: the useful half is three
  lines over `loadEvents` and `filterEvents`, which already exist, are already tested, and already
  take `spec` as a filter key; the fragile half is everything attached to it, and `git reset --hard
  <branch>` needs no path at all. So the fact survives as one printed line inside clause 19 and the
  machinery is gone, along with the clause that justified it. A brief that reports provenance and
  lets a human act on it is worth three lines; a brief that repairs environments is not worth any.
- **The bootstrap costs exactly one hand-written brief, and it is not written here.** `work-prompt`
  cannot dispatch the task that builds `work-prompt`. That cost is real and one-time, and it is
  already paid down to almost nothing: the brief that slice needs is its own record plus the two
  clauses it discharges, which are `tasks show worker-brief-is-generated` and
  `tasks spec show tool-friction-backlog`. So the last dispatch names two existing reads instead of
  restating them, and nothing about that task is written in a place the store does not already
  hold.
- **The worker's brief is dispatched first, so the rest of the branch is dispatched with it.**
  `worker-brief-is-generated` requires nothing and everything else that contests its files is
  ordered behind it, which inverts the natural reading — it is the newest clause and would
  otherwise go last. The reason is that it is the one slice whose output is used by every slice
  after it: build it first and the remaining eleven members are each dispatched through it, which
  is a far better test of the brief than any assertion, and the friction it produces lands while
  the branch that owns it is still open. This is the "build the seam first" rule applied to the
  planner's own tooling rather than to the code under it.
- **Clause 19 does not wait for clause 17.** The brief is better once a task records the clauses it
  discharges, but it is useful before: today the mapping is the first sentence of each
  `deliverable`, so the brief can print the deliverable and be correct, and gains the join when
  `spec-and-read-verbs-scope` lands. Making 19 wait on 17 would have put the seam last, which is
  the whole thing the ordering above is buying.
- **Guiding the next move is clause 18, and it is not part of clause 11.** Clause 11 makes
  `merge-ready` *know* the branch's standing — four legs answering tree, merge base, member closure
  and clause standing. Nothing in it says the output tells anyone what to do about a red leg, and
  the friction log's own suggestion stopped at "printing the conventional merge command as its
  closing line". Separating them keeps a gradeable distinction: clause 11 can be met by a gate that
  fails correctly and says nothing useful, and that is exactly the state the loop is in today.
- **Whether a task's clause is one number or several is the worker's call.** `Task.clause` is
  `number | null` today because `audit` sets it on an `undelivered` record, which answers to exactly
  one unmet verdict. A decomposition slice routinely discharges several — `record-verbs-say-back`
  owes five. Widening the existing field and adding a second are both defensible and the choice
  needs the code read, which is the correction point the workflow already has at dispatch.

## Open questions

None.

## Audit passes

### Pass 1 — 2026-08-04

- base: `da8ddb0b47208b59feb6575a8ee98f3cf9bbe538`
- head: `dada24f03ef8c054a8632caadf3838140e377d5b`
- proof 1: met — All three proof targets exist and match by name. Mutation-tested via `npm run mutate`: filtering done/declined out of `priorArt` in scripts/lib/producers.ts -> KILLED (2 failed of 307, scripts/tasks.test.ts); replacing `pathsOverlap(declaredPath(entry), query)` with string equality (killing directory-grant resolution) -> KILLED (1 failed). Measured on the real store and it reproduces the clause exactly: `npm run tasks -- where src/runtime/stats.ts` (a combat-events granted path) returns per-grammar-dependent-stats and buffs-generalized, both open, and resolves action-time-taxonomy's directory grant `writes src/runtime`; `npm run tasks -- where src/runtime/effects.ts` returns the closed droptables-pass1-adding-any-chance-to-a-batched-action-multi, filed as `files src/runtime/effects.ts:97`, so the `:line` suffix is stripped and the closed finding is reachable. Both answers carry the owning system line, the `[concept]` rows and the `produces` claims. Declined records appear too (dsl-load-path-2026-07-30-m1, conditional-result-rows).
- proof 2: met — Target "system names its exported surface instead of counting it" exists in scripts/tasks.test.ts and matches. Mutation: replacing the surface print in cmdSystem with `${view.surface.length}` and returning early -> KILLED (3 failed of 307). `exportCount` is gone from SystemView, replaced by `surface: ModuleSurface[]` built by `exportedSurface`, and both cmdSystem and cmdWhere render names through `printSurface`. Re-run: npx vitest run scripts/tasks.test.ts -t "system names its exported surface instead of counting it"
- proof 3: met — Named proof targets do not exist under those names (see finding on drifted proof targets), but the substance is covered by real tests and verified live. Live: `npm run tasks -- add "probe task" --writes src/runtime/stats.ts --store <copy>` records the grant and prints "its write grant is recorded as a forecast -- `tasks edit <id> --writes <paths> --grant commitment` is what a worker that has read the region says". planCheck weighing is covered by scripts/lib/planCheck.test.ts:188-236: two commitments -> level 'defect'; one forecast side -> level 'note' naming "a's grant is forecast"; unstated -> note; unstated-dependency and cohesion weighed the same way; `report.commitments` counts only readable commitment grants. The directory-forecast case is the `overlap()` helper itself, which pits `src/runtime` against `src/runtime/combat.ts`. `grant` is validated in taskStore normalizeTask and doctor warns on a kind with no writes.
- proof 4: met — Human-verified as the clause requires. `npm run tasks -- spec new auditprobe-spec --specs-dir <scratch>` scaffolds the file and then prints the survey: `tasks where <path>`, `tasks produces "<name>"`, `tasks system "<name>"`, followed by the instruction to record in `## Decisions` which capabilities the branch adds, extends, takes over and retires, and "A survey that finds an owner is a success". printCapabilitySurvey in scripts/tasks/specCmds.ts writes nothing; the only write is the existing scaffold. Same shape as the `tasks concept` nudge reportUnregisteredProduces prints.
- proof 5: met — Named targets do not exist (see drifted-targets finding); behavior verified live on this generated worktree branch, which is the case the clause was written for. `npm run tasks -- spec show` with no slug answers: "spec inferred from the event log: tool-friction-backlog -- the most recent spec written from claude/work-prompt-prior-art-path-fb3097" and prints the clause standings; the branch name carries no spec signal at all, so the branch-name and open-members routes both fail here. `npm run tasks -- list --state unreviewed` prints no inference line and does not contest one -- the resolveActiveSpec call was deleted from runList. Ordering in context.ts resolveActiveSpec is explicit `--spec`, then branch-name currentSpec, then DEFAULT_BRANCH bail, then lastSpecWrittenFromBranch, then open-members; lastSpecWrittenFromBranch also requires the spec file to exist in this checkout.
- proof 6: met — Named targets do not exist; behavior verified live. `npm run tasks -- add "probe task" --id auditprobe1 --writes src/runtime/stats.ts --store <copy>` printed the full prior-art block unasked: five open claims, action-time-taxonomy's closed directory grant, entity-action-templates, equipment-slots and the declined dsl-load-path-2026-07-30-m1. reportPriorArtOnWrites in architectureCmds.ts excludes the record's own id and fires from both cmdAdd and cmdEdit under `args.flags.writes !== undefined`, so an edit that sets no grant stays quiet. It routes through manifestOrEmpty, so a malformed systems.json costs the concept half and not the write.
- proof 7: met — Named targets do not exist; all three refusals verified live. `npm run tasks -- spec add foo --id bar` -> "  --id: `spec add` takes <id> as a positional, not as a flag". `npm run tasks -- add "x" --note "y"` -> "  --note: not a flag of `add` -- it belongs to `concept`" plus the full `add` flag list. `npm run tasks -- audit-status` -> "`audit-status` is an npm script of this repository, not a tasks verb -- run `npm run audit-status`". reportUnknownFlags derives all of it from the usage strings and package.json scripts, so there is no hand-kept map of likely mistakes. Caveat filed as a low finding: the `--note` refusal does not name `--evidence` as the field it meant, which is what the clause text says it should.
- proof 8: met — Verified live on both halves. mutate: a manifest whose find text differs from scripts/probe.ts by one space produced "scripts/probe.ts does not contain the find text. The nearest line is scripts/probe.ts:207 --" with an aligned "asked for:" / "file has:" pair and "A difference you cannot see here is a line ending or a tab your shell rewrote before the manifest was written." One message covering escaping, whitespace and line endings, as the clause promises. probe: `printf 'a: 1\n---\n# info\nid: thing\n' | npm run probe -- - --each` now names documents `stdin-1` and `stdin-2` and reports real content diagnostics ("content before first section", "# info requires an id"); the `stdin[3] is not a usable module id` refusal is gone, because splitDocuments switched the separator from `[n]` to `-n`. Re-run: npx vitest run scripts/mutate.test.ts scripts/probe.test.ts
- proof 9: met — Named target does not exist; behavior verified live. `npm run tasks -- list --state unreviewed` on this branch answers "0 task(s)" and then "nothing matched. This read is scoped to docs/tasks.jsonl as claude/work-prompt-prior-art-path-fb3097 has it -- 463 record(s) in the whole file." followed by "A record written on another branch is not in this one until that branch merges; `git log --oneline -- docs/tasks.jsonl` is what this checkout can see." reportStoreScope in context.ts fires only when the queue is empty, which is the only moment "gone" and "not on this ref" look alike.
- proof 10: met — Named targets do not exist; both halves verified by mutation and by a real run. Mutation: blanking `doctorNote` in the green-summary branch of runMergeReady -> KILLED (1 failed of 12, scripts/tasks/mergeReady.test.ts). The real `npm run tasks -- merge-ready` run printed "doctor ok pass" with the count folded into the leg detail, and doctorIssues was extracted from cmdDoctor so the count is read from the same list doctor prints rather than parsed back out of its output. The warning count never enters `failed`, which is computed from `result.ok` only.
- proof 11: met — Named targets do not exist; all four failures verified directly by driving runMergeReady through `npm run inspect`. With every subprocess leg stubbed green: {dirty:['docs/tasks.jsonl']} -> ok=false, "NOT merge-ready: tree failed"; {outstandingClauses:['c3']} -> ok=false, "clauses FAIL 1 outstanding after pass 1: c3"; {openMembers:['x']} -> ok=false, "NOT merge-ready: spec failed"; {baseMoved:true} -> ok=false, "main has moved past the merge base"; clean -> ok=true. The real gate run on this branch reported "clauses FAIL tool-friction-backlog has no recorded audit pass" and "NOT merge-ready: clauses failed", and cmdMergeReady sets process.exitCode=1 at mergeReady.ts:231. Caveat filed as a separate finding: two of these four verdicts are untested and survive mutation.
- proof 12: met — Named target does not exist; behavior verified live on a copied store. `tasks note "the reason it closed was X" --id auditprobe1` then `tasks show auditprobe1` prints "1 judgement(s) recorded against this record:" and "  [note] 2026-08-04 (unnamed) -- the reason it closed was X". printJudgements in records.ts reads the event log filtered to op note/decision for that id and wraps through wrapUnder, so a paragraph continues under itself rather than at column zero.
- proof 13: met — Named targets do not exist; the transport was verified live and this pass itself was filed through it. `npm run tasks -- audit tool-friction-backlog --args-from <file> --store <copy> --actor probe` with a findings-only file recorded "1 finding(s) recorded, unreviewed, against pass 1 -- no pass appended, so recorded clause verdicts stand", which is the clause-16 interaction still holding under the new transport. parseAuditFile treats a line opening with `--` as a flag and everything else as a continuation of the value above, skips blanks and `#` comments, and readAuditFile places the file's argv before the command line's so a flag typed beside `--args-from` still wins. This whole 19-clause pass, roughly 14k characters, went in as one store write.
- proof 14: met — Named targets do not exist; the tool was dogfooded during this audit for exactly the case the clause names. `npm run inspect -- - < body.js` loaded scripts/tasks/mergeReady.ts through `load`, built four synthetic BranchStanding values the real store cannot contain, drove runMergeReady over each and printed the results structure -- the "render a scripts/ view over records the real store does not contain" case, from stdin, with no file in the worktree. `git status --porcelain` was empty afterwards. compile() tries expression then statement body, format() prints strings as themselves and structures with depth:null. scripts/inspect.ts is registered in package.json and in Testing procedure's paths and concepts.
- proof 15: met — Named targets do not exist; behavior verified live. `npm run tasks -- done auditprobe1 --store <copy>` printed "if this rested on a judgement worth reading later, `tasks decision \"<one line>\" --id auditprobe1` records it where `tasks show auditprobe1` surfaces it". printDecisionPrompt is exported from records.ts and called from cmdDone, cmdDecline and cmdTriage, so all three prompt. It prints and never writes, and it names `show`, which clause 12 just made the place the answer surfaces.
- proof 16: met — All three behaviours survive. The tests exist under different names and pass: "still prints the clause standing a done closed against", "still names a pass-2 promotion as extending what the spec owes", "audit with findings and no proofs files the findings without appending a pass, so verdicts stand". clauseStanding was refactored to take a `load` function rather than reading disk itself but is still called from cmdDone for undelivered records; pass2Promotion was extracted so cmdPromote and cmdTriage share one string. The third was re-verified live under the new `--args-from` transport, which is the interaction that mattered.
- proof 17: met — Named targets do not exist; behavior verified live and the branch used it on itself. `npm run tasks -- spec show tool-friction-backlog | grep "owed by"` names an owner for all 19 clauses across 8 members, and none reports "owed by: nobody". The store carries discharges on 8 records (for example [1,2] on prior-art-by-path, [3,6,12,15,16] on record-verbs-say-back, [10,11,18] on merge-ready-branch-standing). `discharges` is a separate field from `clause` in taskStore, parsed by optionalNumberArray, accepted as `c3` or `3` by parseDischarges, refused otherwise, and doctor errors on discharges with no spec. clauseOwners in specCmds.ts folds in an undelivered record's own `clause` too.
- proof 18: met — Named targets do not exist; both halves mutation-tested. Suppressing the per-leg `next` emission in the failed branch of runMergeReady -> KILLED (2 failed of 12); deleting the "then merge <branch> into <base>" line -> KILLED (1 failed). Verified live: a moved base emits "base           git merge main", an outstanding clause emits "clauses        npm run tasks -- next", an open member emits "spec           npm run tasks -- next", an unreviewed finding emits "spec           npm run tasks -- triage", a no-pass spec emits "commission an auditor: npm run tasks -- audit-prompt <spec>" (which is what this branch's real run printed), and a green run ends on "next: npm run tasks -- spec done <spec>" then "then merge <branch> into main". It stops short of a `tasks merge` verb as the clause says.
- proof 19: unmet — Five of the six things the clause promises the brief derives are delivered and verified live via `npm run tasks -- work-prompt prior-art-by-path`: deliverable and evidence, the write grant resolved against tracked files, requirements with their states, the three workflow obligations, the invitation to refuse, refusal of an unknown id, and the provenance line "tool-friction-backlog was last written from branch claude/work-prompt-prior-art-path-fb3097". The sixth fails. The clause promises "the proof clauses it discharges and their current standing"; printClauses at scripts/tasks/workPrompt.ts:85 reads `task.clause`, which doctor constrains to `undelivered` records only, instead of `task.discharges`, which clause 17 added for exactly this. So the brief for prior-art-by-path prints "discharges: c1, c2" in the record block and then "Proof clauses this task discharges: - none recorded on this record" eight lines later. Every ordinary member -- which is every record work-prompt exists to dispatch -- gets that contradiction and never sees a clause standing. The passing test uses demo-spec-clause-1, an undelivered record, so it proves only the path that already worked.

### Pass 2 — 2026-08-04

- base: `da8ddb0b47208b59feb6575a8ee98f3cf9bbe538`
- head: `08314d6156d2caf86b658a6c43f8467014892019`
- proof 1: met — Re-graded from the source, not from pass 1. All three named targets resolve to exactly one real test each in scripts/tasks.test.ts (3862, 3875, 3884), checked against `npx vitest list --json` rather than by text search. Mutation via `npm run mutate`: replacing `declaredPath` with `canonicalPath(entry)` so the `:line`/`#anchor` suffix is no longer stripped -> KILLED (2 failed of 1526). Live on the real store: `npm run tasks -- where src/runtime/stats.ts` returns per-grammar-dependent-stats and buffs-generalized (both open), action-time-taxonomy's directory grant `writes src/runtime` resolved against a file beneath it, the done equipment-slots and the declined dsl-load-path-2026-07-30-m1; `npm run tasks -- where src/runtime/effects.ts` returns the closed droptables-pass1-adding-any-chance-to-a-batched-action-multi filed as `files src/runtime/effects.ts:97`. `npm run tasks -- where scripts/lib/taskStore.ts` carries the `[concept] the task record` row, so the concept half is live too.
- proof 2: met — Target "system names its exported surface instead of counting it" resolves in scripts/tasks.test.ts. Live: `npm run tasks -- system "Task system"` prints "exported surface, production modules only:" and one wrapped line of names per module; `npm run tasks -- where scripts/lib/taskStore.ts` prints the same shape for one file. `exportCount` is gone from SystemView, replaced by `surface: ModuleSurface[]` from `exportedSurface`, rendered through one `printSurface` in architectureCmds.ts and summed in one place (architectureCmds.ts:108) for the overview. No second derivation.
- proof 3: met — Targets resolve after the rewrite: "records a grant declared at add time as a forecast, and names the command that commits it" and "grades an overlap between two commitments as a defect and the same overlap under a forecast as a note" in scripts/tasks.test.ts (4012, 4041), "reports the same overlap as a note when one side is only a forecast, and names that side" in scripts/lib/planCheck.test.ts. Mutation: emptying `soft` in planCheck `weigh()` so a forecast weighs as a commitment -> KILLED (4 failed of 29, scripts/lib/planCheck.test.ts). Live on a copied store: `tasks add "probe task 2" --writes scripts/tasks/mergeReady.ts` prints "its write grant is recorded as a forecast -- `tasks edit auditprobe10 --writes <paths> --grant commitment` is what a worker that has read the region says". `plan` also reports `report.commitments` and, on a clean plan, how many readable grants are only forecasts.
- proof 4: met — Human-verified, as the clause requires. `npm run tasks -- spec new auditprobe2 --specs-dir <scratch>` scaffolded the file and then printed the survey: `tasks where <path>`, `tasks produces "<name>"`, `tasks system "<name>"`, then "Then record in this spec's `## Decisions` which capabilities the branch adds, extends, takes over and retires. A survey that finds an owner is a success". printCapabilitySurvey in specCmds.ts writes nothing; the only write is the pre-existing scaffold.
- proof 5: met — All four targets now resolve (scripts/tasks.test.ts 3221, 4147 and the two list/spec-show tests). Mutation: `const logged: string | null = null` in resolveActiveSpec, killing the event-log route -> KILLED (1 failed of 315). Live on this generated worktree branch, which is the case the clause was written for: `npm run tasks -- spec show` with no slug answers "spec inferred from the event log: tool-friction-backlog -- the most recent spec written from claude/work-prompt-prior-art-path-fb3097" and prints the standings; `npm run tasks -- list --state unreviewed` prints no inference line at all.
- proof 6: met — Both targets resolve (scripts/tasks.test.ts 4057, 4073). Two mutations, both KILLED: turning `if (task.writes.length === 0) return` into `>= 0` so the check never fires -> 3 failed of 315; dropping the `candidate.id !== task.id` filter so a record reports against its own grant -> 2 failed of 315. Live on a copied store: `tasks add "probe task" --writes scripts/tasks/mergeReady.ts` printed the full prior-art block unasked, including the declined tool-friction-backlog and five done records, and did not list itself.
- proof 7: met — All three targets resolve (scripts/tasks.test.ts 4203, 4215, 4228) and all three refusals re-run live. `tasks spec add foo --id bar` -> "  --id: `spec add` takes <id> as a positional, not as a flag". `tasks add "x" --note "y"` -> "  --note: not a flag of `add` -- it belongs to `concept`" followed by "  `add` takes prose in: --produces, --deliverable, --evidence", which closes pass 1's low finding: the field the clause meant is now named. `tasks audit-status` -> "`audit-status` is an npm script of this repository, not a tasks verb -- run `npm run audit-status`". All of it is derived in reportUnknownFlags from the usage strings and package.json scripts, via placeholderOf/shapeOf; there is no hand-kept map.
- proof 8: met — All three targets resolve (scripts/mutate.test.ts 654, 674; scripts/probe.test.ts 257) and both halves re-run live. mutate: a manifest whose find text differs from scripts/probe.ts by one space produced "m1: scripts/probe.ts does not contain the find text. The nearest line is scripts/probe.ts:207 --" with the aligned "asked for:" / "file has:" pair and the line-ending/tab sentence -- one message covering escaping, whitespace and line endings. probe: `printf 'a: 1\n---\n# info\nid: thing\n' | npm run probe -- - --each` names the documents `stdin-1` and `stdin-2` and reports content diagnostics; the "stdin[3] is not a usable module id" refusal is gone.
- proof 9: met — Target "says the read is scoped to this checkout, and how much the file holds" resolves at scripts/tasks.test.ts:4182. Mutation: early-returning from reportStoreScope -> KILLED (1 failed of 315). Live: `npm run tasks -- list --state unreviewed` answers "0 task(s)" then "nothing matched. This read is scoped to docs/tasks.jsonl as claude/work-prompt-prior-art-path-fb3097 has it -- 469 record(s) in the whole file." and names `git log --oneline -- docs/tasks.jsonl`. It fires only on an empty result, which is the only moment "gone" and "not on this ref" look alike.
- proof 10: met — The single test both target lines name resolves at scripts/tasks/mergeReady.test.ts:140 and asserts both halves in one body: `runMergeReady(d)` returns true with 5 warnings, the leg detail reads "doctor         ok  pass -- 5 warning(s) reported above, which do not fail this leg", and the summary reads "merge-ready: every leg passed, with 5 doctor warning(s) that fail nothing". doctorIssues was extracted from cmdDoctor so the count comes from the list doctor prints. `failed` is computed from `result.ok` only, so the count cannot change what fails. The real `npm run tasks -- merge-ready` run below reproduces it. Filed low: c10's two proof lines are now the same string.
- proof 11: met — This is the clause pass 1 filed a medium against, and the fix holds. All four legs mutation-tested with `npm run mutate` at scripts/tasks/mergeReady.test.ts scope, all four KILLED where tree and clauses previously SURVIVED: `ok: standing.dirty.length === 0` -> `ok: true` KILLED (1 of 13); `const clausesOk = true` KILLED (1 of 13); `ok: !standing.baseMoved` -> `ok: true` KILLED (1 of 13); `const specOk = true` KILLED (1 of 13). The four tests now assert the verdict as well as the detail string, through the `graded()` helper. All four targets resolve. The real gate run on this branch reproduces the legs.
- proof 12: met — Target "surfaces on the record the evidence a closer recorded with tasks note" resolves at scripts/tasks.test.ts:4087. Mutation: early-returning from printJudgements -> KILLED (1 failed of 315). Live on a copied store: `tasks note "closed because the seam already existed upstream" --id auditprobe10 --actor auditor-pass2` then `tasks show auditprobe10` prints "1 judgement(s) recorded against this record:" and "  [note] 2026-08-04 auditor-pass2 -- closed because the seam already existed / upstream", wrapped under itself by wrapUnder.
- proof 13: met — Both targets resolve (scripts/tasks.test.ts 4444, 4473). Mutation: making parseAuditFile drop a continuation line instead of appending it -> KILLED (1 failed of 315). This whole pass, roughly 20k characters over 19 clauses and 4 findings, was filed through `--args-from` as one store write, which is the clause measured end to end. Filed low: the first target's name claims "a flag typed beside it still wins" and no test asserts that precedence; the behaviour is real (readAuditFile puts the file's argv before the command line's at audit.ts:502) but unheld.
- proof 14: met — All three targets resolve (scripts/inspect.test.ts). Two mutations, both KILLED at scripts/inspect.test.ts scope: resolving a specifier against `scripts/` instead of the repo root -> 5 failed of 7; dropping the statement-body compile form -> 3 failed of 7. Dogfooded during this pass: `npm run inspect -- - < body.js` loaded scripts/tasks/audit.ts through `load` and called `unresolvedTarget` on four probe strings, printing the results, with `git status --porcelain` empty afterwards. Filed low: the third target, "leaves no file behind", drives compile+loaderFor in process (neither contains a filesystem write) and checks a non-recursive readdirSync of the repo root, so it cannot fail for the reason it is named.
- proof 15: met — Both targets resolve (scripts/tasks.test.ts 4107, 4116). Mutation: early-returning from printDecisionPrompt -> KILLED (2 failed of 315), which is the two tests together, so done/decline and triage are both held. Live on a copied store: `tasks done auditprobe10` printed "if this rested on a judgement worth reading later, `tasks decision \"<one line>\" --id auditprobe10` records it where `tasks show auditprobe10` surfaces it". printDecisionPrompt is called from cmdDone, cmdDecline and cmdTriage and writes nothing.
- proof 16: met — All three targets resolve and all three tests are real: "still prints the clause standing a done closed against" (tasks.test.ts:4127) asserts the exact standing line at close; "still names a pass-2 promotion as extending what the spec owes" (4133) drives two passes and promotes the pass-2 finding; "audit with findings and no proofs files the findings without appending a pass, so verdicts stand" (2280) asserts the spec file is byte-identical afterwards and that `spec show` still reads "clause standing (latest pass 1): no clause outstanding". The third was re-exercised by this pass filing through the new `--args-from` transport.
- proof 17: met — All four target lines resolve to two tests (tasks.test.ts 4241, 4249, 4270). Two mutations, both KILLED (1 failed of 315 each): making `edit --discharges` ignore the parsed value, and making clauseOwners fold in no clauses. Live: `npm run tasks -- spec show tool-friction-backlog | grep -c "owed by:"` is 19 and `grep "owed by: nobody"` is empty, so every clause on this spec has a named owner. `discharges` is a distinct field from `clause` in taskStore, parsed by optionalNumberArray, accepted as `c3` or `3`, and doctor errors on discharges with no spec. Filed low: c17's last two proof lines are the same string.
- proof 18: met — All three targets resolve. Two mutations at scripts/tasks/mergeReady.test.ts scope, both KILLED: renaming the triage leg's next command to a verb the CLI does not have -> 2 failed of 13, which is the newly written "names only verbs the CLI actually has" doing its job -- it derives the verb set from allUsages() and cross-checks every `npm run tasks -- <verb>` string the legs emit across seven standings; and dropping `done` from the green run's `spec done <slug>` -> 1 failed of 13. The real gate run on this branch emits a next command beside every failing leg and, green, ends on "next: npm run tasks -- spec done" then "then merge ... into main".
- proof 19: met — This is the clause pass 1 graded unmet, and the reason no longer holds. printClauses now reads `clausesOf(task)`, which unions `discharges` with an undelivered record's `clause`. Live: `npm run tasks -- work-prompt merge-ready-branch-standing` prints "discharges: c10, c11, c18" and then c10, c11 and c18 with their standings; `npm run tasks -- work-prompt prior-art-by-path` prints "discharges: c1, c2", "produces: prior art by path", the grant resolved against tracked files, the provenance line "tool-friction-backlog was last written from branch claude/work-prompt-prior-art-path-fb3097", the three workflow obligations and the invitation to refuse. Mutation: reverting printClauses to `task.clause` -> KILLED (1 failed of 315). Two caveats filed separately, both low or medium rather than unmet: the killing test is not one of c19's five proof targets (I re-ran all five under the reverted fix and all five passed), and docs/workflow.md never names `work-prompt`.
