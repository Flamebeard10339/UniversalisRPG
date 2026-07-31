# Task system

Replaces `backlog.md`, the per-feature deliverable logs, and the audit timer retired in `4beee54`.

## Deliverable

A branch writes down what it promises once. Findings arrive as questions rather than as work, and
one pass answers all of them. A cold session starts from `git log` plus a single command.

Proof:

- `tasks next` and `tasks check` return in under a second against a 200-task store. The store this
  replaces cost 19s at 94 tasks and 30s at 105, and the growth driver was the audit protocol itself.
- The 125 findings standing in `docs/audits/` are triaged in one `tasks triage` session, and the day
  after it the store holds fewer than 40 open tasks.
- A finding can be closed without being fixed, and the store records who decided that and why.
- A second audit pass cannot produce *new* work that blocks the merge. The one thing it can block on
  is a proof clause the branch had already promised.
- A spec whose deliverable is unmet cannot be marked done, and cannot be rescued by editing the
  deliverable: `check` fails on a clause that differs from its state at the merge-base.
- `tasks handoff` is under 40 lines and names the files the next session needs.

## The workflow

```
  spec ─▶ branch ─▶ work ─▶ audit ─▶ triage ─┬─ promote ─▶ fix ─┐
                     ▲                        │                  │
                     └────────────────────────┼──────────────────┘
                                              │
                                       defer / decline
                                              │
                                    spec done ─▶ merge
```

1. **One spec per branch.** The spec is a markdown file naming the tasks the branch promises to
   close. It is the promise, not the log.
2. **The audit reads a diff.** `git diff $(git merge-base main HEAD)..HEAD`, scoped to each system
   the diff touches. No commit counting. A branch touching four systems is a branch that was too
   broad, and that is useful signal rather than something to model.
3. **An audit is not a document.** It is a recorded pass over the spec plus the tasks it produced.
   There is nothing to write, parse or keep in sync, and a finding's evidence lives on the finding.
4. **An audit cannot create work.** Every finding enters the store as `unreviewed`. This decouples
   the auditor from the cost of what it finds, which is the condition under which auditors are
   actually useful.
5. **Triage assigns state, and a human runs it.** Promote joins the current spec and blocks the
   merge; defer leaves it open and unclaimed; decline closes it with a reason.
6. **Pass 2 and later may defer or decline, never promote.** This is the only rule that terminates
   the audit-fix loop, and it terminates it by construction rather than by discipline.
7. **A deliverable the branch did not deliver is promoted automatically.** The audit answers `met` or
   `unmet` against every proof clause the spec froze when the branch opened. Each `unmet` becomes an
   open member of the spec without passing through triage, at every pass, and it cannot be declined.

   This is not an exception to rules 4 and 6 so much as their other half. Those rules stop a spec
   from *growing*; this one stops it from *closing falsely*. It cannot inflate scope, because it
   introduces nothing the branch had not already promised — it refuses a completion claim the diff
   does not support. It has happened here before: a feature shipped, and the audit found the
   deliverable was never actually delivered.
8. **`spec done` means every member is `done` or `declined`.** A member that is neither leaves the
   spec and becomes deferred. Without this the spec can never close, which is precisely how the
   previous backlog grew every day.
9. **Merge requires a done spec and a recorded audit pass.**

## The store

Two files, with opposite lifecycles kept apart. Fusing them is what produced a 7,000-word task
document in the system this replaces.

**`docs/specs/<slug>.md`** — prose, human-written, one per branch, few in number. The filename is the
slug. Sections: `## Deliverable` (with its proof clauses), `## Decisions`, `## Open questions`. No
status table, no chunk list, no handoff — all three live in git.

**The `## Deliverable` and its proof clauses freeze when the branch opens.** They are the only
machine-read part of a spec, because rule 7 answers against them one clause at a time. Editing them
mid-branch is how that rule becomes theatre: the cheapest way to make an `unmet` verdict disappear is
to weaken the sentence it was measured against. `tasks spec amend <slug> --reason "..."` is the
sanctioned way to change one: it archives the current text under `## Amendments`, dated and reasoned,
then leaves `## Deliverable` for a human to edit — loud, dated, and appears in git, without forcing
the team to close the spec and open another for the common case of understanding the requirement
better mid-branch. `tasks check` compares the live clauses against the most recent amendment's
archived text, or against their state at the branch's merge-base when the spec has never been
amended, and fails on a difference.

**`docs/tasks.jsonl`** — one task per line, machine-owned, never hand-edited. One read loads the
store. Line-oriented so a diff shows exactly which task changed and so concurrent branches usually
merge clean.

```json
{
  "id": "checksave-object-fields",
  "title": "checkSave crashes on the save bodies it exists to reject",
  "kind": "finding",
  "state": "unreviewed",
  "severity": "high",
  "system": "Runtime",
  "spec": null,
  "requires": [],
  "files": ["src/runtime/save.ts:88", "src/runtime/save.test.ts"],
  "deliverable": "loadSave refuses a body with cadences absent by name, instead of throwing TypeError from inside the validator",
  "evidence": "activeAction, player and activeBuffs get no check past isObject, so a body whose ids are all real but whose cadences is absent crashes the validator that exists to prevent it.",
  "source": { "spec": "runtime-integer-units", "pass": 2 },
  "reason": null,
  "closed": null
}
```

`kind` is `task`, `finding` or `undelivered`. Only `undelivered` behaves differently: it is created
already `open` and already a member of its spec, and `declined` is closed to it. A finding that can
be declined away is a completion claim that can be declined into truth.

`evidence` is a few sentences — the claim and how to reproduce it. Anything longer belongs in a
failing test, which is the only form of evidence that cannot rot. This is where an audit document's
prose used to go, and keeping it short is what makes a JSONL store readable in review.

`source` is the audit pass that produced it, or null for a task somebody just wrote down.

### Four states, and everything else derived

`unreviewed` → `open` → `done`, with `declined` reachable from either of the first two. `reason` is
required to enter `declined` and forbidden otherwise.

Never stored, always computed:

| reads as | is |
| --- | --- |
| fix now | `state: open` and `spec` is the current spec |
| deferred | `state: open` and `spec` is null |
| blocked | some id in `requires` is not `done` |
| active spec | the spec whose branch is checked out, or — on `next`/`handoff`/`list`/triage's promote target only, never on `check --merge` — the sole spec with open members, when no spec matches the branch |

Storing any of these would be a second record of a fact the store already holds, which is the defect
that produced `H1` of the last testing-procedure audit and is forbidden by CLAUDE.md.

`requires` is the only edge and it points one way. "B blocks A" is `A.requires ∋ B` read backwards;
the reverse index is built at load. Two fields for one relation is two things to keep in sync.

## Relevant files

The `files` array bounds an agent's first read. Standing instruction: **read these first, and widen
only when a test fails, a type does not check, or the change plainly does not fit.** It is a starting
point, never a fence — an agent that refuses to look further because a path was not listed produces
worse work than one that reads too much.

- **Named at the moment of finding, never maintained afterwards.** An auditor passes `--file` for
  what it actually read to reach the finding, and `import` harvests `path/to/file.ts:123` out of the
  22 legacy documents, which are already dense with them. Nobody revisits the list later: a
  hand-maintained list rots, and a rotted list that agents trust is worse than no list at all. An
  `unmet` proof clause takes the same flag, `--file N=path`, naming where the `undelivered` task it
  creates should tell the next session to start.
- **Paths are the contract; line numbers are a decaying hint.** Never resolve an edit by line number.
- **`tasks check` warns when a listed path no longer exists.** A task pointing at a deleted file has
  gone stale and should be re-read before it is worked.

## Commands

`npm run tasks -- <verb>`. Hard performance rule, from the measured failure of the last one: **no git
subprocess inside a loop or a sort comparator.** Anything git-derived is computed once into a table.

**Audit** — `audit <spec>` opens a pass, records `base`, `head` and the time on the spec, and is the
only way a finding enters the store. The auditor is normally an agent, so the verdict form is
non-interactive and one clause per flag:

```
tasks audit task-system-v2 --proof 1=met --proof 2=unmet \
  --evidence 2="triage loses the queue on ^C; nothing is written until [q]" \
  --file 2=scripts/tasks.ts:412 \
  --finding "..." --severity medium --system "Testing procedure" --file scripts/tasks.ts:412
```

Every frozen proof clause must carry a verdict before findings are accepted, and an unanswered
clause fails the merge gate. An auditor therefore cannot skip rule 7 by not thinking to check —
the question is asked structurally rather than remembered. Each `unmet` writes an `undelivered`
task straight into the spec, at every pass, bypassing triage. Findings arrive `unreviewed`, and from
pass 2 onward triage will not offer promote for them.

`audit <spec>` with no verdicts walks the clauses one at a time for a human doing it by hand.

**Intake**
- `add` — a task from nothing, for work that is not a finding.
- `import <audit-doc>` — the migration path only, for the 22 legacy documents under `docs/audits/`.
  Findings under `## H1` / `## M2` / `## L3` become `unreviewed` tasks carrying their severity,
  system and `path:line` references. Nothing written under this model will need it.

**Triage** — `triage` walks the unreviewed queue, severity first:

```
  [12/125]  H  Runtime   checkSave crashes on the save bodies it exists to reject
            docs/audits/runtime-2026-07-30.md#H1   src/runtime/save.ts:88

            loadSave gives activeAction, player and activeBuffs no check past isObject,
            so a body whose ids are all real but whose cadences is absent crashes the
            validator that exists to prevent it.

  [1] promote   [2] defer   [3] decline   [s] skip   [q] save and quit
```

Promote joins the current spec. Decline prompts for a one-line reason. Skip leaves it unreviewed for
the next session. Quitting saves — a 125-item queue will not be cleared in one sitting, and a triage
tool that loses work is a triage tool nobody opens twice.

**Work** — `next` (highest severity, unblocked, in the current spec), `show <id>`, `done <id>`,
`decline <id> --reason "..."`.

**Spec** — `spec new <slug>`, `spec add <slug> <id>...`, `spec remove <slug> <id>...` (the demotion
counterpart to `add`; refuses on an undelivered task, which rule 7 does not let leave a spec by hand),
`spec show <slug>` (members with their states), `spec done <slug>` (refuses while a member is
neither done nor declined, and names it), `spec amend <slug> --reason "..."` (archives the current
`## Deliverable` under `## Amendments`, leaving the live section open to edit — the sanctioned way to
change a frozen deliverable mid-branch).

**Handoff** — `handoff` prints the last commit's `Next:` line, the current spec's deliverable, the
open fix-now tasks and their files. This is the first command of a cold session.

**Integrity** — `check`, fast enough for CI: every id unique, every `requires` resolvable, no cycle,
`reason` present iff `declined`, every `spec` referencing a real file, every `system` in
`systems.json`, and a warning per `files` entry that no longer exists.

## The commit contract

Every non-exempt commit carries **a body** — at least one line past the subject, saying what was
done — and a **`Next:` trailer** saying what the following session should pick up.

The body is already "what was done", and this repository's commit bodies are unusually good. A
separate `Done:` header would be a shorter, worse copy of prose that is already there, so the
contract requires the body to exist rather than requiring it to be relabelled.

Only the last commit's `Next:` is live. Each commit restates the whole forward position; it never
appends a delta to the one before.

**Exempt:** merges, reverts, `fixup!` / `squash!`, and any commit whose entire diff lies inside
`unowned.paths` in `docs/audits/systems.json`. That exemption is why the partition survived the
timer's removal.

Enforced by a `commit-msg` hook, refusing with the reason on stderr. `--no-verify` stays available
for the case the exemption list gets wrong. Not a `PostToolUse` hook: the predecessor watched HEAD
after the fact and fired on `tasks confirm` bookkeeping commits within a day of shipping — its own
audit recorded that as `M7`, and a gate that cries wolf is bypassed within a week.

## The merge gate

`tasks check --merge` refuses when any of these is true:

- the spec has no recorded audit pass;
- a frozen proof clause has no verdict, or has an `unmet` one;
- the spec's deliverable text differs from its most recent amendment, or — if it has never been
  amended — from its state at the branch's merge-base;
- a finding on the spec is still `unreviewed`;
- a member is neither `done` nor `declined`.

The first three are rule 7 with teeth. Without a recorded pass there is no evidence an audit happened
at all, which is what the audit document used to supply and what the store supplies now.

It runs in CI **on `pull_request` only**. Nothing gates a push. It cannot redden `main`, and it
cannot redden a branch mid-work — the two properties the retired timer lacked. This is the only gate
being added, and it replaces one that was strictly worse.

## Bootstrap

**This spec is hand-written and the tool will not track its own construction.** A task store built
while being used to manage building the task store is exactly what happened last time.

Migration is not an import of everything.

1. Build store, `check`, `add`, `show`, `next`, `done`, `decline`. No triage yet.
2. Build `import` and `triage`. Import the 22 audit documents: 125 findings (17 H, 50 M, 58 L),
   many of them already fixed by a later window and never marked as such.
3. Triage them. Expect `decline` to take the majority — a finding whose fix nobody will fund is a
   finding, not a task, and the legacy document remains its permanent record either way.
4. Read `backlog.md` yourself and add only what survives. Do not machine-import it.
5. Delete `backlog.md` and the six `docs/*/deliverable-log.md`. CLAUDE.md also names a
   `completed-tasks.md` that does not exist; correct that in the same pass.
6. Build `spec`, `audit`, `handoff`, the `commit-msg` hook and `check --merge`. These are what the
   *next* branch runs, so they are the last thing this branch builds and the first thing that gets
   used in anger. This branch's own merge is the first real exercise of rule 7.

**Target: fewer than 40 open tasks on the first working day.** If triage leaves 120 open, it was not
triage, and the store will be the previous store with different file extensions.

## Decisions

- **Four states, not six.** `deferred` and `fix now` are spec membership. Storing them as states
  makes two records of one fact and invites them to disagree.
- **Two levels, spec over task, and no third.** This is the child-task structure the previous
  attempt wanted and never built. A task that needs its own checklist is a spec that has not
  admitted it yet. Chunks do not come back: a commit is already the unit of a session's work, and
  the previous system recorded that same event in a checkbox, a `Task:` trailer and a completion
  stamp simultaneously.
- **Audits cannot create work; only triage can — except against the deliverable.** The entire
  audit-inflation problem is a missing disposal step, not an excess of findings. The one finding
  that promotes itself is "the branch did not deliver what it promised", because that adds no scope:
  it withholds a completion claim rather than proposing new work. Its safety rests entirely on the
  deliverable being frozen, which is why the freeze is checked mechanically rather than trusted.
- **An audit is a recorded pass, not a document.** A document has to be written, parsed, kept in
  sync with the tasks lifted out of it, and gated on for existence and minimum size — the previous
  system did all four, and `lastAuditDoc` validation was one of the things that turned CI red. The
  evidence lives on the finding and the proof lives in a test.
- **`declined` is a first-class outcome and requires a reason.** `deferred` is a promise, so a
  deferred-only store grows forever. That growth was read as a system failure for months; it was a
  missing verb.
- **The auditor reports severity; the human assigns state.** An auditor holding both is rewarded for
  rigour with no cost model, and produces 22 audit documents in four days.
- **JSONL over one file per task.** The measured cost of the previous store was 94 file reads plus a
  `git log --follow` spawned from inside a sort comparator.
- **The spec's prose stays in markdown.** Escaped newlines in a JSON field are unreviewable, and the
  spec is the part a human actually reads.
- **2026-07-31 — proof clause 2's "the store holds fewer than 40 open tasks" is a measurement of the
  triage session's outcome, not a permanent cap on the store.** It is the proof that disposal
  happened, for the specific population the whole document is about — the 125 imported findings —
  not a ceiling on legitimate roadmap work added afterward by a different bootstrap step. Measured
  at `0291c17` (immediately after triage, before the backlog migration): 21 open, 104 declined, from
  125 total — met under either reading, since at that moment the store held nothing else. The
  store's current total (`155` tasks, `51` open) includes 30 `kind:task` items migrated from
  `backlog.md`'s settled feature specs and un-imported bugs, which are not findings and are not what
  the audit-inflation problem this clause guards against is about. Recorded rather than resolved
  silently, since the clause's wording alone does not disambiguate the two readings.

## Open questions

None. All three were answered on 2026-07-31; two carry a trigger rather than a date.

**Settled.** Audits produce tasks, not documents — which is why `import` exists only to drain the 22
legacy files and has no role afterwards.

**Deferred, with a trigger.** Declined tasks stay in the store. The cost is a monotonically growing
file; the benefit is answering "was this already considered?" against an agent that would otherwise
rediscover the same finding every quarter. Revisit if `check` slows. The store is being revisited
whole once the MVP lands, to unblock the v0.2 push, and that is the natural moment.

**Deferred, with a method.** A whole-system sweep has no cadence, and will not be given one by
guessing — that is the arbitrariness that killed the timer, and inventing a replacement number would
repeat it exactly. Sweeps are requested by hand and logged; the cadence gets derived from how often
that actually happens, after the MVP. Until then CLAUDE.md must not assert one.

## Audit passes

### Pass 1 — 2026-07-31

- base: `eb29fb7319554467833486907b3d39d4c8ece574`
- head: `297d847639cda94e82cb5ea6f4a4b25b894bd4e3`
- proof 1: unmet — npm run tasks -- next/check measured 1.1-1.6s wall time against a 200-task store; a no-op invocation alone costs ~1.3s (tsx transpile-on-every-run), the query logic itself adds only ~100-200ms. node --experimental-strip-types cuts the same call to ~0.15s but needs Node 22.6+, and test.yml pins node-version: 20 - not a same-session fix.
- proof 2: met
- proof 3: met
- proof 4: met
- proof 5: met
- proof 6: met
