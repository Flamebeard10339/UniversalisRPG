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
- A second audit pass on a branch cannot produce work that blocks that branch's merge.
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
3. **An audit cannot create work.** Every finding enters the store as `unreviewed`. This decouples
   the auditor from the cost of what it finds, which is the condition under which auditors are
   actually useful.
4. **Triage assigns state, and a human runs it.** Promote joins the current spec and blocks the
   merge; defer leaves it open and unclaimed; decline closes it with a reason.
5. **Pass 2 and later may defer or decline, never promote.** This is the only rule that terminates
   the audit-fix loop, and it terminates it by construction rather than by discipline.
6. **`spec done` means every member is `done` or `declined`.** A member that is neither leaves the
   spec and becomes deferred. Without this the spec can never close, which is precisely how the
   previous backlog grew every day.
7. **Merge requires a done spec and an audit doc naming the range.**

## The store

Two files, with opposite lifecycles kept apart. Fusing them is what produced a 7,000-word task
document in the system this replaces.

**`docs/specs/<slug>.md`** — prose, human-written, one per branch, few in number. The filename is the
slug; nothing else in it is machine-read. Sections: `## Deliverable` (with its proof), `## Decisions`,
`## Open questions`. No status table, no chunk list, no handoff — all three live in git.

**`docs/tasks.jsonl`** — one task per line, machine-owned, never hand-edited. One read loads the
store. Line-oriented so a diff shows exactly which task changed and so concurrent branches usually
merge clean.

```json
{
  "id": "checksave-object-fields",
  "title": "checkSave crashes on the save bodies it exists to reject",
  "state": "unreviewed",
  "severity": "high",
  "system": "Runtime",
  "spec": null,
  "requires": [],
  "files": ["src/runtime/save.ts:88", "src/runtime/save.test.ts"],
  "deliverable": "loadSave refuses a body with cadences absent by name, instead of throwing TypeError from inside the validator",
  "source": "docs/audits/runtime-2026-07-30.md#H1",
  "pass": 1,
  "reason": null,
  "closed": null
}
```

### Four states, and everything else derived

`unreviewed` → `open` → `done`, with `declined` reachable from either of the first two. `reason` is
required to enter `declined` and forbidden otherwise.

Never stored, always computed:

| reads as | is |
| --- | --- |
| fix now | `state: open` and `spec` is the current spec |
| deferred | `state: open` and `spec` is null |
| blocked | some id in `requires` is not `done` |
| active spec | the spec whose branch is checked out |

Storing any of these would be a second record of a fact the store already holds, which is the defect
that produced `H1` of the last testing-procedure audit and is forbidden by CLAUDE.md.

`requires` is the only edge and it points one way. "B blocks A" is `A.requires ∋ B` read backwards;
the reverse index is built at load. Two fields for one relation is two things to keep in sync.

## Relevant files

The `files` array bounds an agent's first read. Standing instruction: **read these first, and widen
only when a test fails, a type does not check, or the change plainly does not fit.** It is a starting
point, never a fence — an agent that refuses to look further because a path was not listed produces
worse work than one that reads too much.

- **Harvested, not authored.** `tasks import` pulls `path/to/file.ts:123` out of the finding body.
  The audit documents are already dense with them. A hand-maintained list rots, and a rotted list
  that agents trust is worse than no list.
- **Paths are the contract; line numbers are a decaying hint.** Never resolve an edit by line number.
- **`tasks check` warns when a listed path no longer exists.** A task pointing at a deleted file has
  gone stale and should be re-read before it is worked.

## Commands

`npm run tasks -- <verb>`. Hard performance rule, from the measured failure of the last one: **no git
subprocess inside a loop or a sort comparator.** Anything git-derived is computed once into a table.

**Intake**
- `import <audit-doc>` — findings under `## H1` / `## M2` / `## L3` become `unreviewed` tasks,
  carrying their severity, their system, their `path:line` references and a `source` anchor.
- `add` — a task from nothing, for work that is not a finding.

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

**Spec** — `spec new <slug>`, `spec add <slug> <id>...`, `spec show <slug>` (members with their
states), `spec done <slug>` (refuses while a member is neither done nor declined, and names it).

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

`tasks check --merge` refuses when the current spec is not done, or when no file under `docs/audits/`
names the branch's merge-base range.

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
   finding, not a task, and the audit doc remains its permanent record either way.
4. Read `backlog.md` yourself and add only what survives. Do not machine-import it.
5. Delete `backlog.md` and the six `docs/*/deliverable-log.md`. CLAUDE.md also names a
   `completed-tasks.md` that does not exist; correct that in the same pass.

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
- **Audits cannot create work; only triage can.** The entire audit-inflation problem is a missing
  disposal step, not an excess of findings.
- **`declined` is a first-class outcome and requires a reason.** `deferred` is a promise, so a
  deferred-only store grows forever. That growth was read as a system failure for months; it was a
  missing verb.
- **The auditor reports severity; the human assigns state.** An auditor holding both is rewarded for
  rigour with no cost model, and produces 23 audit documents in four days.
- **JSONL over one file per task.** The measured cost of the previous store was 94 file reads plus a
  `git log --follow` spawned from inside a sort comparator.
- **The spec's prose stays in markdown.** Escaped newlines in a JSON field are unreviewable, and the
  spec is the part a human actually reads.

## Open questions

None blocking. Implementation can start at Bootstrap step 1 today.

- **Does `import` parse the audit document, or does the auditor write records directly?** Parsing is
  fragile to heading drift; direct-write couples the auditor to the schema. Leaning parse, because
  the 23 existing documents can only be read that way. Decide when the first audit is written under
  this model, not before.
- **Do declined tasks stay in the store forever?** They answer "was this already considered?", which
  is worth real money against an agent that rediscovers the same finding quarterly. They also grow
  the store monotonically with dead weight. Leaning keep, and revisit if `check` slows.
- **What cadence does a whole-system sweep get?** "Before a release" is written into CLAUDE.md and
  there is no release yet, so it is currently untested. This is the honest residue of the
  arbitrariness that killed the timer, and it is tolerable here only because nothing blocks on
  getting it right.
