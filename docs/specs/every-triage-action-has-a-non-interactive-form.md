# every-triage-action-has-a-non-interactive-form

## Deliverable

`tasks triage` walks five actions — promote, defer, decline, redirect, ask. Read against the CLI,
the coverage is not the two-of-five the record estimated:

| action | non-interactive form today |
| ------ | -------------------------- |
| promote | `tasks promote <id>... --spec <slug>` |
| decline | `tasks decline <id>... --reason` |
| defer | **none** |
| ask | **none** |
| redirect | `tasks edit --deliverable` reaches the field, but files an `edit` event where the TUI files a `triage` one — the same effect by a different operation, so `tasks log --op triage` cannot see it |

An orchestrator cannot drive a TUI, so today it can promote and decline and nothing else. Under the
endurance goal the missing one that matters is **ask**. It records a question against a finding and
leaves it unreviewed, which is how a batch of judgements reaches the author *with the question
attached*. Handing over forty unreviewed findings and no questions is not the same thing: it makes
the author re-derive what each one needs from them, one at a time, which is exactly the exhaustion
this round exists to remove. The action the orchestrator most needs is the one it cannot perform.

The durable part of this branch is not two new verbs. It is that completeness becomes checkable.
The five actions are an if/else chain inside `cmdTriage`, so a sixth added later would be TUI-only
again and nothing would say so — this defect would simply recur under a new name. So the actions
become a table both routes drive, and a test iterates it. That is the same shape `dsl-kind-prints-
fields` uses for `SECTION_KINDS`, and the same reason: a set that must stay complete needs something
that fails when it does not.

Proof:

- [c1] The five triage actions are one table, and both routes dispatch from it. `cmdTriage` renders
  its menu and performs its actions from that table rather than from a literal if/else chain, so an
  action cannot exist on one route and not the other.
  proof: vitest scripts/tasks/triage.test.ts
- [c2] A test iterates the table and asserts every action has a non-interactive route. A sixth action
  added later fails that test rather than quietly becoming TUI-only, which is the clause that stops
  this defect recurring rather than the ones that fix today's instance of it.
  proof: vitest scripts/tasks/triage.test.ts
- [c3] `defer` has a non-interactive form: state `open`, spec `null` — the inverse of promote — over
  one or more ids, recording the same `triage` event with the same wording the walk records.
  proof: vitest scripts/tasks/triage.test.ts
- [c4] `ask` has a non-interactive form. It appends the dated question to the record's `evidence`
  where the next agent reads it, leaves the record `unreviewed` so the queue keeps offering it, and
  records the same `triage` event — the three properties that make it a handback rather than an edit.
  proof: vitest scripts/tasks/triage.test.ts
- [c5] `redirect`'s non-interactive form is the same *operation* as the walk's, not merely the same
  effect. Both file a `triage` event, so `tasks log --op triage` shows a redirect however it was
  made, and the audit trail does not depend on which route a reviewer happened to take.
  proof: vitest scripts/tasks/triage.test.ts
- [c6] The interactive walk is unchanged. Same keys, same order, same prompts, same
  persist-immediately behaviour on every action — a reviewer who has learned the TUI does not
  relearn it, and the refactor is provably behaviour-preserving on the route that already worked.
  proof: vitest scripts/tasks/triage.test.ts

## Decisions

- **A table, not two more verbs.** Adding `defer` and `ask` alone closes today's gap and leaves the
  next one open: the gap exists because there is no place where the set of actions is written down
  once. Making the set data is what c2 can then check, and it is the difference between fixing an
  instance and retiring the class.
- **`ask` is the load-bearing action, and its three properties are all required.** The question lands
  on the record rather than only in the log, because the next agent reads the record. The record
  stays `unreviewed`, because the queue is what re-offers it. And it files a `triage` event, because
  that is what makes a run's questions countable. Any two of the three would look like it works.
- **New top-level verbs, beside `promote` and `decline`.** Not flags on `triage`. The two actions
  that already have batch forms are top-level verbs, and someone looking for the batch form of a
  third action looks where the first two are.
- **The TUI stays.** It is the right interface for a human working a queue, and nothing here is an
  argument against it — only against it being the *only* route. c6 exists so that this is provable
  rather than asserted.
- **This is the mechanism of the endurance goal, not a convenience.** The record filed it as a hard
  blocker on cost-shaped reasoning. The stronger reason is that without `ask`, a batched review
  degrades into a pile of findings with no questions attached, and the author pays the re-derivation
  cost this whole round is meant to remove.

## Open questions

- Whether `ask` takes one question across several ids or one question per id. The walk asks per
  record; a batch may want both, and the shape is the worker's call once the table exists.
- Whether the table lives in `triage.ts` or beside the record verbs in `records.ts`. Both routes
  import from wherever it lands; the layering is the worker's to judge against the existing split.
