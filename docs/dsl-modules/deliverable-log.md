# DSL modules — deliverable log

**Status:** D1-D8 settled. **Chunks 1, 2, 3a and 3b landed.** Chunk 3c (members: flags,
action labels, dialogue nodes) is what remains of the namespace work.

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

# entity base.miki                ← in a module that depends on the above: edits it
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

### List fields: the operator is on the key, not the value (D1, settled)

A bare key replaces. A `+` prefix appends if absent; a `-` prefix removes if present.

```
+adjacent: tutorial-birdhouse
-adjacent: tutorial-river
```

The operator sits on the **key** because putting it on values is unparseable —
`adjacent: +a b` cannot say whether `b` is appended or replacing. Multiple `+`/`-` lines for the
same key are allowed, so additions and removals are expressed independently.

Mixing a bare assignment with an operator **for the same key in the same section** is an error:

```
+adjacent: tutorial-birdhouse
-adjacent: tutorial-river
adjacent: tutorial-house          ← invalid: replace and modify in one breath
```

Settled sub-rules:
- The restriction is **per section**, not per module. A module assigning `adjacent:` and a later
  module doing `+adjacent:` is the entire point.
- Multiple operators apply **in source order**, so `+a: x` then `-a: x` leaves it absent and the
  reverse leaves it present. No reordering, no set algebra.
- `+`/`-` on a non-list field is an error, not a silent coercion.
- `-` naming an absent member is a no-op. Safe for reference-bearing lists because the walker
  (chunk 3) catches a typo'd id anyway; a typo in a non-reference list like `tags:` will pass
  silently. Accepted.

### Namespaces are paths, and `.` is the only separator (D3 + D6, settled)

There is **one** namespace tree and every reference is a path into it. Each `.` narrows:

```
<module-id> . <kind> . <objId> . <member>
orc-pack    . entity . goblin  . attack
```

A reference may drop any number of **leading** segments, and resolves iff the remaining suffix is
unique across the module and its dependencies:

```
orc-pack.entity.goblin.attack   ≡   entity.goblin.attack   ≡   goblin.attack
```

Ambiguity is an error naming both candidates, not a silent pick.

**This collapses existing special cases rather than adding one.** `<obj>.<objId>.<actionId>` and
`<entityId>.<flag>` stop being distinct grammatical forms — they are just paths of different
depth. Today's entity auto-scoping (`set: fainted` inside an entity meaning
`front-door.fainted`) stops being a scoping pass and becomes the same relative-resolution rule
read from the current context outward. One mechanism, no exceptions.

**`self.`** is reserved for "explicitly my own module", for when local content is shadowed or when
a generator wants to be unambiguous.

Creation is always namespace-local: a bare heading names something inside this module and the
owning module's prefix is applied at load; a dotted heading edits a path that already exists
(D8). You cannot collide, because you cannot create outside your own namespace.

#### Consequences that fall out of making this rigorous

1. **Flags must become declarable.** This is the load-bearing consequence. Flags are currently
   invented by `set:`, so the resolver cannot enumerate them, cannot check a shortened flag
   reference for ambiguity, and cannot catch a typo. Keeping them undeclared would leave flags as
   the single exception to "everything is a path" — the exact thing this design is trying to
   remove. Declaring them also closes the sharpest half of audit finding DSL-H2, where
   `requires: has <typo>` loads clean and reads false forever. The old `## upsert flags` block in
   the *E2E Authoring* notes already assumed this.
2. **Kind names and builtin roots become reserved module ids.** Otherwise `entity.goblin.attack`
   is ambiguous between kind-`entity` and a module named `entity`. Reserved: every section kind,
   plus `player`, `skills`, `self`.
3. **The in-game editor should always emit fully-qualified paths.** Shortening is a human
   authoring affordance; generated content has no reason to be terse. This substantially defuses
   the "adding a dependency breaks my shortcuts" problem below, because `local-changes` and
   published contributions are machine-written and already expanded.

#### Accepted costs

- **Adding a dependency can break existing shortenings**, because the namespace it resolves
  against grew. Accepted as the cost of doing business; an "expand all references" command is the
  fix if it ever stings. The same-module version of this turned out **not** to happen: resolution
  is directed by the kind each site wants, so adding an `entity` named `rope` alongside an `item`
  named `rope` leaves `give: rope` resolving to the item.
- **`tutorial.made-bread` must become `tutorial-made-bread`.** Verified blast radius: 19
  references in `content/tutorial-island.dsl`, 20 in `src`/`scripts`. Mechanical, but note the
  hope that no tests change is *nearly* right rather than right — no test needs restructuring,
  and about twenty string literals need renaming.

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
| 1 | ~~`# info`, module identity, `loadUniverse`, topological order~~ **done** | spec basis |
| 2 | ~~Field-granular merge + `remove` + list operators~~ **done** | DSL-H1, module req 1–3 |
| 3a | ~~Walk every reference the grammar carries~~ **done** | DSL-H2 (checkable half) |
| 3b | ~~One namespace tree for objects; resolution subsumes validation~~ **done** | D3, D6, D8 |
| 3c | Members: declarable flags, action labels, dialogue nodes; folds `scope.ts` in; the `tutorial.` migration | D7, rest of D6; unlocks req 6 |
| 4 | Per-module error isolation + diagnostics | engine req 3, 4 |
| 5 | Enable/disable, packs, dangling-ref pruning | engine req 1, 6; module req 4 |
| 6 | CLI authoring of every DSL type | engine req 2 |
| 7 | Publish to GitHub issue; squash tooling | engine req 5 |
| 8 | Modportal over `approved-mod` issues | stretch |

Chunk 4 is the one to not skip.

---

## Dependencies (D4 + D5, settled)

**A reference is what creates a dependency.** A module that names no other module's id is
genuinely dependency-free and declares nothing. Any cross-module reference must have a declared
dependency — which the chunk-3 reference walker can verify mechanically, since it already
enumerates every reference. The in-game editor gets an `import` affordance over active modules.

Dependency syntax follows Factorio's, which is a solved problem
(`https://lua-api.factorio.com/latest/auxiliary/mod-structure.html`) — a string of
`<prefix> module-id <operator> <version>`, e.g. `? some-mod >= 4.2.0`. Three prefixes are in
scope:

| Prefix | Meaning |
| --- | --- |
| *(none)* | hard requirement; loads before this module |
| `!` | incompatible; version is ignored |
| `~` | required, but **does not affect load order** — for breaking dependency cycles |
| `?` | optional; if present, loads first — if absent, this module still loads |
| `+` | recommended; same load-order effect as `?`, surfaced differently in the UI |

Version operators (`<`, `<=`, `=`, `>=`, `>`) are supported and optional. An optional dependency
that is present but fails its version requirement makes this module incompatible, and it is
disabled.

Two consequences worth stating before they surprise someone:

- **`~` cannot be used for a dependency you edit.** Editing means merging over an id that must
  already exist, which is a load-order requirement by definition. `~` is for mutual references
  that are cyclic, not for patches. The loader should reject a merge into a `~` dependency's id
  with exactly that message.
- **`?` and `+` are the primary consumers of graceful degradation.** A reference into an absent
  optional dependency dangles by design, which is precisely engine requirement 6 — so the
  chunk-5 pruning path is not an edge case, it is the normal operating mode for optional deps.

---

## Chunk log

### Chunk 1 — module identity and load order (done)

`# info <module-id>` with `version:`, `dependencies:`, `pack:`. `loadUniverse(ModuleSource[])`
parses every module, validates its declarations against what is loaded, orders the set, and
applies the sections in that order. `loadModule(source)` survives as a one-module wrapper — and
is no longer misnamed, now that a universe has its own entry point.

Order is the **lexicographically smallest topological order**: of everything whose dependencies
are placed, the alphabetically first goes next. Same modules in, same universe out, whatever
order the sources arrive in.

Three decisions taken during the build, none of them reversals:

- **`enabled` is not a `# info` field.** Enablement is user state, not an author declaration —
  Factorio keeps it in `mod-list.json`, not `info.json`, for the same reason. A module cannot
  meaningfully ship "I am switched off". It belongs on the universe input in chunk 5. `pack:`
  *is* author-declared, so it landed here.
- **An optional dependency present at the wrong version is an error, not a disable.** The design
  says disable; disabling requires the isolation machinery from chunk 4, so until that exists a
  loud error is the honest behaviour and a silent wrong universe is not.
- **Reserved module ids are enforced now**, ahead of the namespace tree that needs them, so no
  content is authored against an id that 1b will have to take away.

Verified: 332 tests green (17 new), the CLI plays the tutorial unchanged, and a second file
loaded alongside it resolves cross-module references in both directions.

### Chunk 1b merged into chunk 3 (measured, not preferred)

The old chunk 1b (namespace resolution) and chunk 3 (complete the reference walker) are the same
traversal. `validateReferences` visits every reference-bearing field and asks `has(id)`;
resolution visits the same fields and asks `resolve(path) → key`. Same visitor, different leaf —
and resolution *subsumes* validation, since "resolves to nothing" is exactly "names an unknown
entity". Doing 1b first meant writing the visitor against 20 of 44 fields and then writing it
again in chunk 3, so the two are now one chunk.

Two consequences to build against, both recorded before they can surprise anyone:

- **Resolution runs per module, before merge.** A shortened reference resolves against *its own
  module and that module's dependencies*, so once sections are merged there is no longer a module
  to resolve against. Chunk 2's merge is untouched by this — it merges whatever keys resolution
  produced — but the pass must be inserted between parse and collect, not after.
- **`time`, `visits` and `player` are engine-owned roots** with hardcoded cases in
  `resolveReference`. `player` and `skills` are already reserved module ids; `time` and `visits`
  are not, and must be before the tree is real.

The `tutorial.` migration (D7) depends on none of this and can be lifted out whenever.

### Chunk 2 — field-granular merge, list operators, `# remove` (done)

Closes DSL-H1. Merging happens on the **authored** form, before hydration, because a hydrated
object has every field filled in with defaults — overlaying one would reset everything the patch
did not mention. That split the load into collect-then-build.

Actions merge by label; dialogues merge by node name. Steps inside a node carry no ids to address
them by, so a respecified node replaces them wholesale — the node is the unit of a dialogue fix,
which is what the requirement actually asks for.

Operators land on the key, per D1: `+adjacent:` / `-adjacent:`, several per key, applied in source
order. `-` names as much of a member as identifies it, so `-adjacent: dunes` also removes the
`dunes` edge that carries a `while` condition. `-label:` removes one entry; `+label:` is rejected
because a bare `label:` already adds it.

`# remove entity.mirror` uses a path rather than the design's `# remove entity mirror`, because
the heading grammar carries one id and a path is what D6 already ratified — and it extends to
`# remove entity.mirror.look-in` later without new syntax. Removal is applied where it stands, so
a later module can name the id again and get a fresh object rather than a hole.

Three holes, all accepted and all narrow:

- **An action cannot be emptied by patching it.** A body parser reports a list it was given no
  lines for as empty rather than absent, so an empty one in a patch means "not respecified".
  Remove the action or respecify it.
- **Operators do not reach inside an action body.** `+on success:` is not a thing, because action
  bodies are parsed by a bespoke parser rather than the generic engine. This is the same seam
  audit finding DSL-M2 named.
- **Removing an id that is not loaded is an error, not a no-op.** Softens in chunk 5, where
  optional dependencies make "not there" a legitimate state.

### Chunk 3a — the complete reference walk (done)

Closes the checkable half of DSL-H2. Newly checked: `has <item>` in every condition position
(action `requires`/`hidden if`, edge `while`, dialogue `when`, choice `(when …)`, `{cond: text}`,
`# test assert:`), `goto` against its own dialogue's nodes, `station:` against the capabilities
entities declare, and every id a `# test` directive names down to the action label in
`use: <kind>.<id>.<action>`. The walk moved out of `registry.ts` into `references.ts`, and its
test moved to the layer it drives. The false "every id is checked" comment is gone; what it
claimed is now a `describe` block that runs.

Three named references stay unchecked deliberately: `open modal:` has no registry until the GUI
is rebuilt, `# skill stat-id:` is the dead field L4 says to delete, and `# save` diff contents are
shaped by the runtime's save codec rather than this layer.

**The audit's cheap flag check does not work.** It suggested treating "written by some `set:`/
`add:` in the module set" as the declaration. Implemented, it failed sixteen existing tests that
write flags from TypeScript — and it would also reject any flag written by a save or by an absent
optional dependency. A writer is not a declaration. Flags need declaring outright.

### D7 cannot be lifted out of the namespace work (measured)

The `tutorial.` → `tutorial-` rename was attempted standalone and reverted. The dot is
**load-bearing today**: `scope.ts` scopes a bare reference inside an entity to that entity, and
keys that decision on the absence of a dot. Rename `tutorial.mirror-done` to
`tutorial-mirror-done` and `set:` inside `# entity mirror` silently becomes
`mirror.tutorial-mirror-done`, which a `# test assert:` outside the entity cannot see. Verified by
loading the renamed content and printing the result: `{"kind":"set","variable":
"mirror.tutorial-mirror-done"}`.

So `tutorial.` is not merely an ugly convention — it is the current escape hatch from
auto-scoping. It can only go when relative resolution replaces auto-scoping, in the same change.
Nothing catches this today because flags are the one thing the walk cannot check.

---

### Chunk 3b — one namespace tree for objects (done)

Every id a module declares hangs under its module id, and every reference resolves against the
module that wrote it plus that module's **direct** dependencies. A bare heading creates inside
this module; a dotted one edits a path that already exists (D8, option B).

Resolution is **directed by the kind the site wants**, which is a refinement of D6 rather than a
departure: `give: rope` asks for an item, so an `entity` named `rope` cannot shadow it. That also
retires the accepted cost about `entity.rope` breaking bare `rope` — it does not.

Resolution runs per module before merge, and it **subsumes validation**: a reference that resolves
to nothing cannot be rewritten into a key, so it throws there. `references.ts` shrank from a full
second traversal to the three checks resolution cannot make — capability, `goto` node, `use:`
action label. One shared visitor (`referenceSites.ts`) now serves resolution, the remaining
validation, and typed CLI input, which is what merging the old chunks 1b and 3 bought.

Decisions taken while building, each measured rather than assumed:

- **A module with no `# info` declares at the root, and that is only legal alone.** The prefix is
  a list of segments; no identity contributes none. This is the empty case of the rule, not an
  exception — and `orderModules` rejects an unnamed module in company, so root ids cannot collide.
  Measured: always-qualifying broke 192 tests, almost all runtime tests whose fixtures are
  anonymous snippets; this rule cut it to 49 and left exactly the meaningful churn.
- **`variable` and `capability` are not namespaced.** A tuning variable is a knob the engine reads
  by name (`registry.variables.get('min-damage')`), and a station is a contract between modules
  that never met. Namespacing either would break the thing it exists for.
- **Ids carry dots now, which broke two packed-string encodings.** A travel `ownerRef` packed
  `origin.dest` and split on the first dot; it now joins on a character an id cannot contain. The
  choice-id regex `use:<kind>.<objId>.<label>` had `[a-z0-9-]+` for the objId. Both were found by
  the tutorial route failing, not by inspection.
- **A typed name at the CLI resolves the same way an authored one does.** Namespacing otherwise
  breaks `travel: basement`, which is a product regression, not test churn. `registry.namespace`
  is exposed and resolves runtime input against every namespace loaded.
- **`humanize` reads the name off the end of the path**, or every title in the game would have
  read "Tutorial Island.miki".

Still open, and now the whole of what is left of D6/D7: **members**. Flags, action labels and
dialogue nodes are not yet paths in the tree, so `scope.ts` still auto-scopes and `tutorial.`
still lies. That is chunk 3c.

---

## Open decisions

### D8 — does a bare section heading create, or edit whatever it finds? (settled: option B)

The design says both, in different places, and they cannot both hold:

- D3/D6: *"Creation is always namespace-local: a section names a bare id and the owning module's
  prefix is applied at load. You cannot collide, because you cannot create outside your own
  namespace."*
- The merge rule, as written and as now implemented: *"`# entity miki` in a module that depends on
  the one that first named `miki` **edits** it."*

Under namespace-local creation the second is impossible — `# entity miki` in module B is
`B.miki`, a different object.

**Option A — a heading resolves like a reference.** Bare `miki` edits whatever `miki` uniquely
resolves to across this module and its dependencies; otherwise it creates. Matches the merge
examples. Costs: adding a dependency that happens to define `miki` silently converts your creation
into an edit of someone else's object. That is a silent semantic change, strictly worse than the
broken-shortcut cost D6 already accepted.

**Option B — bare creates, dotted edits.** `# entity miki` is always `self.miki`. To edit another
module's, name its path: `# entity tutorial-island.miki`. Costs: the merge examples in this log are
wrong as written and need fixing, and a patch module is more verbose — though a patch *is* an
edit, and D6's consequence 3 already says the editor emits full paths.

Chosen: **B**. It makes "you cannot collide because you cannot create outside your own
namespace" literally true, it lets a reader tell a module's creations from its edits at a glance,
and it matches `# remove entity.mirror`, which already addresses by path.

Chunk 3b is: qualified storage keys, suffix resolution, declarable flags, folding `scope.ts` into
relative resolution, and the `tutorial.` migration — all of which hang off this answer.

---

## Closed decisions

- **D1** — list operators prefix the key (`+adjacent:` / `-adjacent:`), bare key replaces, mixing
  the two for one key in one section is an error. See the design section above.
- **D2** — no way to reset a field to its default. A default that is wanted can be written
  directly.
- **D3** — ids are unique per kind, namespaced by owning module; creation is namespace-local so
  collisions are structurally impossible.
- **D4** — a reference creates the dependency; no reference means no declaration.
- **D5** — Factorio dependency grammar, prefixes `(none)`, `!`, `~`, `?`, `+`.
- **D6** — `.` is the only separator; every reference is a path into one namespace tree, and any
  unique leading-truncated suffix resolves. `<obj>.<objId>.<actionId>` and `<entityId>.<flag>`
  collapse into it rather than coexisting with it.
- **D7** — `tutorial.` on flags is neither a namespace nor a convention to keep; it is an error
  (`no such object: tutorial`). Those flags become `tutorial-made-bread` and friends.
