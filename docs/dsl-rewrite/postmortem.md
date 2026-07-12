# DSL/JSON content pipeline — postmortem and audit

Written 2026-07-11, immediately before the legacy content DSL/JSON pipeline was
deleted from this repo (branch `dsl-rewrite`) to make room for a from-scratch
rewrite. This document captures *why* the old system was torn down rather than
hardened, for whoever picks up the rewrite (including a future session of the
assistant that isn't a "prior conversation" to it anymore).

All file:line citations below refer to the state of the repo immediately
before deletion (commit `a0765d7` and earlier) — the files themselves are gone
after this point on this branch, but remain in git history.

## Bottom line

The DSL was designed purely as a one-way authoring shortcut (text → JSON), never
as a true alternate serialization of the object model. **No JSON→DSL path ever
existed anywhere in the codebase.** Every other pain point — the hacky
contribution/diff system, the 781-line grammar document, three independently
drifting grammar implementations, the permanent JSON escape hatch — is a direct
downstream consequence of that one gap. Hardening any one of those symptoms
without fixing the root cause would just move the bolt-on somewhere else.

## How the debt chains together

**1. The compiler was lossy on purpose, so a decompiler was structurally
impossible to bolt on.** `compiler.ts` didn't do a 1:1 mapping — it inferred and
defaulted constantly: humanized-id fallbacks, synthesized `examine` actions when
none were authored, generic default success/failure locale text, a hardcoded 2s
duration for examine, and critically `once` desugared into `maxCompletions:1`
**plus** an auto-derived `visibleWhen` guard computed from whatever flags the
action happened to `set:` (`compiler.ts:217-249`). Once compiled, an authored
`once` and a hand-written equivalent `hidden if:` guard were indistinguishable in
the JSON. You cannot decompile output that has already thrown away which of
several equivalent authorings produced it.

**2. Because there was no decompiler, the contribution differ invented its own
weaker mechanism instead.** `contributionPatch.ts`'s own header comment said this
outright: *"Deliberately decompiler-free: entities/items are emitted as their
verbatim current source block... never reconstructed from compiled objects — so
it never has to round-trip the full action grammar"* (`contributionPatch.ts:8-11`).
It diffed locations field-by-field (the one place it needed real structure) and
treated every entity/item as an opaque atomic text blob — if one line inside
changed, the whole block got re-shipped. Anything it couldn't express this way
(dialogue, quest, stat, skill, interaction, recipe, droptable, brand-new
locations) just produced a warning string for a human to hand-apply. That wasn't
a bug to fix — it was the ceiling of the design.

**3. The rest of the pipeline compounded it.** Two independently-maintained
copies of the same module-splitting regex (one in `contributionBundle.ts`, one
in `merge-contribution-issue.mjs`, explicitly commented as needing to be "kept in
lockstep"); GitHub issue bodies too long for the prefill URL so the real
transport was a manual copy-paste (`githubIssues.ts:48-52`); merge was a
byte-level last-write-wins file overwrite with no real conflict detection (the
one 3-way `git merge-file` tool that existed, `merge-dsl-files.mjs`, was
disconnected from the automated path); "-PATCHES" satellite modules accreted
forever rather than folding back into their target; no CI wiring at all —
everything was a manual CLI.

**4. The grammar bloat had the same root: sugar was added per-feature, not
derived from one uniform shape.** `##` meant "nested entity" under a location but
"op verb + object kind" under `# patch` — same token, unrelated meaning. `say:`
had to be last on a line because its value ran to end-of-line, breaking the
otherwise-uniform comma-joined-tags rule. `enemy:`/`on success:` were composite
tags that recursed a level deeper and couldn't be comma-joined either.
`droptable:` had its own bespoke two-mode recursive grammar with id ambiguity
resolved by a compiler prepass. There was even a fossil: `wall`/`while`
terminology was renamed to `adjacent:`, but comments and a passing test still
referenced the old name (`shared.ts:21`, `parser.ts:172`,
`lineTracking.test.ts:43`) — proof the DSL's own tooling had already drifted from
itself once, silently.

**5. "DSL as ground truth" wasn't even true before deletion.** ~7 of the ~20
`ContentModule` data shapes (`resources`, `effects`, `interactionTypes[].experience`,
`displayProfiles`, `statModifiers`, `collectionLogs`, top-level `enemies`) had
**no DSL sugar at all** — reachable only via the raw-JSON `# advanced` escape
hatch or a hand-written `.json` file, which is exactly why `base-core.json` could
never be ported. Separately, `ContributionMapEditor.tsx` was a fully parallel
visual editor that read/wrote structured JS objects directly — zero DSL text
involvement, no bridge back and forth. Two disconnected authoring surfaces into
the same content, and the DSL didn't even cover its own object model.

**6. Three divergent grammar re-implementations, no shared source.** The parser
(real), the CodeMirror highlighter (`dslLanguage.ts`, a hand-rolled regex
`StreamLanguage`), and the completion engine (`dslCompletions.ts`'s hardcoded
`FIELD_PATTERNS`) each encoded "what the grammar looks like" independently.
Nothing kept them in sync — the `wall` fossil above is proof this already caused
real drift.

## Section inventory of the old grammar (`docs/content-dsl-grammar.md`, 781 lines)

Top-level headers the parser recognized: `info, location, dialogue, advanced,
item, quest, recipe, interaction, stat, skill, flags, droptable, patch`. Notable
special cases layered on top of that:

- `##` overloaded: "nested entity" under `# location`, but "op verb + object
  kind" under `# patch`.
- `## upsert location` was field-level while every sibling patch op was
  whole-object — a manually-synced exception (`entities:` had to be a *full
  resulting list*, not a delta).
- `## upsert flag <id>: <value>` was a third shape again — the header line *is*
  the whole declaration, no nested body, unlike `entity`/`item`.
- `droptable:` was two levels of special nesting beyond a normal tag, its own
  two-mode (independent/dependent) recursive sub-grammar, id ambiguity resolved
  by a compiler prepass.
- `say:` had to be last on a line (value runs to end-of-line) — the one
  exception to the otherwise-uniform comma-joined-tag-list rule.
- `enemy:`/`on success:` were composite tags recursing one level deeper,
  another exception to the comma-join rule.
- `examine:` was textual sugar for `say:` only for that one keyword — the only
  case where inline text auto-wrapped as a tag.
- Condition grammar had two ad hoc special forms (`tag:` / `equipped tag:`)
  only inside `requires:`, nowhere else conditions appeared.

## The `# advanced` escape hatch

Raw JSON merged into `data` (and a separate `data-updates` key), parsed by
brace-depth counting then `JSON.parse` (`parser.ts:148-168`). In shipped content
it was used in only 2 of 6 modules, both tiny (a one-key locale block, a 3-entry
flags array). `# patch` itself was unused in any shipped module — the newest
grammar feature (commit `c6beedf`) had zero real-content mileage before this
teardown.

## Round-trip capability — confirmed absent

No `ContentModule`-JSON→DSL serializer existed anywhere in the codebase.
`contentDsl/` contained only forward parser/compiler code. The closest artifact,
`contributionPatch.ts`, diffed two **DSL source strings** (not JSON) and
explicitly avoided decompiling (see point 2 above).

## Contribution pipeline end-to-end flow (as it existed)

1. In-app edit (`DslModuleEditor.tsx`, CodeMirror) → debounced (300ms) compile
   via `compileAndCommitDslModule` → only compiled-JSON `ContentModule` objects
   ever touched the running game; DSL text lived separately in editor state.
2. Draft → bundle packaging (`contributionBundle.ts`): unchanged modules
   skipped; core modules diffed to a `# patch`; new modules shipped verbatim;
   all concatenated into one multi-module DSL text blob ("the bundle").
3. Diffing a core module → `# patch` DSL (`contributionPatch.ts`): both DSL
   versions re-parsed *and* independently re-split into raw text blocks by a
   second, hand-rolled header-line scanner. Locations diffed field-by-field;
   entities/items compared as verbatim trimmed text, re-headed if different,
   never round-tripped through the compiler/AST. Anything else → a warning
   string.
4. Bundle → GitHub issue body (`githubIssues.ts`): the body was never actually
   put in the prefilled URL (GitHub silently truncates/rejects long
   `issues/new?body=` URLs) — only title/labels were; a "Copy body" button was
   the real transport.
5. Merge (`scripts/merge-contribution-issue.mjs`, manual CLI, not CI-wired):
   regex-extracted the issue sections, re-split modules via a **second,
   independently-maintained copy** of the module-splitting logic (explicitly
   commented as needing to be "kept in lockstep" with `contributionBundle.ts`).
   `upsertDslModules` did a byte-level upsert per module id — last-write-wins
   overwrite, never a merge/patch-apply.
6. Runtime apply of `# patch` sections: the compiler turned `# patch` into
   `ModuleObjectPatch` entries (RFC-6902-ish ops from `jsonPatch.ts`), applied at
   load time by `contentModules.ts`'s `applyObjectPatches`.
7. Conflict handling: `scripts/merge-dsl-files.mjs` (3-way `git merge-file`) was
   a separate, not-pipeline-wired tool — concurrent edits to the same module
   were not handled in the automated path at all.

## The module-conflict-cascade

`resolveAndApplyModules` (`contentModules.ts:1197-1247`) validated the whole
merged bundle, then attributed blame for any error to a module (falling back to
"blame the last module that touched anything" if no clear owner could be
pinned down) and disabled that **entire module**, rerunning the whole pipeline
from scratch. It did not surgically drop just the offending object. CLAUDE.md
called this out by name as risky and noted it "has happened twice" — a repeat
failure mode that was documented as a rule to route around, rather than fixed
architecturally. See `backlog-process-review.md` for what this suggests about
process, not just code.

## What the rewrite should do differently

See `implementation-plan.md` for the phased plan. In short: make the object
schema primary and the DSL a mechanical projection of it (one generic recursive
node shape, not 12 bespoke section grammars); stop destroying information at
compile time (push defaulting/inference to a post-load hydration pass so
`text → object → text` is a true identity); pair the parser with a printer from
day one so diffing becomes "diff two objects, print the diff" instead of
verbatim text-block hacks; derive editor tooling (highlighting, completion) from
the same schema instead of three hand-rolled regex surfaces; unify the visual
and text editors over one object graph; and let full schema coverage make the
JSON escape hatch unnecessary by construction instead of case-by-case.
