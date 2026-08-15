# The workflow

The live specification of how work moves through this repository, and of the tool that carries it.
Kept current: when the tool and this document disagree, that is a defect in one of them. A branch's
promise lives at `docs/specs/<slug>.md` and becomes a historical record the moment it merges — this
file never does.

Two roles. A **planner** decides what a spec promises and never implements, so its context never
fills with low-level detail. A **worker** implements one spec and never plans, so its context is
spent on one piece.

A spec is that piece. It is not cut into sub-tasks, and the step that used to cut it has been
removed rather than improved: a planner cutting one rule into slices has only where the code lives
to cut by, never where the rule applies, so it cuts by surface — and each slice then applies the
rule to its own surface and truthfully reports success while the rule remains unenforced everywhere
else. That failure is recorded as `a-clause-that-enumerates-instances-is-graded-on-the-enumerat`.
If a spec looks like it needs cutting, it is too big: write two, each with its own clauses and its
own audit.

## The session, in order

Every command is `npm run tasks -- <verb>`. The record verbs (`show`, `edit`, `start`, `stop`,
`done`, `decline`, `promote`) accept a unique prefix or substring of an id; everywhere else —
`spec add`/`remove`, `plan`, `--id`, `--requires` — an id is exact.

1. **`tasks plan-prompt <slug> <path>...`** — the planner's brief, generated rather than
   remembered: it runs `tasks where <path>` over every region the work will touch and prints both
   halves of what comes back — prior art (everything, open or closed, that has ever claimed the
   region: `writes`, `files`, `produces`) and **rulings** (event-log decisions and closed-record
   `reason`s whose text names that path or its basename). A claim says someone has written here; a
   ruling says someone has already decided something about it, and the two are printed under
   separate headings because a planner acts on them differently — a ruling against the approach
   about to be taken is a stop, not a data point to work around. Ask by **path** as well as by
   name — a capability name is authored prose and two authors will not choose the same words,
   while a path is the same string for everyone. Then decide, deliberately, which capabilities
   this branch **adds**, which it **extends**, which it **takes over**, and which it **retires**
   — and record that in the spec's `## Decisions`, because it is the reasoning a later planner
   would otherwise re-litigate. A survey that finds an owner is a success: reuse it, or write down
   why a second one is right. Naming no paths still prints the clause format and the
   `plan`/dispatch sequence below, so the brief is worth running even at the first guess.
2. **`tasks spec new <slug>`**, then write `docs/specs/<slug>.md` — numbered proof clauses under
   `## Deliverable`, in the literal `- [cN] text` form `plan-prompt` prints. The spec is the
   contract, never the test plan. Run `spec new` after the survey above, not before — it writes
   only the scaffold, never a planner's capability decisions.
   **Every clause carries a `proof:` target on the line below it**, a `vitest <path>` or a
   `proof: command`. This is not decoration: `audit-prompt` builds the mutation manifest from those
   targets, and a spec of pure prose hands an auditor nothing, which is the single largest measured
   cost in this repository — 37 recorded occurrences, 25 to 45 minutes of hand-aiming per pass, on
   at least eight specs.
   **If a clause says *every*, its proof derives its own subjects.** A test that enumerates cannot
   grow when the code does, so an enumerated proof under a universal clause guarantees the audit
   grades the list rather than the sentence. Sixteen hand-written `@ts-expect-error` lines had gone
   stale by seven fields; the walk over the published types that replaced them costs 54ms and covers
   the field written next month.
   A branch may declare more than one spec, and each is graded and audited on its own. `audit-prompt`
   infers the spec from the branch name and withholds the pass file and the manifest when that
   inference disagrees with the slug asked for — so a branch working several specs audits each from
   a worktree whose branch is named after it, per step 6.
3. **`tasks plan`** — grades the open specs against each other for overlap, unstated dependencies
   and duplicated interfaces before anyone is dispatched. It reports and refuses nothing. Two specs
   writing one region is the collision that costs, and it is the one this check exists for now that
   a spec is never cut into members. Then run `tasks work-prompt <slug>` and read what comes back,
   because it is the brief a dispatcher will hand a worker and a plan that grades clean can still
   put the wrong thing in front of one. `tasks system` / `tasks system "<name>"` / `tasks where
   <path>` answer the architecture.
4. **Dispatch a worker with one instruction**: "run `npm run tasks -- work-prompt <id>` and do what
   it says" — symmetric with the auditor's in step 6, and for the same reason: a hand-written brief
   is a copy of the record that drifts from it, and composing one is where a planner smuggles in
   detail nobody asked it to hold. The brief invites refusal, and a planner must believe it. The
   argument is normally the **spec slug**, since the spec is the work. An exact task id wins over a
   spec of the same name.
   **One worker per worktree at a time, and it stages explicit paths** — `git add <paths>`, never
   `git add -A`. Two workers sharing a tree stage each other's half-written files and run the suite
   against each other's edits; measured here as 206 lines of a live worker's uncommitted test file
   swallowed by another actor's commit, and a second worker's commit lost to the race.
   **The worker proposes before it implements**: `tasks start <id> --actor <name>`, then
   `tasks edit <id> --writes <what it will actually touch> --grant commitment` — the worker has
   just read the region and the planner has not, and `--grant commitment` is the word that turns
   the forecast into a promise. This is also the only place a durable capability gets registered:
   `tasks concept "<system>" "<name>" --paths <paths> --note "produced by <id>"`.
5. **Work.** `tasks next` for what to pick up; commit after each logical chunk;
   `tasks done <id>... --commit HEAD` closes against the commit (several ids in one call). If the
   diff diverges from the grant, correct the record and say so in the commit body — that is
   information, not a violation.
6. **Audit.** Commission an auditor with the one instruction "run
   `npm run tasks -- audit-prompt <slug>` and do what it says" — the brief is generated and
   prints the eight steps an auditor takes, in order, above the data they act on. It writes two
   files: a mutation manifest wired to the clauses' own tests and refusing to run until the
   auditor has aimed it, and the pass file, one line per clause, which the auditor fills in and
   hands back with `tasks audit <slug> --args-from <it>`. That is the one filing route for a
   branch audit — a full pass carrying evidence a next pass can re-run does not fit on a command
   line. `tasks import <doc>` reads findings out of a written report and belongs to the
   whole-system sweeps under `docs/audits/`, which are a different thing from one branch's audit.
   Filing findings without `--proof` flags appends no pass, so late findings never reset verdicts.
   **N specs need N auditors, and they are the one thing here that genuinely parallelises** — on one
   condition: each gets its own `git worktree`, because `npm run mutate` rewrites source in place
   and an auditor sharing a tree reads another's mutant as its own baseline. Name each worktree's
   branch after its spec so `audit-prompt`'s strict route resolves it with no `--branch` override
   and prints nothing false. The gate is in the brief alone; `tasks audit` files whatever it is handed.
   **Filing is the one step that cannot be concurrent, and serialising it costs nothing.**
   `docs/tasks.jsonl` is read-modify-write under no lock, so two `tasks audit` or `tasks add` calls
   in flight lose records with no error raised. The pass file is already the hand-back artifact:
   auditors fill theirs, one actor runs `--args-from` over each in turn. That is seconds against a
   parallel run, and it is the only place cross-auditor duplicates are caught — parallel auditors
   cannot read each other's filings the way a serial third one can.
7. **Triage.** A separate step with a separate actor: the auditor files findings and never promotes
   one, and `audit-prompt` tells it so. Findings from the branch's **own first pass** skip the walk:
   promote HIGHs and anything judged fix-now with `tasks promote <id>... ` — they are always
   promoted anyway, and a human can interrupt. From pass 2 on, promotion extends what the spec owes,
   so it waits for the human: `tasks triage` walks the queue (`[1] promote [2] defer [3] decline
   [4] redirect [a] ask [s] skip [q] quit`; `[a]` records a question on the finding and leaves it
   unreviewed).
8. **Close and merge.** `tasks merge-ready` runs the whole merge gate — tsc, tests, layer-check,
    audit-status, doctor, byte check — plus this branch's standing. The specs a branch owes are read
    from nothing but its own store diff: every task record that changed between the merge base and
    this checkout, filtered to the ones naming a spec, is what this branch **declared** — a spec
    merely written as markdown, with no record ever pointing at it, was never declared and is never
    graded. Every declared spec is graded **on its own** — a branch working two cannot go green on
    the strength of the one it finished — and each is graded on **its own members only**: the ones
    its own diff changed, and the clauses only those members discharge. A member another,
    already-merged branch closed earlier is not this branch's to answer for, and a clause none of
    this branch's members discharges never blocks its clauses leg. A branch declaring no spec owes
    no clause; a checkout whose diff cannot be read at all (no merge base, an unreadable store
    snapshot) fails loudly rather than reading that as "declares nothing" — the gate never guesses.
    One line per leg, non-zero when a leg fails, and **every failing leg names
    the command that advances it**, the declared spec's own slug included — an outstanding clause
    names `tasks next --spec <slug>`, an unreviewed finding names `tasks triage --spec <slug>`, a
    moved base names the merge of it into this branch. A fully green run
    names `tasks spec done <slug>` for every spec it declared and then the merge, so "work until
    `merge-ready` is green" is an instruction rather than a judgement — and there is no leg whose red
    state is meant to be read as noise: a red spec or clauses leg is real debt, on a member this
    branch itself worked. It stops short of merging: the merge body is the one
    artifact whoever did the work has to write.
9. **Record what it cost**: a friction is filed into the store like anything else —
    `tasks add "<what cost you>" --kind finding --fault tooling|contract|nobody`, with
    `--breaches <lesson-handle>` when what failed was an instruction that did not land. There is no
    second place: prose in a markdown file does not aggregate, so the friction that recurs is
    exactly the friction that stays invisible, and nothing the tooling generates may send a report
    outside the store. Hitting one the channel already holds is
    `tasks recur <id> --note "what it cost this time"`, which appends an occurrence and increments
    nothing; reading a lesson and finding it clean is `tasks checked <handle> --note "..."`, which
    is what separates a lesson that is working from one nobody looked at. `tasks friction` is the
    one query over all of it, and none of it gates anything.
10. **Record the reasoning**: `tasks note "<one line>" --id <id>` and
    `tasks decision "<one line>" --spec <slug>` as they happen; `tasks log --id <id>` /
    `--op decision` answers later, from the log alone, and `tasks show <id>` prints both back
    against the record they name. A decision made in a session and not recorded here is a
    decision the next planner will re-litigate — which is why `done`, `decline` and `triage`
    each print the command rather than leaving you to remember it.

## Why it is shaped this way

**Write grants.** `writes` is what a spec's work may change (files or directories; a directory
covers everything beneath it) — not `files`, which is evidence about where a finding was observed.
`produces` names an interface nothing owns until the work lands, so "who owns batching?" is a
query instead of a guess. `requires` orders work; a forward reference to a record that does not
exist yet holds it until it does. `tasks plan` reports eight shapes of defect and note —
two unordered records writing one region, a write into a region another is producing an
interface for, two claims on one interface, a claim the repository already answers, a plan
concentrated in one path, a grant it cannot read, a wildcard it cannot resolve, and one that
starts blocked. Those now grade **specs against each other** rather than members within one, since
a spec is never cut. Dispatching against a reported defect is a call a planner may make; making it
unknowingly is not.

**Why the cut was removed rather than improved.** The rule it replaced — cut by write grants, so no
two slices touch one file — is sound for work that is genuinely several pieces, and it is exactly
wrong for one rule that reaches many files. A planner has only the file tree to cut by, so it cuts
by surface; each worker then enforces the rule where it can see it, reports honestly, and the rule
is left unenforced everywhere it could not. `reimplement-localization` paid seven audit passes to
that, its c3 unmet at six of them on a new surface each time, and the successor spec began
reproducing it — a stat, then a slot, then a skill — until the author stopped it. What closed it was
one sweep applying one rule everywhere at once. Chunks touching one file are one task; one rule
across forty files is also one task.

**Forecast and commitment.** A grant also records which side of step 4 it is on, and `plan`
grades an overlap as a **defect** only between two commitments. Anything else is a note naming
the soft side. The reason is measured: four independent roadmap tasks reported five collisions
because the honest grant on unread code is a directory and a directory overlaps everything
beneath it, and narrowing them to invented file paths took the count to zero by making the
record false. So the check moved rather than the record. A grant that has said nothing is a
third answer and is weighed like a forecast — it has no more read the code than one.

**Concepts.** A concept is one thing a system knows how to do, declared in
`docs/audits/systems.json` inside its owning system. Register durable capabilities only — a
branch's output ("playtest findings") is not one. `tasks done` prints unregistered claims and the
registering command; it never writes one itself, because that judgement is the point. Two
concepts claiming one file is the report that the file does two jobs.

**Audit outputs.** A pass has two outputs that behave differently. A finding enters `unreviewed`
and waits — that decouples the auditor from the cost of what it finds, which is the condition
under which auditors are useful. An `unmet` clause becomes an open `undelivered` member of the
spec directly — high severity, no triage — because it is scope the branch already promised.
An ungraded clause records `unknown` and creates nothing.

**The store is the record.** Every store write appends to `docs/events.jsonl` automatically —
who, when, branch, head, what changed. `tasks log` answers from the log alone, never by joining
to present-day state, so history stays exact after records are re-pointed. `tasks doctor` scans
and reports; it fails on exactly one condition, a line that will not parse. Reads always answer;
writes refuse only malformed input; no semantic disagreement fails a build.

## Where the deeper reasoning lives

- `.planning/agent-swarm-theory.md` — what a planner owes the tree, learned from rounds that failed
- `.planning/orchestration-research-2026-08-02.md` — the literature this protocol draws on
- `docs/audits/` — the archive; every finding label cited above is traceable there
