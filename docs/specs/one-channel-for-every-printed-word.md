# one-channel-for-every-printed-word

## Deliverable

`reimplement-localization` made rendering raw text a compile error and its audits proved that, nine
clauses over seven passes. What it proved is narrower than what it is remembered as, and the
difference is this spec. Its c1 enumerates the fields it covers — "choice labels and details, view
titles and descriptions, `state.log`, and `PruneWarning`'s message" — and every pass graded the
enumeration. The universal reading was never delivered, and pass 6 said so in as many words. This
branch delivers it: every piece of text a person reads from this project comes from the localizer,
and the rule that says so is derived rather than listed.

Three measurements, taken while scoping this branch:

- `grep -c Localized` over non-test `src/ui` and `scripts` returns **0**. The brand stops at the
  runtime layer boundary. Every consumer above it takes a plain `string`, so a localized value is
  laundered back into an ordinary one the moment it crosses — `src/ui/transcript.ts:10` is where the
  whole app's log column loses it.
- The compile-failure fixture at `src/runtime/localized.test.ts:28` is **sixteen hand-written
  `@ts-expect-error` lines**. It is a list, not a rule. Seven fields the branch branded are absent
  from it, and reverting any of the seven to `string` leaves `tsc` and the suite green.
- `Localizer.identifier()` (`src/runtime/localized.ts:65`, thirty call sites) is an unconditional
  `string → Localized` cast. Every call today genuinely passes an id; nothing but convention says so,
  and pass 5 measured the abuse when `"Back to inventory"` went through it.

So a new player-visible field typed `string` compiles, and nothing anywhere goes red. That is the
gap, and it is not adversarial: nobody is trying to smuggle prose in. There simply has to be a
supported way for any part of this codebase to print text, and one channel rather than a per-layer
answer is what stops the next surface inventing its own.

The store already held most of this. Findings filed by earlier auditors describe it from several
directions — `the-command-layer-answers-in-english-and-the-gui-console-ren`,
`the-gui-shell-has-its-own-english-vocabulary-and-no-way-to-r`,
`a-cluster-plane-refuses-in-strings-no-locale-can-reach`,
`authored-prose-reaches-the-log-with-no-key-to-translate-it-b` and
`one-action-a-dozen-entities-bring-is-a-dozen-locale-keys-wit`. This spec is the single seam under
that list rather than five separate repairs.

Proof:

- [c1] **The rule is derived, not listed.** One test walks the published surface types transitively
  from a named set of roots and fails on any `string`-typed field that is neither `Localized` nor
  declared an answer under c2. Adding a player-visible field without branding it fails that test
  with nobody editing it, which is the property the sixteen `@ts-expect-error` lines could not have.
  Those lines retire, and the seven fields they never reached are covered by construction. The root
  set is the one hand-maintained thing that remains, and it is named in the test with the reason.
  proof: vitest src/runtime/published.test.ts
- [c2] **An answer is declared where it is built, not judged where it is read.** The values a
  `# test` replays — a race, an item id, a directive tail, a typed name, a dialogue index — are
  declared as answers in one place, and that declaration is what c1 checks against. `submit-modal:`
  keeps recording the value and never the index: `ModalOption.values` is `null` for free text so
  there is no list to index, and an item id indexes a list whose order depends on what the player
  picked up, so a recorded index selects a different object once the list moves and the recording
  still passes.
  proof: vitest src/runtime/modals.test.ts
- [c3] **The shell reads its words from the same localizer as the engine.** Every word `src/ui` puts
  on a screen comes from a key: `src/ui/labels.ts`'s twenty English words become engine keys, and
  the shapes in `src/ui/plane.ts` and `src/ui/sheet.ts` that spell their own go the same way. The
  standing rule that a driver may name a control after the engine value it acts on and may invent no
  word for the acting is unchanged — this gives that rule a channel instead of a convention.
  proof: vitest src/ui/render.test.tsx
- [c4] **The command layer answers in keys.** `CommandOutput`'s message arm carries a `Localized`
  rather than a `string`, and every `said()` call site and every `RuntimeError` message `refused()`
  relays comes from a key. The authoring-tool messages are separated from the player's rather than
  laundered together: which of the two a reader is looking at is a fact the type carries, since
  `scripts/drift.test.ts` holds the GUI's transcript equal to the REPL's and both render this arm.
  proof: vitest src/runtime/command.test.ts
- [c5] **The REPL invents no word either.** `scripts/play-cli.ts` and `scripts/planeView.ts` print
  no English of their own. `scripts` sits above `runtime` in the layer order and may import it, so
  there is no obstacle but habit, and leaving it out would localize the two drivers to different
  degrees — which is the fragmentation this spec exists to end.
  proof: vitest scripts/play-cli.test.ts
- [c6] **Authored prose carries a key.** A `say:` result and a dialogue line are addressable, keyed
  by their owner's key and their index within it, so a `# locale` can translate them and the prose
  door stops being the one text no translator can reach. Reordering the `say:` lines under one owner
  moves their keys, and the recordings that name them are re-authored; that is accepted rather than
  designed around, because an index is the only address a line with no id has.
  proof: vitest src/content/locale.test.ts
- [c7] **An action's display is keyed on its declaration, once.** An action a `use:` brings reads its
  display from the key its declaration owns, so declaring `# action melee-combat` once yields one
  key however many owners perform it. Today `recordActionText` keys per owner and takes the
  namespace and language from the owner while the label came from the declaration, so an English
  action used by an entity in a module declaring another language renders its raw key to a player of
  either one, with no `# locale` line able to repair it.
  proof: vitest src/content/locale.test.ts
- [c8] **What does not change is stated and proven.** Every `# test` over the shipped content passes,
  `scripts/drift.test.ts` still holds the two drivers' transcripts equal entry by entry, and no save
  field, `SAVE_VERSION` or authored content id moves. Three things a reader sees do move, and they
  are the whole list: the `say:` and dialogue keys of c6; a stat's spelling under c9, where
  `+3 attack` becomes `+3 Attack` on the character sheet and the plane pane; and under c10 every id
  a surface still draws as a word, which is a skill's on the character sheet and a declared slot's
  on the equipment page. Nothing else player-visible moves.
  proof: npm test
- [c10] **No surface draws an id where a player expects a word, and the rule can see it.** Every
  remaining one goes, not a named few: a skill on the character sheet, an equipment slot on the
  equipment page, and any other the enforcement below turns up. A slot gets the declaration it
  lacks — `# slot <id>` with a `title:`, and `slot: ['title']` joining `stat` and `skill` in
  `TEXT_FIELDS` — while `equipment-slots:` goes on naming ids; the declaration is optional, so no
  content that loads today stops loading. A slot is declared once and keyed once, because
  `declaredSlots` unions `equipmentSlots` across every entity into one vocabulary
  (`src/content/references.ts:44`), so a title on the entity's own field would give one slot as many
  keys as it has declarers — the defect c7 removes for actions. A skill needs no new declaration:
  `skill: ['title']` is already in `TEXT_FIELDS` and only the publishing and the reading are missing.

  The enforcement is the half that keeps this closed. `published()` in `src/ui/render.test.tsx`
  stops offering raw ids as permissible screen text — today it passes `Object.keys(view.xp)`,
  `Object.keys(view.equipment)` and `place.id`, which is a licence to draw an identifier — and the
  walk that rule runs over visits the pages that draw them. Measured 2026-08-14: deleting all three
  id entries leaves every test in that file passing, because the walk never opens the Skills,
  Equipment or Map pages, so the one rule in this repository that says a driver may invent no word
  has never looked at three of its screens.
  proof: vitest src/ui/render.test.tsx
- [c9] **A stat is read by its title, not by its id.** The view publishes a stat's localized title
  beside the dictionary keyed by its id, and the character sheet and the plane pane read it, so
  `bare(statId)` stops putting an identifier in front of a player. Today `src/ui/plane.ts:68` and
  `src/ui/sheet.ts:43-44` render the raw id, which is the one surface where a player of any language
  reads an identifier where every other surface reads a title.
  proof: vitest src/ui/sheet.test.ts

## Goal

Every piece of text a person reads from this project comes from the localizer, and the rule that
says so is derived rather than listed — so the surface written next month is covered by the same
sentence as the surface written today, with nobody having to remember it.

## Decisions

- **The check is derived from the types, and the root set is the residue.** A list of fields was
  tried and is what this spec replaces: it went stale within one release, missing seven fields while
  reading as though it covered everything. Walking the published types transitively means a new
  *field* is free; a new *root* is not, and that is the honest remainder rather than a claim to have
  eliminated maintenance. The roots are few, change rarely, and adding one is a visible line.
- **`identifier()` keeps its door open, and c1 is why that is safe.** Narrowing it to a type that
  proves a string is an id was considered and rejected: an instance id, a slot and a save path are
  all genuinely strings, and a wrapper around each would be ceremony that moves the same convention
  one level down. What made the door dangerous was that nothing downstream of it was checked; with
  every published field checked by construction, an abuse of `identifier()` has to be written into a
  field that c1 already covers.
- **Answers are declared, not exempted.** The alternative — an allowlist of field names c1 skips —
  makes the exception a property of the test, which is where it drifts from the code. Declaring an
  answer where it is built keeps the rule "enforce where a value is assembled", and it means the
  question "is this words or a protocol?" is answered once by the person who knows.
- **The recorded modal answer stays the value, and the record that called it a TypeScript constant
  is corrected here.** Every `submit-modal:` the shipped content records is a content id, an engine
  verb, a directive tail or typed free text — a protocol, not prose — so the 2026-08-14 decision on
  `content/engine-en.dsl` was right in substance and wrong in wording, and the wording is what
  invites this to be re-litigated. Recording the index instead was raised by the author and is
  refused for the two reasons c2 states. The drivers continue to *answer* by index, which is a
  different question and is already settled by `crafting-modal`'s ruling.
- **`src/ui` is in scope because `gui-rebuild` is done.** CLAUDE.md said `src/ui` was pending that
  rebuild and that the `window.__test` harness needed reintroducing; both were stale, the spec
  closed with seven passes and no clause outstanding, and the harness is live at
  `src/ui/agent/testHarness.ts`. Corrected on this branch. Had the line stood, this spec would have
  deferred work on a finished shell.
- **The findings are the evidence, not the plan.** Each names a surface; this spec names the seam
  under them. `a-modal-option-s-display-is-its-answer-value-so-neither-can-` and
  `a-carried-thing-s-displayed-name-is-assembled-in-code-so-not` are triaged before anything is
  built, because both look closed by `reimplement-localization`'s own passes and this branch has
  already shipped one finding for a defect it had itself fixed.
- **c8 was amended by the author to let a stat's spelling move, and c9 is what moves it.** As first
  written c8 pinned every player-visible English string, and c3's worker found that this forbids
  fixing the one surface where a player reads a raw id: `+3 attack` on the character sheet and the
  plane pane. The two could not both stand. The author ruled for c9 on 2026-08-14, and the reason is
  that the decision had already been taken elsewhere — the 2026-08-14 ruling on `src/content/locale.ts`
  put a stat's title in the missing-translations set precisely because "the GUI rebuild puts a stats
  sheet and a skills list on screen, at which point a translator who skipped them would have been
  asked too late". The view simply never caught up. Shipped stats author no `title:`, so `humanizeEn`
  supplies `Attack` and the English change is a capitalisation. The alternative — authoring lowercase
  `title:` lines to pin the current display — was rejected as baking a display choice into content to
  protect a test. `render.test.tsx`'s c16 note that "a key is what the engine gave and a key is what
  the sheet may draw" is superseded for stats: under c9 the engine gives a title too.
- **Authored prose is in scope, on the author's design.** The earlier reading was that a `say:`
  nested in a result list has no id to key on and so needs a design; the design is that it inherits
  its owner's key and its index. Reordering is a breaking edit to the recordings that name it, and
  that is accepted rather than engineered around.

## Open questions

- Whether the c1 walk is implemented over the TypeScript compiler API or over a narrower structural
  reflection is the worker's call once the region is read; c1 fixes the property, not the mechanism.
  The five-minute rule in CLAUDE.md 6.6 binds it either way.
- Whether the authoring-tool messages of c4 become keys or become a separate arm of `CommandOutput`
  is the worker's call. c4 fixes that the type distinguishes them, not which shape does it.
- Whether an entity that overloads a `use:`d action gets its own display key under c7. The grammar
  rejects a `title:` in an overload block today, so there is no authored English for a second key to
  carry; if that ever changes, the rule needs its named companion.
