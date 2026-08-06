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

## Audit passes

### Pass 1 — 2026-08-06

- base: `a49a9b614c6cff533de973d9bceb9d18c4d42e94`
- head: `6eb10e324fd7946214160f08dc6f634de9d57ba6`
- proof 1: met — Both the menu (`TRIAGE_ACTIONS.map(...).join(...)`, triage.ts:144) and the dispatch
(`TRIAGE_ACTIONS.find((candidate) => candidate.key === answer)`, triage.ts:150) read from the same
TRIAGE_ACTIONS array (triage.ts:95-101) rather than a literal if/else chain -- confirmed by reading
the diff against the pre-refactor if/else (a49a9b6..621b1d5). Mutation-verified: inverting the match
(`candidate.key === answer` -> `!==`, manifest entry c1-dispatch-invert) was KILLED at its own named
test (triage.test.ts "triage promotes, defers and declines findings, saving after every decision"),
1 failed of 17, no escalation to the file or whole suite needed.
- proof 2: met — triage.test.ts's "every action in the table names a `tasks` verb that actually exists,
so a table entry with no route fails here" iterates TRIAGE_ACTIONS and runs `tasks <verb> --help`
per entry. Verified by doing exactly what the audit brief asked rather than reading the test: added
a sixth entry `{ key: 'z', label: 'zonk', verb: 'nonexistent-verb', run: runAsk }` to the table
(manifest entry c2-sixth-action-no-route) and confirmed this exact test catches it -- KILLED, 1
failed of 17, at its own named-test scope, no escalation needed.
- proof 3: met — cmdDefer (records.ts:820-836) sets state 'open'/spec null and files the identical note
string 'deferred: opened outside every spec' that the walk's runDefer uses (triage.ts:48-52) -- same
literal string in both files. Mutation-verified: changing the non-interactive wording to 'deferred:
moved outside every spec' (manifest entry c3-defer-wording-drift) was KILLED at its own named test
("tasks defer opens a record outside every spec..."), 1 failed of 17, no escalation. Also verified by
direct execution: cmdDefer refuses a declined id with "it does not reopen closed ones" and, given a
batch of two ids where one is declined, leaves the other (valid) id completely untouched -- the same
all-or-nothing convention cmdPromote already uses. Calling defer twice on an already-open record
succeeds both times (idempotent) and logs two separate, identically-worded triage events.
- proof 4: unmet — Two of the three properties are solid and mutation-verified: appending (not replacing)
evidence -- mutating the assignment from append to outright replacement (manifest entry
c4-ask-overwrites-evidence) was KILLED at its own named test ("tasks ask records the question on the
finding..."), 1 failed of 17, no escalation -- and a second `tasks ask` call on the same id correctly
appends a second dated block rather than overwriting the first (verified by direct execution). The
triage-event property also holds (see c5's evidence; the recordEvents call is shared). But the third
property -- "leaves the record unreviewed so the queue keeps offering it" -- is not enforced and does
not hold in general. cmdAsk (records.ts:865-884) never reads or checks task.state, unlike cmdDefer and
cmdPromote which explicitly refuse to run on anything but an unreviewed-or-open record. Reproduced
directly: add a finding, decline it with a reason, then ask a question against that same now-declined
id. The ask command exits 0, appends the question to evidence, and files a triage event -- but showing
the record afterward still reports state 'declined', not 'unreviewed'. unreviewedQueue will never re-offer
this record, directly contradicting the clause's literal promise, and the caller receives no warning
or error. This is not a hypothetical: an orchestrator batch-asking across ids it has not itself just
pulled from the unreviewed queue (a stale id, a racing second run, an id typo that happens to resolve)
hits this silently. `tasks redirect` has the identical missing guard, but c5 does not depend on state
so it is unaffected; only c4's own claim is broken by it. See the filed HIGH finding for the fix.
- proof 5: met — cmdRedirect (records.ts:839-858) files `recordEvents(config, 'triage', ...)`, matching
the walk's runRedirect (triage.ts:66-76); `tasks log --op edit` never shows the id afterward and
`tasks log --op triage` does, exactly as the existing test asserts. Mutation-verified independently:
changing the op from 'triage' to 'edit' (manifest entry c5-redirect-files-edit-not-triage) was KILLED
at its own named test ("tasks redirect is the same operation as the walk's redirect..."), 1 failed of
17, no escalation. Also confirmed the property is state-independent (unlike c4): redirecting a
declined record's deliverable still files a `triage` event, not an `edit` one, by direct execution.
- proof 6: unmet — Three of the four named properties are solidly proven. Same keys and same
persist-immediately behaviour: mutation entries c1-dispatch-invert and c6-walk-drops-persist (the
latter deletes the common `saveStoreAndWarn`+`recordEvents` call on the walk's decision path) were
both KILLED at the same named test ("triage promotes, defers and declines findings, saving after
every decision"), 1 failed of 17 each, no escalation -- plus the existing tests already drive the
walk with literal keystrokes ('1','2','3','4','a') independent of the table's own content. Same
prompts: proven by the existing hardcoded-string test ("triage prompts read exactly as before the
table refactor"), which asserts the literal "reason: ", "replacement deliverable: ", "question: "
text, not anything derived from the table. But "same order" has zero coverage anywhere in the suite.
The only order-touching test ("the menu is rendered from the action table") computes its expected
string from TRIAGE_ACTIONS itself (`TRIAGE_ACTIONS.map((action) => ...).join(...)`), making it
tautological -- it can never fail from a reorder, because it is checking the table against itself.
Confirmed by mutation entry c6-menu-order-scrambled: swapped the array positions of the promote and
redirect entries (keys and verbs left untouched) and ran it with no `tests` scope at all, i.e.
directly against the whole 1673-test suite: SURVIVED, 0 failed of 1673. The shipped order does
currently match the pre-refactor order (confirmed by reading the diff), so there is no live
regression today, but the clause's own claim to be "provably behaviour-preserving" does not hold for
this one property -- nothing in the suite, up to and including the whole suite, would catch a future
silent reorder. See the filed MEDIUM finding for the fix.
