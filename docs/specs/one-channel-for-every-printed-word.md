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
  and fails on any `string`-typed field that is neither `Localized` nor declared an answer under c2.
  Adding a player-visible field without branding it fails that test with nobody editing it, which is
  the property the sixteen `@ts-expect-error` lines could not have. Those lines retire, and the seven
  fields they never reached are covered by construction. The root set is derived too, on the author's
  ruling of 2026-08-14: a hand-written one was shipped first and is corrected here, because a list
  does not grow when the code does and this one had missed eight types. What is hand-maintained is
  what is *not* published, and a type nobody has ruled on is walked rather than skipped.
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
  proof: vitest src/content/locale.test.ts src/runtime/localized.test.ts
- [c8] **What does not change is stated and proven.** Every `# test` over the shipped content passes,
  `scripts/drift.test.ts` still holds the two drivers' transcripts equal entry by entry, and no save
  field, `SAVE_VERSION` or authored content id moves. Three things a reader sees do move, and they
  are the whole list: the `say:` and dialogue keys of c6; a stat's spelling under c9, where
  `+3 attack` becomes `+3 Attack` on the character sheet and the plane pane; and under c10 every id
  a surface still draws as a word, which is a skill's on the character sheet and a declared slot's
  on the equipment page. A fourth moves for a player of a language the line was not authored in,
  and it belongs to c6 rather than being a separate change: `engine.text.untranslated` retires with
  `Localizer.prose`, so where such a player read `(untranslated)` they now read the key — which is
  the whole of what c6 buys, an address a translator can fill. English display is unaffected, which
  is why no test moved. Nothing else player-visible moves.
  **Read over this spec's own work and not over the branch's diff.** The branch carries
  `action-labels-as-members` and `what-is-stored-or-replayed-is-an-id` as well, and between them
  `SAVE_VERSION` goes 9 to 11, `activeAction`'s action field is renamed, `PlaneFrame.said` changes
  shape and four authored lines are respelled. Each is named in that spec's own closing clause and
  none is this one's to answer for: what this clause covers is the channel, which stores nothing
  and respells nothing.
  proof: npm test
- [c10] **An id never reaches a driver alone.** Every published value a driver draws carries its own
  words beside its own id, in one row, so a driver never holds an identifier it has no words for and
  cannot draw one. This is the whole rule and it is enforced by shape rather than by inspection: a
  published field may not be a map keyed by an `Answer`, because a key is not a field and c1's walk
  is structurally blind to it — which is exactly how three of these survived seven audit passes and
  a fourth was about to be found by hand. `PlayStatus.resources` and `.discovered` are already this
  shape and have never needed a decision; `stats`, `xp` and `equipment` are the three that are not,
  and `statTitles` — a second map to be kept in step with the first by hand — is retired rather than
  extended, because CLAUDE.md forbids two systems that must be manually kept in sync and c9 built one.

  A slot is the one id with nowhere to keep its words, so it gets the declaration it lacks:
  `# slot <id>` with a `title:`, and `slot: ['title']` joining `stat` and `skill` in `TEXT_FIELDS`,
  while `equipment-slots:` goes on naming ids. The declaration is optional, so nothing that loads
  today stops loading, and a slot is declared once and keyed once because `declaredSlots` unions
  `equipmentSlots` across every entity into one vocabulary (`src/content/references.ts:44`) — a
  title on the entity's own field would give one slot as many keys as it has declarers, the defect
  c7 removes for actions. A skill needs no declaration: `skill: ['title']` is already in
  `TEXT_FIELDS` and only the publishing and the reading are missing.

  Three enforcements, one per driver and one at the type, because the rule above is only worth what
  notices it. c1's walk refuses a published map keyed by an `Answer`, so the next dictionary is
  caught at the type rather than at an audit. `published()` in `src/ui/render.test.tsx` stops
  offering raw ids as permissible screen text while its walk visits the pages that draw them —
  measured 2026-08-14: deleting the three id entries from it leaves every test in that file passing,
  because the walk never opens the Skills, Equipment or Map pages. And the REPL's own lines are
  walked the way the shell's markup is, by playing one script twice over one universe — the base
  language and `translationOf()` of it — so that every run of letters surviving the change of
  language is a word no locale produced. Four things may leave one standing and every one of them
  derives its own subjects: a bearing out of `DIRECTIONS`, a token the engine itself spelled into
  words it published, the player's own line quoted back, and this clause's own sentence — an id
  drawn where the words published on its row are drawn too. Which of a published field's values are
  ids and which are words is read off the two renderings rather than named, so a field added
  tomorrow is covered unedited. `/state` and the modal banner are exempt by being `ToolLine`s, which
  is c4's `words: 'tool'` discriminant and not a list of strings: they address records and screens
  by the ids the engine stores under, and answer to whoever is driving rather than to a player.
  proof: vitest src/runtime/published.test.ts
  proof: vitest scripts/printedWords.test.ts
- [c9] **A stat is read by its title, not by its id.** The character sheet, the plane pane and the
  REPL read a stat's localized title, so `bare(statId)` stops putting an identifier in front of a
  player. Delivered first as a `statTitles` map published beside `stats`; c10 retires that map and
  carries the title on the stat's own row instead, because a second map kept in step with the first
  by hand is the shape CLAUDE.md forbids. The property this clause asserts is unchanged and c10 is
  where it now lives — recorded here rather than edited away, since the map is what the branch built
  and an auditor reading the diff will find it.
  proof: vitest src/ui/sheet.test.ts

## Goal

Every piece of text a person reads from this project comes from the localizer, and the rule that
says so is derived rather than listed — so the surface written next month is covered by the same
sentence as the surface written today, with nobody having to remember it.

## Decisions

- **The check is derived from the types, and so is the root set.** A list of fields was tried and is
  what this spec replaces: it went stale within one release, missing seven fields while reading as
  though it covered everything. The first attempt at c1 kept a hand-written root set for the same
  reason it had rejected the field list — "the roots are few, change rarely, and adding one is a
  visible line" — and the author refused that on 2026-08-14, on the ground that it is the same shape
  that had just failed twice. "Published" has a mechanical definition: every type `src/ui` or
  `scripts` imports from `src/runtime`, and every type either declares that spells `Localized`.
  Measured against the ten hand-written roots it replaces, the derivation reaches 51 declarations
  where they reached 43, and two of the eight uncovered types held a bare `string` on the published
  surface with nothing red: `CommandResult.recorded` and `Localizer.language`. The residue is now an
  exclusion list of five — a parameter bag, a replay log, the authoring sources, a command handle and
  the command table — and it fails loudly, because a type nobody has ruled on is walked.
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
  The five-minute rule in CLAUDE.md 6.6 binds it either way. Settled: a parse-only walk over
  `ts.createSourceFile`, deriving its own roots from the import graph the same way, whole file under
  a second.
- Whether the authoring-tool messages of c4 become keys or become a separate arm of `CommandOutput`
  is the worker's call. c4 fixes that the type distinguishes them, not which shape does it.
- Whether an entity that overloads a `use:`d action gets its own display key under c7. The grammar
  rejects a `title:` in an overload block today, so there is no authored English for a second key to
  carry; if that ever changes, the rule needs its named companion.

## Audit passes

### Pass 1 — 2026-08-15

- base: `cfa1eb692c996ed4414390fa5cb492741856a0f2`
- head: `e9ae6d48a7956d91b46bf4abe598a4eda582fd57`
- proof 1: met — npx vitest run src/runtime/published.test.ts — 7 tests green over a parse-only walk whose
roots are derived from the import graph (every type src/ui or scripts imports from src/runtime, plus
every type either declares that spells Localized); the sixteen @ts-expect-error lines are gone.
Mutation KILLED: src/runtime/session.ts entities: Array<{ id: Answer; title: Localized; ... }> with
title reverted to string fails "leaves no field on the published surface a bare string" with nobody
editing the test. Mutation KILLED: narrowing derivedRoots' brought.file.startsWith(RUNTIME) to a path
nothing matches fails "derives a root set that reaches the surface both drivers draw", so the
derivation is load-bearing and not decorative. The second half of c1 — which fields are words — is
derived too as of 79016e2: TEXT_FIELDS is Record<SchemaKind, ...> so a kind added to SCHEMAS does not
compile, and locale.test.ts walks SCHEMAS for every field whose parser is text. Mutation KILLED:
event: ['title'] changed to event: [] fails "leaves none unaccounted for", so the empty-list escape
the brief asked about is closed for any kind whose title is { parser: text, default: defaultTitle },
which is all eleven of them. The residual — a words-bearing field parsed by something other than the
text reference — is filed as a low finding; no such field exists today.
- proof 2: met — npx vitest run src/runtime/modals.test.ts. Mutation KILLED: src/runtime/carriedScreen.ts's
carried list built with value: String(at) instead of value: entry.id fails "reaches the same object
from either order, because the value is what was recorded". ModalOption.values is null for free text
(modals.ts:97) so there is no list to index there, and Answer is applied at RACES, LEAVE, CONFIRMED,
PLANE, BACK, CarriedVerb.value and PlaneMove.value — where each is built, which is what c1's walk reads.
- proof 3: met — src/ui/labels.ts holds twenty EngineKeys and no words; wordsOf() is the only door and takes
no text. A scan of every non-test file under src/ui for multi-word English string literals, JSX text
runs and placeholder/aria/title/alt attributes returns nothing. Mutation KILLED: TabBar's
{words(tab.id)} changed to {'Journal'} fails both walk tests in src/ui/render.test.tsx with
"Journal" is on the screen and no engine value produced it. The walk is genuine: Pager and VStack
render every subpage of every layer into one strip, so renderToStaticMarkup(<App/>) really does contain
the Skills, Equipment and Map markup. Filed as a medium finding: the walk runs in one language and
SHELL_WORDS is derived from wordsOf() itself, so a component spelling one of the twenty English labels
literally would pass.
- proof 4: met — npx vitest run src/runtime/command.test.ts. PlayerMessage carries text: Localized and
ToolMessage text: string, discriminated by words, and the three raw-DSL arms (help, source, authored)
declare words: 'tool' — which src/runtime/published.test.ts reads rather than restates.
Mutation KILLED: said() publishing { words: 'tool', text: text as string } fails "moves every player
message with the language and no authoring message, over the whole table", a sweep of every COMMANDS
entry twice through two universes that derives its own subjects. Filed as a low finding: the clause
says every RuntimeError message refused() relays comes from a key, and what was built relays all of
them as the tool speaking — including engine.action.stale.owner/action, which are keyed and localized
and then published as words: 'tool'.
- proof 5: met — A literal scan of scripts/play-cli.ts and scripts/planeView.ts finds no player-facing
English of their own: what English is left is argv usage (console.error), the "Disabled module:"
load-diagnostic prefix and formatHelp's command table, all ToolLine, which is the split recorded in
60a847b. planeView.ts declares PlaneLines = readonly Localized[] so a string[] return would be red.
Mutation KILLED: replacing formatView's engine.repl.clock line with an invented English sentence
fails scripts/play-cli.test.ts. But that kill is an enumeration, and the state is all that holds:
three mutations SURVIVED the whole 3094-test suite — (a) ADDING a new English line to formatView that
no assertion pins, (b) an "as Localized" cast in scripts/planeView.ts, (c) an engine pattern's English
("Back to inventory") spelled out verbatim in scripts/planeView.ts. Each is caught for src/ and for
nothing else, because localized.test.ts's "the brand is closed (c1)" and "leaves no engine sentence
behind in TypeScript" both walk sourceFiles('src'). Filed high.
- proof 6: met — npx vitest run src/content/locale.test.ts — "every line the DSL speaks carries an address
(c6)" walks the built registry for say: results and dialogue lines and asserts each carries a key, that
the addressable set is exactly the keys the lines carry, and that reordering under one owner moves them.
Mutation KILLED: dropping the assignment in stampSays (result.key = recordProse(...) becomes a bare
recordProse(...) call) fails "leaves no spoken line in the registry without one". A recipe's say: is the
one text field exempted from TEXT_FIELDS, and it is genuinely keyed — registry.ts:362 registers
recipeActions under recipe for stampSays, so the exemption is not cover.
- proof 7: met — npx vitest run src/content/locale.test.ts src/runtime/localized.test.ts. actionTextOwner
(src/content/action.ts:39) is the one place the question is answered and both the loader and
Localizer.actionLabel read it. Two mutations, both KILLED: replacing the owner choice with
{ kind, id: ownerId } fails "writes none under the performer, so no translator fills one word once
per performer" in the content table, and "shows every performer the translated words, and never the
untranslated label" in the runtime lookup, the latter over a # locale es minted from the shipped
declarations themselves. The three questions the brief raised, checked by reading:
(a) overloads — overlayAction (registry.ts:886) skips label, and an entity's overload block carries
no id field (ACTION_FIELDS declares none), so the assembled action keeps the declaration's id and the
key does not move;
(b) a namespace boundary — the hall/casa fixture at locale.test.ts:250 has a Spanish module use: an
English declaration, and the entry lands at hall.action.pick-lock.pick-lock with language en, with no
key under casa.entity.puerta for either side to disagree at;
(c) the double write — recordActionText reaches a used declaration once from the performer's row and
once from registry.actions, and both writes pass the same action.label, the same generatedLabel (an
overload cannot set it) and the same language, since language is now looked up on owner.namespace and
not on the performer. locales.base.set is therefore idempotent here and needs no order.
- proof 8: met — npm test green (3094), scripts/drift.test.ts green, npm run tasks -- merge-ready green on
tsc, tests, layer-check, audit-status, doctor and the byte check. Read over this spec's own work as the
clause directs: SAVE_VERSION moves twice in the range and neither move is this spec's — b510099
(what-is-stored-or-replayed-is-an-id) takes 9 to 10 and 6f6f838 (action-labels-as-members) takes 10 to
11, confirmed by git show <sha> -- src/runtime/save.ts. No commit belonging to this spec touches
SAVE_VERSION. The three moves the clause names are all present in the diff: c6's say:/dialogue keys,
c9's "+3 attack" becoming "+3 Attack", and the skill and slot ids that became titles. One item not in
the clause's whole list: 1425ff5 retires engine.text.untranslated, so a player of an untranslated
language now reads a key where they read (untranslated). English display is unaffected. Filed low.
- proof 10: unmet — Both enforcements the clause names landed, and both are load-bearing. Mutation KILLED:
stats: CountedRow[] reverted to Record<Answer, number> fails "publishes no map keyed by an id that has
not said nothing in it is words". Mutation KILLED: sheet.ts's counted() drawing localizer.identifier(row.id)
instead of row.title fails "renders nothing a player can read that the engine did not publish, with a
row on every page" — and that page is genuinely opened now, because everyPageFilled() equips something
and Pager/VStack render every subpage into the markup. The clause's leading sentence is still false, one
driver over. The REPL draws ids for which the branch has just published words: scripts/planeView.ts:98
draws bare(cluster.jewel) where ClusterReport.title sits on the same row and src/ui/plane.ts:107 draws
that title; scripts/play-cli.ts:202 dumps status.xp by row.id and :203 dumps status.equipment by
row.slot/row.item — the exact three fields c10 reshaped. It also draws ids for which no words exist at
all: status.flags, status.inventory and status.grown keys and Modal.name, all through say() and so all
PlayerLines. scripts/play-cli.test.ts:125 pins them (Flags: {"tutorial-island.guide-house.discovered":true},
Inventory: {}, XP: {}). What is missing is not another instance but the derivation: the enforcement
the clause built reads the GUI's rendered markup and nothing reads the REPL's, so the rule that says a
driver may draw no id has never looked at the second driver.
- proof 9: met — npx vitest run src/ui/sheet.test.ts. Mutation KILLED: counted() naming a row
localizer.identifier(row.id) instead of row.title fails "names a row by the title the engine published
on it". The plane pane and the REPL's plane both read statTitle rather than bare(statId) —
src/ui/plane.ts and scripts/planeView.ts payload() and clusterHeading(), diffed at 9805250 — and the
statTitles map c9 first shipped is retired in favour of CountedRow carrying its own title, which is what
c10 asks for and what leaves no second dictionary to keep in step by hand.
