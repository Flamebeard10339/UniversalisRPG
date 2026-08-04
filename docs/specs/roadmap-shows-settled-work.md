# roadmap-shows-settled-work

## Deliverable

`tasks roadmap` shows the backlog that has *not* been decided, and hides the work that has. The
mechanism is one condition: `roadmapView` sources everything from `listQueue(tasks, { deferred:
true })`, and that filter is `task.state === 'open' && task.spec === null`, so **attaching a spec to
a task removes it from the roadmap**. On 2026-08-04 eight branches carried written specs with graded
proof clauses and a settled dependency order, and the whole of that appeared as the string
`448 records · 8 held by a spec` in the header. A planner arrives asking two questions — what has
been decided, and what could I pick up — and the command answers only the second.

The clearest demonstration is this branch itself: `roadmap-shows-settled-work` was listed as the
only `high` ready topic until a spec was attached to it, at which point it vanished from the command
it exists to fix.

This branch gives it both. Decided work becomes a section rather than a number; the backlog view it
already renders stays as it is.

Proof:

- A task with a spec appears in the roadmap. Specced work is a section of its own, not a count in
  the header, and `roadmapView` no longer takes the deferred backlog as its only source. Nothing
  about `listQueue`'s `deferred` filter changes: the other callers that mean "the unspecced backlog"
  keep meaning it.
- Live work is sorted into three named states, and each name means what it says. **ready** is
  specced, unblocked and unstarted — pick it up and write code. **unspecced** has no spec and needs
  a planning session before anyone implements anything. **blocked** is waiting on something named.
  Today's heading calls the second of these "ready", and because its source filters on
  `spec === null`, every entry under it is by definition *not* ready to implement.
- The view leads with live work, not with the archive. 448 records is not a fact a planner acts on
  when most of them are `done` or `declined`; the counts that open the output are the ones that
  describe work still to do, and the archive is a single number if it appears at all.
- The command is branch-independent and correct on `main`. It infers no active spec, reads no branch
  name, and answers the same question from anywhere in the tree — which is what makes it the view a
  planning session starts from rather than a second `handoff`.
- One invocation answers "what is next", for a reader with no prior context. A cold planner should
  not need a follow-up command to learn that a chain exists, where it starts, or which items need a
  decision rather than an implementation.
- A dependency chain renders as a chain, in order. A reader sees that six branches are decided and
  run in a particular sequence, rather than seeing only the one that happens to be unblocked. Where
  a chain has a head that is ready, that is legible from the same view.
- Every listed item states what it is waiting on, or that nothing blocks it. Today the `unblocks`
  edge is drawn for ready topics and the inverse edge appears nowhere, so a blocked task's reason
  for being blocked is not in the output at all.
- Each spec shown carries its clause standing, summarised the way `tasks spec show` already
  summarises it, so "decided" and "how far along" are one glance rather than two commands. The
  summary is computed from the same `specDoc` code path rather than a second implementation of it.
- Findings that could redden an audit are named, not counted. High-severity findings appear as
  themselves; the remainder may stay aggregated, because the number 42 is a prompt to run another
  command rather than information.
- Output stays bounded and scannable. The obvious failure of this change is a view that prints every
  record, so the roadmap states its own limits — what it truncated, and the command that shows the
  rest — and a store with hundreds of records still produces a page a reader can hold.
- It remains a read that cannot fail. `roadmap` exits zero on every store it can parse, reports
  rather than refuses, and stays outside the merge gate.

## Decisions

- **The bug is a filter, not a rendering choice.** `task.spec === null` inside
  `listQueue`'s `deferred` branch is the whole of it, and it is correct for the callers that ask for
  the unspecced backlog — `tasks list --deferred` means exactly that. The fix belongs in
  `roadmapView`, which should stop treating that one query as the whole world, not in the filter.
- **Two questions, two sections.** "What has been decided" and "what could I start" are different
  questions with different answers, and collapsing them is what produced a view that answers the
  second while silently discarding the first. The existing ready-topics rendering is the answer to
  the second and is kept.
- **`ready` and `unspecced` are different states because they need different people.** Unspecced
  work needs a planning session and a decision; ready work needs an implementer. Calling both of
  them ready is what let a list of eight undecided topics look like a queue of eight jobs. The
  current heading, "TOPICS READY TO BRANCH ON", is not wrong — you do branch to write the spec — but
  it reads as a work queue and is consumed as one.
- **The audience is a planning agent with no context.** That is a sharper target than "a person
  browsing", and it decides the trade-offs: prefer one dense view over several commands, name states
  rather than implying them, and never require a reader to know that `deferred` means `spec ===
  null` in order to interpret a count.
- **Bounded beats complete.** A roadmap that prints 448 records is as useless as one that prints 15
  of them and hides the rest without saying so. The difference between the two failures is whether
  the output admits what it left out, which is why that is a clause rather than a nicety.
- **`roadmap` is the planner's view; `handoff` is the session's.** `tasks handoff` already answers
  "where am I, on this branch, right now". This branch must not grow a second copy of that: the
  roadmap is about the shape of the work, not the state of the checkout.
- **Clause standing is read, never cached.** The summary comes from the spec file through `specDoc`
  at call time. A roadmap that stored clause counts in the task record would be a second copy of a
  fact the spec owns, kept in sync by hand — which is the thing this repository does not build.

## Open questions

- Whether a spec's *findings* — the ones filed against it by an audit — belong in the decided
  section beside its clauses, or stay with the other findings. They are a branch's remaining debt,
  which argues for the first; they are also the bulk of the record count, which argues for the
  second. The answer probably falls out of the bound the output has to respect.
