# Content DSL — Grammar v0.1

Status: **spike**. This document specifies the target grammar. Sections marked
`[not yet implemented]` are designed but not wired into `src/game/contentDsl/`
yet — they exist so the format doesn't need a breaking redesign once we get to
them.

Compile target is unchanged: the existing `ContentModule` JSON
(`src/game/types.ts`), consumed by the existing loader/validators. The DSL is
a front-end only; no engine change is required to ship it.

## File = module

One `.md` file compiles to exactly one `ContentModule`. Files may be as small
as a single patch or as large as an entire content pack (per-file size is not
constrained) — but a file never contains more than one module's worth of
`info`.

## Top-level shape

```
# info
id: <module-id>
version: <semver>
universe: <universe-id>
author: <string>
game_version: <string>
dependencies: <dep-list>

<object sections...>
```

`dependencies` is a comma-separated list. Each entry is a module id, optionally
prefixed and/or version-constrained, reusing the existing loader's grammar
exactly (`src/game/contentModules.ts`):
- bare `foo` — hard dependency, must be present.
- `+foo` — recommended: auto-enabled if available, not required.
- `?foo` — optional: if present, loads before this module; not required.
- `~foo` — no-load-order: allowed to exist without ordering constraints (used
  to permit cycles between modules that don't actually depend on load order).
- `!foo` — conflict.
- version constraint suffix: `foo >= 2.0.0`.

## Object sections

A `#` header starting with a known keyword opens an object section that lasts
until the next `#`/`##` header of equal-or-higher level:

| Keyword | Produces |
|---|---|
| `# location <id>` | `LocationNode` (+ nested entities, + wall directives) |
| `## entity <id>` (nested under a location) | `EntityDefinition`, auto-added to the parent location's `entities` |
| `# entity <id>` (top-level) | `EntityDefinition`, not placed anywhere (author adds the id to a location's entity list manually — rare) |
| `# item <id>` | `ItemDefinition` `[not yet implemented]` |
| `# dialogue <id>` | `DialogueDefinition` |
| `# quest <id>` | `QuestDefinition` `[not yet implemented]` |
| `# recipe <id>` | `RecipeDefinition` `[not yet implemented]` |
| `# advanced` | raw JSON escape hatch for resources/effects/interaction-types/display-profiles/combat-balance/experience-curve — see below |

### `# location <id>`

```
# location tutorial-guide-house
x: 0, y: 0, z: -1, tags: tutorial indoors, starting

wall -> tutorial-beach while !miki-cleared

## entity miki
...
```

The metadata line is a **tag-line** (see grammar below). Recognized keys:
`x`, `y`, `z` (numbers), `tags` (a **space**-separated list — not comma, since
a comma would be read as ending the `tags` field and starting the next
top-level tag), `starting` (bare tag).

`wall -> <locationId> while <condition>` declares a travel wall: an
auto-named `role: 'travel'` action (`wall-<from>-<to>`) with
`visibleWhen: <condition>` and `results: [relocate(<locationId>)]`, added to
this location's `actions`. This is content, not an engine feature — it relies
on the existing highly-connected-mode wall behavior
(`src/game/travel.ts`'s `isWallAction`).

### `## entity <id>` (nested in a location)

```
## entity drawer
examine: A drawer full of random junk.{!took-coins: You see some coins on the bottom.}{!took-lockpick: A worn set of lockpicks.}
- take coins: give gold 5, set took-coins, once, say You take the coins.
- take lockpick: give lockpick, set took-lockpick, once, say You take the lockpick.
```

An `examine:` line is sugar for an auto-generated `examine` action (see
"Inline conditional text" below) — equivalent to hand-writing the
`visibleWhen`-gated variant pattern documented in `CLAUDE.md`
("Repeatable state-dependent flavor text").

Every other line in an entity body is an **action**, in one of two forms:

**Short form** — a single bullet, tags after the first `:`:
```
- <title>: <tag-line>
```

**Long form** — a bullet with no trailing tags, followed by indented (2-space)
`key: <tag-line>` fields, terminated by a blank line or dedent:
```
- <title>
  <key>: <tag-line>
  <key>: <tag-line>
```
Long form exists because adversarial actions (with an inline enemy) need more
fields than comfortably fit on one line. Short and long form are otherwise
equivalent — a parser detail, not a semantic one.

## Tag-line grammar

A tag-line is what appears after a `:` — in an action's short form, or as the
value of a long-form field:

```
tag-line := tag (',' tag)*
tag       := bare-word
           | keyword value
           | keyword value1 value2   -- (numeric pairs, e.g. "xp thieving 4")
           | text-keyword rest-of-line   -- MUST be the last tag on the line
```

**Rule: free text always goes last.** `say`/`examine` text runs to the end of
the line (commas inside it are literal), so it must be the final tag. This is
the one rule that lets tag-lines and prose coexist without quoting.

### Recognized action-tag keywords (v0.1)

| Tag | Effect |
|---|---|
| `give <itemId> [amount]` | grants an item. Compiles to a `Reward` (rewards array) on timed/adversarial actions, or an `ActionResult` (results array) on instant actions — matching how the existing hand-written content already splits this (`rewards` = rolled/logged reward pipeline, `results` = deterministic immediate effect). |
| `take <itemId> [amount]` | consumes an item (results, negative amount) |
| `xp <skillId> <amount>` | same instant/timed split as `give` |
| `requires <expr>` | sets `requirements` (condition expression, see below) |
| `hidden if <expr>` / `visible if <expr>` | sets (part of) `visibleWhen` |
| `set <flagId>` | appends a `{kind:'flag', flagId, value:true}` result; auto-declares the flag if unseen |
| `unset <flagId>` | same, `value:false` |
| `once` | `maxCompletions: 1`, plus an auto `visibleWhen` guard: `not(any(hasFlag(f)))` over any flags this same action `set`s, or `not(completed(actionId))` if it sets no flag. Combined with any explicit `hidden if`/`visible if` via `all(...)`. |
| `goto dialogue <dialogueId>` | `results: [{kind:'dialogue', dialogueId}]` |
| `open modal <modalId>` | `results: [{kind:'open-modal', modalId}]` |
| `say <text>` | (must be last) appends a generated-key `chat` result |
| `enemy: <interactionTypeId>, <statKey> <value>, ...` | (long form only) sets `interactionTypeId` + inline `enemy` block |

Because `say` must be last, any other tag on the same line (`open modal`,
`set`, `give`, ...) goes *before* it: `- look: open modal name-editor, say You catch your reflection...`.

Deferred to a later pass (documented, not implemented): `chance N%` +
`fail: ...` (one-shot gamble actions like the mining locked chest),
`station <stationId>` (recipe stations), `respawn <seconds>`,
`max <n>` (arbitrary `maxCompletions`), drop-table references inside `give`.

### Condition expressions

Used by `requires`, `hidden if`/`visible if`, and `wall ... while`:

```
cond      := disjunct ('|' disjunct)*
disjunct  := conjunct ('&' conjunct)*
conjunct  := '!'? IDENT
```
A bare `IDENT` is `hasFlag(IDENT)` unless it's a known item id inside a
`requires` field, in which case it's `hasItem(IDENT)`. No parentheses in v0.1
— nesting beyond one level of `&`/`|` mixing is out of scope until a real case
needs it.

### Inline conditional text

```
text := (literal-run | '{' cond ':' literal-run '}')*
```

Compiles to the `visibleWhen`-gated-variants pattern: for the *n* distinct
flags referenced across all `{...}` fragments in one `examine:`/`say` line,
the compiler enumerates the 2ⁿ truth assignments, and for each assignment
emits one action variant whose text is the base text with each fragment
included/excluded per that assignment, and whose `visibleWhen` is the exact
conjunction of that assignment. All variants share one title locale key, so
the button label never changes — only the body text does. This is not a new
engine mechanism; it's the existing `gommi` examine/examine-asleep pattern,
generated instead of hand-written.

## Dialogue

```
# dialogue miki
start (miki): Oh — hi. You're the new arrival, right?
  -> Whats this Quests tab? [[explain-quests]]
  -> Whats with the colors? [[explain-colors]]
  -> I'm ready to go, thanks. [[offer-quest]]

[[explain-quests]] (miki): Right, the Quests tab...
  -> Whats with the colors? [[explain-colors]]
  -> continue [[offer-quest]]

[[farewell]] (miki): Door's unlocked. Go on, get curious.
  set miki-cleared
```

- The first node is implicitly `id: start`; `(speaker)` is optional — omit it
  for narrator text (`narratorKey` instead of `textKey`).
- `[[nodeId]]` declares subsequent nodes. This is deliberately the same
  syntax as an Obsidian wikilink, so dialogue files get working goto/backlink
  navigation for free in any editor that understands it.
- `-> <label> [[target]]` is a `DialogueOption`; an optional trailing
  `: <tag-line>` attaches `results` to that option (most commonly `set`).
- `goto [[target]]` (no arrow, no label) sets `gotoNodeId` directly — a node
  with no options that advances automatically (mirrors the existing
  no-options-but-has-gotoNodeId case that `visibleChoices` already renders a
  synthetic Continue for).
- A bare tag-line indented under a node with no `->`/`goto` prefix (like
  `set miki-cleared` above) is that node's on-enter `results`.
- A node with neither options nor a goto is terminal.

## `# advanced`

```
# advanced
{
  "resources": [...],
  "effects": [...],
  "interactionTypes": [...]
}
```
Raw JSON, merged directly into the module's `data` object as-is. This is the
intentional escape hatch for object kinds that are engine plumbing rather than
authoring surface (resources, effects, interaction-types not already covered
by an entity's inline `enemy:` block, display-profiles, combat-balance,
experience-curve) — contributors are not expected to hand-write these, so
there's no ergonomic pressure to give them DSL sugar.

## Localization

The DSL is authored in English inline; the compiler generates locale keys and
emits an `en` dictionary, leaving the compiled objects pointing at keys like
today. Two key strategies:
- **Structural-path keys** (`action.entity.drawer.take-coins.title`) for
  anything with a natural id anchor — titles, descriptions, most `say` text.
  Stable across text edits.
- **Content-addressed keys** for text with no structural anchor (inline
  conditional fragments, where the same entity can have N text variants) —
  suffixed by variant index. These are **not** stable across reordering the
  DSL source; this is a known, accepted trade-off, not a bug.

## What proved out in the v0.1 spike

Implemented and tested against a hand-authored rewrite of
`tutorial-island-guide-house`: `info`, `location` (+ `wall`), nested `entity`
+ actions (instant, adversarial/timed with inline `enemy`), `once` +
auto-visibility sugar, inline conditional `examine` text (verified it
reproduces the 4-way `examine`/`examine-coins-only`/`examine-lockpick-only`/
`examine-both` split by hand-authored today), dialogue (multi-node,
options, on-enter results, bare `goto`), `open modal`.

Not yet implemented: `item`, `quest`, `recipe`, `chance`/`fail`, `station`,
`respawn`, drop tables, `# advanced` raw passthrough, the visual grid-placement
GUI for locations, and the full editor/live-preview UI. These are the next
slices, not blocked by anything discovered so far.
