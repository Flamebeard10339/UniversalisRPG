# Tool friction

Raw notes on where the tooling — repo scripts, the agent harness, the CLI — cost time or
produced a wrong state. Each entry is something that actually happened, not a speculative
improvement. One section per session, newest last.

An entry leaves this file when a spec clause has taken it over, and the clause carries its evidence
verbatim; `git log -- .planning/agent-feedback/tool-friction.md` holds the original wording. The
2026-07-28 through 2026-08-04 entries were drained into `docs/specs/tool-friction-backlog.md` at
`f004048` — twenty entries into sixteen clauses, plus one that was already fixed before the drain
(`audit-prompt` naming two log paths that did not exist, repaired in `605b868`).

## Entries

<!-- Append below. Newest last. Name the pass and the date. -->

## `tool-friction-backlog` planning, 2026-08-04

Decomposing a sixteen-clause spec into seven slices, and the friction was in the two places the
tool could not answer a planner's question at all.

### A task cannot name which proof clauses it discharges

The whole output of a decomposition session is a map from clauses to the tasks that owe them, and
there is nowhere to put it. `Task` has a `clause` field, but `tasks add` hardcodes `clause: null`
(`records.ts:107`) and no verb offers a `--clause` flag; the only writer is `audit`, which sets it
on the `undelivered` records an `unmet` verdict creates (`audit.ts:538`). So the mapping went into
each task's `deliverable` prose as "Clauses 3, 6, 12, 15, 16", where nothing can read it back.

The cost is not this session's — it is the next one's. `tasks spec show` prints sixteen clause
standings and twelve members and cannot join them, so "who is delivering clause 9" is a prose
search across twelve deliverables, and "which clauses has this branch not assigned to anyone" is
not answerable at all. The audit then grades clauses against a diff without knowing which slice
promised each one.

Worth considering: `--clause` on `add` and `edit`, accepting several, and `spec show` printing the
owing task beside each standing. The field, the parse and the display all exist; only the planner's
half of the write is missing. Whether an unassigned clause should be a `plan` note is the open
question — it is the one shape of decomposition defect `plan` cannot currently see.

### `spec show` answers "no proof clauses" when the list is numbered instead of bulleted

Rewriting the spec's `## Deliverable` with `1.`-style numbered clauses — the natural markdown for a
list whose items are referred to by number — silently produced `(no proof clauses — --full prints
the whole ## Deliverable)` and a clause standing of `no clause to grade`. All sixteen clauses were
present under a `Proof:` line; `scanProofClauses` matches `/^- (.*)$/` (`specDoc.ts:97`) and nothing
else, so the whole set read as prose.

The failure is quiet in the direction that matters: the spec file still looked right, `tasks spec
show` still exited zero, and had the edit been made without checking, the branch would have carried
a contract of zero clauses into its audit. It was caught only because the read immediately after
the write was for a different purpose.

Worth considering: `scanProofClauses` already knows it found a `Proof:` heading. When the lines
under it are non-empty and none of them matched, say so — `Proof: found, but no line under it
begins with "- "` — rather than reporting the same thing an absent `Proof:` heading reports. Same
shape as the near-miss refusals in clause 7: the reader has the evidence in hand and prints a bare
negative.

### `roadmap` reports a spec as waiting on its own members

After the decomposition, `tool-friction-backlog`'s row reads `waits on record-verbs-say-back (spec
tool-friction-backlog), roadmap-shows-settled-work-pass1-wrapunder-computes-its-wrap (spec
tool-friction-backlog), …` — four ids over five wrapped lines, every one of them a member of the
spec doing the waiting. The state cell is correct (`ready`), and the annotation does say which spec
each blocker belongs to, so nothing is wrong; it is just that the line a reader scans to learn what
blocks a spec is spending five lines saying "some of its members are ordered behind others", which
is what `requires` is for and what step 4 of `docs/workflow.md` asks every planner to produce.

Every other spec on the roadmap names external work there. This is not a regression — it is the
first row rendered for a spec that has actually been decomposed, so the case had not arisen. It
also sharpens `roadmap-shows-settled-work-pass1-the-record-caps-bound-how-m`, already promoted into
this branch: that finding measured an uncapped row on a synthetic store, and this is the same
uncapped list on the real one.

Worth considering: `blockerText` filters blockers whose `spec` equals the row's own spec, and says
`N member(s) ordered behind others` if it wants to say anything at all. The annotation it already
prints is the evidence that it knows which ones they are.
