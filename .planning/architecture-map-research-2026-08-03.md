# Architecture map research — 2026-08-03

Commissioned against the sketch: `Project → Capability → Concept → Module → Symbol Graph`,
to answer "should the task store carry architecture information, and in what shape".

Everything below is measured against this repo as of `bb5c620`. No speculative features.

## The standing recommendation this supersedes

`orchestration-research-2026-08-02.md` looked at the same idea one day ago and deferred it:

> Your point 2 (Feature → Module → Function graph) is the most attractive item and the one to
> defer. [...] Build it derived, or not at all — and not before the four items above.

The four items were `writes`, `produces`, `tasks plan`, and worker-proposes-its-own-grant. **All
four have shipped.** The deferral was conditional and its condition has expired. The other half of
that sentence — *build it derived, or not at all* — has not expired, and is the load-bearing
constraint on everything below.

## Six measurements

### 1. The repo is small enough that derivation is free

75 production files, 438 named exports, ~25k lines including tests. `src/ui` is empty pending the
GUI rebuild. Deriving the whole module/symbol/import graph is a sub-second full-tree walk using
machinery that already exists: `layers.ts:importedPaths` parses imports, `systems.ts:covers`
attributes a path to a system, `sourceFiles.ts` walks the tree.

There is no size argument for storing any of it.

### 2. The system dependency graph is 5 edges, and it is already clean

Derived from production files only (tests add no edges the source does not already have):

```
Contribution system  -> DSL load path        (15 imports)
Runtime              -> DSL load path        (36 imports)
Testing procedure    -> Contribution system   (1 import)
Testing procedure    -> DSL load path         (7 imports)
Testing procedure    -> Runtime               (5 imports)
```

Acyclic. No edge contradicts the layer rule. **A declared-vs-observed system dependency check would
find nothing today.** Its value is preventative, and CLAUDE.md is explicit that a gate earns its
place by preventing something that actually happened. This tier is real, nearly free to derive, and
should be *reported*, not *gated*.

### 3. System membership is not a partition, and the tie is broken by JSON array order

11 tracked files are claimed by two systems:

```
scripts/lib/modportalCache.ts       Contribution system + Testing procedure
src/content/contribution.ts         DSL load path + Contribution system
src/content/contribution.test.ts    DSL load path + Contribution system
src/content/issueForm.test.ts       DSL load path + Contribution system
src/content/localChanges.ts         DSL load path + Contribution system
src/content/localChanges.test.ts    DSL load path + Contribution system
src/content/modportal.ts            DSL load path + Contribution system
src/content/modportal.test.ts       DSL load path + Contribution system
src/content/registryDiff.ts         DSL load path + Contribution system
src/content/serialize.ts            DSL load path + Contribution system
src/content/serialize.test.ts       DSL load path + Contribution system
```

`systems.json` documents this as "double coverage rather than a gap", which is the right call for
*audit* coverage — two auditors reading one file is redundancy, not a hole. But
`owningSystem()` returns `systems.find(...)`, first match wins, so every one of those files answers
**"DSL load path"** — the Contribution system's own core modules are attributed to a different
system, silently, because of where its entry sits in a JSON array. `audit-status`'s orphan check
only detects files claimed by *nobody*; a file claimed by *two* passes it.

The measured effect: the Contribution system reports 11 exports. Its actual owned surface is far
larger. Any low-level query of the form "which files are part of this system" — precisely the
query the sketch is meant to serve — is wrong for 11 of 75 production files today.

**This is the one defect in the existing map, and it is a prerequisite for everything else.**
Ownership must be single-valued before anything is hung off it. Audit coverage can stay
many-to-many; that is a second, weaker relation and should be named separately.

### 4. Duplication is a real, recurring defect class here — 30 of 299 records

10% of the store mentions a second copy of something. A sample of the concrete ones:

| id | what was duplicated |
|---|---|
| `dsl-load-path-2026-07-28-m2` | `action.ts` is a second, laxer copy of the section field engine |
| `testing-procedure-2026-07-30-pass2-m6` | `systems.json` had two readers, two type declarations, two default-budget expressions |
| `build-deployment-2026-07-28-l5` | the Android CI job re-implements the `sync` npm script |
| `testing-procedure-2026-07-28-l3` | `session.test.ts` walks the Miki route a second time, in TypeScript |
| `contribution-system-2026-07-30-h1` | the fix was already written in a sibling file that the commit declined to reuse |

The instinct behind the sketch is correct: this is not a hypothetical failure mode.

**Every one of these was found by an audit, after the code shipped.** None was prevented. So the
mechanism has to be cheap and *before*, or it is just a sixth audit.

### 5. …but the duplication is almost entirely *inside* one system

This is the uncomfortable finding, and it re-aims the design.

Of the concrete cases above, four are intra-system: a second field engine inside the DSL load path,
two `systems.json` readers both inside Testing procedure, a CI job and an npm script both inside
Build & deployment. Only the Miki-route case crosses a boundary.

**A capability map at system granularity would have prevented approximately none of the duplication
this repo has actually recorded.** The duplication happens one or two levels below where the
sketch's top tier operates. Six systems are already known to every agent from CLAUDE.md; nobody
built a second registry because they didn't know Runtime existed.

What *would* have caught `action.ts`: an index entry saying **"section field validation — owned by
`src/content/section.ts`"**. That is the Concept tier. It is the load-bearing one. The Capability
tier above it is mostly already written, and the Symbol tier below it answers no question that was
asked.

### 6. `produces` is already the Concept tier, orphaned

20 of 299 records carry `produces`. The values:

```
action kind · modal system · action template · droptable system · skill level curve · the GUI
playbot · smithing skill · writes grant · produces claim · plan report · buff engine
combat event hook · per expression · three archetype mods · starting zone · balance numbers
end-to-end agent workflow · playtest findings · a retired spec · default-branch inference rule
```

Three problems, all fixable, none requiring a new store:

- **It conflates two kinds of thing.** "buff engine", "droptable system", "modal system" are
  durable capabilities. "playtest findings", "balance numbers", "three archetype mods" are one
  branch's output. Only the first kind should survive its task.
- **It has no reader after dispatch.** `planCheck` compares `produces` **only within one dispatch
  set** (`duplicate-produces`). Once a task closes, the claim is inert. There is no query that
  answers "does anything already produce X" against the store, let alone against the tree. The
  birth certificate exists; the registry does not.
- **It is free text with no vocabulary.** No two of the 20 values share a word. A duplication check
  over free text is a string-match lottery.

The cheap version of the user's core ask is therefore **not a new subsystem**. It is: give
`produces` a reader that spans the whole store, and a place for a claim to graduate to when its
task closes.

## What the sketch gets right, and where it needs cutting

The sketch mixes two kinds of node, and CLAUDE.md's "do not create systems required to be manually
kept in sync" cuts exactly along that seam.

| Sketch node | Derivable? | Verdict |
|---|---|---|
| Capability: purpose | authored only | keep — `systems.json` needs it; the `note` fields are audit history wearing its clothes |
| Capability: dependencies | **derivable** (measurement 2) | derive and report; do not author, do not gate |
| Capability: owning modules | authored (`paths`) | already exists — fix its single-valuedness first (measurement 3) |
| Capability: public interfaces | **derivable** (438 exports) | derive on demand; authoring this is a sync system |
| Capability: owned concepts | authored | **this is the new tier and the whole value** |
| Concept: capability / modules / symbols / tests / docs | authored + derived mix | authored: name + owner. Derived: everything else |
| Module: files, public symbols | **fully derivable** | never store |
| Symbol graph: calls, references, types | derivable, expensive | **cut** — see below |

### Cut the symbol graph

It is the only tier requiring new machinery (tree-sitter or the TS compiler API), and the question
it answers — "what calls this" — is already answered by `Grep` in one call, exactly, over 25k lines.
It would be a stored derivative that rots between runs, or a slow live pass, and neither buys
anything over the tool an agent already reaches for first. Nothing in the 30 duplication records
would have been caught by a call graph.

### Make Concept a refinement of System, not a third axis

This tree already has two orthogonal partitions: **layers** (`grammar < content < runtime < ui <
scripts`, gated by `layer-check`) and **systems** (`systems.json`, gated by `audit-status`). They
are genuinely orthogonal — the Contribution system spans the content and scripts layers.

A third independent partition is where "keep independent systems independent" starts to cost more
than it returns. The fix is to make concepts a **refinement**: every concept belongs to exactly one
system, and a system's `paths` must equal the union of its concepts' paths plus whatever is
unassigned. Then the partition check gets *stronger* rather than duplicated, and the low-level
query ("which files are in this system") and the high-level one ("who owns field validation")
resolve against one relation instead of two that can disagree.

## The "file ballooning past its scope" signal

Asked for as a natural consequence, and it can be one — but only with a non-arbitrary measure. A
line-count threshold is the `comment-only` gate again: a number nobody can defend, generating strip
commits.

Two honest candidates, both relative:

1. **A file whose exports span more than one concept.** Falls straight out of the Concept tier
   if concepts name their modules — the flag is `src/content/action.ts` appearing under both
   "action parsing" and "section field validation". This is a *structural* claim, not a size one,
   and it is exactly the `action.ts` finding, computed instead of audited.
2. **Growth since `lastAudit`, per file.** `audit-status` already resolves `lastAudit` and walks
   the diff; adding "and these 3 files grew by N lines" is nearly free, is relative to a reviewed
   baseline rather than to an invented constant, and feeds the existing sweep-request decision
   instead of a new gate.

Both are reports. Neither should redden CI.

## Recommendation — three tiers, in evidence order

**Tier 1 — fix the map that exists.** Make ownership single-valued (measurement 3); name audit
coverage as its own weaker relation so nothing is lost. Add derived queries over the existing
manifest: `tasks system <name>` answers files, exports, what it imports, what imports it, in one
call, computed, stored nowhere. This is the low-level agent's question, answered correctly for the
first time.

**Tier 2 — the actual ask.** A concept registry, refining systems, where a `produces` claim
graduates on close. `tasks produces <term>` / a `plan` check that spans the whole store, not one
dispatch set. Needs a vocabulary discipline more than it needs code.

**Tier 3 — defer indefinitely.** Symbol graph. Revisit only when a question arrives that Grep
demonstrably cannot answer.

The open question Tier 2 cannot dodge: **who writes the concept entries, and when.** A registry
nobody updates is worse than no registry, because it answers "no owner" with confidence. That is
the thing to settle before any code is written.
