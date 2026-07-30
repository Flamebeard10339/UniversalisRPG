# Task system — branch deliverable log

Live working document for replacing `backlog.md` with a task store, moving the audit trigger
off commit counts, and collapsing deliverable logs into tasks. Designed 2026-07-30 in a
read-only planning session; revised twice the same day after review.

**This log is task zero.** It is written in the convention it formalizes, and chunk 6 migrates
it into `docs/tasks/` alongside everything else.

## Status

| Chunk | State |
| --- | --- |
| 1. `scripts/tasks.ts` — parse, model, `list` / `show` / `next` | not started |
| 2. `tasks check` + systems.json ownership | not started |
| 3. The writer verbs | not started |
| 4. `.claude/commands/` and the handoff hook | not started |
| 5. Audit trigger: chunk budget at task completion, plus `--brief` | not started |
| 6. Migrate `backlog.md` (58 items) and the deliverable logs → `docs/tasks/` | not started |
| 7. Audit back-reference pass over the six `lastAuditDoc`s | not started |
| 8. CLAUDE.md, AGENTS.md, `completed-tasks.md`, CI wiring | not started |

## Deliverable

One store, one document shape, one ordering, one completion protocol, one audit trigger,
reachable from two commands: `npm run tasks` and `npm run audit-status`. `backlog.md`,
`completed-tasks.md` and the per-feature deliverable logs all become task files. CLAUDE.md
gets shorter.

The success condition is not "tasks are tracked" — they already are. It is that these failures
become impossible or loud rather than remembered:

1. **A stale pointer in CLAUDE.md.** `Currently live: docs/combat/deliverable-log.md` is
   hand-maintained and was forgotten. There is no such pointer under this design.
2. **A task resumed badly because nobody decided it deserved a handoff.** Every task carries
   one, unconditionally, and the tooling writes it. See "Handoff is not a judgment call".
3. **Sporadic archiving.** Archiving becomes a status flip in place, so "we forgot to move it"
   has no way to occur.
4. **Findings written down and never lifted.** `docs/dsl-rewrite/backlog-process-review.md` is
   the evidence: every major DSL failure was correctly identified *in writing, in advance*,
   and lost to "no owner, no due condition, no link to the commits it should have gated." That
   doc's conclusion — a forcing-function problem, not a knowledge problem — is the
   justification this system needs under CLAUDE.md's rule that a gate earns its place by
   preventing something that actually happened.
5. **An audit fired mid-task to unblock CI.** `e65f784` audited the DSL load path on
   `dsl-pass2-resources`, a branch whose actual work is the integer conversion. See "The audit
   trigger".
6. **An agent hand-editing markdown and putting things in the wrong place.** Every section has
   a writer verb; no path requires opening the file to change it.

## The rule this design is bent around, and where it stops

CLAUDE.md: *do not create systems that are required to be manually kept in sync.* Every
**relation** is declared once and computed everywhere else — `blocks` is the inversion of
`blocked-by`, the queue order is a function of the graph, a task's commits are a `git log`
query.

**State is declared, never derived.** A relation is a function of what is written, so deriving
it cannot be wrong. State is a claim about the world — whether work is underway, whether it is
stuck, what the next person should do — and only the session that was there can make it.
Inferring "in progress" from three checked boxes tells the next session how many boxes are
checked, which it could already see, and nothing about whether chunk 4 is half-applied in the
working tree or abandoned on purpose.

So: relations derived, state written down, and the writing forced by the tooling rather than
requested at the end of a session.

## Spec

### One document shape

There is no separate deliverable-log concept. A task that needs a 400-line spec is a task with
a long `## Spec`; a task that needs one line has an empty one. `docs/combat/deliverable-log.md`
becomes `docs/tasks/combat.md` at 50 KB, which is fine — size is only a problem when you are
reading a file to find the part that concerns you, and `tasks next` hands you the one file
that does.

Every task file, scaffolded by `tasks new`, has all six sections. Empty ones stay visible: an
empty `## Open questions` is information.

```markdown
---
severity: high
system: DSL load path
status: active
blocked-by:
audit: docs/audits/dsl-load-path-2026-07-30.md H1
confirmed:
---

# A block-form list line silently drops what it does not understand

## Deliverable
A block-form list line that is not fully understood fails at load, with the same diagnostic
the inline form already produces. Proof is the shipped `while` typo at
`content/tutorial-island.dsl:139` erroring instead of dropping the front-door gate.

## Chunks
- [x] requireEnd per line in list.parseBlock
- [ ] a test that walks the list fields rather than one per field

## Handoff
requireEnd is in and the shipped typo now errors. The walking test is started in
`list.test.ts` but only covers `entities:`; the field table it should iterate is `SCHEMAS` in
`content/module.ts`, not the one in `list.ts`, which only knows its own kind.
Next: iterate `SCHEMAS`, expect a diagnostic per list field.

## Spec
<the reproduction and evidence currently in backlog.md, verbatim>

## Decisions
- **2026-07-30** — fix at `list.parseBlock` rather than per field. `4f1b648` swept three other
  sub-parsers onto `parseWhole`/`requireEnd`; this is the one site it missed, and every
  block-form list field of every section kind goes through it.

## Open questions
- [blocking] none
```

| section | holds |
| --- | --- |
| `## Deliverable` | what done looks like. Feeds the audit prompt's "unmet acceptance criteria" |
| `## Chunks` | the checklist — **and the implementation order, which is list order** |
| `## Handoff` | where the work actually is. Newest last, last line is the next action |
| `## Spec` | the detail, to whatever depth the work needs |
| `## Decisions` | settled, with rationale. Today's `**SETTLED (2026-07-29)**` convention, append-only |
| `## Open questions` | `- [blocking] …` or plain. Blocking ones surface in `tasks next` |

"Implementation order" is not a section because it is the chunk sequence. "Status" is not a
section because it is frontmatter. There is no `spec:` pointer field: external reference prose
like `docs/dsl-rewrite/grammar.md` is linked from `## Spec` like any other link.

### Frontmatter

**The id is the filename.** No `id:` field, so it cannot disagree with anything. Renaming
breaks inbound `blocked-by` references, which the check catches by name.

**Only `blocked-by` is declared.** `blocks` is its inversion, computed at read time.

**`system:` is validated against `docs/audits/systems.json`, and may be a list.** One
vocabulary across audits and tasks. A task touching two systems charges both audit budgets —
the same "double coverage rather than a gap" reasoning `systems.json` already applies to
`src/content` being owned by two systems.

**`audit:` is a list of finding references**, each `<doc> <id>` — `docs/audits/runtime-2026-07-
30.md H1, M2`. Many-to-many: one task may close several findings, and one finding may need
several tasks. This is what gate 8 counts.

**`severity:` is `high` / `medium` / `low`**, identical to what audits emit, so lifting `H1`
needs no translation. Accepted consequence, decided 2026-07-30: a high-severity defect and an
MVP-blocking feature tie on severity, and the dependent count then puts the feature first.
That is intended, but it means a shipped-content correctness bug can sort second. Add a fourth
level only if it bites.

**`status:` is written, and is one of five:**

| value | means |
| --- | --- |
| `open` | not started |
| `active` | underway; at most one repo-wide, enforced by `tasks check` |
| `blocked` | stuck on something outside the dependency graph. Requires a reason |
| `done` | finished, awaiting the user's confirmation |
| `deferred` | out of MVP |

`blocked` is distinct from having an unmet `blocked-by`, which is computed and needs no field.
It is for what the graph cannot see, which `systems.json` already records in prose ("both
BLOCKED on the action.health/target: unification").

### Handoff is not a judgment call

Every task file has `## Handoff` from creation. Not gated on size, not written at the end of a
session.

**It is written when a chunk is checked, by the command that checks it.** `tasks chunk <id>
<n> --note "…"` ticks the box and appends the note in one call. There is no path that checks a
box without writing the note, so "the agent forgot to update the log before the session ended"
is not a thing that can happen — the update is not an end-of-session act at all.

The note answers what a cold session asks: where the work is, what is half-applied, what was
learned that is not in the code yet, what to do next.

### Commits are linked, not wrapped

`tasks` does not create commits. Wrapping git in a bespoke CLI breaks amend, rebase and squash,
and — the decisive problem — **a SHA written into a task file rots the first time the branch is
rebased**, which this project does; the integer conversion came out of a worktree and was
reapplied elsewhere.

So the task file holds no git data. The commit carries a trailer:

```
Task: block-form-list-drops-typos #2
```

`tasks show` derives a task's commits with `git log --grep`. The link survives rebase because
the message travels with the commit, and CLAUDE.md already says this is where context belongs.

Order of operations, which is what makes it checkable: `tasks chunk` writes the box and the
note, then the commit carries the trailer, so **one commit holds both the work and the
handoff**. `.claude/hooks/task-handoff.sh` — modelled on `audit-due.sh`, watching HEAD, same
per-worktree state file, same fire-once-on-the-edge discipline — then verifies two exact
things rather than guessing:

- HEAD moved with a `Task:` trailer, but that task's file is not in the commit.
- HEAD moved while a task is `active`, with no trailer at all.

Both write to stderr and exit 2, which surfaces to the agent as feedback. This is the forcing
function CLAUDE.md's commit rule ("make commits after each logical chunk") already implies but
never checked.

### Ordering

The queue is every task that is `open` with all `blocked-by` satisfied, sorted by:

1. `severity` — high, medium, low.
2. **Transitive dependent count**, descending.
3. Oldest first, from the file's first commit. Derived from git, not a field.

Step 2 answers "push features to a playable state before semi-trivial bug hunting" without a
second hand-assigned axis. "Make the thin RPG GUI work again" blocks the release gate, the GUI
mod portal and action-labels-as-members, so it floats; the five DSL lows have no dependents
and sink.

`--system` and `--severity` filter. `active` and `blocked` tasks print above the queue
regardless of filter, as does anything `done` awaiting confirmation.

### Commands

`scripts/tasks.ts`, run as `npm run tasks`. Layer-clean: `scripts` is the top layer and this
imports nothing from `src`.

Readers:

| invocation | behaviour |
| --- | --- |
| `tasks` / `tasks list` | the ranked queue: severity, system, dependents, chunk progress |
| `tasks next` | the top item's body, handoff, dependents, other open tasks in the same system |
| `tasks show <id>` | the file, plus blockers, dependents, audit finding, and its commits |
| `tasks check` | the CI gate |

Writers — one verb per section, so nothing is hand-edited:

| invocation | writes |
| --- | --- |
| `tasks new <slug> --severity --system [--blocked-by]` | scaffolds all six sections |
| `tasks start <id>` | `status: active`; refuses if another task is active |
| `tasks chunk <id> <n> --note "…"` | ticks the box, appends the handoff |
| `tasks chunk add <id> "…"` | appends a chunk |
| `tasks note <id> "…"` | handoff only, when no chunk moved |
| `tasks decide <id> "…"` | appends to Decisions, dated |
| `tasks ask <id> "…" [--blocking]` | appends to Open questions |
| `tasks answer <id> <n> "…"` | moves a question into Decisions |
| `tasks spec <id> --append \| --file <path>` | writes Spec |
| `tasks block <id> --note "…"` | `status: blocked` with its reason |
| `tasks defer <id>` | `status: deferred` |
| `tasks done <id>` | the completion protocol below |

`tasks next` listing same-system siblings is the churn reduction: the DSL lows L1–L5 want to
land with H1 in one pass over `src/grammar`, and `backlog.md` gives no signal they are
neighbours.

Four slash commands under `.claude/commands/` wrap the readers and carry the protocol prose
that `backlog.md`'s "How to use" preamble holds today: `/task-next`, `/task-context <id>`,
`/task-new`, `/task-done <id>`. The originally proposed `/create_task`,
`/get_first_backlog_item` and `/get_item_context` map onto three of them.

### Completion, confirmation, and compaction

`tasks done` refuses while any chunk is unchecked, and names the unchecked ones. It sets
`status: done` and leaves `confirmed:` empty.

**Every `tasks next` prints an "awaiting your confirmation" block for each done-but-
unconfirmed task until the user fills it.** This is the existing `**DONE pending user
confirmation**` prose — two items in `backlog.md` carry it right now — turned from a note
someone might read into the thing that nags on every invocation.

**Confirmation compacts the file.** `tasks confirm <id>` stamps the date and strips `## Chunks`
and `## Handoff`, leaving frontmatter, Deliverable, Spec, Decisions and Open questions. Those
two sections are process scaffolding whose entire audience is the next session, and once
confirmed there isn't one; git holds every word. This is what keeps a tracked archive bounded
— see the prose budget below.

Archiving is that status flip. Nothing moves, nothing is copied into a second document, so the
failure mode disappears rather than being automated.

## Prose budget

Measured 2026-07-30. Tracked repo 1668 KB, of which prose (`docs/` plus root `*.md`) is
**548 KB — 33%**, code and config 1108 KB, shipped DSL content 10 KB.

Tracking `completed-tasks.md` adds 70 KB: 4% of the repo, and after compression roughly
15–20 KB in the object store, once. **Disk is not the problem and will not become one.** The
dimension that actually hurts is agent context: 548 KB of prose is ~140K tokens, more than a
context window. Gitignoring is the wrong lever for that — an untracked file costs identical
tokens when read, while losing durability, CI visibility, fresh clones, and any chance of
tooling scoping the read. It pays nothing where it hurts and loses everything where it helps.

The real growth is not the task archive. It is completed work logs:

| file | size |
| --- | --- |
| `docs/combat/deliverable-log.md` | 50 KB |
| `docs/dsl-modules/deliverable-log.md` | 48 KB |
| `docs/dsl-rewrite/delegation-experiments.md` | 46 KB |
| `docs/dsl-rewrite/deliverable-log.md` | 45 KB |

190 KB — a third of all prose — in four files describing finished work. So the policy that
matters is **compaction at confirmation**, above, not a decision about what to track. Two of
those four are finished and compact on migration.

`completed-tasks.md` is therefore tracked, not frozen: it becomes `status: done` task files in
chunk 6, already compacted, and `.gitignore:16` is deleted.

## The audit trigger

The commit-count threshold is a proxy for "how much unreviewed change has accumulated in this
system". The idea is sound; the unit and the firing point are both wrong.

**The evidence it is arbitrary.** `a98df9e increased audit frequency from 10 to 20` — the
threshold was hand-retuned once already, with no measurement behind either number.

**The evidence it fires badly.** `e65f784 Audit the DSL load path at 22 commits` sits on
`dsl-pass2-resources` between `49b7ca6` and the integer conversion. The branch exists to do
runtime work; the audit was of a different system, and it happened there because a counter
crossed a line while work was in flight and CI went red. A commit boundary is mid-task by
construction — a task is many commits — so this is not bad luck, it is the design.

**The window to switch is now.** On 2026-07-30 every system was audited to zero commits
(`d7c6493`, `14ec4a9`, `72a40f0`), so no counter is carrying history and none is close to
firing. Testing procedure — which owns `scripts/` and `.claude/`, everything chunks 1–4 touch
— was at 16 of 20 hours earlier and would have tripped mid-build. It is at 0.
   - An audit was conducted. See commit: d7c6493928db0bef5f778a28748fd49456743c07

### The change

- **The unit is a chunk of a completed task, not a commit.** A chunk is a declared, coherent
  piece of work; a commit is an arbitrary slice, and the counter cannot tell a seven-commit
  feature from seven typo fixes. Chunks are declared up front, before anyone knows which will
  trip a budget. Combat chunks 1–7 are already one commit each — the unit is not new.
- **The fire point is task completion.** The budget is evaluated in `tasks done` and nowhere
  else, so nothing mid-task can make a system overdue and CI cannot go red while work is in
  flight. This is the part that fixes the observed failure; the counter's precision is
  secondary.
- **The audit gates confirmation, not the fix.** When completing a task tips a system past its
  budget, the audit runs and its findings become tasks before the user confirms. Closing does
  not wait on *fixing* what the audit found, or nothing would ever close.
- **A task may demand one: `audit: on-completion`.** Escalation, not a threshold, and it
  matches what already happens by hand — `1d13661` and `745659a` were deliberate audits
  commissioned at the end of a deliverable rather than triggered by a counter.
- **Both numbers stay visible.** `audit-status` keeps printing commits-since-`lastAudit`; the
  *verdict* comes from the chunk budget. A system whose commit count runs far ahead of its
  chunk count is doing work outside the task system, and the two figures side by side make
  that observable instead of silent. That is the safety net for hotfixes and dependency bumps.

### How the budget is counted

**Derived from git, never stored.** `2e05502 Derive the audit counters from git instead of
hand-maintaining them` is the precedent, and a stored chunk counter would walk it back.

The count for a system is the chunk-closing commits in `lastAudit..HEAD` — `git log --grep
'^Task:'` — whose task names that system, **restricted to tasks that are now `done` or
confirmed.**

That restriction is not a detail; it is what makes the whole change work. Trailers land per
chunk, so counting all of them would let the budget cross mid-task and reproduce exactly the
failure this replaces. Because an active task's chunks are worth zero until it completes, the
counter can only move inside `tasks done`, which is the boundary the design promises.

It also means compaction is safe: `tasks confirm` strips `## Chunks`, but the budget reads
trailers, not boxes, so a compacted archive still counts.

`tasks done` does not run the audit — nothing automated should. It reports the system as due
and points at the audit prompt, the same way `audit-status` already does.

### What an auditor is handed

Found while running the six audits that brought every system to zero: an agent asked to audit
a system has no way to see what it must review, and resorted to

```
git log --oneline 49b7ca6..HEAD && git log --oneline 745659a..HEAD && …
```

— every commit in the range, unfiltered, for three systems at once, with no indication of
which touched the system, which changed code, or which files. `audit-status --verbose` already
prints the per-commit `code` / `no-op` verdict it computes, and the agent did not find it,
which is its own evidence: the affordance exists and is undiscoverable.

`npm run audit-status -- --brief "<system>"` emits the audit's working set:

- the range, `lastAudit..HEAD`, and the previous audit doc to read for history.
- **the tasks completed in that range** — id, deliverable, decisions. This is the part worth
  having. Twenty-two commit subjects do not tell an auditor what was being attempted; four
  task deliverables do, and `## Decisions` hands over the reasoning to disagree with, which is
  what the audit prompt's "do not assume the implementation approach is correct" asks for.
- the code-changing commits only, already filtered by the existing `codeOnly` stripper.
- the system's files touched in the range, and the `git diff` invocation that shows the
  cumulative change.

This is the second half of the audit integration: gate 8 pushes findings out into tasks, and
`--brief` pulls tasks in as audit input.

### Threshold

**The starting value is a guess and should be labelled one.** Recent audits fired at 11, 20
and 22 commits, which at two to three commits per chunk suggests something near 8. Start at 8
chunks and tune against observation.

**Counters reset at the switch.** Every system's chunk count starts at zero when chunk 5
lands, and whatever is DUE under the old rule at that moment is resolved first. Nothing is
currently due, which is the cheapest time to do this.

## Gates

`npm run tasks check`, one script, all reference-integrity — the same class as
`audit-status`'s existing `documented()` and orphan checks:

1. Every `blocked-by` names an existing task file.
2. No dependency cycles.
3. `system:` names systems in `systems.json`; `severity:` and `status:` are in vocabulary.
4. Every task has all six sections — **except confirmed ones, which have four**, compaction
   having removed Chunks and Handoff by design.
5. At most one `active` task.
6. `active` and `blocked` tasks have a non-empty `## Handoff`; `blocked` states a reason.
7. `status: done` has no unchecked chunks.
8. **Every finding in every current `lastAuditDoc` is referenced by at least one task's
   `audit:` field**, in any status — a closed finding still counts as coverage.

Gate 8 is the one with history behind it, and it is half the integration with the audit
system: it makes "the audit landed and its findings were never lifted" fail CI.

It is stated per *finding* rather than per *doc*, which the first draft rejected as too
expensive on the assumption that findings were free prose. They are not. All twenty audit
docs head their findings `## H1`, `## M2`, `## L3` without exception, so the ids parse, and
per-doc coverage would have let four of a doc's five findings vanish while the gate stayed
green. The convention is load-bearing now, so `--brief` should say so when an audit is written.

Only the six docs named as a current `lastAuditDoc` are gated — 33 findings today. Superseded
docs are history and are not re-litigated. An audit that genuinely produced nothing is
declared, not implied: `systems.json` gains an optional `noFindings: ["docs/audits/<doc>.md"]`
array per system, so that claim is written by someone rather than inferred from silence.

`tasks check` runs in CI next to `audit-status`, ubuntu only, same as it.

**Sequencing constraint:** gate 8 cannot enter CI before chunks 6 and 7 land, or the repo goes
red on the six audit docs that predate the store. Chunk 2 builds the check; chunk 8 wires it.

## What this deletes

- `backlog.md`, 604 lines. `docs/tasks/` is the store, `npm run tasks` is the view.
- Its five-line "How to use" preamble, which moves into the commands that enforce it.
- CLAUDE.md lines 23–25, including the hand-maintained `Currently live:` pointer.
- The deliverable-log concept, as something separate from a task.
- The judgment call "is this big enough for a deliverable log".
- Four incompatible spellings of "this sub-piece is finished".
- `.gitignore:16`.
- AGENTS.md's contents, which describe `src/game/contentDsl/`, JSON-driven content and Zustand
  stores, none of which exist. It becomes a pointer to CLAUDE.md.

CLAUDE.md's replacement is roughly six lines: tasks live in `docs/tasks/`, `npm run tasks` is
the entry point, `docs/audits/` and `npm run audit-status` is its sibling, every task file has
the same six sections. Two commands, one pathway, and the file gets shorter.

## Ownership changes required

`audit-status.ts:25` fails CI on any tracked file owned by neither a system nor `unowned`, so
these land in the same commit as the files:

- `scripts/tasks.ts`, `scripts/tasks.test.ts` → **Testing procedure** `paths`, alongside
  `scripts/audit-status.ts`.
- `.claude/commands` → **Testing procedure** `paths`, alongside `.claude/hooks`.
- `docs/tasks/` → already covered by `unowned.paths`' `docs` entry. No change.

`package.json` gains `"tasks": "tsx scripts/tasks.ts"`. `.github/workflows/test.yml` gains
`npm run tasks check` under the same `if: matrix.os == 'ubuntu-latest'` guard as
`audit-status`.

Chunk 5 additionally modifies `scripts/audit-status.ts` and the `systems.json` schema, both
owned by Testing procedure — the system the budget change most affects, and the reason chunk 5
is sequenced before that budget can be spent.

## Migration

`backlog.md` holds **54 `##` items and 4 `###` sub-items across 868 lines** — it grew from 604
on 2026-07-30 when six fresh audits lifted 33 findings into it. Expect ~58 files, plus the logs:

- The 4 `###` items (Droptables, Skill levels, the two E2E entries) become their own tasks with
  `blocked-by:` naming their parent — the relation the nesting was expressing.
- `## DSL audit 2026-07-30 lows` splits into five tasks, L1–L5, each with its own `audit:`
  reference. One heading holding five unrelated findings is why they cannot be ranked or closed
  independently.
- `# Deferred — out of MVP` items become `status: deferred`; the struck `# remove` item and the
  `# Resolved by triage` items become `status: done`, confirmed and compacted.
- The two marked done-pending-confirmation (`bd77f26`, and the integer conversion at `2c2ccee`
  / `f9dfd72`) migrate as `status: done` with `confirmed:` empty, so they surface in the first
  `tasks next` and get closed properly.
- `docs/combat/deliverable-log.md` becomes `docs/tasks/combat.md`, `active`, its status table
  becoming `## Chunks` and its open decisions `## Open questions`.
- `docs/dsl-modules/` and `docs/dsl-rewrite/deliverable-log.md` are finished work: they migrate
  as confirmed, compacted tasks. `docs/dsl-rewrite/grammar.md`, `postmortem.md`,
  `backlog-process-review.md` and `delegation-experiments.md` are reference, not tasks, and
  stay where they are.
- `completed-tasks.md` becomes confirmed, compacted task files; `.gitignore:16` is deleted.
- Every migrated task gets `## Deliverable` and `## Handoff` seeded from what its body already
  says; for most, the handoff is one line stating no work has started.

**Prose is moved verbatim into `## Spec`.** The risk is silent content loss across 604 lines
plus four logs, and the mitigation is that the migration commit is reviewable as a diff against
`git show HEAD~1:backlog.md` with every heading accounted for. Do not rewrite bodies in the
same commit as the move; seeding Deliverable and compacting archives are the only edits.

Chunk 6 is large enough to be its own task under the new system by the time it runs. Split it:
backlog first, logs second, archive third.

## Open questions

- [blocking] none.
- **Does the handoff hook block, or only warn?** `audit-due.sh` exits 2, which surfaces to the
  agent as feedback rather than stopping the commit — PostToolUse fires after the commit
  already happened. The stronger version is PreToolUse on the commit itself, which is a real
  gate and a real annoyance. Start weak.
- **Is `active` durable across sessions?** It is a field in a tracked file, so yes — including
  when a session dies mid-task, which is the case that matters. The cost is a stale `active`
  after an abandoned branch; the one-active rule turns that into a visible error rather than
  silent drift.
- **`.planning/` was tracked on 2026-07-30** (`f4fe0ee`), closing the process review's third
  recommendation, and declared `unowned` in `f8c8c8d` so the orphan check stays green.
  `.scratch.md` alone remains untracked and is still the open-thoughts bucket; `/task-new` is
  the promotion path from a thought to a vetted task. The six now-tracked planning docs are
  reference, not tasks, and do not migrate.
- **No test precedent for `scripts/audit-status.ts`** — it ships untested. `tasks.ts` should
  not follow that precedent: the ordering function, cycle detection, the trailer parser and
  each check are real logic with cheap tests, and `scripts/play-cli.test.ts` is the pattern.

## Implementation order

1. **Chunk 1** — parser and model, readers only. Nothing is written, so it can be eyeballed
   against a handful of hand-written task files before the backlog is touched.
2. **Chunk 2** — the check, plus the `systems.json` ownership entries. Not yet in CI.
3. **Chunk 3** — the writer verbs. **Chunk 4** — slash commands and the handoff hook.
4. **Chunk 5** — the audit trigger and `--brief`. Every system is at 0 commits as of
   `72a40f0`, so the counters have nothing to carry across; do it before chunks 1–4 spend
   Testing procedure's budget back up.
5. **Chunk 6** — the migration, split three ways. `backlog.md` is deleted here, not before.
6. **Chunk 7** — walk the six `lastAuditDoc` values, confirm each is referenced by a migrated
   task, declare `noFindings` where an audit produced none.
7. **Chunk 8** — CLAUDE.md, AGENTS.md, `.gitignore`, and `npm run tasks check` into
   `test.yml`. Last, because gate 8 only passes once 6 and 7 are done.

On merge, archive this log and lift anything unfinished back into `docs/tasks/` — which by then
is where this log's own remaining chunks already live.
