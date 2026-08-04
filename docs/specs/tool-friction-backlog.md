# tool-friction-backlog

## Deliverable

Everything in `.planning/agent-feedback/tool-friction.md` plus the planning session of 2026-08-04,
in one branch. It leads with discovery, because that is the gap that cost the most and the only one
whose fix was measured rather than reasoned to: asking "does this already exist" is answered today
by `tasks produces`, which matches how a capability was *spelled*, so it caught `buff engine` and
missed `per expression` against `+N <stat> per <counter>` — one grammar, two owners, surfaced only
as a `stats.ts` write collision that had to be interpreted.

The rest is not a list of unrelated papercuts. Six of the entries are one shape — a refusal that
holds the information the caller needs and prints a bare rejection instead — and three more are a
summary or a record omitting the one thing it exists to carry. The friction log is the evidence for
every clause below, and each entry there is something that happened rather than something imagined.

Proof:

- Prior art is answered by **path**, through the verbs that already answer neighbouring questions
  rather than a new one. A query takes the paths a piece of work will touch and returns everything
  that has ever claimed them, drawn from `writes` and `files`, resolving directory grants, across
  **every state including `done` and `declined`** — alongside the system that owns them, the
  concepts registered against them, and the capability claims that name them. Measured against this
  session: the two paths already known to be in scope for `combat-events` return
  `per-grammar-dependent-stats`, `buffs-generalized` and the closed
  `droptables-pass1-adding-any-chance-to-a-batched-action-multi` — three of the four duplications,
  including the one whose rule was rewritten as a clause.
- The planning answer names a system's public interfaces, not a count of them. `Module.exports` is
  already a `string[]` and `exportCount` is a reduction over it, so the names exist and are
  discarded at the point of display; a planner asking about a region gets the surface it would have
  to import, alongside the paths, concepts and claims for that region.
- A write grant says whether it is a forecast or a commitment, and `plan` weighs the two
  differently. A grant declared before anyone has read the code is honestly a directory, and a
  directory collides with everything beneath it — measured at five defects across four independent
  roadmap tasks, and zero once narrowed to invented file paths, which trades a true record for a
  quiet check. The workflow already has the correction point, a worker narrowing its own grant at
  dispatch; what is missing is the record saying which side of that point a grant is on. This closes
  `grant-forecast-vs-commitment`.
- `tasks spec new` prints the capability survey rather than trusting a planner to remember it. It
  names the commands that answer "what is already here" for the region about to be specced, and the
  reminder that which capabilities the branch adds, extends, takes over or retires belongs in the
  spec's `## Decisions`. This is the nudge `tasks done` already uses for an unregistered `produces`
  claim, applied at the one moment the whole capability landscape is in view; it prints and never
  writes, because the judgement is the point.
- Spec inference is consistent across read verbs. `tasks next` prints the spec it inferred from the
  branch name, which reads as ambient, and `tasks spec show` then answers the same slug with usage.
  Every read verb that can infer the active spec does, or none of them does.
- The check fires without being asked for. Setting `--writes` on `add` or `edit` runs it and prints
  what already claims those paths, the way `tasks done` already prints the `tasks concept` command
  for an unregistered `produces` claim. A check that must be remembered is skipped exactly when a
  session is deep in something else: it was run once in this session, and that once is the one
  duplication that was caught.
- A refusal says what it already knows. `mutate`'s find miss holds the file open and names the
  nearest line rather than repeating that the text is absent — which covers line endings, escaping
  and whitespace drift with one message, the three separate sessions that hit it. `spec add --id`
  and `add --note` name the near-miss field instead of only printing usage. The unknown-command
  refusal points at `npm run audit-status`. `probe --each` names a document so that a variant which
  loads clean stops reporting as a broken module id.
- A store query that cannot see a record says why. Reading the store from a ref that predates a
  branch's writes answers `0 task(s)` today, which is indistinguishable from "those records are
  gone"; the store is versioned with the code, so every query is silently ref-scoped and the answer
  must say so.
- A summary does not bury the class it exists to surface. `merge-ready` ends on
  `merge-ready: every leg passed` while `doctor` warnings scroll past above it — warnings whose
  entire subject is a close that exists only in the working tree and is about to be discarded. The
  count reaches the summary line without changing what fails.
- `merge-ready` answers this branch's standing, not only the repository's. Its legs are all repo
  health; the questions a merge actually turns on — is the tree clean, has main moved past the merge
  base, is every spec member closed, does the latest pass leave a clause outstanding — are six
  manual reads across two tools, and the one that bites in practice, main having moved, fails
  nothing.
- A close carries why it closed, reachable from the record. `tasks show` prints `closed` and
  `closedCommit`; the evidence a closer recorded with `tasks note` is reachable only by someone who
  already knows it is there.
- Recording a full audit pass is not rationed by the transport. `tasks audit` with a pass and its
  findings exceeds the Windows 8191-character command line, in two separate sessions, and splitting
  is not an escape because clauses left ungraded in a pass record `unknown`. The store write is one
  operation and only the transport is the problem.
- A `scripts/` view can be rendered over records that do not exist. Two sessions reached this from
  opposite directions and both ended in a throwaway `.ts` at the repository root, because `tsx -e`
  cannot resolve the repo's relative imports. `npm run probe` is the precedent for the load path;
  the task CLI has no equivalent.
- The store is the path of least resistance for a judgement. `tasks decision` went unrun across a
  whole branch while twelve commit bodies carried the reasoning, because the commit had a writing
  prompt attached and the store did not.
- What already works is not optimised away. `tasks done` printing the clause standing at close, and
  `promote` naming a pass-2 finding as extending what the spec owes, both survive this branch: they
  are the tool declining to let a close look tidier than it is, at the moment the judgement is made.

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
- **One branch, many slices.** This is one promise with a dozen independent fixes under it, and it
  will decompose into slices with disjoint `writes` before anyone works it. Keeping it one spec is
  what stops a dozen papercut branches each carrying its own audit.
- **Prior art extends the existing verbs rather than adding one.** `where <path>` already answers
  "which system owns this" and `produces <name>` answers "who claims this capability" — the same
  question asked of the manifest and of the store. A planner arriving with a feature in mind wants
  every answer at once and is rarely troubled by receiving too much, so these converge into one
  answer rather than a third command a caller has to know to run.
- **The two Testing-procedure entries stay, and the audit window is wider for it.** `probe` and
  `mutate` belong to a different system than the rest of this branch, so the diff spans two and will
  be audited as such. That is cheaper than leaving a refusal that has now cost three separate
  sessions unfixed while it waits for a branch of its own.
- **Evidence that points into git carries the SHA.** "See git history at the deletion commit" cost
  two archaeology sessions in one day. This is a convention for new records rather than a sweep over
  old ones, and it belongs here because it is the same failure as the rest: a record holding a
  pointer it declined to make usable.

## Open questions

None.
