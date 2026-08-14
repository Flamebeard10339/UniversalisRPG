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
