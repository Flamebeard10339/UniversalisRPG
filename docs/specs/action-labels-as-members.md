# action-labels-as-members

## Deliverable

An action is addressed by a slug and displayed by a label, and the two stop being one string.
Today an action section's `title:` line *is* its label (`src/content/action.ts:20`), and that
label is what `activeAction.actionLabel` stores, what `findActiveAction` and `save.ts` compare by
string equality, what a `use:` directive spells and what a choice id carries. So renaming
`title: Fight` to `Combat` stops the fight under way and puts the English word into a Spanish
player's log — reproduced by `what-is-stored-or-replayed-is-an-id` pass 3, which is why this
spec's own recorded premise, that nothing is broken today, is struck rather than edited quietly.

This is the third and last owner of an action label. `travelAction` composed one from a
location's title and pass 1 found it; the recipe loader composed one from a recipe's id and pass 2
found it; this is the one an author writes, and no clause of that branch could reach it — its c3
is about text the engine composed and the engine composed nothing here, its c4 about sentences
built in TypeScript and this is built in the DSL. The slug those branches already derive for the
display key becomes the identifier, the label becomes display text and nothing else, and the
uniformity this spec was originally written for — a namespace member, `use:` resolving like every
other reference, the bespoke validator retiring — comes with it rather than being its point.

Proof:

- [c1] An action's slug is a namespace member, declared under its owner beside that owner's flags and
  dialogue nodes, so an action is addressable by the same path grammar as everything else a module
  owns.
  proof: vitest src/content/resolve.test.ts
- [c2] `use:` resolves through the namespace, and the bespoke check retires. `validateTestReferences`
  no longer reads the owner's built `actions` to compare labels; an unknown action is an unknown
  member, reported the way an unknown flag already is.
  proof: vitest src/content/references.test.ts
- [c3] An action removed by a later module takes its member with it, through the reconciliation
  `dangling-reference-on-field-edit` already built, with no removal logic written here.
  proof: vitest src/content/flags.test.ts
- [c4] What is stored, replayed and compared is the slug, and the label reaches no field that
  outlives the frame it is drawn in. `activeAction` holds the slug under a field name that says
  so, `findActiveAction`, `pruneStateForRegistry` and the encounter roster compare slugs, and a
  choice id carries one. Proven the way its two neighbours were: a save written against an action
  titled one thing is replayed against the same action retitled, in another language, and the
  action is still under way with no English in the log.
  proof: vitest src/runtime/save.test.ts
- [c5] What changes is only what had to, and it is named here in full. `SAVE_VERSION` moves 10 to
  11, because `activeAction`'s action field changes both name and domain; the seven `# save`
  fixtures carry the version stamp and nothing else, since none holds an action. Two authored
  lines move and no others: `use: entity.mirror.look in` and `use: entity.dresser.search drawer`
  in shipped `# test` sections become their slugs, which is this spec's original promise that no
  directive is respelled being withdrawn rather than quietly broken. No `title:` moves, no
  content id moves, and no player-visible English moves.
  **Read over this spec's own work and not over the branch's diff.** The branch carries
  `one-channel-for-every-printed-word` as well, whose c8 names three player-visible things that
  do move — the `say:` and dialogue keys, a stat's spelling, and the ids a surface used to draw
  as words. Those are that spec's to account for and are not counterexamples here. What this
  clause covers is the addressing change: `activeAction`, the choice-id shape, the namespace
  member, and the two respelled `use:` lines. One author-facing string moves and is named
  rather than left to be found: a compiled craft's label is `Craft` where it was `craft`, so a
  load error about a recipe's cadence quotes it capitalised. It is a diagnostic and not a
  screen — no surface draws either compiled label, since a craft under way is said by
  `engine.craft.label` and a walk by `engine.travel.to`.
  proof: npm test
- [c6] The choice-id contract is stated once, where it is built. `use:<kind>.<objId>.<slug>` is
  produced and parsed in one agreed shape across `session.ts` and `test.ts`, rather than a regex in
  each that happens to match the other.
  proof: vitest src/runtime/session.test.ts

## Decisions

- **"Nothing is broken today" is struck, not softened.** This spec was written as uniformity on
  the recorded premise that the bespoke label check works and nothing fails. `what-is-stored-or-
  replayed-is-an-id` pass 3 refuted it against the repository's own module resolution: a save
  holds `"actionLabel":"Fight"`, changing only `title: Fight` to `Combat` yields `Detenida la
  accion action.isla.melee-combat.Fight: no existe la accion "Fight" en action.isla.melee-combat.`
  and drops the action. The shipped content has exactly that shape at
  `content/tutorial-island.dsl:120-121`, driven by two shipped recordings. The uniformity is still
  bought and is still nearly free; it is no longer the reason.
- **The stored field is renamed, not just retyped.** `activeAction.actionLabel` holding a slug
  would be a field whose name says the opposite of what it holds, which is the confusion that
  produced this defect in the first place. It is renamed with its domain, and that is what moves
  `SAVE_VERSION`.
- **`use:` spells the slug.** The alternative — accepting the written label and resolving it to a
  slug at load — was rejected: it keeps a recording depending on display text, so a `title:`
  rename still breaks it, which is the whole defect. Two shipped lines are respelled and named in
  c5. This is the same bargain every id in this DSL already makes.
- **No save migration.** Third consecutive `SAVE_VERSION` bump; `save-migration-system` stays open
  and untouched and a stale save is rejected, which is standing policy rather than a decision of
  this branch.
- **The deferral to `gui-rebuild` is retired, and the reason is recorded rather than reversed
  silently.** Its logic was that the GUI redefines the choice-id contract, so touching it twice is
  waste. Localization now touches it first and must, so the second touch is already happening; and
  `gui-rebuild` sits behind `first-class-modals` and the whole decided chain, which would leave a
  derived slug and a bespoke validator standing side by side for a long time.
- **An address is derived, not authored, and it is derived from whatever the declaration is.** A
  `# action` section is addressed by the id it was written under, so its `title:` is display and
  moves freely; an inline block on an entity or a location has no id but the label it is headed
  with, so a slug of that label is the only address available and renaming the heading renames the
  declaration, which is honest. This corrects the rule as first written here — "the slug is
  derived from the label", for every form — which c4 refutes: a slug of a title still moves when
  the title moves, so a declaration addressed that way would still stop a save on a retitle, which
  is the whole defect. The two agree wherever a label was generated rather than authored, because
  `actionSlug(humanizeEn(id))` is the id again. Two declarations under one owner deriving the same
  address is rare, checkable, and a load error.
- **The identifier and the display are separated by localization, not here.** After that branch, the
  label is display text resolved through a key and the identifier is the slug. This branch does not
  re-litigate that split; it takes the slug as given and gives it a home in the namespace.
- **Carried on the same branch as `what-is-stored-or-replayed-is-an-id`, and audited separately.**
  The earlier reasoning — two unrelated failures behind one audit — assumed they were unrelated,
  and pass 3 showed they are one failure on three owners. They stay separate specs with separate
  audits, which is what keeps the grading honest; they share a branch because the store diff, not
  the checkout, is what makes a branch owe a spec, and because this one moves the choice-id
  contract that the localization work above it reads.

## Open questions

- Whether `use:` keeps a bespoke directive grammar or becomes an ordinary namespaced reference in
  `referenceSites.ts` is the worker's call once the region is read. c2 fixes that the label
  comparison goes, not which visitor replaces it.
- `gui-rebuild` will still redefine the choice-id contract when it lands. c5 asks only that the shape
  be agreed in one place now, so that redefinition changes one thing rather than two regexes that
  drifted apart in the meantime.

## Audit passes

### Pass 1 — 2026-08-15

- base: `cfa1eb692c996ed4414390fa5cb492741856a0f2`
- head: `e9ae6d48a7956d91b46bf4abe598a4eda582fd57`
- proof 1: met — declareMembers (src/content/resolve.ts:103) declares one ACTION_MEMBER key per
address returned by actionAddresses, for entity, location and item alike; NAMESPACED_KINDS
carries 'action-slug' (src/content/namespace.ts:11,26).
src/content/resolve.test.ts "an action's address is a member of the namespace" walks all three
owner kinds, the uses: form, the negative (no member for an action nobody performs) and the
snapshot line that puts it beside the owner's flag.
Mutation: deleting the declare line at resolve.ts:103 is KILLED by resolve.test.ts "hangs an
inline block under the object that heads it, on all three kinds that own one"; emptying `used`
in actionAddresses is KILLED by "hangs an action a `uses:` brings under the entity that brings
it". Manifest:
C:\Users\yonat\AppData\Local\Temp\audit-action-labels-as-members-pass1-mutations.json
- proof 2: met — validateTestReferences (src/content/references.ts:88-108) no longer builds the
entity/location/item owners map and no longer compares action.label; all that is left of use:
there is the leading kind. Both halves after the verb are resolved in
referenceSites.ts:236-243, the action half through visit(ACTION_MEMBER, ...).
src/content/references.test.ts "a use: names an object and a member of it" covers the address
spelling, a shortened owner, an action of another object, and the kind check; the pre-existing
case now reports "names an unknown action-slug: training-dummy.eat", i.e. the flag wording.
Mutation: deleting referenceSites.ts:242 is KILLED by references.test.ts "refuses an action of
another object, however real that action is elsewhere".
Boundary found and filed below: the member key carries no owner kind, so an object that loses
its action while a same-id object of another kind keeps that address still resolves the use: at
load and dies at runtime. That is the key shape flags already use and a recorded ruling, so it
is filed rather than graded against this clause.
- proof 3: met — No removal logic is written for the member: reconcileMembers
(src/content/registry.ts:1107-1121) recomputes wouldDeclare over the merged sections and
undeclares what no longer survives — the machinery dangling-reference-on-field-edit already
built — and actionAddresses reads the merged authored section, so -uses:, +uses: and a removed
inline block all reconcile there.
src/content/flags.test.ts "an action a field edit takes away" covers the field edit, order
independence, a + putting it back, an inline block cut on its own, and the whole object going.
The prune-time half (an action dropped for a dangling reference) is covered by
src/content/universe.test.ts over all four sites that strand one.
Mutation: deleting the undeclare line in reconcileMembers is KILLED twice — by flags.test.ts
"goes away with the value, so a use: the edit stranded no longer resolves" and by "takes an
inline block away with the block, not only with the object that headed it".
- proof 4: met — ActiveAction.actionSlug and Seat.actionSlug (src/runtime/encounter.ts:17,24) carry
the address; findActiveAction (actions.ts:89), activeActionProblem (save.ts:142) and
seatOf/seatAction (encounter.ts:94,146) all compare actionAddress(each); a choice id is built by
useChoiceId from actionAddress (session.ts:245,253,268) and a recorded line by
canonicalDirective(choiceToDirective(...)), so nothing persisted holds a label.
src/runtime/save.test.ts "a fight under way survives its action being retitled" is the proof the
clause asks for: a save armed against `title: Fight` in an es universe is replayed against the
same action retitled Combat, stays under way, and the inline-block half stops with a message
carrying no English.
Mutations, seven aimed at the arming call sites and the two comparison sites: all KILLED —
actions.ts and save.ts label comparisons, runtime.ts:545 actionSlug: actionAddress(action),
armCraft, craftFirstUnit, armTravel, useTravel, encounter.ts seatOf. Manifests
...-pass1-mutations.json and ...-pass1-mutations-travel.json.
One exception, filed below: reverting travelFirstUnit (runtime.ts:704) to .label SURVIVED at
whole-suite scope, 0 failed of 3094 — the function has no callers anywhere in the repository.
It writes no field, so the clause holds; the commit's "five call sites ... fails 43 tests" is an
aggregate one of the five contributes nothing to.
- proof 5: met — Read over this spec's own commits (6f6f838, f51b3ff, e0b7483, 827b4f3, 82cf320,
d201b75, 852173f) and not over the branch range, as the clause directs.
SAVE_VERSION 9->10 belongs to what-is-stored-or-replayed-is-an-id; 6f6f838 moves it 10->11
exactly as named (git show 6f6f838:src/runtime/save.ts | grep SAVE_VERSION).
Seven # save fixtures in content/tutorial-island.dsl change the version stamp and no other byte
(miki-route-start, miki-route-end, dresser-trinket-end, explored-and-unlocked,
growing-a-heartwood-blade-start, growing-a-heartwood-blade-end,
growing-through-the-inventory-screen-end).
Exactly two authored lines move: use: entity.mirror.look in -> look-in and
use: entity.dresser.search drawer -> search-drawer. The other seven shipped use: lines were
already slugs or are the two-sided form. The block labels are untouched — look in: at :527 and
search drawer: at :582 still read as English. No title: and no content id moves anywhere in
this spec's diff.
The one named author-facing move checks out: parse.test.ts now expects
way (travel -> Travel) and is not named, but reaches no diagnostic — travel is not stochastic so
runtime.ts:357 cannot quote it, it carries no rate: so stats.ts:164 cannot, and everyActionTable
excludes recipeActions and travel, so neither compiled label becomes a locale entry. The use:
load diagnostic also moved wording; that is c2's own deliverable rather than an unnamed change,
and is filed low so the next pass has it in writing.
- proof 6: met — usePayload, parseUsePayload, useChoiceId and parseUseChoiceId are the one pair, all
in src/content/test.ts:117-131, built on the same USE_PAYLOAD the directive grammar parses.
session.ts reaches for them at :245, :253, :268, :338 and :581; serialize.ts at :287. No second
template or regex over use: survives outside test.ts (grep -rn "'use:'" src scripts). The
OBJECT_KINDS tie-break is gone because the two payload shapes are now disjoint: an address holds
no space and the two-sided form is spelled with one.
src/runtime/session.test.ts "a use: choice id and a use: directive are one shape" walks every
use: choice a real session over the shipped content offers, in both directions.
Mutation: changing usePayload's separator from . to : is KILLED by "offers no action choice the
directive parser cannot read back".
