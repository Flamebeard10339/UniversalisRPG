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
or `## entity` line. Recognized fields: `x:`, `y:`, `z:` (numbers). The bare
word `starting` marks the location as the universe's start. **Any other bare
word — this is the one place in the grammar a bare, unrecognized word isn't
an error** — is a location tag (`tutorial`, `indoors`, `shore`, ...). There's
no `tags:` label to remember, because everything on that line that isn't a
recognized field or `starting` already is one.

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
| `[[dialogue <id>]]` | `results: [{kind:'dialogue', dialogueId}]` — same bracket syntax as a dialogue-node goto, since both mean "jump to X"; which one applies is unambiguous from context (an action's tags vs. a dialogue node's body are always different sections) |
| `open modal: <modalId>` | `results: [{kind:'open-modal', modalId}]` |
| `say: <text>` | appends a `chat` result; supports inline conditional text (below) |
| `enemy: <interactionTypeId>[, <statKey> <value>]*` | sets `interactionTypeId` + inline `enemy` block. Composite — see below. |
| `on success: <tags>` | (adversarial actions only) tags here become `results`, fired on completion, instead of `rewards` |

Deferred to a later pass: `chance N%` + a `fail:` counterpart (one-shot
gamble actions, e.g. the mining locked chest), `station:` (recipe stations),
`respawn:`, arbitrary `max: N` completions, drop-table references inside
`give:`.

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
item check. No parentheses in v0.1 — nesting beyond one level of `&`/`|`
mixing is out of scope until a real case needs it.

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
  "resources": [...],
  "effects": [...],
  "interactionTypes": [...]
}
```
Raw JSON, merged directly into the module's `data` object. The intentional
escape hatch for object kinds that are engine plumbing rather than authoring
surface (resources, effects, interaction-types, display-profiles,
combat-balance, experience-curve) — contributors aren't expected to
hand-write these, so there's no ergonomic pressure to give them DSL sugar.

## Localization

The DSL is authored in English inline; the compiler generates locale keys and
emits an `en` dictionary, leaving the compiled objects pointing at keys like
today. Structural-path keys (`action.entity.drawer.take-coins.title`) are
used wherever there's a natural id anchor; inline-conditional `say:` variants
get a content-addressed suffix (`chat.entity.drawer.examine.0`, `.1`, ...),
which is **not** stable across reordering the DSL source — a known, accepted
trade-off, not a bug.

## What proved out in the v0.2 spike

Implemented and tested (`src/game/contentDsl/compiler.test.ts`) against a
hand-authored rewrite of `tutorial-island-guide-house`, verified by merging
the compiled module through the *real* `applyModulesToBundle` pipeline with
zero validation errors: `info` (+ `pack`), `location` (+ multi-line bare-tag
metadata, + `wall`), nested `entity` + actions (instant, adversarial/timed
with inline `enemy:`), the unified colon/indentation action grammar (no
bullets), `once` + pack-scoped flag-visibility sugar, `examine:` as pure
`say:` sugar with compound (`&`/`|`) multi-flag inline conditionals,
multi-line `on success:` with sequential `say:` lines, `[[dialogue x]]`,
dialogue (multi-node, options, on-enter results, bare `goto`), `open modal:`.

Not yet implemented: `item`, `quest`, `recipe`, `chance`/`fail`, `station`,
`respawn`, drop tables, the visual grid-placement GUI for locations, and the
full editor/live-preview UI. These are the next slices, not blocked by
anything discovered so far.
