# DSL rewrite — phased implementation plan

Goal, per the audit (`postmortem.md`): make the object schema primary and the
DSL a mechanical, lossless projection of it — one generic recursive node shape
instead of per-section bespoke grammar, a real printer paired with the parser
from day one, defaulting/inference pushed out of the compile step and into a
separate read-time hydration pass, and editor/diff/patch tooling all deriving
from the same schema instead of hand-rolled, independently-drifting copies.

No migration path is needed — the old system is fully deleted on this branch.
Content will be hand-authored fresh against the new grammar as it's built,
which doubles as the stress test for whether authoring actually stayed simple.

## Dependency graph

```
Phase 0 (schema)
    |
Phase 1 (generic parser + printer + hydration)
    |
    +---------------+---------------+
    |               |               |
Phase 2A          Phase 2B        Phase 2C
(differ)          (loader +       (editor tooling:
                   validation)     highlight/complete/
    |               |              wire DslModuleEditor)
    |               |                     |
    +-------+-------+                    Phase 3
            |                        (unify visual + text
       Phase 4                        editing)
   (contribution infra:
    real patches, transport)

Phase 5 (author real content end-to-end) — needs 2B at minimum, benefits from 4
Phase 6 (rewire gameplay consumers) — needs 0, can start as soon as schema is stable,
         runs in parallel with 2A/2B/2C/3/4/5 for any consumer that doesn't need the
         new loader yet (pure type-shape updates), but final verification needs 2B.
```

## Phase 0 — Schema definition (sequential, blocking, do first)

Define the canonical object schema for every content kind: entities, items,
locations, actions, dialogues, quests, recipes, interaction types, resources,
effects, stat modifiers, drop tables, display profiles, collection logs. For
each field, decide and record:
- shape (scalar / reference-by-id / nested object / list / free text),
- whether it's **authored** (must survive `text → object → text` unchanged) or
  **derived** (computed later, never appears in the parsed object at all — e.g.
  humanized display ids, default locale strings, hardcoded durations).

This is the one phase that genuinely resists parallelization even across
multiple people — the decisions here (what's authored vs. derived, what the
uniform node shape looks like) ripple into every other phase's contract. Get
this reviewed/settled before starting Phase 1, even if it's done quickly.

**Exit criterion:** a written schema doc + TS types, with an explicit list of
which fields are "hydration-only" (never written by the parser, never read by
the printer).

## Phase 1 — Generic parser + printer + hydration (blocking for everything after)

- Build the generic recursive-node reader: one shared rule for "heading +
  `key: value` lines + indented nested block + list items," not per-keyword
  bespoke parsing functions.
- Build the printer as the mechanical inverse, walking the same schema
  metadata from Phase 0.
- Build the hydration pass as a separate, pure function over parsed objects —
  it must never run during parsing or printing.
- Prove `text → object → text` is a true identity (modulo whitespace) on a
  hand-written corpus covering every content kind and nesting case, not just
  flat objects.

**Parallelizable within this phase:** once Phase 0's node-shape grammar is
fixed, the reader and the printer are separable work — they both just walk the
schema independently and only need to agree on the AST shape as a shared
contract. Two people/threads can take "parser" and "printer" as separate
tracks; write the round-trip test first so both sides are checked against the
same target throughout instead of only at the end.

**Exit criterion:** round-trip test suite green; a real hand-authored sample
module (not a toy) parses, prints, and re-parses to the same object.

## Phase 2A — Structural differ + patch renderer (parallel track)

- Depends only on Phase 1 (needs parsed objects + the printer).
- Generic deep-diff over two objects of the same schema — this replaces the
  old bespoke `jsonPatch.ts` (which only handled string arrays, id-keyed object
  arrays, and whole-replace fallback) with something that covers every content
  kind, not a subset.
- Render a diff as DSL text using the *same* printer used for whole objects —
  a patch op's value is just an object/scalar the printer already knows how to
  render, so no new "patch grammar" should be needed beyond "which object/field
  this diff targets."
- **Exit criterion:** diffing two versions of every content kind (not just
  locations) produces a correct, printable patch — including dialogue, quest,
  stat, skill, interaction, recipe, drop table, the kinds the old system
  couldn't patch at all.

## Phase 2B — Loader + validation engine (parallel track)

- Depends only on Phase 1.
- New module loader: reads DSL files, produces objects via the Phase 1 parser.
  Decide up front whether "JSON-first-then-DSL fallback" file resolution is
  worth keeping at all now that DSL is the only format — probably not; simplify
  to DSL-only file resolution unless there's a concrete reason otherwise.
- New validation/merge pass. Explicitly design against the old
  module-conflict-cascade failure mode (a single bad reference disabling an
  entire module, sometimes cascading further): prefer surgical exclusion of
  the specific invalid object over blaming and disabling a whole module, and
  avoid the "blame the last module that touched anything" fallback heuristic
  entirely — if attribution is ambiguous, that ambiguity itself is a design
  smell worth solving structurally (e.g. via explicit ownership) rather than
  guessing.
- **Exit criterion:** a small multi-module test fixture loads, merges, and
  validates correctly, including a deliberately-broken reference in one module
  that does *not* take down unrelated modules.

## Phase 2C — Editor tooling rebuild (parallel track)

- Depends only on Phase 1 (needs the parser's AST with real position spans —
  make sure Phase 1 threads real source positions through the AST natively,
  not via the old manual `withLine` line-threading hack).
- Rebuild syntax highlighting and completions to derive from Phase 0's schema
  metadata instead of hand-rolled regex — the goal is one source of truth, not
  three independently-maintained approximations.
- Wire the existing `DslModuleEditor.tsx` UI shell (kept during teardown) to
  the new parser/printer/hydration.
- **Exit criterion:** typing invalid DSL in the editor surfaces an error at
  the right line; completions and highlighting reflect the real grammar with
  no hand-maintained keyword lists to fall out of sync.

## Phase 3 — Unify visual and text editing

- Depends on Phase 1 (schema) and Phase 2C (editor rewire in place).
- Wire the visual/structured editor (`ContributionMapEditor.tsx`, kept during
  teardown, or its replacement) to operate on the *same* in-memory object graph
  the text editor parses into, using the Phase 1 printer to keep DSL text in
  sync with structured edits and vice versa. This is the fix for the old
  "two disconnected authoring surfaces" problem — it should fall out mostly for
  free once both editors share one object model and one printer, rather than
  needing its own bespoke bridge.
- **Exit criterion:** editing a location's position in the visual editor
  updates the corresponding DSL text region; editing that region as text
  updates the visual editor.

## Phase 4 — Contribution pipeline infra rebuild

- Depends on Phase 2A (differ) and Phase 2B (loader).
- Replace `contributionPatch.ts`'s verbatim-text-block hack with real
  diff-then-print patches covering every content kind.
- Fix the actual infra debt independent of format: eliminate the two
  independently-maintained module-splitting implementations (one shared
  function, imported by both the in-app bundler and whatever merge tooling
  replaces the old CLI scripts); fold "-PATCHES" satellite modules back into
  their target on merge instead of accreting forever (straightforward once
  patch-apply-and-reprint exists).
- Worth a real decision, not an assumption: whether to keep an issue-body
  copy-paste transport at all, or move to a PR-based flow (a bot-authored
  branch with a real diff) now that GitHub already solves "review a diff" and
  "detect a conflict" better than a hand-rolled merge script does. This is a
  transport decision, separate from the DSL rewrite itself, and could be
  deferred past Phase 4 if it's not blocking.

## Phase 5 — Author real content end-to-end

- The user hand-authors the Tutorial Island modules fresh against the new
  grammar, from git history and memory — the deliberate stress test for
  whether authoring actually stayed simple and near-English on real,
  non-trivial content (not just the test corpus from Phase 1).
- Treat any grammar rough edge found here as expected, first-iteration
  feedback, not a failure — feed it back into Phase 0/1 rather than
  special-casing it in Phase 2+ tooling built on top.
- Can start as soon as Phase 2B (loader) is usable; doesn't need Phase 4 to
  begin, though real contribution-flow testing does.

## Phase 6 — Rewire gameplay consumers

- Every file that imports content-schema types from `src/game/types.ts`
  (`choices.ts`, `travel.ts`, `ActionPanel.tsx`, `DialoguePanel.tsx`,
  `scripts/playtestEngine.ts`, etc. — left in place but broken by the teardown)
  gets updated to whatever shape Phase 0 settled on.
- Largest raw line-count phase, least architecturally risky — mostly
  mechanical once the schema is stable. Can start incrementally as soon as
  Phase 0 is locked (pure type-shape work doesn't need Phase 1-4 to exist),
  but final end-to-end verification needs Phase 2B's loader working.
- `scripts/playtestEngine.ts`/`scripts/playtest-cli.ts` specifically: worth
  keeping (they were left in place deliberately, not deleted, during teardown)
  since the simulation-loop logic itself isn't DSL-specific — only their
  `readModule`/`loadStagedBundle` functions need rewiring to the new loader.

## Suggested parallelization if more than one person/session is available

- One track: Phase 0 → Phase 1 (parser+printer), solo or pair, since this is
  the least parallelizable part.
- Once Phase 1's contract (AST shape, printer signature) is frozen, split into
  three simultaneous tracks: differ (2A), loader+validation (2B), editor
  tooling (2C). These touch disjoint files and only share the Phase 1 contract.
- Phase 3 picks up as soon as 2C lands; Phase 4 picks up as soon as both 2A and
  2B land — these can also run concurrently with each other.
- Phase 6 (consumer rewiring) can be chipped away at continuously from the
  moment Phase 0 locks, by whoever has spare capacity, without waiting on 1-4.
- Phase 5 (real authoring) is the forcing function that should happen last but
  soon — it's the only phase that tests the *whole* system against real
  content rather than test fixtures, so don't let it slip indefinitely.
