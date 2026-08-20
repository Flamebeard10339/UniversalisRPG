# DSL load path audit — 2026-07-28

Independent audit of repository system 1 (**DSL load path**: `src/grammar`, `src/content`) at
`50a4f41`. First audit of this system. `git log -- src/grammar src/content` shows one commit
(`262a637`, the folder move); the real history is the 92 commits under `src/game/contentDsl`,
of which the predecessor "content pipeline" system stood at 11 un-audited when the split
happened.

Baseline: `npx tsc --noEmit` clean, **315 tests / 21 files** green, `npm run comment-budget`
green (3.2% repo-wide, every file within budget), `npm run layer-check` green (279 cross-file
imports, zero upward).

Every finding below was reproduced against a throwaway fixture loaded through the real
`loadModule`, and each fixture is described inline so it can be re-run. Findings already
tracked as open in `backlog.md` are not re-reported.

---

## What the system gets right

Stated first because it bounds everything else.

**The pass-2 M1 fix landed completely.** I re-ran every row of that audit's table against
fresh fixtures rather than trusting `references.test.ts`. All twelve now fail at load:

| pass-2 M1 row | then | now |
| --- | --- | --- |
| `speed:` / `target:` unknown | caught | caught |
| `drain: 5 bogus-pool` | loads clean → thrown mid-fight | **caught at load** |
| `restore: 5 bogus-pool` | loads clean | **caught at load** |
| `+100% bogus-stat` (tag clause) | loads clean → silently reads 0 | **caught at load** |
| `xp: bogus-skill 5` | loads clean | **caught at load** |
| `give:` / `take: 1 bogus-item` | loads clean | **caught at load** |
| `relocate:` / `discover: bogus-place` | loads clean | **caught at load** |
| recipe `in:`/`out:`/`burnt:` item | loads clean | **caught at load** |
| recipe `skill:` | loads clean | **caught at load** |

The messages are good too — `# entity training-dummy action "strike" speed: names an unknown
stat: attack-rat` names section, member, field, kind and id.

**The section engine is a genuinely good design.** `SectionSchema` + `parseSection` +
`hydrateSection` (`src/grammar/section.ts`) drive 8 of the 11 section kinds off ~140 lines,
with a clean authored/derived split: parsing leaves absent fields absent, hydration supplies
defaults lazily through getters, and a circular default throws a `DslError` instead of looping
(`section.ts:124`, tested at `parse.test.ts:385`). Field-order independence falls out for free.

**Layering is real, not aspirational.** `src/grammar` imports nothing outside itself;
`src/content` imports only `grammar` and `content`. The upward dependency that would have been
natural — the save diff's shape, owned by `src/runtime/save.ts` — is instead typed
`Record<string, unknown>` in `src/content/saveSection.ts`, which is the documented
`tuning.ts`/`save.ts` split applied correctly.

**A `# save` body cannot pollute the prototype.** I loaded
`{"version":4,"__proto__":{"pwned":true},...}`; `loadSave` reads only a 12-key whitelist
(`save.ts:15-28`), `Object.prototype.pwned` stayed `undefined`, and the extra key was dropped.

**Forward references work.** Validation runs once after every section has parsed
(`registry.ts:257`), so declaration order never matters.

---

## H1 — a second definition of an id silently replaces the first, wholesale

**Verified.** `loadModule` stores each section with `Map.set` (`registry.ts:197, 203, 207, …`).
There is no duplicate check anywhere. Fixture — the real `content/tutorial-island.dsl`
concatenated with a two-line "mod", which is literally what `play-cli.ts:551` does
(`loadModule(files.map(readFileSync).join('\n'))`):

```
# location guide-house
x: 1
```

| | before | after |
| --- | --- | --- |
| `x` | 0 | 1 |
| `starting` | **true** | **false** |
| `entities` | **5** | **0** |
| `adjacent` | **3** | **0** |

`loadModule` reports nothing. `startSession` then throws `unknown location: ` — the game
cannot start, from a mod that changed one number.

This is the exact worked example in `backlog.md`'s E2E authoring plan
(`## upsert location tutorial-guide-house / x: 1`). The DSL has no merge semantics at all;
"patching" today is `Map.set` clobbering a whole section, and the failure is silent at the
seam where it happens and fatal three layers later. This is the concrete mechanism behind the
user's note that the diff/contribution work "felt difficult to implement and hacky" — it was
hacky because the load path offers nothing to build on.

Every registry kind behaves this way; measured individually:

| fixture | result |
| --- | --- |
| two `# item straw` | `items.size=1`, second body wins |
| two `# location den` | second wins entirely; `starting` lost |
| two `# stat attack` | `base` = second value |
| two `# entity` actions labelled `strike:` | **both kept**, `actions=[strike, strike]` |
| two `# dialogue` with `owner = dummy` | both kept in `dialogues`, `dialoguesByOwner` keeps the last |
| two `# dialogue` `node hi:` | both kept; `findNode` takes the first, so the second is dead |
| two `# test t` | `tests.size=1` — **a regression test can be silently deleted by a later one** |
| `# item straw` + `# location straw` | both kept, no warning (may be intentional) |

**Fix direction.** Make redefinition a `DslError` by default — `# location guide-house is
already defined` — which is one `has()` check per kind and turns H1 from silent corruption into
a load error. Then decide *separately* whether merging is a feature, and if so give it explicit
syntax with defined per-field semantics. Note that duplicate action labels and duplicate
dialogue node names need the same treatment and are currently the two cases that silently
produce unreachable content rather than replacing it.

---

## H2 — reference validation covers under half the reference-bearing fields, and its comment says otherwise

**Verified against fixtures.** `registry.ts:72-74`:

> Walked after everything parses, so forward references are fine. **Every id is checked**, not
> just the ones a past incident named: an unknown stat never fails at all — statRange falls
> through to point(0) and the resolver divides by it.

I enumerated every reference-bearing field in the grammar and loaded a module with each one
pointed at a nonexistent id. Twenty are checked; twenty-four are not:

| unchecked field | what happens instead |
| --- | --- |
| **`requires: has <item>`** (`condition.ts:35`) | loads clean; `conditions.ts:49` reads `inventory[item] ?? 0`, so the gate is **false forever** and the action is unreachable with no error, ever |
| `adjacent: x while has <item>` | same, on an edge — the route silently never opens |
| dialogue `when:` / choice `(when …)` / `{cond: text}` | same |
| `goto <node>` (node step and choice) | loads clean; `RuntimeError: goto target not found` thrown **at the player, mid-conversation** (`dialogue-runtime.ts:19`) |
| `open modal: <id>` | loads clean; sets `state.pendingModal` to a modal only `submitModal` can clear, and `session.ts:252` says character creation is the only modal |
| `# skill … stat-id:` | loads clean — and see L4, nothing reads it |
| `# recipe … station:` | loads clean; the recipe is craftable nowhere, silently |
| `# entity … stations:` | loads clean; capabilities are free-form strings with no registry |
| `# test` `travel:` `talk:` `craft:` `run:` `load:` `expect:` `use:` `assert:` | loads clean; fails only when the test runs |
| `# save` diff contents | loads clean (see M4) |
| `set:` / `unset:` / `add:` variable, bare condition references | flag-shaped and genuinely free-form today |

Of the twenty-four, nine are flag-shaped and arguably not checkable without a flag declaration
mechanism. **The other fifteen name a kind that already exists in the registry** and could be
checked by the `check()` dispatch that is already written.

`has <item>` is the sharpest. Fixture:

```
# location den
x: 0, y: 0
starting
open-chest:
  requires: has strawe      // typo of `straw`, which is declared
  say: opened
```

Loads clean; `view().choices` is `[]` and stays `[]` for the life of the game. This is exactly
the failure mode the comment above says was closed — a typed reference that silently reads
empty — reached through the one door the walk does not open. It is an *item* reference, the same
`check('item', …)` used by `give:`/`take:`, applied to a field the walk never visits.

Note the pattern: this is the **third consecutive audit** to find a load-bearing comment in
this validator asserting a universal property the code does not have (pass 1's L3 comment,
pass 2's M1 comment, now this one). The comment is inherited — it moved here verbatim in
`1c30ea7` — but it is false at its new address too.

**Fix direction.** `validateReferences` already has the dispatch; it is handed too few nodes
again. Add a `checkCondition` walk (covering `has`) and call it from `checkAction` for
`requires`/`hiddenIf`, from the location-edge loop, and from the dialogue walk; add a node-name
set per dialogue for `goto`; add `skill`/`capability`/`test`/`save`/`recipe` to `ReferenceKind`
and walk `# test` directives. Delete the "every id is checked" sentence rather than re-writing
it — the claim belongs in the test file, where it is executable.

---

## M1 — one stray carriage return silently reattributes a section; a CRLF file will not load at all

**Verified.** `structure.ts:16`: `HEADING = /^#[ \t]+…[ \t]*$/`. `source.split('\n')` leaves the
`\r` on the line, `[ \t]*$` does not match it, so the heading is not a heading — it becomes a
body line of the *previous* section.

| fixture | result |
| --- | --- |
| real `content/tutorial-island.dsl`, LF | loads (4 locations, 9 entities) |
| **byte-identical file, CRLF** | `DslError: content before first section: # variable travel-seconds-per-unit` |
| LF file with **one** `\r` appended to `# stat attack` | `DslError: unexpected content: "# stat attack"` |

The single-CR case is the dangerous one: had the preceding section been an `# item` (which has
`clauses: 'tags'`) or a `# location` (which has `entries`), the stray heading would have been
consumed as a tag clause or an action rather than raising anything.

This is not hypothetical for the workflow being built. There is no `.gitattributes`; this
machine has `core.autocrlf=input`, but a contributor on the git-for-Windows default
(`autocrlf=true`) gets a CRLF working tree, and DSL pasted through a GitHub issue body — the
authoring path in `backlog.md` — routinely carries CRLF.

**Fix direction.** One line in `splitSections`: strip a trailing `\r` from each `raw` before
matching. Add `*.dsl text eol=lf` to `.gitattributes` as belt-and-braces. Both are cheap; the
regex change is the one that matters, because it also fixes pasted content.

---

## M2 — `action.ts` is a second, laxer copy of the section field engine

**Verified by differential fixture.** `section.ts` refuses trailing garbage because `parseLine`
loops until the cursor is done. `action.ts`'s hand-written `parseActionLine` `return`s the
moment it has its value, dropping the rest of the line:

| line | outcome |
| --- | --- |
| `x: 0 garbage` (section field) | `DslError` |
| `base: 4-7 garbage` (section field) | `DslError: unexpected content: "garbage"` |
| **`time: 5 garbage`** (action field) | **loads clean, garbage dropped** |
| **`health: 5 garbage`** | **loads clean** |
| **`speed: s garbage`** | **loads clean** |
| **`time: 1e3`** | **loads clean as `time = 1`** |
| **`escape after 3 times`** | **loads clean as `escapeAfter = 3`** |
| **`xp: brawling 2 junk`** | **loads clean** |
| **`requires: has 3 straw JUNK`** | **loads clean** |
| **`stop now`** | **loads clean as `{kind:'stop'}`** |

Same DSL, two strictness regimes, decided by whether a field happens to live on a section or on
an action. `time: 1e3` becoming `1` is the one that will actually bite an author.

The duplication is also literal: `parseActionLine` spans 89 of `action.ts`'s 147 lines (60%),
is 17 `cursor.take(/…:/)` probes, and carries **14** hand-written
`'action X is defined more than once'` guards — the exact check `section.ts:81` performs once,
generically, for every schema.

`section.ts:1` records the design decision this violates: *"the rejected alternative was a
hand-written parser per section kind."* Actions took the rejected alternative.

**Fix direction.** `parseLine` in `section.ts` is already a standalone function taking a field
table. Export it (or a small `fieldBlock(fields, flags, clauses)` helper) and express `Action`'s
thirteen fields as a `Field<>` table. The duplicate-field guards, the "unknown action field"
message and the trailing-garbage rejection all come along, and `action.ts` loses roughly 80
lines. `on success:`/`on failure:`/`on escape:` already have the inline-or-block shape
`section.ts:82-83` implements.

---

## M3 — a mistyped section field becomes a player-facing action

**Verified.** On any section with `entries` (location, entity, item), `section.ts:76` routes an
unrecognised `key:` into the entries collection rather than raising `unknown <kind> field`.
Fixture:

```
# location den
x: 0, y: 0
starting
examin:
  dusty
```

Loads clean. `view().choices` is `[["use:location.den.examin", "examin"]]` — the typo is offered
to the player as an action labelled "examin", and `location.examine` is `undefined`.

The inline form (`examin: dusty`) does raise, but with `unrecognized action result: "dusty"`,
which points the author at results rather than at the misspelled field. Sections without
`entries` behave correctly: `# recipe … ouy: 1 straw` gives `unknown recipe field: ouy`.

**Fix direction.** The entries fallback is doing double duty as "any label is an action" and as
"there are no unknown fields here". Cheapest correct fix: keep the fallback but require an
entry body to parse as at least one result or a recognised action field — a body that is a bare
keyword tag and nothing else is far more likely a typo than an action. Alternatively require a
marker on authored actions. Worth a design call rather than a patch.

---

## M4 — `# save` bodies are type-unchecked past `version`

**Verified.** `saveSection.ts:24-26` checks object-ness and `typeof version === 'number'`, then
hands `diff` through as `Record<string, unknown>`. `loadSave` assigns it into `GameState` with a
cast:

| `# save` body | resulting state |
| --- | --- |
| `{"version":4,"flags":"potato"}` | `flags = {"0":"p","1":"o","2":"t",…}`, `view()` still succeeds |
| `{"version":4,"time":"potato"}` | `state.time = "potato"`; survives a 10 s `resolve()` unchanged |
| `{"version":4,"inventory":[1,2,3]}` | `inventory = {"0":1,"1":2,"2":3}` |
| `{"version":4,"location":42}` | loads; **`RuntimeError: unknown location: 42`** from `view()` |
| `{"version":4,"totallyUnknown":{…}}` | silently dropped |

Only the `location` case produces any signal, and it is a runtime crash. This matters because
`# save` sections are the fixture format for `expect:`/`load:` in `# test`, so a hand-edited or
mis-migrated save yields a corrupt-but-running session rather than a rejected file.

**Fix direction.** The field list already exists as data (`save.ts:15`, `Record<SaveField,
'record'|'scalar'>`). A per-kind shape check at parse time — records must be objects, `time`/`rng`
must be finite numbers, `location` a string — is a dozen lines. It cannot live in
`saveSection.ts` without importing upward, which is the same shape as `tuning.ts`: put the
validator next to `SAVE_FIELDS` in `src/runtime/save.ts` and call it from `loadSave`, keeping the
grammar side purely structural. Relatedly, the silent drop of unknown keys is worth a warning
given the open "migration system for saves" backlog item.

---

## M5 — `starting` is unvalidated in both directions

**Verified.** `starting` is a per-location flag with no cardinality check.

| fixture | result |
| --- | --- |
| no location marked `starting` | loads clean; `startSession` leaves `state.location = ''`; **`Error: unknown location: ` from `view()`** |
| two locations marked `starting` | loads clean; `save.ts:50` `find()`s the first in **source order** — silently `den`, not a stated choice |
| no `# location` sections at all | loads clean; same empty-id crash on first `view()` |

The zero case is a whole-module authoring mistake surfacing as an unhelpful runtime error with
a blank id. It is also reachable *from H1* — the concatenated-mod fixture lands here.

**Fix direction.** Assert exactly one `starting` location in `loadModule`, unless a module is
allowed to be a fragment with no start — in which case the check belongs in `startSession` with
a message that says so. Two locations at identical coordinates also load clean and silently
overlap on the map; likely benign, listed for completeness.

---

## L1 — `DslError.span` is computed everywhere and read nowhere

**Verified.** `src/grammar` and `src/content` construct spans at roughly forty sites, threading
absolute offsets through `Cursor.base`/`abs()`. Repo-wide search for `.span` outside those two
folders returns **zero** hits in live code. The only consumer of a `DslError` is
`play-cli.ts:319`, which prints `err.message`. No author has ever seen a line number.

Two consequences compound it:

- Errors raised *after* parsing carry no span at all. Every throw in `validateReferences`
  (`registry.ts:86`), the retaliation guard (`registry.ts:194`), the resource-max guard
  (`registry.ts:228`), both coordinate errors (`location.ts:77, 81`) and `validateTuning`
  (`tuningVariables.ts:11`) omit it. `parseBegin` (`test.ts:48, 53, 58, 61`) omits it too.
  So the errors most likely to hit an author are the ones with the least location information.
- `play-cli.ts:518` joins module files with `'\n'` before parsing, so an offset is into the
  concatenation, not into any file. Even a consumer could not name a file and line today.

**Fix direction.** Either render spans — a `formatDslError(source, err)` that converts offset to
`file:line:col` and prints the offending line, which is ~20 lines and makes the whole existing
investment pay — or delete the span plumbing. Rendering is clearly right given the DSL is meant
to become ground truth for outside contributors, but the current state (pay the cost, take none
of the benefit) is the worst of the three.

---

## L2 — `layer-check` catches one import syntax of seven

**Verified.** `scripts/layer-check.ts:24`:

```ts
const IMPORT_PATTERN = /(?:from|import)\s*\(?\s*'(\.[^']*)'/g;
```

Single quotes only. I built a synthetic `src/grammar` → `src/runtime` violation in seven
syntaxes and ran the real script over it:

| syntax | detected |
| --- | --- |
| `import { z } from '../runtime/r'` | **caught** |
| `import { z } from "../runtime/r"` | missed |
| `import type { Z } from "../runtime/r"` | missed |
| `const p = import("../runtime/r")` | missed |
| `export { z } from "../runtime/r"` | missed |
| ``const q = import(`../runtime/r`)`` | missed |
| `const m = await import("../runtime/r")` | missed |

The repo currently uses single quotes throughout, which is why the gate reads green and why
this is Low rather than Medium — but **there is no ESLint or Prettier config anywhere in the
repo**, so nothing enforces that. The gate's guarantee is one keystroke deep. It also only
scans the five declared roots, so a file added directly under `src/` is outside every layer and
unchecked.

**Fix direction.** Widen the character class to `['"\`]` with a backreference, or drop the regex
for `ts.preProcessFile` / a TypeScript AST walk — TypeScript is already a dependency and
resolves every import form exactly.

---

## L3 — this system's own reference tests live in the runtime's folder

`src/runtime/references.test.ts` imports `../content/registry` and `../grammar/parser` and
nothing else; every one of its 25 assertions drives `validateReferences`. CLAUDE.md: *"Tests
live in the folder of the layer they drive."* It belongs in `src/content/`.

This is not cosmetic. `docs/audits/systems.json` derives system membership from paths, so today
a change to the DSL load path's most important test file spends the **Runtime's** audit budget,
not this system's — and the DSL load path shows fewer un-audited commits than it has.

---

## L4 — `Skill['stat-id']` is authored, parsed, tested, and read by nothing

`src/content/skill.ts:7,14` declares and parses `stat-id`. Repo-wide search finds no reader —
the only other `stat-id`/`statId` hits are the unrelated tag-clause field and `entity.stats`
keys. `parse.test.ts:79` pins it: *"leaves a gathering skill stat-id undefined, since it has no
default"* — a test asserting that a dead field stays empty, which is the audit prompt's "tests
that repeat the implementation's assumption" in its purest form.

It is also unvalidated (H2), so it is simultaneously a stat reference nobody checks and a stat
reference nobody reads. Delete the field and its test, or wire it up.

Two smaller members of the same class: `AuthoredItem` (`item.ts:15`) is exported and never
imported.

---

## L5 — `add:` cannot express a negative, and silently means `+1` instead

**Verified.** `actionResult.ts:33` reads the amount with `/\d+/`, which cannot match a sign, and
falls back to `1`:

| line | parsed |
| --- | --- |
| `add: den.counter -3` | `{kind:'add', variable:'den.counter', amount:1}` |
| `add: den.counter` | `{amount:1}` (intended) |

An author writing a decrement gets a silent increment. The neighbouring `number` parser
(`values.ts:9`) already accepts `-?\d+`; `parseAdd` just does not use it. Either accept the sign
or reject it loudly — the current behaviour is the one outcome nobody wants.

Same family, lower stakes: `give: 0 straw` parses to `amount: 0` (a give that gives nothing),
and `# resource … start: -50` is accepted below zero without comment.

---

## L6 — the default item examine is ungrammatical, and a test pins it

`item.ts:21`: `default: (self) => \`This is an ${self.title}.\``. Verified against a fixture:
`# item hay` hydrates to `examine: "This is an Hay."`. Most ids are consonant-initial, so the
default is wrong more often than right, and it is player-facing text shown on any item whose
`examine:` the author omitted. `parse.test.ts:378` asserts `'This is an Mystery Box.'`, locking
it in.

## L7 — `burnt:` without `accuracy:` is silently ignored

`registry.ts:59-65` attaches `onEscape` only when `recipe.accuracy` is set. A recipe with
`burnt: 1 charcoal` and no `accuracy:` loads clean with `onEscape === undefined` — the authored
burn outputs are dropped with no signal. `recipe.ts:17` documents that `evasion` is contested
against `accuracy`, so the coupling is intentional; the silence is not. Either raise
`# recipe weave: burnt: has no effect without accuracy:` or make `burnt:` imply a failure path.

---

## Design questions for the user, not defects

1. **What should a second definition of an id mean?** (H1) Error, replace, or field-wise merge?
   This is the crux of the "DSL pipeline audit" backlog item, and it cannot be settled by an
   auditor. My reading: make plain redefinition an error now — that is strictly safer than
   today and blocks nothing — and design merge as explicit grammar afterwards, because a
   `# patches` syntax with declared per-field semantics is a different feature from
   "concatenation happens to overwrite."

2. **Are flag references meant to be undeclarable?** (H2) Nine of the twenty-four unchecked
   references are flag-shaped, and they are unvalidatable only because flags have no
   declaration. A `# flag` section kind — or simply treating "written by some `set:`/`add:` in
   the module set" as the declaration — would close a class that currently fails completely
   silently. The other fifteen should be checked regardless of this decision.

3. **Should `stations:`/`station:` be a declared kind?** Capabilities are currently free-form
   strings matched by equality across two sections with no registry, which is a typo-shaped
   hole that makes a recipe craftable nowhere.

4. **Is an item and a location sharing an id legal?** It loads today. If ids are meant to be
   globally unique the check is trivial; if kind-scoped, that is worth stating so the eventual
   editor can rely on it.

5. **grammar.md is already flagged stale in `backlog.md`.** Three of the findings above (M2's
   trailing-garbage asymmetry, M3's typo-becomes-action, L5's `add:` sign) are places where the
   *implemented* grammar is more surprising than the documented one. The user's concern that
   grammar.md "has grown rules that undercut the DSL's simplicity" is, on this evidence, partly
   a symptom: the rules grew because actions parse by a different set of rules than sections do
   (M2). Unifying them would let the document shrink rather than grow.
