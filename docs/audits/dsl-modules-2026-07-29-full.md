# DSL module deliverable — full-system audit, 2026-07-29

Audit of the whole DSL module push (chunks 1–8, `e56b25d`..`731c3a6`) against the deliverable spec in
`docs/dsl-modules/deliverable-log.md`, plus the cross-system surfaces it grew: `src/runtime/save.ts`,
`scripts/play-cli.ts`, `scripts/modportal.ts`, `scripts/publish-local-changes.ts`,
`scripts/squash-local-changes.ts`.

Wider than the `65d764a` audit, which covered chunks 1–7 within `src/grammar` + `src/content` only.
This pass deliberately crosses that boundary, because the deliverable's own acceptance criteria
(engine requirement 6, "degrade gracefully on missing ids") are implemented in `src/runtime`, and
nothing in the DSL-load-path system's declared paths can see whether they hold.

Baseline at `731c3a6`: 419 tests green, `tsc --noEmit` clean, `layer-check` clean, `audit-status`
green. Every finding below was reproduced against that baseline; the reproduction is quoted inline.

---

## H1 — a loaded save loses every object-owned flag, including all map discovery

`src/runtime/save.ts:120`

```ts
pruneRecord(state.flags, 'flags', (id) => registry.flags.has(id), 'flag', warnings);
pruneRecord(state.visits, 'visits', (id) => registry.namespace.has('node', id), 'dialogue node', warnings);
```

`registry.flags` holds only `# flag` sections. Chunk 3c gave flags a second, deliberate declaration
form — `flags:` on an entity or location — and those land in `registry.namespace` alone
(`src/content/resolve.ts:56-60`). So does `discovered`, which `resolve.ts:57` declares on *every*
location and which `src/runtime/effects.ts:52` writes as `${location}.discovered`.

The `visits` line one row below already reads the namespace. The `flags` line does not, so every
member flag in a save is classified as "not loaded" and deleted.

Reproduced against unmodified `content/tutorial-island.dsl`:

```
saved: {"version":4,"flags":{"tutorial-island.front-door.unlocked":true,
                             "tutorial-island.basement.discovered":true,
                             "tutorial-island.made-bread":true}}
flags after load: {"tutorial-island.made-bread":true}
WARN: Removed flags tutorial-island.front-door.unlocked because its flag is not loaded.
WARN: Removed flags tutorial-island.basement.discovered because its flag is not loaded.
```

Blast radius is both paths that call the prune: `/load` (`save.ts:187`) and every accepted `/dsl`
edit (`scripts/play-cli.ts:317`). A player who saves, loads, and returns to the guide house finds the
front door locked again and the map undiscovered. This is the exact defect class chunk 5 was built to
prevent, inverted: instead of quietly removing content that is gone, it quietly removes content that
is present.

**Fix and verification.** Changing that one line to `registry.namespace.has('flag', id)` was applied
and the suite re-run: **419/419 still green**. That the fix is indistinguishable from the bug under
the current suite is the second half of this finding — see M7.

**Why nothing caught it.** `PRUNE_MODULE` (`src/runtime/save.test.ts:125`) declares exactly one flag,
`# flag known`, at module level — the one shape `registry.flags` covers. The same fixture *does*
exercise a member key for `visits` (`'miki.hello'`, `save.test.ts:159`), so the two sibling lines were
tested asymmetrically. And no `# save` section exists anywhere in `content/`, so
`src/runtime/integration.test.ts` never loads a real save of the real game.

---

## H2 — patching one stat on another module's entity silently deletes the rest of the sheet

`src/content/entity.ts:30`, `src/content/merge.ts:61-62`

`stats` is a `Record<string, Range>` produced by `statBlock`, a hand-rolled `Parser` that calls
`list(statAssignment).parse` and discards the `ListParser` shape around it. `isListField`
(`src/grammar/section.ts:42`) tests for `element`, finds none, so `mergeAuthored` falls to
`merged[key] = value` — wholesale replacement.

Reproduced:

```
base:  # entity rat / stats: attack 4, defence 9   (+ two actions)
patch: # entity base.rat / stats: attack 7

stats patch  -> stats {"base.attack":{"min":7,"max":7}}                       defence GONE
action patch -> stats {"base.attack":..., "base.defence":...}  actions merged by label
```

The action patch in the same run merges correctly by label. Stats are the one authored collection
with no field-granular edit path, which fails module requirement 2 of the deliverable — "Edit an
entry owned by another module — down to a single key" — and contradicts the design's own one-sentence
rule, "fields it does not list are untouched". It fails silently: no diagnostic, no warning.

---

## M1 — `stats:` is the only collection field the grammar refuses as a block

`src/content/entity.ts:30`, `src/grammar/section.ts:76-79`

Same root cause as H2. `parseBlock` requires the field's parser to carry `parseBlock`; `statBlock`
drops the one `list()` already supplies. Measured across the grammar:

```
FAIL  stats block      -> this field cannot be written as a block
OK    stats inline
FAIL  +stats           -> (rejected: stats is not a list)
OK    flags block
OK    entities block
FAIL  title block      -> this field cannot be written as a block   [correct: scalar]
```

Every other multi-valued field — `entities:`, `adjacent:`, `flags:`, `tags:`, `in:`, `out:`,
`burnt:`, `on empty:`, `on full:`, `stations:`, `dependencies:` — takes block form and `+`/`-`,
because they are all `list(...)`. `stats:` is the sole exception, and the exception is an accident of
how one parser was wrapped, not a design decision — nothing in the deliverable log defends it.

This is the failure an agent authoring against the grammar hit and misdiagnosed as its own error. It
is not: the grammar is inconsistent, and the inconsistency is invisible until you trip it. Fixing it
is a few lines — give `statBlock` a `parseBlock` delegating to the same `list()` — and fixing it as a
real `ListParser` over `[statId, Range]` pairs closes H2 at the same time.

---

## M2 — a corrupt modportal manifest crashes the game before any DSL loads

`scripts/play-cli.ts:760`, `scripts/modportal.ts:97`

```
malformed json -> THROWS SyntaxError: Expected property name or '}' in JSON at position 2
no entries key -> THROWS TypeError: manifest.entries is not iterable
```

Both call sites `JSON.parse` an on-disk file and iterate `manifest.entries` with no guard. A
truncated write, a hand-edit, or an interrupted `sync` leaves `content/modportal.local/manifest.json`
in a state that takes down `npm run play` with a stack trace — and takes down `modportal list`,
`enable` and `disable` the same way, so the tool cannot repair its own cache.

Chunk 4 exists precisely so that bad content cannot reach an unrecoverable state (engine requirement
3). The chunk-8 surface routes around it: this file is read before the tolerant loader is ever
called.

---

## M3 — disabling a broken module neither silences it nor unblocks `sync`

`src/content/registry.ts:524-533`, `scripts/modportal.ts:138-165`

`loadUniverseWithDiagnostics` parses every disabled source to recover its id, and records a parse
diagnostic when that throws:

```
loaded: [ 'base' ]  disabled: [ 'busted' ]
diagnostics for a switched-OFF module: [ 'busted/parse: unrecognized action result: "x"' ]
```

`play-cli.ts:817` prints every diagnostic as `Disabled module: …` on stderr, so a user who switched a
broken mod off still gets its error on every launch. Worse, `modportal sync` calls `validateEnabled`
with *all* entries (despite the name) and `process.exit(1)` on any diagnostic — so a broken mod the
user has already disabled fails the sync command, and disabling is not the escape hatch it is
documented to be.

---

## M4 — two positional arguments silently redirect `/dsl` at a content file, which it then overwrites

`scripts/play-cli.ts:718`

```ts
if (positional.length > 1 && localFile === defaultLocalChanges) localFile = positional[0];
```

Multi-file loading is documented as comma-separated (`splitContentArg`, and the chunk-6 log). Two
space-separated positionals is the natural guess for the same thing, and it instead makes the first
file the local-changes file. `main()` then reads it as `localSource.text`, and the first `/dsl`
rewrites it through `renderLocalChangesModule` — replacing its `# info` header with
`# info local-changes / version: 0.0.0 / pack: local`, regenerating its dependency list, and dropping
comments outside section spans. `npm run play -- content/a.dsl content/b.dsl` destroys `a.dsl`.

Undocumented in `HELP_LINES`, which names only `local=<file>`.

---

## M5 — the prune map has no exhaustiveness guard, unlike its sibling in the same file

`src/runtime/save.ts:13-30` vs `109-142`

This is the structural answer to "is the pruning more complicated than it needs to be?" — **it is
not**. Strip `activeAction` and `activeBuffs` and what remains is literally the naive rule: load the
DSL, apply the save, delete keys the registry does not have. Five `pruneRecord` calls, one line each.
The two exceptions are earned: `location` needs a *replacement* rather than a deletion because
"nowhere" is not a playable state, and `activeAction` is a compound in-flight record whose actors,
cadences and resources are each separately prunable, so "does this key exist" is genuinely several
questions (`activeActionProblem`, 20 lines).

What is missing is the guard the same file already demonstrates. `SAVE_FIELDS` is a
`Record<Exclude<keyof GameState,'log'>, …>` specifically so that adding a `GameState` field is a type
error until it is classified. `pruneStateForRegistry` is a hand-written sequence with no such
constraint: add `equipped: Record<string, string>` to `GameState` and the compiler forces you to
classify it for diffing while saying nothing about pruning it. H1 is what that class of silence
produces when the *predicate* rather than the *field* is wrong; the same shape would hide a missing
field entirely.

The cheap version: drive the record prunes off a table keyed by `SaveField`, so the exhaustive key
type covers both halves of the file.

---

## M6 — approved-mod re-identification is a blind text substitution over untrusted content

`src/content/modportal.ts:59-61`

```ts
return replaceInfoId(source, LOCAL_CHANGES_MODULE_ID, moduleId).replace(/(^|[^a-z0-9-])local-changes\./g, `$1${moduleId}.`);
```

The `# info` replacement is anchored and safe. The second is a global regex over the whole DSL
source, which does not know what is a reference and what is prose. Any `local-changes.` inside a
`say:`, `examine:`, `title:`, or a `# save` JSON blob is rewritten too. The repository has a complete
namespace resolver and a shared reference visitor (`referenceSites.ts`) that exist to avoid exactly
this; the re-id path reaches past both to string-replace.

Narrow in practice, but it operates on third-party content by definition, which is the one place a
textual approximation is least defensible.

Related, and worth a decision rather than a fix: `upsertModportalEntries` defaults new entries to
`enabled: true` (`modportal.ts:99`) and `play-cli` auto-loads `content/modportal.local` by default
(`play-cli.ts:672`), so `modportal sync` puts newly-approved third-party content into the player's
next session with no prompt. The content is DSL-only — no code execution — and the `approved-mod`
label is a maintainer gate, so this is a defensible design; it is recorded because it is not
currently stated anywhere as a design position.

---

## M7 — the prune tests encode the implementation's assumptions rather than the requirement

`src/runtime/save.test.ts:125-209`

The one-line H1 fix leaves 419/419 green. A suite that cannot distinguish "delete flags the registry
lacks" from "delete every flag an object owns" is not testing engine requirement 6; it is restating
`pruneStateForRegistry`'s implementation with one fixture per branch.

Two concrete gaps behind that:

- `PRUNE_MODULE` declares only module-level `# flag`s, so the fixture cannot express the member-flag
  case that chunk 3c introduced — even though the same fixture uses a member key for `visits`.
- No `# save` section exists in `content/`, so `integration.test.ts` never round-trips a real save of
  the shipped game. Given that `# test` sections are the declared regression format and `/load` is a
  first-class directive, a `# test` that saves, loads and asserts a member flag survived is the
  natural regression here and would have failed on H1 the day it landed.

---

## L1 — `extractContributionDsl` takes the first ```dsl fence in the issue body

`src/content/contribution.ts:53-61`

`buildContributionIssueBody` places contributor notes (`## Summary`) *before* the fenced module, and
extraction is `indexOf(DSL_FENCE)` / `indexOf('\n```')`. A contributor whose notes contain a ```dsl
block — plausible when explaining a change — makes the modportal materialize the wrong text. Usually
caught by `parseModuleSource`, but a prefix that happens to parse would be materialized silently.
Anchoring on the last fence, or on the documented trailing HTML comment, removes the ambiguity.

## L2 — `n()` has two identical branches

`src/content/serialize.ts:25-27`

```ts
return Number.isInteger(value) ? String(value) : String(value);
```

Dead conditional across every numeric field the serializer emits.

## L3 — two mechanisms for "prune references to content that is not there"

`src/content/registry.ts:296-375`

`pruneRegistryDanglingReferences` drives most of its work off `danglingRoots` — absent optional
module roots — exactly as the chunk-5 log states, so typos still produce diagnostics. But entity
stats (`:303`) and item stat-bonus tags (`:312`) are filtered by `registry.stats.has(statId)`, which
is the "anything the registry lacks" rule the same log explicitly disclaims. The two coexist in one
function under one name. Reachable via `# remove stat.x` in a later module: the reference resolved,
the stat is gone, and the entity's sheet is trimmed with no diagnostic.

## L4 — `visits` is claimable as a flag name and misparses; `skills` is reserved but unused

`src/grammar/condition.ts:visitedNode`, `src/content/universe.ts:28`

`visitedNode` treats any path ending in `.visits` as a dialogue-node counter. A flag named `visits` on
any object therefore resolves as `node`, not `flag`, and fails as an unknown node. `RESERVED_IDS`
covers `player`, `skills`, `self`, `time` — `visits` is absent, and `skills` is reserved without
being an engine root in `ENGINE_ROOTS`. The chunk-1b note in the deliverable log flagged `visits` as
needing reservation; it was not carried through when `visits` became a trailing segment rather than a
root.

## L5 — `Namespace.resolve` materializes every key of a kind per reference

`src/content/namespace.ts:92`

```ts
const matches = [...this.keys(kind)].filter(([key, namespace]) => …);
```

O(references × keys-of-that-kind) per load, and the tolerant loader recompiles the whole universe
once per failing module. Irrelevant at tutorial scale; recorded because the deliverable's purpose is
to make the universe grow with user content, and `/dsl` runs a full reload per accepted edit.

---

## What holds up

Stated because the audit prompt asks for reuse and boundary judgements, not only defects.

- **`referenceSites.ts` as one visitor** serving resolution, residual validation, prune and typed CLI
  input is the right consolidation, and it is what made merging the old chunks 1b and 3 correct
  rather than convenient.
- **Layering is clean.** 378 cross-file imports, all downward; the content/runtime split held through
  a deliverable that repeatedly wanted to violate it.
- **Path traversal was considered where it mattered.** `loadModportalSources` guards manifest-supplied
  paths with `inside()`, and materialized filenames are built from a validated integer and a
  `MODULE_ID`-checked slug.
- **Determinism is real.** Lexicographically smallest topological order, and the tolerant loader
  reparses from source per retry rather than reusing half-resolved state — the log's reasoning for
  that is correct and the cost is acceptable.
- **Scope drift is low.** Every chunk landed roughly what it declared, and the three deferrals
  (action labels, `-flags:` over-approximation, networked `gh` publishing) are each recorded with a
  reason at the point of deferral.

## Residual risk

The `gh issue create` and `gh issue list` paths are still unexercised against real GitHub; chunk 8's
own log records this. The canonical serializer remains non-source-preserving by design. The GUI
surfaces of engine requirement 2 ("create content of every DSL type, from both CLI and GUI") are
pending the GUI rebuild, so requirement 2 is half-met by construction and the deliverable log should
say so rather than marking chunk 6 as closing it outright.
