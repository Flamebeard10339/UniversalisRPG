# DSL modules — deliverable log

**Status:** design drafted 2026-07-28, **not ratified**. Open decisions at the bottom; two of
them change the grammar surface, so they want an answer before chunk 2 starts.

---

## The deliverable

Content authored in-game by players and contributors, as modules that compose. Content is
strategy expressed over three engine capabilities that already exist — adversarial resolution
between stat-bearing agents, temporary and permanent stat modification, and tracking/responding
to player action — so most new content needs no new code. Balancing is authoring: the XP a
player earns for dealing damage belongs in a module, not in `src/`. Contributors care that an
NPC says "BBBB" instead of "AAAA"; they do not care how that is stored, ordered, or merged.

### What a module must do
1. Add new content of any kind, no restrictions.
2. Edit an entry owned by another module — down to a single key, so a one-line dialogue fix does
   not mean repasting the dialogue.
3. Read as a compact diff: a module contains what it changes and nothing else.
4. Organize natively into packs/folders, so content can be grouped, enabled, disabled, searched.

### What the engine must do
1. Enable/disable any module on a whim, so user content need not be part of the core experience.
2. Create new content of every DSL type, from both CLI and GUI.
3. Edit local changes without being able to reach an unrecoverable state through invalid input.
4. Validate, and help the author find broken grammar.
5. Publish local changes to a GitHub issue for integration.
6. Degrade gracefully on missing ids — disabling a mod whose item is in the player's inventory
   removes the item with a quiet warning, it does not fail loudly.

Plus: tooling to squash repeated edits into one file so core stays maintainable, and a modportal
that reads GitHub issues labelled `approved-mod` so user mods need not be committed to be played.

---

## Where the code actually is (verified 2026-07-28 at `8da9b95`)

**There is no module system to fix — there is one to build.** Measured, not assumed:

| Spec assumes | Reality |
| --- | --- |
| Modules have identity, deps, packs | `grep` for `dependencies`/`universe`/`pack`/`enabled` across `src/` returns **nothing** |
| Modules load in an order | `loadModule(source: string)` takes **one concatenated string**; `play-cli` joins comma-separated files before parsing |
| A module can edit another | `registry.entities.set(entity.id, entity)` — **last write wins, wholesale** (audit DSL-H1) |
| Content is organized | `content/` holds exactly one file, `tutorial-island.dsl` |
| Bad input is survivable | `loadModule` **throws**; one bad character anywhere fails the entire universe |

The one piece of good news: the legacy `# info`/`# patches`/`upsert`/`replace`/`remove` system —
the one that "felt difficult and hacky" — died with the rewrite. Nothing has to be unwound. The
worked examples still sitting in `backlog.md` under *E2E Authoring* describe that dead system.

`loadModule` is also misnamed: it loads a universe, not a module.

---

## The design

### The rule, in one sentence

> **A section names an id. The fields it lists are applied over whatever that id already holds;
> fields it does not list are untouched.**

Whether a section *creates* or *edits* is not something the author declares. It follows from
whether the id already exists when that module loads. Same syntax either way.

```
# entity miki                     ← in the module that first names `miki`: creates it
title: Miki
examine: A guide, mid-yawn.
dialogue: miki-intro

# entity miki                     ← in a module that depends on the above: edits it
examine: A guide, wide awake.     ← title and dialogue are untouched
```

**Why this is the answer to the upsert/replace/remove problem.** Those keywords existed to tell
the loader something the loader can work out for itself. The contributor was being asked to
describe the storage operation instead of the content change. Delete the keywords, keep the
information — it is already in the dependency graph.

This satisfies requirements 2 and 3 directly and for free: a module physically cannot contain
more than it changes, because anything it does not mention is inherited.

### Nesting recurses

The same rule applies at every level, addressed by id:

```
# location tutorial-guide-house
### entity stairs-up              ← patches one entity inside the location
title: Creaking Stairs            ← its actions, examine, etc. survive
```

Dialogue nodes are addressed by node id, which is what makes "change this one line" a two-line
module rather than a repaste.

### Load order comes from dependencies, and is deterministic

`# info` gains `dependencies:`. Load order is a topological sort of the dependency DAG, **with
ties broken by module id**.

On the unordered-conflict case: the spec accepts unpredictability and asks the game to handle it
gracefully. I want to push back one notch, because it is nearly free. Two modules that write the
same field with no dependency path between them are *unordered*, but they need not be *random*.
Sorting the tiebreak makes the same set of modules always produce the same universe — so a
conflict yields a reproducible wrong result, which a player can screenshot and a contributor can
debug, instead of a heisenbug. You are right that the engine cannot *resolve* it; the mods do have
to talk. But it can be deterministic about it, and it can say so:

> `bronze-dagger.tags` is written by both `sharper-weapons` and `rebalance-pack`, which do not
> depend on each other. `rebalance-pack` won by name order. Declare a dependency to make this
> intentional.

That diagnostic costs one `Map<string, moduleId>` populated during the merge that is happening
anyway.

### Deletion is the one verb that survives

Merge-by-omission cannot express removal — there is no partial object that means "this is gone".
So exactly one keyword remains:

```
# remove entity mirror
```

This is not the old triad coming back. It is the residue: one keyword, for the one operation with
no other expression. Everything else is inference.

---

## What the spec needs that does not exist yet

### 1. Module identity, and a real multi-module load
`# info` (id, version, dependencies, pack, enabled) as a section kind; `loadModule(string)` becomes
`loadUniverse(modules)` doing parse-all → order → merge → resolve. Everything below depends on this.

### 2. Field-granular merge
Closes audit finding DSL-H1. Today's `Map.set` is the whole obstacle.

### 3. The complete reference walker — this is a prerequisite, not cleanup
Audit finding DSL-H2 says reference validation covers 20 of 44 reference-bearing fields.
**Engine requirement 6 cannot be built without closing that**, and the connection is not obvious:
to quietly strip a disabled mod's item from the player's inventory you must know *every* place an
item id can legally appear. The complete traversal buys three things at once:

- load-time validation (what the partial walker does today),
- dangling-reference pruning when a module is disabled (requirement 6),
- the (id, field) → writing-module map that powers conflict diagnostics.

So DSL-H2 should be scheduled as part of this deliverable, not as a leftover audit finding.

### 4. Per-module error isolation
Requirement 3 says the user must not be able to reach an unrecoverable state. Today a single bad
character throws out of `loadModule` and there is no game. A module must be able to fail *alone*:
parse into a staging area, and on failure disable that module, keep the rest, and surface
diagnostics. This is the architectural change with the widest blast radius and it is what makes
user-generated content safe to run at all.

### 5. Enable/disable and packs
Requirements 1 and 4. Cheap once 1 exists — an `enabled` flag consulted before merge, plus a
`pack:` grouping. Disabling must re-run the load, which makes 3 and 4 load-bearing.

### 6. Authoring, validation, publishing
Requirements 2/4/5 and the existing backlog items *Implement CLI commands for editing the DSL* and
*E2E Authoring*. The in-game editor writes a field-granular patch into a `local-changes` module
that depends on everything — which is exactly the shape the merge rule already produces, so the
editor has no special serialization path.

### 7. Squash and modportal
Squashing is well-defined *because* merge is field-granular: apply the merge, emit the result.
The `approved-mod` issue reader is independent of everything above.

---

## Chunk order

Engine first; nothing in tooling is safe until a bad module can fail alone.

| # | Chunk | Closes |
| --- | --- | --- |
| 1 | `# info`, module identity, `loadUniverse`, topological order | spec basis |
| 2 | Field-granular merge + `remove` | DSL-H1, module req 1–3 |
| 3 | Complete the reference walker | DSL-H2, unlocks req 6 |
| 4 | Per-module error isolation + diagnostics | engine req 3, 4 |
| 5 | Enable/disable, packs, dangling-ref pruning | engine req 1, 6; module req 4 |
| 6 | CLI authoring of every DSL type | engine req 2 |
| 7 | Publish to GitHub issue; squash tooling | engine req 5 |
| 8 | Modportal over `approved-mod` issues | stretch |

Chunks 1–2 are one sitting and kill the highest audit finding. Chunk 4 is the one to not skip.

---

## Open decisions

**D1 — do lists replace or append?** The rule says a field assignment replaces that field's value
entirely, lists included. That keeps one rule for everything, but it bites on `adjacent:`: a module
adding a two-way connection to an existing location must repaste that location's whole adjacency
list. Options: (a) keep the single rule, accept the repaste; (b) add a `+` prefix for additive list
fields — `adjacent: +tutorial.birdhouse` — one character, opt-in, default stays simple.
*Leaning (b), only because connectivity is directional so this case is common.*

**D2 — can a module reset a field to its default?** Merge has no way to say "put `examine` back to
the generated default". Probably YAGNI; flagging so it is a decision rather than an oversight.

**D3 — are ids globally unique or unique per kind?** Raised by the audit and unanswered. Merge
semantics make it sharper: `# entity mirror` and `# item mirror` either are or are not the same id.

**D4 — does a module have to declare a dependency to edit, or is it just recommended?** Strict
(refuse to merge into an id you do not depend on) gives better diagnostics and makes conflicts rare;
lax is friendlier for a quick local tweak. *Leaning strict for published mods, lax for
`local-changes`.*

**D5 — versioning.** `# info` carries `version:`. Does a dependency pin one, and what happens when
a dependency's content changes underneath a patch that targets it? Deferrable until modules are
distributed rather than committed, but it is the thing that decides whether chunk 8 is possible.
