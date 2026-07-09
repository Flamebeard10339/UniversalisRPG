# Content DSL — Grammar v0.2

Status: **spike**, revised once against real feedback on the v0.1 sample.
Sections marked `[not yet implemented]` are designed but not wired into
`src/game/contentDsl/` yet.

Compile target is unchanged: the existing `ContentModule` JSON
(`src/game/types.ts`), consumed by the existing loader/validators. The DSL is
a front-end only; no engine change is required to ship it.

## Two rules that explain almost everything

1. **A line either declares something or continues the thing above it, and
   indentation alone tells you which.** There is no bullet (`-`). A line at
   the same or lower indent than its enclosing block starts something new; a
   line indented deeper than it continues it.
2. **A keyword that takes a value is always written `keyword: value`.** A
   keyword with no value (`once`) has no colon, because there's nothing to
   separate. This applies uniformly — action titles, `examine:`, `enemy:`,
   `on success:`, `give:`, `set:`, all of it.

Everything below is these two rules applied to a specific piece of content.

## File = module

One `.md` file compiles to exactly one `ContentModule`. Files may be as small
as a single patch or as large as an entire content pack — per-file size isn't
constrained.

## `# info`

```
# info
id: <module-id>
version: <semver>
universe: <universe-id>
author: <string>
game_version: <string>
pack: <pack-id>
dependencies: <dep-list>
```

`pack` is optional (defaults to `id`) — see "Flags and pack scoping" below.

`dependencies` is a comma-separated list, reusing the existing loader's
dependency-prefix grammar exactly (`src/game/contentModules.ts`): bare `foo`
(hard dependency), `+foo` (recommended/auto-enabled), `?foo` (optional
load-order), `~foo` (no-load-order), `!foo` (conflict), `foo >= 2.0.0`
(version-constrained).

## `# location <id>`

```
# location tutorial-guide-house
x: 0, y: 0
tutorial indoors, starting

wall -> tutorial-beach while !miki-cleared

## entity miki
...
```

Metadata may span multiple non-blank lines (blank lines never carry meaning —
they're purely visual spacing; use them or don't) up until the first `wall`
or `## entity` line. Recognized fields: `x:`, `y:`, `z:` (numbers), and the
optional flat text fields `title:`/`description:`/`exhausted:` (each on its
own line, unlike `x:`/`y:`/`z:` which may share a comma-joined line with tags).
The bare word `starting` marks the location as the universe's start. **Any
other bare word — this is the one place in the grammar a bare, unrecognized
word isn't an error** — is a location tag (`tutorial`, `indoors`, `shore`,
...). There's no `tags:` label to remember, because everything on that line
that isn't a recognized field or `starting` already is one.

`title:`/`description:`/`exhausted:` are all optional — a location with none
of them still compiles, falling back to a humanized id for the first two and
`"It is quiet now."` for the third, the same generic-default philosophy used
throughout this grammar. `## entity <id>` sections take the same optional
`title:` (their own first line, before any actions) with the same
humanized-id fallback.

`wall -> <locationId> while <condition>` declares a travel wall: an
auto-named `role: 'travel'` action (`wall-<from>-<to>`) with
`visibleWhen: <condition>` and `results: [relocate(<locationId>)]`, added to
this location's `actions`. Content, not an engine feature — relies on the
existing highly-connected-mode wall behavior (`src/game/travel.ts`'s
`isWallAction`).

## `## entity <id>`

```
## entity drawer
examine: A drawer full of random junk.{!drawer-coins-taken & drawer-lockpick-taken: You see some coins on the bottom.}{!drawer-lockpick-taken & drawer-coins-taken: You see a set of worn lockpicks at the bottom.}{!drawer-coins-taken & !drawer-lockpick-taken: There are coins and a worn set of lockpicks tucked in the back.}
take coins: give: gold 5, set: drawer-coins-taken, once, say: You take the coins.
take lockpick: give: lockpick, set: drawer-lockpick-taken, once, say: You take the lockpick.
```

Every line in an entity body is an **action declaration**:
```
<title>:[ <inline tags>]
[  <further-indented tag line>]*
```
The title line always ends in `:`. Content after it on the same line (if
any) is parsed as inline tags; any further-indented lines below contribute
more tags to the *same* action, each parsed independently. There's no
separate "short form" / "long form" — it's one form, and whether you put
everything on one line or spread it across several is purely a readability
choice with no effect on what gets compiled (see "Multi-line and `say`"
below).

`examine:` is not a special AST node — it's sugar. `examine: <text>` means
exactly the same thing as writing `examine:` alone followed by an indented
`say: <text>` — both go through the identical `say`-tag compilation path
(including the inline-conditional-variant expansion described below). This
is the *only* place inline text is auto-wrapped as `say:`; everywhere else,
if you want a chat message you write `say:` yourself.

## Tags

A tag is `keyword: value`, or the bare word `once`, or the bracket form
`[[dialogue <id>]]`. Tags on one line are comma-separated; the exception is
`say:`, whose value runs to the end of the line (so it can contain literal
commas) — which means **`say:` must be the last tag on its line**. This is
rarely a real constraint because any tag can go on its own line instead (see
below), including a second `say:` right after the first one.

| Tag | Effect |
|---|---|
| `give: <itemId> [amount]` | grants an item — a `Reward` on adversarial actions, an `ActionResult` on instant actions (matching the existing split between the rolled/logged reward pipeline and deterministic immediate effects) |
| `take: <itemId> [amount]` | consumes an item |
| `xp: <skillId> <amount>` | same instant/adversarial split as `give` |
| `requires: <expr>` | sets `requirements` |
| `hidden if: <expr>` / `visible if: <expr>` | sets (part of) `visibleWhen` |
| `set: <flagId>` | appends a flag-true result; auto-declares the flag if unseen (see pack scoping) |
| `unset: <flagId>` | same, flag-false |
| `once` | `maxCompletions: 1`, plus an auto `visibleWhen` guard: `not(any(hasFlag(f)))` over any flags this action `set:`s, or `not(completed(actionId))` if it sets none. ANDed with any explicit `hidden if:`/`visible if:`. |
| `max: <N>` | `maxCompletions: N` — unlike `once`, sets no auto `visibleWhen` guard (the engine already stops offering an action once its completions reach `maxCompletions`); use this when you want a repeatable-but-capped action with no completion-based hiding of its own. |
| `[[dialogue <id>]]` | `results: [{kind:'dialogue', dialogueId}]` — same bracket syntax as a dialogue-node goto, since both mean "jump to X"; which one applies is unambiguous from context (an action's tags vs. a dialogue node's body are always different sections) |
| `open modal: <modalId>` | `results: [{kind:'open-modal', modalId}]` |
| `say: <text>` | appends a `chat` result; supports inline conditional text (below) |
| `enemy: <interactionTypeId>[, <statKey> <value>]*` | sets `interactionTypeId` + inline `enemy` block. Composite — see below. |
| `on success: <tags>` | (adversarial actions) tags become `results`, fired on completion, instead of `rewards`. (recipes) tags become `extraResults`. |
| `on fail: <tags>` | (instant `chance:` actions) tags become `failureResults`, fired when the roll fails |
| `chance: <N>` (e.g. `chance: 50`, `%` optional) | one-shot gamble: the action's main tags become `results` fired on success, `on fail:` becomes `failureResults` — mirrors `action()` + `chance`/`failureResults` today, not a new engine mechanic |
| `station: <stationId>` | marks the action as a station action — no fixed rewards/results/duration; the UI populates its options from whichever `# recipe` entries the player currently holds ingredients for. All other tags on the same action are ignored. |
| `resource: <resourceId> <amount>` | grants/drains a resource (e.g. `resource: health -3`) — same instant/adversarial rewards-vs-results split as `give`/`xp` |
| `relocate: <locationId>` | `results: [{kind:'relocate', locationId}]` — an unconditional move, for entity actions that are a plain button rather than a highly-connected-grid edge (a ladder, tunnel, or portal). This is the same result `wall ->` produces internally for grid edges; `relocate:` is the tag form for anywhere else an action needs to move the player. |
| `set spawn: <locationId>` | `results: [{kind:'set-spawn', locationId}]` — moves the player's respawn point, independent of `relocate:` (a one-way "you've moved on for good" moment, like leaving a tutorial area, typically pairs both tags on the same action) |

Deferred to a later pass: `respawn:`, drop-table references inside `give:`.

## `# item <id>`

```
# item cooked-shrimp
title: Cooked Shrimp
description: A simple meal that keeps you going.
tags: food, +3 regeneration, 60s

# item note
title: Handwritten Note
description: A note in someone else's hand, tossed onto a shelf.
read: [[dialogue note]]
```

Reuses the exact same action-declaration grammar as `## entity` — an item
action compiles through the identical pipeline (including inline-conditional
variant expansion), just keyed `action.item.<id>.<actionId>` instead of
`action.entity.<id>.<actionId>`. The one difference: an item action can't
carry `enemy:` — items are always instant, matching the engine's
`ItemActionDefinition` (no `enemy` field, unlike `EntityActionDefinition`).

`title:`/`description:` are optional flat metadata fields, each written to
the item's own `item.<id>.title`/`item.<id>.description` locale keys. Both
are optional — an item with neither still compiles, falling back to a
humanized version of its id (`small-net` → "Small net") for the title and
`"<Humanized id>."` for the description, the same generic-default philosophy
used elsewhere in this grammar (interaction messages, action success/failure).

`maxQuantity:` is an optional flat number, the item's stack cap
(`ItemDefinition.maxQuantity`) — omit it for an item with no cap.

`tags:`/`offensiveTags:`/`defensiveTags:` are metadata fields whose value is
a **raw pass-through string** — the existing equipment tag-string grammar
from `src/game/equipment.ts` (slot tags, `+N`/`+N%` bonuses, duration tags).
That grammar is untouched and unrelated to this DSL's own tag-line grammar;
these three fields exist purely to carry it through verbatim.

## `# quest <id>`

```
# quest leave-tutorial-island
title: Leave Tutorial Island

stage accept: quest-accepted
  You have not taken on a task yet. Someone in this house looks like they know the island — try talking to them.

stage leave-house: miki-cleared
  Miki the tutorial guide has tasked you with finding a way off of tutorial island. Step one is probably to leave his house.
```

`stage <id>: <condition>` is a header line (condition uses the same
expression grammar as everywhere else, pack-scoped); the narrative
description is every further-indented line, joined with a space (prose, not
a tag-line — there's nothing to parse there).

## `# interaction <id>`

```
# interaction lockpicking
source: thieving
target: thieving
targets player health: false
title: Lockpicking
player kill: The lock gives with a soft click.
```

Sugar for `InteractionTypeDefinition` — replaces hand-writing this shape as
raw JSON via `# advanced`. `source:`/`target:` set `sourceStatId`/
`targetStatId`; `targets player health:` sets `targetPlayerHealth` (defaults
`true` if omitted — the common combat case; a lockpicking-style interaction
where the target never fights back sets it `false`, per CLAUDE.md's
Actions-and-combat section). `title:`, `player hit:`, `player miss:`,
`player kill:`, `entity hit:`, `entity miss:`, `entity kill:` set the
corresponding locale entries.

Every message field is optional — the compiler backfills a generic default
(e.g. "You hit the {entity}.") for any that are left unwritten, rather than
requiring the author to invent flavor text for an outcome that's either
uninteresting (a lockpicking "you made progress" tick) or literally
unreachable (a `targets player health: false` interaction's `entity hit:`,
since the target never attacks back). Write the fields that matter for a
given interaction — the lockpicking example above only writes `player kill:`
(the one moment worth a line: the lock opening) and leaves the rest generic.

If two modules declare `# interaction` sections with the same id, or a
module also declares `interactionTypes` via its own `# advanced` block, both
sources are merged into the module's `interactionTypes` array (not
clobbered) — `# advanced` remains a valid way to set `experience` or other
fields this sugar doesn't cover.

Every compiled action (not just interactions) gets the same generic-default
treatment for its own `.success`/`.failure` (and `.kill`, if adversarial)
locale keys, for the same reason — there's no DSL tag yet for authoring
those directly, and leaving them unset would otherwise either nag every
single action with a validation warning or silently show the player a raw
locale key. An author who wants specific text for a real outcome already has
it via `on success: say: ...` / `chance:` + `on fail: say: ...`, which
produce their own separate chat messages independent of this generic one.

## `# recipe <id>`

```
# recipe smelt-bronze
station: tutorial-furnace
in: copper-ore
in: tin-ore
out: bronze-bar
skill: smithing 8

# recipe smith-dagger
station: tutorial-anvil
in: bronze-bar
out: bronze-dagger
skill: smithing 10
on success:
  set: mining-cleared
```

`station:`, `in:`, `out:`, `skill: <skillId> <xpAmount>` are flat metadata
fields. `in:`/`out:` may repeat across lines — each occurrence appends more
ingredients (needed when a recipe has more than one input, like smelting
bronze from separate copper and tin). `on success:` is the same nested
tag-block as an action's, becoming the recipe's `extraResults`.

### Composite tags recurse the same way an action does

`enemy:` and `on success:` are the two tags whose value isn't a single
scalar — they follow the *exact same* "inline value, then optional
further-indented continuation" shape as an action declaration itself, just
one level deeper:
```
pick lock:
  requires: lockpick
  hidden if: miki-cleared
  enemy: lockpicking, attack 0, defense 3, health 12, rate 0
  xp: thieving 4
  on success:
    set: miki-cleared
    set: quest-accepted
    say: The lock gives with a soft click.
    say: Whatever is out there, you can reach it now.
```
Because of this, composite tags must be on their own line — they can't be
mixed inline with other tags via a top-level comma (a comma inside `enemy:`'s
own value would otherwise be ambiguous with the tag-separator comma one
level up). Simple/scalar tags don't have this restriction and can be
comma-joined or split one-per-line, author's choice.

### Multi-line and `say`

Because any tag can go on its own line, the earlier "say must be last"
awkwardness mostly disappears in practice — `on success:` above has *two*
sequential `say:` lines, producing two chat results in order, exactly the
mechanism needed for chunking a longer message the way dialogue text does.

### Condition expressions

Used by `requires:`, `hidden if:`/`visible if:`, `wall ... while`, and inline
conditional text:
```
cond      := disjunct ('|' disjunct)*
disjunct  := conjunct ('&' conjunct)*
conjunct  := '!'? IDENT
```
A bare `IDENT` is a flag check unless it's inside `requires:`, where it's an
item check — except for the two special-cased `requires:`-only forms
`tag:<tag>` and `equipped tag:<tag>` (e.g. `requires: tag:pickaxe`, `requires:
equipped tag:mainhand`), which are item-tag / equipped-item-tag checks
("holding/wearing anything tagged X") instead of a specific item id — the
DSL surface for the engine's existing `item-tag`/`equipped-item-tag`
`Condition` kinds. No parentheses in v0.1 — nesting beyond one level of
`&`/`|` mixing is out of scope until a real case needs it.

### Inline conditional text

```
text := (literal-run | '{' cond ':' literal-run '}')*
```
`cond` is a full boolean expression, not just a single flag — as in the
drawer example above, a fragment can be gated on `!coins-taken &
lockpick-taken` (i.e. "coins still here, lockpick already gone").

Compiles to the `visibleWhen`-gated-variants pattern documented in
CLAUDE.md's "Repeatable state-dependent flavor text": for the *n* distinct
flags referenced across all `{...}` fragments in one action's `say:` tag(s),
the compiler enumerates the 2ⁿ truth assignments, and for each emits one
action variant whose text is the base text with each fragment
included/excluded per that assignment, and whose `visibleWhen` is the exact
conjunction of that assignment (ANDed with any explicit `hidden if:`/`once`
guard the action also has). All variants share one title locale key, so the
button label never changes — only the body text does.

This is not examine-specific. Since `examine:` is sugar for `say:`, *any*
action with conditional `say:` text gets this expansion — an action doesn't
need to be named "examine" to have state-dependent flavor text.

## Flags and pack scoping

A bare (undotted) flag id — in `set:`/`unset:`/`hidden if:`/`visible if:`/
`wall ... while`/inline conditional text — auto-namespaces to the current
module's **pack** (`pack:` from `# info`, defaulting to the module's own
`id`). A dotted flag id is used exactly as written, with no namespacing
applied — that's the escape hatch for a flag that's set by one module and
read by another (e.g. a quest-stage condition in a `foundation` module
checking a flag that a different, later-loading module sets — an
already-shipped, intentional pattern per CLAUDE.md's Quests section).
Modules that want to freely share short flag names declare the same `pack:`;
modules that don't share a pack must spell out the full
`<producer-pack>.<flag>` form to reference each other's flags. Item, entity,
action, dialogue, skill, and stat ids are **not** pack-scoped — those are
merge-time cross-referenced object ids (already validated at merge time) and
stay globally addressed exactly as today.

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
  set: miki-cleared
```

- The first node is implicitly `id: start`; `(speaker)` is optional — omit it
  for narrator text (`narratorKey` instead of `textKey`).
- `[[nodeId]]` declares subsequent nodes — deliberately the same bracket
  syntax Obsidian treats as a wikilink, so dialogue files get working
  goto/backlink navigation for free in any editor that understands it.
- `-> <label> [[target]]` is a `DialogueOption`; an optional trailing
  `: <tags>` attaches `results` to that option (most commonly `set:`).
- `goto [[target]]` (no arrow, no label) sets `gotoNodeId` directly — a node
  with no options that advances automatically (mirrors the existing
  no-options-but-has-gotoNodeId case `visibleChoices` already renders a
  synthetic Continue for).
- A bare tag line indented under a node with no `->`/`goto` prefix (like
  `set: miki-cleared` above) is that node's on-enter `results`.
- A node with neither options nor a goto is terminal.

`[[dialogue <id>]]`, used inside an *action's* tags (not a dialogue node's
body), starts a different dialogue by id — see the tag table above.

## `# advanced`

```
# advanced
{
  "stats": [{ "id": "fishing", "base": 6 }],
  "skills": [{ "id": "fishing", "maxLevel": 100, "statId": "fishing" }],
  "flags": [{ "id": "tutorial.bank-visited", "initialValue": false }],
  "resources": [...],
  "effects": [...],
  "interactionTypes": [...],
  "locale": {
    "stat.fishing.title": "Fishing",
    "stat.fishing.description": "Power applied to fishing actions."
  },
  "data-updates": {
    "remove": { "locations": ["crossroads"] },
    "patches": [{ "targetModId": "other-module", "objectType": "entities", "objectId": "x", "ops": [{ "op": "add", "path": "/actions/-", "value": "y" }] }]
  }
}
```
Raw JSON, merged directly into the module's `data` object, except for the
optional `"data-updates"` key, which is instead attached verbatim to the
module's own `data-updates` field (`ModuleDataUpdates` — removals and
cross-module JSON-patch edits). It's a second, separate escape hatch from the
rest of `# advanced`'s JSON for exactly this reason: `data` and
`data-updates` are two different fields on the compiled `ContentModule`, and
neither the DSL's own sections (`# location`, `# item`, ...) nor the rest of
`# advanced` can author the latter.

The remaining keys (merged into `data`) are the intentional escape hatch for
object kinds that are engine plumbing rather than authoring surface (stats,
skills, flags, resources, effects, interaction-types, display-profiles,
combat-balance, experience-curve) — contributors aren't expected to
hand-write these, so there's no ergonomic pressure to give them DSL sugar.

The optional `"locale"` key is a flat key → text record (same shape as the
compiler's own generated locale output) merged into the module's `en`
dictionary — the escape hatch for text that has no other DSL-generated
locale key, since stats/skills/resources/effects have no compiler-side
locale generation of their own (unlike items/dialogue/quests, which always
get *something*, even a humanized fallback). It never overwrites a key any
other section already generated; if you want to override generated text,
write it where it's generated (e.g. an item's `title:`/`description:`), not
here.

## Localization

The DSL is authored in English inline; the compiler generates locale keys and
emits an `en` dictionary, leaving the compiled objects pointing at keys like
today. Structural-path keys (`action.entity.drawer.take-coins.title`) are
used wherever there's a natural id anchor; inline-conditional `say:` variants
get a content-addressed suffix (`chat.entity.drawer.examine.0`, `.1`, ...),
which is **not** stable across reordering the DSL source — a known, accepted
trade-off, not a bug.

## What proved out

Implemented and tested against hand-authored rewrites of real Tutorial
Island content, verified by merging the compiled modules through the *real*
`applyModulesToBundle` pipeline with zero validation errors in every case:

- **`compiler.test.ts`**, against `tutorial-island-guide-house`: `info`
  (+ `pack`), `location` (+ multi-line bare-tag metadata, + `wall`), nested
  `entity` + actions (instant, adversarial/timed with inline `enemy:`), the
  unified colon/indentation action grammar (no bullets), `once` + pack-scoped
  flag-visibility sugar, `examine:` as pure `say:` sugar with compound
  (`&`/`|`) multi-flag inline conditionals, multi-line `on success:` with
  sequential `say:` lines, `[[dialogue x]]`, dialogue (multi-node, options,
  on-enter results, bare `goto`), `open modal:`.
- **`coverage.test.ts`**, against slices of `tutorial-island-foundation` and
  `tutorial-island-mining`: `item` (including tag-string pass-through and
  item actions sharing the entity-action pipeline), `quest` (staged
  conditions + narrative descriptions), `recipe` (multi-line `in:`/`out:`,
  `on success:` → `extraResults`), `chance:` + `on fail:` (the locked-chest
  one-shot-gamble pattern), `station:`, and the new `resource:` tag.

Not yet implemented: `respawn:`, drop-table
references inside `give:`, multi-line dialogue-node body text, the visual
grid-placement GUI for locations, and the full editor/live-preview UI that
replaces contribution mode. None of these have hit a design wall — they're
the next slices.
