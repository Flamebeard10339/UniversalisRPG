# DSL load path — audit, 2026-07-30

Scope: `731c3a6..49b7ca6`, the 22 code-changing commits touching `src/grammar`, `src/content` and
`content` since the last audit (`docs/audits/dsl-modules-2026-07-29-reconciled.md`).

Baseline: `npx tsc --noEmit` clean, `npm test` 505 passing across 33 files, `npm run layer-check`
411 imports all pointing downward. Every claim below was reproduced against the working tree at
`49b7ca6`; reproductions are quoted inline.

---

## H1 — a block-form list line silently drops what the parser does not understand

`src/grammar/list.ts:22`.

```ts
parseBlock: (lines) => lines.flatMap((line) => parseInline(new Cursor(line.text, 0, line.span.start))),
```

`parseInline` stops at the first thing it cannot read and hands back what it got. Nothing demands the
rest of the line. `4f1b648` ("Make a sub-parser consume the whole line it was handed") swept
`action.ts`, `dialogue.ts` and `test.ts` onto `parseWhole`/`requireEnd`; `list.parseBlock` is the one
site it missed, and it is the site every block-form list field of every section kind goes through:

```
$ grep -n "parseWhole\|new Cursor" src/content/*.ts src/grammar/*.ts   # non-test sites
dialogue.ts:55,83,87,110,115   parseWhole
test.ts:89                     parseWhole
action.ts:91                   new Cursor  -> requireEnd at :93
section.ts:140                 new Cursor  -> loop to end of line
list.ts:22                     new Cursor  -> nothing
```

Reproduced on the shipped file, changing one letter of `while` at
`content/tutorial-island.dsl:139`:

```
shipped as authored : [{"target":"tutorial-island.beach","condition":{"kind":"reference","reference":{"path":["tutorial-island","front-door","unlocked"]}}}]
one letter changed  : [{"target":"tutorial-island.beach"}]
```

The gate on the tutorial's front door disappears, the beach becomes adjacent from the first turn, and
there is no diagnostic. Three more, all silent:

| authored (block form) | held | should be |
| --- | --- | --- |
| `entities:` / `  miki oven` | `["miki"]` | a rejected line, or both entities |
| `flags:` / `  alert typo` | `["alert"]` | rejected |
| `on success:` / `  xp: brawling 2.5` | `amount: 2` | rejected — this is the `time: 1e3` → `1` class `ae76dea` closed elsewhere |

The same text **inline** is rejected: `adjacent: beach whille unlocked` → `expected a direction`,
`flags: alert typo` → `unexpected content: "typo"`. So whether a typo is caught follows from whether
the author used block form, and block form is what the shipped content uses
(`content/tutorial-island.dsl:136-141`, `146-149`, `154-157`).

**Fix.** Route each line of `parseBlock` through `requireEnd` — one line, in the one place, closing
every field kind at once. Wants a test that walks the list fields rather than one per field.

---

## M1 — hydrate breaks the single-traversal invariant, and entity `stats:` references escape validation

`src/content/referenceSites.ts:177` states the invariant this file exists to hold:

> Every place the grammar can carry a reference to a named object, in one traversal, so that
> resolving one and validating one cannot drift apart.

They have drifted. `visitSection('entity')` reads the stat sheet through `listMembers`
(`referenceSites.ts:185`), which sees the **authored** form — a list of `[statId, Range]` pairs.
`validateSectionReferences` (`references.ts:18`) runs after the universe is built, over the
**hydrated** value, where `MappedField.hydrate` (`entity.ts:38`) has turned `stats` into
`Record<string, Range>`. `listMembers` returns `[]` for a plain object, so the sheet is never walked.

Reproduced — a module removes a stat another module's entity puts on its sheet:

```
base : # stat attack / # entity guard / stats: attack 4
mod  : # remove stat.base.attack

loads clean
  sheet    {"base.attack":{"min":4,"max":4}}
  stats    []
  declared false
```

The identical reference written as `accuracy: base.attack` is caught:
`# entity base.guard action "poke" accuracy: names an unknown stat: base.attack`.

The seam is already known. `registry.ts:340` hand-rolls the traversal for the
dangling-optional-dependency prune:

```ts
const stats = Object.fromEntries(Object.entries(entity.stats).filter(([statId]) => referencesLoaded(() => visit('stat', statId, `# entity ${id} stats:`))));
```

That loop is `visitSection`'s job, written a second time because `visitSection` cannot see the
hydrated sheet. **The duplication is the finding**; the missed validation is its symptom. Introduced
by `356ddd7`, which is otherwise the right fix for R1.

Consequence is bounded: `src/runtime/stats.ts:15` reads the sheet by stat id, and nothing asks for a
stat that no longer exists, so the stale entry is inert. Filed as M for the broken invariant and the
duplicated traversal, not for a demonstrated failure.

---

## M2 — a `-` field edit that matches nothing says nothing, and for `stats:` it usually will

`src/content/merge.ts:22` states the rule:

> A `-` names as much of a member as it takes to identify it, so an edge written `-adjacent: dunes`
> also removes the `dunes` edge that carries a condition.

`statAssignment` (`entity.ts:22`) requires a range after the id, so the rule does not hold for the
field the R1 work just made a list:

```
-stats: attack 4   (value restated correctly)  -> {"base.defence":{"min":9,"max":9}}     removed
-stats: attack     (id only, as -adjacent: allows) -> REJECT expected a number or a range like 4-7
-stats: attack 5   (value no longer matches base)  -> {"base.attack":{"min":4,"max":4},…} SILENT NO-OP
-adjacent: base.dunes (target only, condition unstated) -> []                             removed
```

A patch that is correct today becomes a no-op the moment the base module retunes the value, with no
diagnostic. `applyEdits` (`merge.ts:31`) never reports a `-` operand that identified nothing, so this
generalizes to every list field — `-entities: base.rat` twice leaves the second one silent.

The repo already decided the opposite question at section granularity: `registry.ts:521` throws
`# remove ... names nothing that is loaded`. Same rule, applied in one place only.

The test added for the R1 work pins only the working case — `merge.test.ts` asserts
`-stats: defence 9` with the value restated — so the suite stays green through the no-op. That is a
test sharing the implementation's assumption rather than checking it.

---

## M3 — `declareMembers` declares the member a `-flags:` edit removes, so a phantom flag validates clean

`src/content/resolve.ts:67`:

```ts
for (const flag of listMembers<string>(value.flags)) declareFlag(namespace, kind, value.id, flag, …);
```

`listMembers` (`section.ts:66`) flattens **every** op, `-` included. A patch that strips a flag
therefore declares it. Reproduced:

```
base : # entity rat / flags: alert
mod  : # entity base.rat / -flags: ghost

flags        ["alert"]
ghostDeclared true
```

and with an action added to the same patch:

```
mod  : # entity base.rat / -flags: ghost / poke: / requires: base.rat.ghost
loads clean, action "poke" offered
```

`poke` requires a flag no object holds and nothing can ever set — permanently unavailable, no
diagnostic.

This is a second door into the open backlog item *"A field edit can strip a member and leave
references to it dangling"*. That item names the missing undeclare; this names an active wrong
declare, which is the simpler half and probably the first line of the fix. **Folded into the existing
item as evidence rather than filed again.**

---

## L1 — action fields have no typo detection, so a near-miss field name reports as a bad tag

```
poke: / accuracey: attack   ->  unrecognized tag clause: "accuracey: attack"
```

`4ad1236` gave the section engine `typoOf` and the `one letter from accuracy` message. `03d4f4b`
then gave `action.ts` the field table (`ACTION_FIELDS`, `:70`) that would make the same message
nearly free, and did not use it — an unclaimed key falls through to `startsResult`, then to the tag
parser, which reports in the vocabulary of the wrong concept.

Status note for the open **DSL-M2** item: its *laxity* half is closed except for H1 above. Its
*duplication* half — "`action.ts` is a second copy of the section field engine" — is still open and
now visible as two field tables, two once-guards and one typo table.

## L2 — `registryDiff`'s map list has no exhaustiveness guard

`src/content/registryDiff.ts:3` builds `REGISTRY_DIFF_MAPS` from `CONTENT_SECTION_MAPS` plus three
literals. A registry map added later is silently outside the round-trip assertion `c9c88e1` added —
the assertion `bd77f26`'s canonicalization of approved mods now leans on. The pattern that gets this
right landed in the same window: `SAVE_FIELDS` (`src/runtime/save.ts:37`, from `5f3708d`) is a
`Record<SaveField, …>` the compiler forces you to extend.

## L3 — a comment says the same thing twice

`src/grammar/actionResult.ts:33-34`, from `ae76dea`:

```ts
// Signed, so `add: counter -3` subtracts rather than silently meaning +1.
// Signed, so `add: counter -3` subtracts instead of silently meaning +1.
```

## L4 — `referencePruned('entity', …)` is unreachable

`registry.ts:363` filters a location's entities on whether the entity was pruned, but no path adds an
entity to `pruned`: `dropContent` is called for location, recipe, resource, dialogue and test only.
Either an entity should be droppable and is not, or the check reads as coverage that does not exist.

## L5 — the file disagrees with itself about whether a section's owner can be missing

`startingLocationFailure` (`registry.ts:412`) treats a missing owner defensively — `module ? … :
null`. `validateBuiltRegistry` asserts it away five times (`:441,451,462,470,478`,
`sectionOwner(...)!`), and the caller then reads `.module.source` — so a missing owner would throw a
TypeError out of the path that exists so bad content cannot reach an unrecoverable state. I could not
construct an input where the lookup fails; filed as an inconsistency, not a reproduced defect.

---

## Verified closed

Each was re-run with the reproduction that used to fail.

- **R7 — `~` dependencies do not work.** Fixed. `RESOLUTION_PASSES` (`resolve.ts:135`) runs
  declare / settle / resolve over *every* module before the next pass begins, so a name resolves
  from what is loaded rather than from load order. Both name orders now load
  (`aref` and `zref` against `target`), and the `~`-edit and `~`-remove errors still fire.
- **R1 — `stats:` is a broken collection field.** Fixed. `MappedField` over `list(statAssignment)`
  with `hydrate` (`entity.ts:36`, `section.ts:16`). Block form, `+`, `-` and single-key patching all
  work; see M2 for what `-` still cannot express.
- **R2 — the registry and the namespace describe different universes.** Both halves fixed.
  `save.ts:40` prunes flags through `registry.namespace.has('flag', id)`, so object-owned flags and
  map discovery survive a load; `dropContent` (`registry.ts:327`) undeclares alongside every registry
  delete, and `# remove` undeclares at merge (`registry.ts:527`).
- **R8 — sub-parsers accept trailing garbage.** Closed everywhere except `list.ts:22` (H1).
- **Tier-3 L2** — `serialize.ts:26` `n()` is one branch. **Tier-3 L4** — `visits` is reserved as a
  flag name (`resolve.ts:59,87`) and `skills` is no longer a reserved module id (`universe.ts:29`,
  taken from `ENGINE_ROOTS` rather than restated).
- **Two `starting` locations** are refused rather than decided by source order (`registry.ts:412`).
- **The serializer's canonicalization path is broader than its own fixture.** `bd77f26` sends
  approved mods through `serializeRegistryModule`, so a field the serializer drops would drop content
  from a reviewed mod. I round-tripped a fixture covering what `serialize.test.ts` does not: every
  combat axis (`target:`/`dr:`/`ability:`/`evasion:`), `retaliates`, `escape after`, `on failure:`,
  `on escape:`, `hidden if:`, `open modal:`, `drain:`/`restore:`/`add:`/`stop`, resource `on full:`,
  recipe `burnt:`/`time:`/`speed:`/`accuracy:`, and dialogue `once`/`sticky`/`again:`/conditional
  segments/choice `(when …)`/`goto`. `registryDiff` reported no difference. See L2 for the guard the
  assertion itself still lacks.

## Not findings

- **No layer violations, no scope drift, no CI or test weakening.** Every commit in the window
  matches its message; the suite grew from the R1/R7/`# remove` work rather than being relaxed.
- **Contribution overlap.** Five of the 22 commits (`8cde0dc`, `efa64cd`, `6299045`, `c9c88e1`,
  `bd77f26`) are contribution-system work under `src/content`, after that system's baseline
  `745659a`, so they are charged to both counters. They are not re-audited here; the load-path-facing
  part is the serializer round trip, above.
- **`# save` bodies carry no validated references.** `# save start {"version":1,"location":"nowhere"}`
  loads clean. This is by design — `CONTENT_SECTION_MAPS` (`registry.ts:49`) says so, and
  `src/runtime/save.ts` prunes a save's ids against the registry on load, which is the seam that has
  to hold anyway for a save written before a mod was disabled.

## Recommended work order

1. **H1** — one line, in one place, on the shipped authoring path.
2. **M3**, then **M2** — both are "a removal that removes nothing says nothing"; M3 has the worse
   consequence and the simpler fix.
3. **M1** — restore the single traversal. Deleting `registry.ts:340`'s hand-rolled loop is the proof
   it worked.
4. **L1**–**L5**.
