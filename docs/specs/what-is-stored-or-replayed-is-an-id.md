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
  to 10 for `PlaneFrame.said`'s new shape. Two authored things move with it and nothing else
  does: the `submit-modal:` values in shipped `# test` sections, and the one `# save` fixture
  carrying `"race":"Elf"`, because a race answer is a stored field and becomes an id with the
  rest. No fixture's instances or equipment moves, since an ordinal is what they already hold.
  No content id, no field name and no player-visible English string moves, every `# test`
  passes, and `npm run tasks -- merge-ready` is green on every behavioural leg.

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
  machinery for a problem nobody has had yet. The index is an id, it satisfies c2 today, and
  no shipped `# test` answers a dialogue choice, so nothing authored moves. Revisit when
  reordering options actually breaks something.
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
