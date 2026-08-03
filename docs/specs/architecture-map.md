# architecture-map

## Deliverable

The repository's architecture becomes a thing an agent can **query before it writes**, instead of a
thing an auditor reconstructs after it shipped. Thirty of 299 store records are a second copy of
something that already existed, and every one was found after the fact.

Two halves, and the split between them is the whole design. **Intentional facts** — what a system is
for, what it is supposed to own, what a name means — can only be authored, and are worth authoring
because they are what a derived graph can be checked against. **Derivable facts** — which files a
system owns, what it exports, which systems it actually imports — are computed on demand and stored
nowhere, because a stored derivative is a system required to be manually kept in sync.

`docs/audits/systems.json` stays the one place membership is declared. It gains **concepts**, which
*refine* systems rather than forming a third partition of the tree alongside layers and systems.
Nothing in this branch adds a gate: `audit-status` keeps its single failing condition and everything
new reports.

Proof:

- [c1] Every tracked file resolves to exactly one owning system, and the answer never depends on the
  order entries appear in the manifest. The eleven files currently claimed by two systems resolve to
  the more specific claim — `src/content/modportal.ts` to the Contribution system, not to the
  DSL load path, which is what array order silently returns today.
- [c2] Audit coverage stays many-to-many and is a **separately named relation** from ownership. No
  system's audit window changes as a side effect of c1; where a window is intended to change, the
  change is stated rather than inherited from a resolution rule.
- [c3] A concept belongs to exactly one system and its paths are a subset of that system's paths. A
  concept naming a path its system does not own is reported, and so is a concept naming a path that
  does not exist. No second manifest file is created.
- [c4] One command answers, for a named system: the files it owns, its exported surface, the systems
  it depends on, and the systems that depend on it. Every part of that answer is computed from the
  tree at call time and none of it is written back to any file.
- [c5] The reverse query answers for a path: its owning system, its concept if one claims it, and
  what it imports across a system boundary. A low-level agent gets its membership answer without
  reading the manifest.
- [c6] "Does anything already produce X" is answerable against **the whole store and the concept
  registry** — every closed task's claim included — not against one dispatch set as
  `duplicate-produces` does today. A hit names the owner and where it is declared.
- [c7] `tasks plan` reports a `produces` claim colliding with an already-registered concept or an
  already-closed task's claim. The existing in-set check keeps working and is not duplicated by a
  second implementation.
- [c8] A file claimed by two concepts of the same system is reported as one file doing two jobs.
  `src/grammar/action.ts` — `dsl-load-path-2026-07-28-m2`, "a second, laxer copy of the section
  field engine" — is the worked example, and the report names it once the registry describes it.
- [c9] The registry is seeded **from evidence**: the twenty `produces` claims already in the store
  and the audit archive in `docs/audits/`. A seeded concept that cannot cite where its name came
  from does not ship. Names invented for coverage are worse than absent, because the query then
  answers "no owner" with confidence.
- [c10] `docs/workflow.md` states when a concept is registered and by whom, inside the correction
  round trip that already exists at step 4. No new protocol step, no new role, no second round trip.
- [c11] Nothing here adds a failing condition to any gate. `audit-status` still fails on exactly one
  thing — a tracked file owned by nobody — and `npm test` stays inside the five-minute budget.

## Decisions

**Ownership resolves by longest match, not by array order.** `owningSystem` is
`systems.find(...)`, so today `src/content/modportal.ts` answers "DSL load path" because that entry
is written first, even though the Contribution system names the file exactly. Longest-match is the
routing-table rule: an exact file beats a directory. It makes the *current* manifest correct as
written, needs no membership edits, and structurally resolves the double-charge that
`testing-procedure-2026-07-30-l4` recorded against `scripts/lib/modportalCache.ts` — that finding
was declined as a note-accuracy issue, and the underlying double-charge it measured is real.

**Coverage and ownership are two relations, not one.** systems.json calls the `src/content` overlap
"double coverage rather than a gap", and for auditing that is correct — two auditors reading one
file is redundancy. For membership it is not: it makes "which files are in this system" return a
wrong answer for eleven of seventy-five production files. Splitting the relation keeps the audit
behaviour and fixes the membership answer, instead of trading one for the other.

**Concepts refine systems; they are not a third axis.** The tree already carries two orthogonal
partitions — layers (`grammar < content < runtime < ui < scripts`) and systems. A third independent
one is where "keep independent systems independent" starts costing more than it returns. As a
refinement, a system's membership and a concept's membership resolve against one relation that
cannot disagree with itself, and the partition check gets stronger rather than duplicated.

**The symbol graph is cut.** It is the only tier needing new machinery, and "what calls this" is one
exact Grep over 25k lines. None of the thirty duplication records would have been caught by a call
graph. Revisit only when a question arrives that Grep demonstrably cannot answer.

**A `produces` claim is reported at close, never auto-registered.** Twenty claims exist and they
conflate durable capabilities (`buff engine`, `droptable system`) with one branch's output
(`playtest findings`, `balance numbers`). Auto-graduating them would fill the architecture map with
the second kind. `done` prints what would be registered and the command that registers it; a human
or the closing worker decides.

**A declared-vs-observed system dependency check reports and does not gate.** The observed graph is
five edges and already acyclic, so such a gate would prevent nothing today, and CLAUDE.md is
explicit that a gate earns its place by preventing something that actually happened.

## Open questions

None outstanding. The one that blocked planning — who writes concept entries and when — is settled
by c10: the worker, in the `writes`/`produces` correction round trip it already performs before
writing code.

## Audit passes

### Pass 1 — 2026-08-03

- base: `8f1de469c8609e685c500a1ae490ad5e1bc10c0c`
- head: `af0ef8bf120f5c9e5ab486cc8b111260a7fa33c3`
- proof 1: met — All 11 double-claimed files resolve to the more specific claim; Math.max->Math.min and tie-break reversal both killed by mutation.
- proof 2: met — Manifest diffed base to head: paths, lastAudit, note and unowned identical for all six systems, only concepts added. owningSystem had no production caller at base.
- proof 3: met — Coverage-for-ownership mutation killed. Out-of-system path errors, nonexistent path warns, a path escaping the repo is refused.
- proof 4: met — tasks system answers files, exports and both directions with nothing written back; export surface understates by 9 names, filed as M4.
- proof 5: met — tasks where returns owner, coverers, concept, and cross-boundary imports in both directions.
- proof 6: met — Finds a closed task's claim and a registered concept; a miss prints an explicit weak-no.
- proof 7: met — Three mutations killed; duplicate-produces still fires; findProducers is the single implementation of the match rule.
- proof 8: met — audit-status names src/grammar/action.ts as claimed by action parsing and the section field engine, once.
- proof 9: met — Every one of the 23 citations checked: 9 finding ids and 5 task ids all exist, tasks are done and their produces match. No invented name.
- proof 10: met — Registration sits inside the existing step-4 correction round trip; no new step or role.
- proof 11: unmet — Test budget met at 54s and audit-status verified single-condition by injection, but tasks plan gained a failing condition on a malformed manifest, proven base-vs-head. See M3.
