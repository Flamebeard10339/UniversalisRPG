# what-is-stored-or-replayed-is-an-id

## Deliverable

Everything the engine stores, replays or compares is an id. Everything a player reads comes
from a locale and from nowhere else, so a game with no locale loaded shows ids on every
surface and adding a locale is the only thing that makes it speak. The two stop being the
same string, everywhere they are still the same string today: a carried row answered by its
base-language title, a plane move answered by a jewel's title, a dialogue choice answered by
its authored line, a `PlaneFrame.said` holding a composed English sentence, and twenty engine
sentences still built in TypeScript. What falls out is that no edit to a translation and no
rename of an English title can change what a recording replays.

Proof:

- [c1] An instance is referenced by an ordinal and named from its template. The ordinal never
  changes and never encodes what the instance is a copy of, so a copy transformed from one
  template to another keeps its identity. It is named by asking the played language for its
  template, and where that language has no entry it is `<template>#<ordinal>` —
  `iron-sword#18273` — because an instance has no key of its own: there are unboundedly many
  of them and a locale can address only a template. Two copies of one template are named alike
  on screen, which is correct and is nothing any surface has to repair.
- [c2] Nothing a player answers with carries words. Every `ModalChoice.value` every modal
  publishes is an id — a content id, an instance ordinal, a slot, a hexagon, or one the engine
  itself owns — and none is drawn from a `title:`, an authored line or a locale entry. The
  engine's own are spelled as ids rather than as the English they used to be: `grow`, not
  `Grow`. Proven by enumerating what every modal publishes against the loaded locale rather
  than by reading the source. `distinct()` goes with it: ids do not collide, so nothing has to
  be made answerable after the fact.
- [c3] What is stored is a key and its parameters, never a rendered sentence. No save field
  holds text the engine composed: `PlaneFrame.said` carries an engine key and the parameters
  it takes, so one save read by a player of one language and a player of another reads in
  each. Proven by writing a frame in one language and rendering it in the other, both
  directions.
- [c4] No engine sentence is built in TypeScript. Every string the engine puts on a screen or
  into the log comes from a key in the union — the twenty growth, plane and cluster refusals
  included. `Localizer.prose` is left with one job, text the DSL authored that carries no key,
  and the sentence-scan allowlist holds nothing but action labels.
- [c5] A recording survives translation. Every shipped `# test` passes against a universe
  whose every engine pattern and every content title has been replaced with different text.
  This is the property the whole branch exists to buy: after it, a `# test` that breaks is a
  `# test` about behaviour, and nothing a translator or an editor does can break one.
- [c6] What changes is only what had to, and it is named here in full. `SAVE_VERSION` moves 9
  to 10 for `PlaneFrame.said`'s new shape. Three authored things move with it and nothing else
  does: the `submit-modal:` values in shipped `# test` sections, the one `choose:` line in
  `tutorial-quest-given`, which is the dialogue-facing spelling of the same answer, and the one
  `# save` fixture carrying `"race":"Elf"`, because a race answer is a stored field and becomes
  an id with the rest. No fixture's instances or equipment moves, since an ordinal is what they
  already hold. No content id, no field name and no player-visible English string moves, every
  `# test` passes, and `npm run tasks -- merge-ready` is green on every behavioural leg.

## Goal

Stop paying for the same defect once per screen. Five of `reimplement-localization`'s six
audit passes found one root cause wearing a different surface, because the wire and the
display were one string and no pass had standing to separate them.

## Decisions

- **This overturns c16's no-id reading, which was a miscommunication.**
  `one-name-for-a-carried-thing-on-every-surface` discharges c16 as *one function below every
  screen answers what a carried thing is called, no id in either*, and it is why
  `a-listed-growth-value-names-a-jewel-by-its-namespaced-id` was declined on 2026-08-13. That
  branch landed before this one and the order should have been the reverse. What the author
  saw was `Whetstone x6` beside `feed: with tutorial-island.whetstone`, and the inconsistency
  was read as the id being wrong — but there was no localization then, so the id was the only
  honest thing either surface could have shown, and the fix should have been the other one
  showing an id too. The rule this branch works to instead: reference everything by id
  internally, and let a locale be the only source of words. Without that, none of the rest
  holds. c16's naming function survives untouched and is where the fallback in c1 lives.
- **A travel action's label is an id, because a save holds it.** An action's label doubles as
  its identifier and `activeAction.actionLabel` stores the one a walk is under, so a compiled
  `Travel to <title>` put a sentence built from a title into the save and made a rename stop
  the walk. The label is `travel`; the pair is the ownerRef's to say and the words are
  `engine.travel.to`'s. Found by pass 1, whose reproduction is the regression to re-run.
- **This is where `reimplement-localization`'s c3 lands.** That clause — a missing translation
  shows its key, in every direction — was graded unmet on passes 2 through 6 and is deferred
  onto this branch rather than dropped. It is unmeetable there: `PlaneFrame.said` is a plain
  string in the save, so a refusal composed by an English session reads as English to a
  Spanish player however well the composing is keyed, and fixing that moves the save shape,
  which `reimplement-localization`'s own c9 forbids by name. c3 and c4 above are what settle
  it. The deferred record is adopted with `tasks spec add`.
- **The ordinal is global, not per template.** It guarantees uniqueness without a second
  counter, it is simpler to keep right over time, and it leaves room for a copy to be
  transformed — log to plank to table — while staying the same thing throughout. The
  per-template form `iron-sword.1` was considered and rejected for that last reason: it puts
  what a copy currently is into the name of who it is. Legibility is bought by the naming rule
  in c1 rather than by the id, which is where it belongs.
- **A keyed thing shows its key; only an instance shows a `#` form.** Playing with no locale
  already puts `tutorial-island.item.iron-sword.title` on screen, and that key *is* the id
  with the field it addresses — so it stays, and `reimplement-localization`'s c3 is not
  reopened. The `#` form exists for the one thing that has no key to show.
- **A dialogue answer is the option's index within its node.** The right answer is a mix —
  an authored id where one is wanted, and a slug falling back to it so a cosmetic edit does
  not invalidate every recording — but that is a lot of authoring surface and migration
  machinery for a problem nobody has had yet. The index is an id and it satisfies c2 today.
  One shipped `# test` does answer a dialogue choice — `tutorial-quest-given`'s `choose:` —
  so the cost is real and is named rather than assumed away: inserting an option before
  Miki's first one makes that recording replay a different line, and it keeps passing as
  long as the new line also sets `quest-given`. The index is counted over the choices the
  node declares rather than the ones a `when:` leaves standing, so gating one does not shift
  the answer to every choice after it. Revisit when reordering options actually breaks
  something.
- **No save migration.** This is the second consecutive `SAVE_VERSION` bump and there is no
  point building a migration path while the shape underneath it is still moving.
  `save-migration-system` stays open and untouched; a stale save is rejected, which is this
  repository's standing policy rather than a decision of this branch.
- **An engine id is an id like any other, and is localized like any other.** `grow`, `close`,
  `back` and `human` live in TypeScript for the same reason `tutorial-island.iron-sword` lives
  in a `.dsl`: whoever owns the thing owns its id. Ownership is the whole of the difference.
  Both are addressed by a key, both are shown through the played language, and both show that
  key when no locale supplies words — there is no class of engine token that sits outside
  localization, and nothing in this branch may create one. What this revises is the reasoning
  recorded on `reimplement-localization`, which argued from a correct premise to the wrong
  conclusion: the premise is that the wire must not move when text moves, and the conclusion it
  should have reached is that the wire carries no text at all. Instead it concluded that the
  English belonged in TypeScript. The English never belonged there; the id does — and `Grow`
  was never an id, it was an English word doing an id's job, which is why c2 makes it `grow`.

- **A craft's label is an id too, and c3 needs no boundary stated around it.** The compiled
  recipe action was labelled `Craft ${humanizeEn(recipe.id)}`, so `activeAction.actionLabel`
  held a sentence the engine had composed and `save.ts` folded it into `engine.prune.action`
  and `engine.action.stale.action` — an English sentence in a Spanish player's log. It is the
  same defect pass 1 found on `travelAction`, on the next owner along, which is this branch's
  recurring failure mode. The label is `CRAFT_LABEL`; a recipe owns one action, so the id
  identifies it, and the display was already `engine.craft.label` over the recipe's own title
  key. Pass 2 graded c3 met against a stated boundary because that label derived from an id
  and so could not move when words moved; the boundary is now unnecessary and is withdrawn,
  and c3's first sentence is literally true. The sentence-scan allowlist is empty, which is
  what c4's last sentence says.
- **An answer is checked for holding a word, not only for being one.** c2's enumeration
  intersected published values with the strings the universe can show, by equality, so a
  value carrying a title inside a shape passed it — `slot: <dir> with <jewel.id>` rewritten
  to use the jewel's name survived the whole of `modals.test.ts` and was caught only by the
  shipped recordings. Equality was the wrong relation: every reopening of this clause has
  been an embedded title. The check is containment, and the walk goes one step further so
  the two verbs whose values embed a carried id — `slot:` and `feed:` — are published at all.
- **The third owner of an action label is named as a boundary, not fixed here.** An action
  section's `title:` line *is* its label (`src/content/action.ts:20`), and a label is what
  `activeAction.actionLabel` stores and what `save.ts` compares by string equality — so renaming
  `title: Fight` to `Combat` stops the fight under way and puts the English word into a Spanish
  player's log. Pass 3 reproduced it and it is the same root cause as pass 1's travel label and
  pass 2's craft label, on the last of the three owners: the one an author writes rather than one
  the engine composes. Two of this Deliverable's sentences are false on it — "Everything the
  engine stores, replays or compares is an id" and "no rename of an English title can change what
  a recording replays" — and that is recorded here rather than argued away. No clause's own
  sentence reaches it: c3 is about text the engine composed and the engine composed nothing here,
  c4 is about sentences built in TypeScript and this is built in the DSL. The fix is
  `action-labels-as-members`, which is already specified and already derives the slug this needs,
  and whose recorded claim that "Nothing is broken today" pass 3 refutes. It is the next branch
  rather than this one because it moves the `use:<kind>.<objId>.<label>` contract and the shipped
  `# test` recordings that spell it, which is a different system's diff.

- **Two surfaces this branch does not reach, named rather than left to be found.** Both are
  outside `src/runtime`'s brand, which is why neither is a hole in it. The GUI shell keeps
  its own twenty-word English vocabulary in `src/ui/labels.ts`, composes shapes from it in
  `plane.ts` and `sheet.ts`, and shows a stat by the last segment of its id — and nothing
  under `src/ui` can reach a localizer at all, because the driver publishes `PlayView` and
  nothing else, so the channel is the work rather than the words. `gui-rebuild` owns that
  tree. The command table answers in English through `said()`, and the GUI's console renders
  the same `CommandOutput` the REPL prints. Filed as
  `the-gui-shell-has-its-own-english-vocabulary-and-no-way-to-r` and
  `the-command-layer-answers-in-english-and-the-gui-console-ren`; neither is in this diff,
  and this spec's clauses are graded over what the engine puts on a screen.

## Open questions

None.

## Audit passes

### Pass 1 — 2026-08-14

- base: `cfa1eb692c996ed4414390fa5cb492741856a0f2`
- head: `7ad6f3accaf9fcfe4b6e35bc6d19b50ac8f34321`
- proof 1: met — An ordinal is a counter reading and nothing else, and the naming rule is proven at
both ends. src/runtime/instances.test.ts "mints an ordinal that does not encode what the copy is
of, and keeps it when that changes" rewrites a live instance's template through the table and the
copy answers to the same ordinal, and the next mint is still 3. src/runtime/carriedName.test.ts
covers the four cases the clause names: a stack is its title, a grown copy is the title under
engine.item.modified, two ordinals of one template are one name, and a language with no title for
the template gives forge.iron-sword#18273 / forge.iron-sword#4. Re-run:
npx vitest run src/runtime/carriedName.test.ts src/runtime/instances.test.ts.
Mutation, mine, not from a manifest this brief wrote: replacing
localizer.identifier(`${template}#${copy}`) in src/runtime/carriedName.ts:15 with
localizer.title(kind, template) is KILLED by "names a copy by its template and its ordinal where
the played language has no title for the template", re-measured at its own file with the mutation
still applied.
- proof 2: met — Proven by enumeration rather than by reading the source, as the clause asks.
src/runtime/modals.test.ts "publishes no value that is a title, an authored line or a locale
entry" walks all four declared modals far enough to publish -- character creation, the inventory
with nothing chosen and with a grown copy chosen, the plane that copy opens, and the sage's
dialogue -- collects every ModalChoice.value, and intersects them with every string the universe
can put on a screen (every declared locale entry in both languages, every base entry, and the two
authored dialogue lines); the intersection is empty in en and in es, over more than ten values.
"publishes the same values in every language, so a recording replays in each" asserts the two
value lists are identical. The engine's own are ids: grow/equip/unequip/destroy, close, go-ahead,
back, human/elf/dwarf/orc, and a dialogue answer is String(choice.index). distinct() is gone from
src/runtime/carriedScreen.ts (it is present at cfa1eb69:src/runtime/carriedScreen.ts:106 and
nowhere at HEAD). Re-run: npx vitest run src/runtime/modals.test.ts. Two mutations of mine, both
KILLED and re-measured with the mutation still applied: value: String(choice.index) ->
value: choice.text in src/runtime/modals.ts:126 (10 of 38 failed), and
value: entry.id -> value: entry.shown in src/runtime/carriedScreen.ts:154 (11 of 38 failed).
- proof 3: unmet — The named half is met and mutation-proven: PlaneFrame.said is a Said, isSaid checks
its key against the closed union, and src/runtime/planeScreen.test.ts "a frame carries a key, not
a sentence" writes a refusal in each language and renders it in the other, both directions
(Modified Blade at 1,0 -- position 1 of 1,0 costs a point and none remain / Hoja modificada en 1,0
and posicion 1 de 1,0 cuesta un punto y no queda ninguno), with the stored value asserted to be
{engine, params} and equal across the two writers. Two mutations of mine are KILLED there:
dropping growth.refused from the frame planeSubmit returns, and collapsing the copy arm of
say() to the template id.
The clause's own first sentence is what fails. "No save field holds text the engine composed" is
false for activeAction.actionLabel and for activeAction.roster[].actionLabel: a walk under way
saves as "actionLabel":"Travel to Far Beach", composed by src/runtime/actions.ts:56 out of a
location's title, and src/runtime/save.ts:141 re-derives it and compares string equality, so a
rename of the English title alone stops the saved walk. Re-run, via the repo's own resolution:
npm run inspect -- - with a body that starts a session on a two-location island titled "Far
Beach", begins a travel, serializes, then reopens flags/activeAction/journey against the same
island retitled "Distant Beach" and calls pruneStateForRegistry. Unchanged title: no warnings,
still walking. Renamed title: ["Stopped unavailable action travel.isla.shore>isla.far.Travel to
Far Beach: unknown action \"Travel to Far Beach\" on travel.isla.shore>isla.far."] and the action
is gone. That is the Deliverable's own headline -- "no rename of an English title can change what
a recording replays" -- falsified on a shipped surface, and it is the same root cause the Goal
names rather than a new one.
- proof 4: unmet — The structural half holds and is strong: Localized is a branded type, every
player-visible field is branded, the only three doors into it are engine() over the closed union,
prose() and identifier(), and src/runtime/localized.test.ts "the brand is closed (c1)" keeps
asLocalized out of src. prose() has exactly four call sites, all DSL-authored text
(dialogue-runtime.ts:53, :73, effects.ts:205, modals.ts:126), and the sentence-scan allowlist is
two action labels and nothing else. Every log push in src/runtime is keyed.
What fails is the first sentence, through identifier(). src/runtime/actions.ts:54 builds
`unknown travel destination: ${destId}` as a bare template literal with no key;
src/runtime/save.ts:137 relays that RuntimeError's message into a PruneWarning through
localizer.identifier, and save.ts:275 pushes every warning into state.log. Re-run: npm run
inspect -- - loading engine-en plus a one-location module declaring language: es,
with a # locale es entry for engine.prune.action, then setting
activeAction.ownerRef = 'travel.isla.shore>isla.gone' and calling pruneStateForRegistry. The
Spanish session's log line is "Detenida la accion travel.isla.shore>isla.gone.Travel to Gone:
unknown travel destination: isla.gone." -- an English sentence built in TypeScript, on a screen,
in a language that is not English. The sentence scan cannot see it because it has no key to
match against, which is the shape of hole the scan is blind to by construction.
- proof 5: met — src/runtime/translationSurvival.test.ts loads the shipped universe (engine-en plus
tutorial-island) and then reloads it with translationOf() layered on: a # locale module giving
every key the universe can address -- every ENGINE_KEYS entry and every locales.addressable
content key -- a Caesar-shifted replacement in the base language and in zz, two different shifts
so the two languages differ from the English and from each other. Four gate tests assert the
replacement is total (every key declared in both languages; no key still reading its authored
English except engine.carried.worn, which is "{item} ({slot})" and has no word to replace; the two
languages differ for every worded key; and a shipped title no longer says what it said). All six
shipped # test sections are then replayed in both languages: 16 tests, all passing. Re-run:
npx vitest run src/runtime/translationSurvival.test.ts. Two mutations of mine, both KILLED and
re-measured at their own file: collapsing the zz shift to 13 so the two languages agree, and
dropping locales.addressable from everyKey so only engine patterns are replaced.
- proof 6: unmet — Everything the clause promises about behaviour holds and is checkable: SAVE_VERSION
is 10, the six # save fixtures carry only the version bump, no fixture's instances or equipment
moved, "race":"Elf" became "race":"elf", the submit-modal: values in
growing-through-the-inventory-screen became ids, and npm run tasks -- merge-ready is green on
every behavioural leg (tsc, npm test, layer-check, audit-status, doctor, bytes, tree, base) with
only "clauses what-is-stored-or-replayed-is-an-id has no recorded audit pass" outstanding, which
is this pass. The visible English is unmoved: Grow, Equip, Unequip, Destroy, Close, Go ahead,
Go to {hex}, Back to inventory and slot:/allocate:/feed: read at cfa1eb69 exactly as
content/engine-en.dsl now spells them.
"named here in full" is what fails. A third authored thing moved and is not named:
content/tutorial-island.dsl:689 in # test tutorial-quest-given went from
"choose: Sounds good. Teach me." to "choose: 0". That is a choose: directive, not a submit-modal:,
and the Decisions block states as settled fact that "no shipped # test answers a dialogue choice,
so nothing authored moves" -- which git show cfa1eb69:content/tutorial-island.dsl:688 refutes.
Re-run: git diff cfa1eb69..HEAD -- content/tutorial-island.dsl.

### Pass 2 — 2026-08-14

- base: `cfa1eb692c996ed4414390fa5cb492741856a0f2`
- head: `c76a0afe2b8597747c0a5242ea487638f7b16b75`
- proof 1: met — Both halves broken and watched. Mutation 1, mine, at
src/runtime/instances.ts:90: `const id = String(table.next);` -> `const id =
`${template}.${table.next}`;` — the per-template form the Decisions reject by name — is
KILLED by src/runtime/instances.test.ts "mints an ordinal that does not encode what the copy
is of, and keeps it when that changes" and three more in that file, re-measured at
src/runtime/instances.test.ts with the mutation still applied. Mutation 2, at
src/runtime/carriedName.ts:15: localizer.identifier(`${template}#${copy}`) ->
localizer.identifier(template) is KILLED by src/runtime/carriedName.test.ts "names a copy by
its template and its ordinal where the played language has no title for the template",
re-measured at its own file. distinct() is still absent from src/runtime/carriedScreen.ts, so
two copies of one template stay named alike and nothing repairs it. Re-run:
npm run mutate -- C:\Users\yonat\AppData\Local\Temp\audit-what-is-stored-or-replayed-is-an-id-pass2-mutations.json
(entries c1-the-ordinal-encodes-what-the-copy-is-of, c1-the-no-locale-fallback-drops-the-ordinal).
- proof 2: met — The property holds and is watched, though not everywhere the clause's own
enumeration claims. Every value published by the four declared modals is an id, by source:
RACES' human/elf/dwarf/orc (src/runtime/modals.ts:82-87), carriedScreen's entry.id / verb.value
/ LEAVE / CONFIRMED, planeScreen's `<verb>: <tail>` over directions, hexagons and item ids plus
BACK, and String(choice.index) for a dialogue. Mutation, mine, at src/runtime/modals.ts:83:
{ value: 'human' } -> { value: 'Human' } is KILLED by src/runtime/modals.test.ts "publishes no
value that is a title, an authored line or a locale entry", re-measured at its own file, as is
carriedScreen.ts:154 entry.id -> entry.shown. Re-run: npm run mutate --
C:\Users\yonat\AppData\Local\Temp\audit-what-is-stored-or-replayed-is-an-id-pass2-mutations-b.json.
The caveat is filed as a finding rather than as a grade: that same named test SURVIVES a value
that embeds words instead of being them — planeScreen.ts:95 `${slot.direction} with ${jewel.id}`
rewritten to `${slot.direction} with ${jewel.name}`, which is pass 4's own reproduction — and so
does the whole of modals.test.ts. It is caught, but by scripts/drift.test.ts, src/runtime/integration.test.ts,
src/runtime/planeScreen.test.ts "spells the id of the item an argument points at, and never its
title" and src/runtime/translationSurvival.test.ts, i.e. by the shipped recordings rather than by
the enumeration the clause names.
- proof 3: met — The named half is met and mutation-proven at both ends. PlaneFrame.said is a Said,
isSaid checks its key against the closed union, and src/runtime/planeScreen.test.ts "renders a
frame written by one player in the language of the other, both directions" writes the refusal in
each language and reads it in the other. Mutation, mine, at src/runtime/planeScreen.ts:152:
planeFrame(frame.target, frame.hex, growth.refused) -> planeFrame(frame.target, frame.hex,
{ id: say(localizerOf(registry, state), growth.refused) }) — the frame storing the rendered
sentence rather than the key — is KILLED by that test, re-measured at its own file. Pass 1's
headline is closed and re-proven: src/runtime/actions.ts:68 `label: TRAVEL_LABEL` ->
`label: `Travel to ${registry.locations.get(destId)!.title}`` is KILLED by three tests in
src/runtime/save.test.ts, re-measured at their own file.
I grade this met against a boundary I am stating rather than against the clause's first sentence
as written, because that sentence is still false and this is the seventh pass to trip over the
same wording. `activeAction.actionLabel` holds `Craft Bake Bread` for a craft under way — text
src/content/registry.ts:146 composed, in a save field. The rule that actually holds, and the one
the Deliverable's headline asks for, is that no save field holds text that MOVES when words move:
that label is `Craft ${humanizeEn(recipe.id)}`, derived from the id, so no translation and no
title rename can touch it, and the walk-stopping defect pass 1 found cannot recur through it. A
longer exclusion list would be worse than the stated boundary. The one place that label does harm
is that it reaches a player's screen, which is c4's sentence and not this one, and it is filed
there. Re-run of the stored label:
npm run inspect -- - < C:\Users\yonat\AppData\Local\Temp\audit-what-is-stored-or-replayed-is-an-id-pass2-craft.ts
- proof 4: unmet — The structural half holds and is strong, and I broke it twice to check. Localized is
a branded type; the three doors are engine() over the closed union, prose() and identifier();
prose() has exactly the four DSL-authored call sites the clause allows (dialogue-runtime.ts:53,
:73, effects.ts:205, modals.ts:124); the sentence-scan allowlist is one entry. Mutation, mine, at
src/runtime/actions.ts:58, putting pass 1's own diagnostic back as a bare template literal
(`localizer.identifier(`unknown travel destination: ${destId}`)`), is KILLED by
src/runtime/localized.test.ts "leaves no engine sentence behind in TypeScript"; collapsing the
prose door (localized.ts:92 -> `prose: (text) => text as Localized`) is KILLED by "stays shut for
a player of another one, however the locale modules are written". Both re-measured at their own
file.
The first sentence is what fails, on the surface the allowlist entry names. src/content/registry.ts:146
compiles a recipe's action as `label: `Craft ${humanizeEn(recipe.id)}``, and that string is not an
identifier that stays off screens: src/runtime/save.ts:209 builds `${ownerRef}.${actionLabel}` and
puts it through engine.prune.action, and save.ts:140 puts it through engine.action.stale.action.
Reproduced against the repo's own resolution — a Spanish session with a craft under way, reopened
against a registry whose recipe id has moved — the log line is
`Detenida la accion recipe.kitchen.bake-bread.Craft Bake Bread.`: an engine sentence built in
TypeScript, on a screen, in a language that is not English. That is pass 1's M1 finding on its
next neighbour; the fix reached travel and not craft, and the justification written beside the
allowlist in src/runtime/localized.test.ts:80-84 ("a compiled one stays English in TypeScript
while its display is keyed") is false for exactly these two call sites. Re-run:
npm run inspect -- - < C:\Users\yonat\AppData\Local\Temp\audit-what-is-stored-or-replayed-is-an-id-pass2-craftwarn.ts
- proof 5: met — src/runtime/translationSurvival.test.ts loads the shipped universe and reloads it
with translationOf() layered on, then replays all six shipped `# test` sections in the base
language and in zz: 16 tests, all passing. Two mutations of mine, both KILLED and re-measured at
src/runtime/translationSurvival.test.ts. First, src/content/translation.ts:14 SHIFT en 13 -> 0, so
the editor's side keeps the English a recording was written beside — killed by "leaves no key
reading the English it was authored in" and "says nothing a shipped title says". Second,
src/runtime/modals.ts:281 `choice.value === value` -> `choice.shown === value`, which makes an
answer depend on the words it is offered as — killed by six of the replays by name, including
test "tutorial-island.growing-through-the-inventory-screen". That second one is the clause's own
property: a recording that depended on words would stop replaying, and the suite says so. Re-run:
npm run mutate -- C:\Users\yonat\AppData\Local\Temp\audit-what-is-stored-or-replayed-is-an-id-pass2-mutations.json
(entries c5-the-base-language-keeps-the-english-a-test-was-written-beside,
c5-an-answer-is-matched-against-the-words-it-is-offered-as).
- proof 6: met — The enumeration pass 1 found short is now complete, checked against git rather than
against the prose. `git diff cfa1eb69..c76a0af -- content/` touches two files and nothing else:
content/engine-en.dsl, which has zero deleted lines over the whole range (that same diff narrowed
to content/engine-en.dsl and grepped for removals is empty), so no shipped English moved; and
content/tutorial-island.dsl, whose entire diff is the three things c6 names — the submit-modal:
values in growing-through-the-inventory-screen, the one `choose:` line at :689, and
`"race":"Elf"` -> `"race":"elf"` — plus the {"version":9} -> {"version":10} stamp on all six
`# save` fixtures, which is the SAVE_VERSION move the clause opens with. No fixture's instances or
equipped bytes moved. No save field name moved: the SAVE_FIELDS keys at cfa1eb69 and at HEAD are
the same seventeen in the same order. SAVE_VERSION is 10, and breaking it (save.ts:15, 10 -> 9) is
KILLED by scripts/migrate-saves.test.ts, src/runtime/integration.test.ts and
src/runtime/translationSurvival.test.ts, re-measured at their own files. `npm run tasks --
merge-ready` is green on every behavioural leg — tsc, npm test, layer-check, audit-status, doctor,
bytes, tree, base — with only this spec's own clause and member legs outstanding, which is this
pass. One understatement I am recording rather than filing: c6 says the version moves "for
PlaneFrame.said's new shape", and it also had to move because a saved modal frame's answers changed
domain (`race` is `elf`, a carried answer is an id). Every authored consequence of that is named;
only the stated reason is short.

### Pass 3 — 2026-08-14

- base: `cfa1eb692c996ed4414390fa5cb492741856a0f2`
- head: `fd9309e1a11b830c1ad9840e5d8196baaadeadda`
- proof 1: met — Unchanged since pass 2 and re-proven rather than carried over. Both halves broken and
watched. Mutation c1-the-ordinal-encodes-what-the-copy-is-of at src/runtime/instances.ts:90,
`const id = String(table.next);` to `const id = `${template}.${table.next}`;` (the per-template
form the Decisions reject by name), is KILLED by src/runtime/instances.test.ts "mints an ordinal
that does not encode what the copy is of, and keeps it when that changes" and three more in that
file, re-measured at src/runtime/instances.test.ts with the mutation still applied. Mutation
c1-the-no-locale-fallback-drops-the-ordinal at src/runtime/carriedName.ts:15,
localizer.identifier(`${template}#${copy}`) to localizer.identifier(template), is KILLED by
src/runtime/carriedName.test.ts "names a copy by its template and its ordinal where the played
language has no title for the template", re-measured at its own file. distinct() is still absent
from src/runtime/carriedScreen.ts, so two copies of one template stay named alike and nothing
repairs it. Re-run: npm run mutate --
C:\Users\yonat\AppData\Local\Temp\audit-what-is-stored-or-replayed-is-an-id-pass3-mutations.json
(entries c1-the-ordinal-encodes-what-the-copy-is-of, c1-the-no-locale-fallback-drops-the-ordinal).
- proof 2: met — Pass 2's caveat is closed and I broke the same line to check. The enumeration in
src/runtime/modals.test.ts "publishes no value that is a title, an authored line or a locale
entry" now tests containment rather than equality, and the walk was extended with a second
cluster jewel, a save fixture that stocks it and an `allocate: slot e` step so that the two verbs
whose values embed a carried id are published at all; the test asserts that they are, per
language, before it asserts nothing holds a word. Mutation
c2-a-slot-value-embeds-the-jewels-title-instead-of-its-id at src/runtime/planeScreen.ts:95,
`${slot.direction} with ${jewel.id}` to `${slot.direction} with ${jewel.name}` (the reproduction
that SURVIVED this same named test at pass 2) is now KILLED by it, re-measured at
src/runtime/modals.test.ts with the mutation still applied. So is
c2-a-feed-value-embeds-the-foods-title-instead-of-its-id at planeScreen.ts:110,
`with ${food.id}` to `with ${food.name}`. The engine's own values are ids by source:
human/elf/dwarf/orc (modals.ts:82-87), entry.id / verb.value / LEAVE / CONFIRMED in
carriedScreen.ts, `<verb>: <tail>` over directions, hexagons and item ids plus BACK in
planeScreen.ts, and String(choice.index) for a dialogue. distinct() is gone from
src/runtime/carriedScreen.ts. Re-run: npm run mutate --
C:\Users\yonat\AppData\Local\Temp\audit-what-is-stored-or-replayed-is-an-id-pass3-mutations.json
(entries c2-a-slot-value-embeds-the-jewels-title-instead-of-its-id,
c2-a-feed-value-embeds-the-foods-title-instead-of-its-id). One caveat filed rather than graded:
the walk hand-lists the four modals it visits and is tied to nothing, so a fifth declared modal
would leave the clause unproven silently.
- proof 3: met — Pass 2's stated boundary is withdrawn and the clause's first sentence is now literally
true of engine-composed text. PlaneFrame.said is a Said, isSaid checks its key against the closed
union, and src/runtime/planeScreen.test.ts "renders a frame written by one player in the language
of the other, both directions" writes the refusal in each language and reads it in the other;
mutation c3-a-frame-stores-the-sentence-instead-of-the-key at src/runtime/planeScreen.ts:152,
planeFrame(frame.target, frame.hex, growth.refused) to planeFrame(frame.target, frame.hex,
{ id: say(localizerOf(registry, state), growth.refused) }), is KILLED by it and re-measured at its
own file. Both compiled labels are ids and both are watched: mutation
c3-a-craft-is-labelled-by-the-sentence-a-player-reads at src/content/registry.ts:145, label:
CRAFT_LABEL back to the composed `Craft ${humanizeEn(recipe.id)}`, is KILLED by
src/runtime/save.test.ts "stores an id rather than the sentence a player reads", and
c4-a-walk-is-labelled-by-its-destinations-title at src/runtime/actions.ts:68 is KILLED by three
tests in the same file, both re-measured there. I checked the remaining save fields by hand: the
only one still holding words is activeAction.actionLabel for an action an author declared with a
`title:` line, which the engine did not compose but which is a display string doing an
identifier's job. Reproduced and filed as a finding rather than graded here, because the clause's
sentence is about text the engine composed. Re-run: npm run mutate --
C:\Users\yonat\AppData\Local\Temp\audit-what-is-stored-or-replayed-is-an-id-pass3-mutations.json
(entries c3-a-frame-stores-the-sentence-instead-of-the-key,
c3-a-craft-is-labelled-by-the-sentence-a-player-reads,
c4-a-walk-is-labelled-by-its-destinations-title).
- proof 4: met — Pass 2's one failure is closed at its source rather than allowlisted. The compiled
recipe action is `label: CRAFT_LABEL` where CRAFT_LABEL is 'craft' (src/content/registry.ts:127
and :145), the IDENTIFIERS allowlist in src/runtime/localized.test.ts is deleted, and the scan now
asserts offenders equals the empty array. Two mutations put an engine sentence back into
TypeScript and both are KILLED by src/runtime/localized.test.ts "leaves no engine sentence behind
in TypeScript", re-measured at that file with the mutation still applied:
c4-the-craft-label-reaches-a-translated-log-as-english (registry.ts:145 back to the composed
Craft label) and c4-an-engine-sentence-is-built-in-typescript-again (actions.ts:54 back to the
bare `unknown travel destination: ${destId}` template literal). The behavioural half is proven
separately: src/runtime/save.test.ts "says the craft is gone with no word the played language did
not supply" asserts the Spanish log line is 'Detenida la accion recipe.cocina.pan.craft: no hay
ningun recipe cocina.pan..', where pass 2 measured 'Detenida la accion recipe.cocina.pan.Craft
Bake Bread.'. The structural half I re-checked independently of the scan, which is blind by
construction to a sentence that has no key: Localized is a branded type, `as Localized` appears in
no file but localized.ts, localizedFixture is imported by no file in src, and the three doors are
engine() over the closed union, prose() and identifier(). prose() has exactly four call sites and
all four carry DSL-authored text (dialogue-runtime.ts:53 and :73, effects.ts:205, modals.ts:124);
every one of the fourteen log pushes in src/runtime goes through engine() or prose(); every
identifier() call site in src passes an id, a slot, a hexagon, a path or an ordinal; and the
growth, plane and cluster refusals are all Said values built with says() over the union
(itemInstance.ts:238-326, clusterEffect.ts:78-89). Re-run: npx vitest run
src/runtime/localized.test.ts src/runtime/save.test.ts, and npm run mutate --
C:\Users\yonat\AppData\Local\Temp\audit-what-is-stored-or-replayed-is-an-id-pass3-mutations.json
(entries c4-the-craft-label-reaches-a-translated-log-as-english,
c4-an-engine-sentence-is-built-in-typescript-again).
- proof 5: met — Unchanged since pass 2 and re-proven. src/runtime/translationSurvival.test.ts loads the
shipped universe (engine-en plus tutorial-island) and reloads it with translationOf() layered on,
then replays all six shipped recordings in the base language and in zz: 16 tests, all passing. Two
mutations, both KILLED and re-measured at src/runtime/translationSurvival.test.ts with the
mutation still applied. c5-the-base-language-keeps-the-english-a-test-was-written-beside at
src/content/translation.ts:14, the en shift 13 to 0, is killed by "leaves no key reading the
English it was authored in" and "says nothing a shipped title says".
c5-an-answer-is-matched-against-the-words-it-is-offered-as at src/runtime/modals.ts:281,
`choice.value === value` to `choice.shown === value`, is killed by six replays by name including
test "tutorial-island.growing-through-the-inventory-screen", which is the clause's own property: a
recording that depended on words stops replaying and the suite says so. Re-run: npx vitest run
src/runtime/translationSurvival.test.ts, and npm run mutate --
C:\Users\yonat\AppData\Local\Temp\audit-what-is-stored-or-replayed-is-an-id-pass3-mutations.json
(entries c5-the-base-language-keeps-the-english-a-test-was-written-beside,
c5-an-answer-is-matched-against-the-words-it-is-offered-as).
- proof 6: met — Checked against git over the whole range rather than against the prose, and re-checked
over pass 2's head to HEAD for anything the craft-label fix moved. A diffstat of
cfa1eb69..fd9309e over content/ touches two files: content/engine-en.dsl, whose diff has zero
deleted lines,
so no shipped English moved; and content/tutorial-island.dsl, whose entire diff is the three
things the clause names (the submit-modal: values in growing-through-the-inventory-screen, the one
choose: line at :689, and "race":"Elf" becoming "race":"elf") plus the version 9 to 10 stamp on
all six save fixtures. No fixture's instances or equipped bytes moved. `git diff
c76a0af..fd9309e -- content/` is empty, so the craft-label fix moved no authored content at all.
SAVE_VERSION is 10 and breaking it (save.ts:15, 10 to 9) is KILLED by
scripts/migrate-saves.test.ts, src/runtime/integration.test.ts and
src/runtime/translationSurvival.test.ts, re-measured at their own files (mutation
c6-save-version-did-not-move). `npm run tasks -- merge-ready` is green on every behavioural leg
(tsc, npm test, layer-check, audit-status, doctor, bytes, tree, base), on both spec legs and on
reimplement-localization's clauses leg, with only this spec's own clauses leg outstanding, which
is this pass. Two movements I record rather than file, both inside what the clause allows: the
compiled recipe label moved from "Craft Bake Bread" to "craft", which changes the English a prune
warning names, but that string was never keyed and moving it is the c4 defect being fixed rather
than shipped display text; and the DSL cadence diagnostic moved from `# recipe dig action "Craft
Dig"` to `# recipe dig action "craft"` (src/content/parse.test.ts:450), which is author-facing and
still names the recipe.
