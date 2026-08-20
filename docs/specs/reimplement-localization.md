# reimplement-localization

## Deliverable

There is nothing to reimplement: localization left with the legacy contribution mode on 2026-07-08,
`en.json` and `LocalizationEditor.tsx` together, and no locale file or locale code survives. So the
question is not how to translate strings but how to stop new untranslatable ones appearing, one at a
time, for months.

**The headline of this branch is that rendering raw text becomes a compile error.** Not a convention,
not a review checklist, not a lint pass — a type. Every field a player can read is a `Localized`,
produced only by the localizer, whose engine entry point takes a key from a literal union. A raw
string in a player-visible field does not typecheck, and adding a sixteenth engine string without
giving it a key does not typecheck either. `npx tsc --noEmit` already runs in CI, so the gate exists
and this branch only has to stand on it.

That is not a preference, it is measured. Surveying this task, a grep for inline template literals
reaching the log found **one** engine string. A more careful pass found **fourteen**. Looking once
more, at a helper rather than at a log call, found a **fifteenth** — `item.ts`'s `examine` default,
an English sentence built by an `article()` function that picks "a" or "an" by leading vowel. Three
passes by someone actively hunting, and the count went 1, 14, 15. A checklist finds some of the
strings; a type finds all of them, including the ones written next year.

**There is no cross-language fallback. Ever.** If the active language has no string for a key, the
player sees the key. Not the base language, not a humanized id, not a guess. Falling back across
languages is how a missing translation hides: a Spanish player reading English text has no way to
report what is wrong, and an author has no way to see it. A key on screen is ugly, unmistakable, and
is exactly the string a translator needs in order to fix it. This is the same reasoning as the type:
make the gap loud rather than survivable.

That makes the base DSL's authored text simply *the entry for the language that module declares*.
`# info` gains `language:`, defaulting to `en`. `humanize` — which capitalises words and replaces
hyphens, an English convention wearing a general-purpose name — becomes `humanizeEn` and supplies
the English entry for an unauthored title only in a module that declares English. A Spanish module
with no title has no entry in any language, because `rata-gigante` humanized is not English and is
not Spanish either.

| the module and field                                    | playing | shows                                       |
| -------------------------------------------------------- | ------- | ------------------------------------------- |
| `language: en`, `title: Giant Rat`                         | en      | Giant Rat                                   |
| `language: en`, `title: Giant Rat`, `es` has the key        | es      | Rata Gigante                                |
| `language: en`, `title: Giant Rat`, `es` lacks it           | es      | `tutorial-island.entity.giant-rat.title`     |
| `language: en`, no title                                   | en      | Giant Rat — `humanizeEn` supplies the entry |
| `language: en`, no title, `es` lacks the key                | es      | the key                                     |
| `language: es`, `title: Rata Gigante`                      | es      | Rata Gigante                                |
| `language: es`, `title: Rata Gigante`, no `en` entry        | en      | the key — never the Spanish, never `humanizeEn` |
| `language: es`, no title                                   | es      | the key — `humanizeEn` does not run          |
| a travel edge, `en` has `engine.travel.to`                 | en      | `Travel to Beach`, the destination's own localized title substituted |
| a travel edge, `es` lacks `engine.travel.to`               | es      | `engine.travel.to`                          |
| a `# locale` key matching no base key                      | any     | reported as unmatched, not silently kept     |

The engine keys this branch strips out of TypeScript and ships as a `# locale en` module. The
list is closed in code by c2's literal union and printed by `ENGINE_KEYS` in `src/content/locale.ts`;
the shipped `content/engine-en.dsl` covers it exactly, and a test asserts the two agree. It began as
the fifteen counted while surveying this task, and finished at thirty-two — the survey's own point,
made a third time. What the survey missed: a `Talk to {entity}` label that is a choice like any
other; the log line narrating an opened modal; a foe swinging at another foe, which the four combat
patterns did not cover; and the prune and instance warnings, which reach the log through
`PruneWarning.message` and were one composed sentence each until each reason became a pattern of its
own — a fragment like `stat attack` substituted into `because its {missing} is not loaded` is a
sentence no translator can reach.

Proof:

- [c1] Rendering raw text does not compile. Every player-visible field — choice labels and details,
  view titles and descriptions, `state.log`, and `PruneWarning`'s message — holds a `Localized`, and
  the only way to make one is through the localizer. Assigning a string literal or a template literal
  to any of them is a type error, demonstrated by a compile-failure fixture rather than asserted.
  proof: npx tsc --noEmit
- [c2] An unkeyed engine string cannot be added. The engine entry point takes a key from a literal
  union, so a new string with no key fails to compile and a mistyped key fails with it. All fifteen
  that exist today are converted and none remains as a literal in TypeScript.
  proof: vitest src/runtime/localized.test.ts
- [c3] A missing translation shows its key, in every direction. Playing a language the module was not
  authored in, with no entry for that key, renders the fully qualified key — never the module's own
  language, never a humanized id. This holds for content keys and engine keys alike, so a locale file
  that is absent entirely leaves a readable, reportable screen rather than a wordless one.
  proof: vitest src/runtime/session.test.ts
- [c4] Parameters are named and substituted in `{name}` form, and a parameter may itself be localized
  — a travel label's destination resolves in the active language before it is substituted. A pattern
  naming a parameter the call site did not supply is an error rather than a literal `{name}` reaching
  the player.
  proof: vitest src/runtime/localized.test.ts
- [c5] `# info` declares a module's language, defaulting to `en`, and `humanizeEn` runs only for a
  module that declares English. `article()` goes the same way: it is English grammar and stops being
  applied to anything but English.
  proof: vitest src/content/universe.test.ts
- [c6] `# locale <lang>` is a section of key/value pairs that never merges into content. Loading a
  locale leaves every registry map byte-identical to loading without it, so a locale can neither add,
  patch nor remove a single piece of content.
  proof: vitest src/content/locale.test.ts
- [c7] A locale key matching no base string is reported, naming the key and the locale, and missing
  translations are computable without a view: a pure function over the loaded modules and a locale
  returns the keys it does not cover.
  proof: vitest src/content/locale.test.ts
- [c8] An action's display text is keyed on a slug derived from its label, not on the label itself.
  `pick lock` keys as `pick-lock`, by the rule ids already follow, so the key is addressable by the
  same path grammar as every other key; two labels under one owner deriving the same slug is a load
  error. The identifier `use:<kind>.<objId>.<label>` is untouched by this branch — only the display
  becomes a lookup — so nothing authored and no `# test` changes.
  proof: vitest src/content/locale.test.ts
- [c9] What does not change is stated and proven. Shipped content plays in English with the same
  player-visible text as today, every `# test` over it passes, `.title` and its fifty-four readers
  keep their types, the registry keeps base-language content, and no save field, `SAVE_VERSION` or
  authored content id moves.
  proof: npm test

## Decisions

- **A type, because a checklist provably misses them.** Enforcing this by review or a grep-based gate
  was rejected on evidence from this spec's own survey: three passes by someone hunting deliberately
  counted 1, then 14, then 15. What the first two missed was behind a variable, a struct field
  carried to the log later, and a schema default calling a helper. A brand on the player-visible
  fields moves the check to the compiler, where it costs nothing per string, cannot be forgotten, and
  rides a gate already in CI rather than adding one.
- **The engine key set is a literal union, not a string.** A `Localized` made from an arbitrary
  string would let prose back in through the constructor. Taking `EngineKey` makes the set
  enumerable, a typo a compile error, and adding a string a one-line diff to a visible list.
- **No cross-language fallback, in either direction.** Showing the base language when a translation
  is missing is the standard behaviour and it is rejected here on purpose: it hides the gap from the
  player, from the author and from the translator, which is the failure this whole branch exists to
  prevent. It is also wrong in the reverse direction — a module authored in Spanish must not render
  Spanish to an English player, and must not render `humanizeEn` of a Spanish id, because
  `rata-gigante` humanized is neither language. The key is the one answer that is honest in every
  direction and is itself the thing a translator needs.
- **Engine English is content, not a constant.** An earlier draft kept the English patterns hardcoded
  behind a key lookup, on the reasoning that a missing locale file would otherwise leave the game
  wordless. With c3 that risk is gone — a missing file shows keys, which is readable and reportable —
  so English becomes data like every other language and there is exactly one mechanism. The patterns
  ship as a `# locale en` section in `content/tutorial-island.dsl`.
- **Key/value locale sections, not language-tagged content modules.** A locale written in the content
  grammar would be indistinguishable from a patch of the same sections, with only a tag on `# info`
  between "a translation" and "an edit of the base" — a mechanism that fails silently and in the
  direction that destroys content. An explicit `# locale` cannot be mistaken for a patch and puts
  engine and content keys in one place.
- **A locale is inert with respect to content, provably.** c6 asserts registry equality rather than
  the absence of a merge, because equality is checkable and "we did not call merge" is not.
- **Articles and grammatical gender are handled by making the whole sentence the translatable unit,
  and this is a deliberate finding rather than an assumption.** The English patterns above bake in
  "the" and "a/an"; no other language is obliged to. A Spanish translator writes
  `{attacker} te golpea por {damage}` with no article at all, or moves the article into the noun's own
  localized string — `la rata gigante` — so it agrees with the noun the engine cannot know the gender
  of. Nothing in the engine imposes an article, a word order or a plural rule, because the engine
  never assembles a sentence; it substitutes named parameters into a pattern a human wrote in that
  language. The known limitation: one localized noun serves both bare display and in-sentence use,
  and a language needing different forms for those would want two keys. That is an additive change —
  a new key, which under c3 shows itself the moment it is missing — not a redesign, and it is not
  built now because no language in play needs it yet. Gendered pattern *selection*, the ICU `select`
  shape, is likewise deliberately absent.
- **English is the only officially supported language, and `humanizeEn` could not honestly be
  anything else.** The question was asked directly — is `humanize` functional across Latin alphabets
  — and the answer is no, on three grounds. Its capitalisation is locale-independent, so Turkish `i`
  becomes `I` where the language requires `İ`, and Dutch "ij" loses its digraph capital. Its
  every-word title case is an English convention: French, Spanish, Italian, Portuguese, Catalan and
  Romanian use sentence case, and German capitalises nouns but not adjectives, so it agrees only by
  coincidence. And decisively, ids are `[a-z][a-z0-9-]*` — a Spanish author cannot write
  `rata-pequeña` and a Turkish one cannot write their own city's name, because the characters are a
  parse error. For any language with diacritics, humanizing an id could not produce a correct title
  even in principle. So this is not "untested", it is "impossible", and `humanizeEn` carries the
  language in its name for that reason.
  What this decision does *not* do is restrict `language:` to English. A module declaring another
  language is accepted; it simply gets no generated titles and falls back to keys, which is the
  honest behaviour and is already what c3 and c5 require. Supporting English officially means English
  is what ships, what the shipped `# locale en` covers and what the suite proves — not that another
  language is rejected. Adding one stays a matter of authoring a `# locale`, never of changing code,
  and that property is the point of the whole branch.
- **An action's key segment is a slug because it costs nothing here and prevents churn later.** This
  branch has to choose a path segment for an action's display key regardless, and `action-labels-as-members`
  will later promote that same segment to a namespace member. Deriving it as `pick-lock` now rather
  than keying on `pick lock` means that promotion changes no key and therefore breaks no locale file
  — a key that moved would show as missing under c3 in every language at once. This branch does not
  touch the `use:` identifier; separating the display role from the identifier role is all it does,
  and making the identifier itself a slug is the sibling task's.
- **Translation is a view concern and the registry keeps base-language content.** A registry holding
  every language, or holding unresolved keys, would change `title`'s type and reach all fifty-four of
  its readers for no gain. The active language belongs to the player, not to the content.
- **The selected language is an input, not state.** There is no settings store anywhere in `src/` or
  `scripts/`; `auto-save-export-and-load` is the task that will build one. Taking the language as a
  parameter keeps this branch unblocked and every case a test with a value.
- **The GUI half is a separate task.** The locale editor, side-by-side view, show-missing toggle and
  dropdown warning all need a GUI that does not exist. c7 makes each of them a rendering of an answer
  this branch computes. The evidence's Spanish end-to-end plan belongs there too, since it exercises
  the authoring path rather than the loading one.

### Decided while building it

- **The patterns ship as `content/engine-en.dsl`, their own module, rather than as a section of
  `content/tutorial-island.dsl`.** The shipped glob picks either up, so the app is unaffected; what
  changes is that a universe without the tutorial island still has English, a mod can depend on the
  module by name, and a unit test loads English without loading 880 lines of island. The spec's
  requirement — engine English is content loaded through `# locale`, never a constant in TypeScript
  — is what is being kept, and a test proves no pattern survives anywhere in `src`.
- **A language tag is whatever `# info language:` says, unvalidated and lowercase.** The section
  heading grammar already bounds it, so `pt-br` is writable and `pt-BR` is not; nothing but the
  `humanizeEn` gate reads the tag, so an unknown one is a language with no locale rather than an
  error.
- **The localizer stringifies a number parameter and applies no locale-aware numeric formatting.**
  Rounding stays where it was, in `spoken`. `Intl.NumberFormat` would change today's English for any
  number past a thousand, which c9 forbids, and no language in play needs it yet.
- **A pattern naming a parameter the call site did not supply throws; a parameter the pattern does
  not name is allowed.** The second direction is deliberate: a Spanish `engine.item.examine`
  legitimately drops `{article}`, and refusing the extra would make the English call site
  untranslatable.
- **The language is an input carried on `GameState`, beside `log`, and is not a save field.** Every
  site that writes a player-visible line has the state in hand and nothing else does; `SaveDiff` and
  the exhaustive `SAVE_FIELDS` table exclude it by name, so `SAVE_VERSION` does not move and adding
  a field still fails to compile until somebody classifies it.
- **A `# locale` section is attributed to the module that wrote it and printed back out under it, and
  `registryDiff` compares the sections.** Without that, a serialize-and-reload — which is what the
  contribution flow does to every edit — would drop every translation in silence.
- **A base string is keyed to the module that owns the id, not to the module that last patched the
  section.** A patch writes text into somebody else's object; the key names the object.
- **Prose the DSL carries verbatim goes through one door and is not keyed by this branch.** A `say:`
  result, a dialogue line and a plane's growth refusal all reach `state.log` with no key to address
  them by. `Localizer.prose` is the one way they become `Localized`, and it shows the text only where
  every loaded module is writing the language being played — so a player of another language sees
  `(untranslated)` rather than the module's own language, which is c3's rule kept rather than
  bypassed. Keying them is its own task: a dialogue line's value is not a flat pattern but a segment
  list with `{path}` interpolation and `{cond: text}` conditionals, so a locale entry for one has to
  be re-parsed by the dialogue grammar, and a `say:` nested inside a result list has no id at all.
- **`Equip` and `Unequip` stay English — superseded.** It read: they are the carried screen's answer
  *values*, so localizing them would move an authored id, which c9 forbids; splitting a modal
  option's display from its value is the GUI's task, and the two keys are left out of the union
  rather than added and left dead. Pass 5 did the splitting here instead, because c3 could not be
  met without it. `engine.carried.verb.equip` and `engine.carried.verb.unequip` are in `ENGINE_KEYS`
  and ship patterns, read through `CarriedVerb.shown`; what stays English is the *value* beside
  them, which is what c9 actually protects.
- **An id is a second door, not prose.** `Localizer.identifier` carries a slot, an instance, a
  path into the save or a modal's name into a pattern verbatim in every language, because an id
  belongs to none. Pass 1 measured what the single door cost: a translated prune warning read "Se
  eliminó (untranslated) (untranslated) porque su (untranslated) no está cargado" — grammatical and
  factless, which is worse than the key c3 argues for. `prose` keeps only what is words: a `say:`,
  a dialogue line, a growth refusal, and the English diagnostic naming why a modal or an action was
  dropped.
- **Nothing is printed that the loader would generate for itself.** Serialization used to write
  every `title:` out, including the one hydration filled in, so one trip through the contribution
  flow turned a non-English module's keys into authored raw ids with `registryDiff` reporting
  nothing. A generated title and a generated `# action` label are both omitted now, which is also
  what keeps `generatedLabel` from having to survive a round trip.
- **c8's slug narrows the authoring grammar in one case, and that is stated rather than hidden.** A
  key segment may open with a digit, so `3 Card Monte` keys as `3-card-monte` and stays loadable;
  what is newly refused is a label with neither a letter nor a digit in it, which keys as nothing at
  all, and a label whose slug is already a field of the object that owns it. Both are one key with
  two meanings or none, and the error says what a legal label looks like.
- **Every screen a title reaches asks the localizer, not the registry.** Pass 2 measured three that
  did not: the carried list, the plane report and the modal built from them read `.title` off the
  record, so a Spanish player was shown the base language on them while the room around them was
  right. `carriedName` takes a localizer now and `Modified` is `engine.item.modified` — a pattern, so
  a language that puts the descriptor after the noun may.
- **The set of keys a report answers about is every key the engine asks for, not every key some
  module has text for.** A module writing a language nobody translated has no base entries at all,
  and drawing the report from those said nothing was missing while the player was shown a key on
  every screen. `Locales.addressable` holds the keys; `base` holds the text. A title is addressable
  whatever anybody authored, and an unauthored `examine:` is not, because nothing renders one.
- **The prose door asks the modules that carry prose.** Asking every loaded module could never open
  it for anybody, since the shipped engine locale declares `en`; a module that is nothing but
  translations says nothing about what language a `say:` is in.
- **A modal option's label is branded and its values are not.** That split is the whole of what pass
  3 needed: a label is read and a value is answered, so the label goes through the localizer and the
  value stays the string a `submit-modal:` replays. Branding it is what finally closed c3 — the plane
  screen was still composing its heading out of the registry's title and an English refusal, and no
  amount of fixing screens one at a time would have stopped the next one.
- **Any text is refused at load for naming a parameter nothing supplies.** A translation may drop
  one — a Spanish `engine.item.examine` needs no `{article}` — but inventing one made every screen
  in that language throw at render time. Enforced where the value is assembled rather than where it
  is read, which pass 5 found meant both places a value is written and not only `# locale`: an
  authored `examine:` naming `{open}` loaded clean and threw out of every view, so `recordBase` in
  registry.ts now holds base text to the same rule. No caller passes a parameter to a title, an
  examine or an action label, so for a content key every parameter it names is unsupplied.
- **A modal option's answer and the words that offer it are one pair, not two lists.** This is what
  finally closed c3, after branding the label alone moved the leak to `values` on the same interface.
  The Decision that fix rested on — a label is read and a value is answered — is false in both
  directions: a dialogue menu's *answer* is the whole of what that screen says, and the carried
  screen built its answer out of the localized name, so a `submit-modal:` recorded in English threw
  in Spanish. `ModalChoice` carries both, the answer is spelled in the base language because it is
  what a `# test` replays, and what is read is the played language's.
- **The brand's boundary is a compile fixture, not a convention.** Pass 4 measured that reverting
  `ModalOption.label` and `PlayView.said` to `string` left `tsc` clean, because the c1 fixture still
  enumerated only the seven fields pass 1 wrote. It enumerates every branded field now, so unbranding
  one fails the build rather than reopening c3 a fifth time.
- **`engine.item.examine` has one reader, `itemExamine`, and the schema default is gone.** Nothing
  displayed an item's examine before this branch either; what mattered was that the English sentence
  and its `article()` left the schema, which is what c2 and c5 ask for.

## Open questions

- Number and quantity formatting is locale-sensitive and `spoken(damage)` sits inside a combat
  string. Whether the localizer formats numbers or the pattern receives an already-formatted
  parameter is the worker's call; c1 forces the decision to be made rather than defaulted into by
  concatenation.
- Whether `language:` takes a bare tag (`es`) or a full BCP 47 one (`pt-BR`), and whether the set is
  validated at all, is the worker's call. The decision above fixes that unknown tags are accepted
  rather than rejected; nothing in this branch reads the tag except the `humanizeEn` gate.
- Where the `language:` gate is applied is the worker's call: a schema-level
  `default: (self) => humanize(self.id)` cannot see its module, so either the default moves to where
  the module is known or the language is threaded into hydration. c5 fixes the behaviour, not the
  seam.
- `stationless-recipes-dsl-section` also forecasts writing `session.ts`, and the craft label this
  branch keys is one of the entries that branch removes from the choice list. Both grants are
  forecasts, so `tasks plan` grades it a note; whichever starts second should read the other's spec.

## Audit passes

### Pass 1 — 2026-08-14

- base: `ae7232c5e9ab4a157da7ba445270ce0e0ac936c4`
- head: `6234f809e5b8a11d33f88ea3a27d96d10b9b18ca`
- proof 1: met — The fixture is real and tsc is what runs it. `src/runtime/localized.test.ts:21-37`
holds seven `@ts-expect-error` lines assigning string and template literals to
PlayChoice['label'], PlayChoice['detail'], PlayStatus['location']['title'],
PlayStatus['location']['description'], PlayStatus['entities'][number]['title'], Localized[]
(the log) and PruneWarning['message']; `tsconfig.json` includes "src", so `npx tsc --noEmit`
type-checks the file. Re-runnable check that the fixture can fail: replace
`export type Localized = string & { readonly [LOCALIZED]: true }` in src/runtime/localized.ts
with `export type Localized = string` and run `npx tsc --noEmit` -- it reports exactly seven
TS2578 "Unused '@ts-expect-error' directive" errors at localized.test.ts lines 23,25,27,29,31,33,35,
and passes again when restored. The brand's escape hatch is closed by two tests in
`describe('the brand is closed (c1)')`: no file in src outside localizedFixture.ts imports it,
and no file outside localized.ts/localizedFixture.ts writes `as Localized`.
- proof 2: unmet — Half of it is proven and half is false. Proven: the shipped English covers the union
exactly -- mutating `engine.talk.to` to `engine.talk.too` in content/engine-en.dsl was KILLED by
src/runtime/localized.test.ts "ships an English pattern for every key the union holds, and no other
key". The literal-union half is proven by tsc rather than by the named vitest target: mutating
`export type EngineKey = (typeof ENGINE_KEYS)[number]` to `= string` SURVIVED the whole suite
(0 failed of 2930) but produces two TS2578 errors under `npx tsc --noEmit`.
False: "none remains as a literal in TypeScript". Two English engine sentences still stand as
template literals -- `src/runtime/actions.ts:55` `label: \`Travel to ${dest.title}\`` and
`src/content/registry.ts:143` `label: \`Craft ${humanizeEn(recipe.id)}\``. The second is not
merely an identifier: `recordActionText` records its output as a base entry, so
`isla.recipe.barra-de-bronce.craft-barra-de-bronce` = {text:'Craft Barra De Bronce', language:'es'}
for a `language: es` module, and `publishAction` displays it. The test written to prove this
half cannot see either one: it filters patterns to `length > 12` after stripping `{params}`,
which excludes six of the thirty-two keys -- engine.travel.to ('Travel to'), engine.craft.label
('Craft'), engine.talk.to ('Talk to'), engine.item.examine ('This is  .'), engine.modal.opened
('modal:') and engine.prune.nowhere ('(nowhere)') -- and the two survivors are in that six.
- proof 3: met — The no-fallback rule is one line and it is watched. Mutating
`src/runtime/localized.ts:37` `return base?.language === language ? base.text : undefined;` to
`return base?.text;` was KILLED twice: by src/runtime/session.test.ts "shows the key for every
string the played language has no entry for", and again, aimed at "never renders the module's
own language to a player of another one", by two named tests in that file, each re-run at its own
file with the mutation still applied. `describe('a missing translation shows its key, in every
direction')` covers both directions (en module played in es, es module played in en), content keys
and engine keys, a partially translated locale (`Viaja a island.location.cove.title` -- the
untranslated destination shows its key inside a translated sentence), and the no-locale-at-all case.
Caveat filed as a finding, not against this grade: when an engine.prune.* key IS translated, every
identifier substituted into it is destroyed.
- proof 4: met — Both halves mutation-proven at their own lines in src/runtime/localized.ts.
Removing `if (value === undefined) throw new RuntimeError(...)` from `substitute` (line 25) was
KILLED by src/runtime/localized.test.ts "refuses a pattern naming a parameter the call site did not
supply". Changing `const PARAM = /\{([a-z][a-z0-9-]*)\}/g` (line 20) to require doubled braces was
KILLED by "puts a value in by name". The localized-parameter half is covered by "resolves a
localized parameter in the active language before substituting it" (es.title resolved to 'Cuerda'
before substitution into 'Viaja a {destination}') and end-to-end by session.test.ts's
`Viaja a island.location.cove.title`. The deliberate asymmetry (an extra param is allowed) is
tested by "allows a parameter the pattern does not name".
- proof 5: unmet — Two of the clause's three halves fail. The `# info language:` half holds: mutating
`src/content/info.ts` `defaultTitle` to drop its `language === DEFAULT_LANGUAGE` test was KILLED,
and mutating `src/content/registry.ts:244`'s `field === GENERATED_FIELD && language ===
DEFAULT_LANGUAGE` gate to drop the language test was KILLED.
"humanizeEn runs only for a module that declares English" is false. Two call sites run it for every
module regardless of `language:` -- `src/content/action.ts:20` (`# action` with no title:) and
`src/content/registry.ts:143` (a recipe's craft label) -- and `recordActionText`
(src/content/registry.ts:262) records the result as a base entry under the module's own declared
language with no GENERATED_FIELD/language gate at all. Measured: loading
`# info isla / language: es / # entity puerta / uses: abrir-puerta / # action abrir-puerta` and
playing 'es' offers the choice labelled `Abrir Puerta` -- humanizeEn's every-word English title case
applied to a Spanish id and shown to a Spanish player, which the Decisions call impossible to do
honestly and promise falls back to keys. A Spanish recipe records
{text:'Craft Barra De Bronce', language:'es'}. `missingTranslations(locales,'es')` returns [] for
both, so nothing reports the gap either.
"article() stops being applied to anything but English" is unproven: removing
`if (localizer.language === 'en')` from `itemExamine` (src/runtime/localized.ts:90) SURVIVED the
whole suite, 0 failed of 2930. The test named for it asserts the output is 'engine.item.examine',
which it is whether or not articleEn ran, because the Spanish pattern is missing.
- proof 6: met — The equality test is the right shape and is stronger than a list. `src/content/
locale.test.ts` declares `const FIELDS: Record<keyof Registry, 'content' | 'the locale table'>`,
so adding a field to Registry stops the file compiling until somebody classifies it; the test then
compares all twenty-three content fields of a registry loaded with a `# locale es` against one
loaded without, through `sameValue`, with `namespace.snapshot()` standing in for the Namespace.
Re-runnable: `npx vitest run src/content/locale.test.ts -t "leaves every content map identical"`.
Also tested: entries land in `locales.declared` and nowhere else, a non key/value line is refused,
one key translated twice is refused, and a language-less `# locale` heading is refused.
Noted as a separate finding: the one line this branch wrote for c6 --
`if (section.kind === 'locale') continue;` in registry.ts's mergePass, carrying a `(c6)` comment --
is inert. Removing it SURVIVED the whole suite, because `applySection` has no `locale` case and
locale sections are read from `module.sections` rather than from `merged`. The property holds
structurally; the line does not carry it.
- proof 7: met — Both halves mutation-proven at their own lines in src/content/locale.ts. Replacing
`if (isEngineKey(key) || locales.base.has(key)) continue;` (line 214) in `unmatchedLocaleKeys` with
an unconditional `continue` was KILLED by src/content/locale.test.ts "names the key and the locale
of a translation matching no base string", which asserts the pair
{language:'es', key:'island.entity.crabb.title'}. Replacing
`if (entry.language === language || declared?.has(key)) continue;` (line 196) in
`missingTranslations` with an unconditional `continue` was KILLED by "answers which keys a language
does not cover, without a view". `missingTranslations` is a pure function over
(Locales, language) -- no registry, no session, no view -- and the companion test proves a base
string counts as covered by the language its own module declared.
- proof 8: met — Both halves mutation-proven at their own lines in src/content/locale.ts. Changing
`actionSlug`'s `.replace(/[^a-z0-9]+/g, '-')` (line 119) to drop the hyphen was KILLED by
src/content/locale.test.ts "keys `pick up` as `pick-up`, and leaves the identifier the label",
which asserts both halves at once: the base entry at `island.entity.crab.pick-up` and
`entities.get('island.crab').actions[0].label === 'pick up'`. Removing the collision branch
`if (taken.has(slug)) return ...` (line 132) from `actionSlugProblem` was KILLED by "refuses two
labels under one owner that reach the same slug". The identifier is untouched: session.ts still
emits `use:entity.${entityId}.${action.label}` with the raw label, and `npm test` passes over the
shipped `# test` sections unchanged. Filed as a low finding: the slug rule also refuses at load
any label the path grammar cannot address, which narrows the authoring grammar in a way the clause
disclaims.
- proof 9: met — `npm run tasks -- merge-ready` passes every leg -- tsc ok, npm test ok (2930 tests),
layer-check ok, audit-status ok, doctor ok (22 pre-existing warnings, none from this branch's
paths), bytes ok, tree ok, base ok, spec ok -- with the sole failure being
`clauses reimplement-localization: has no recorded audit pass`, which is this pass. Shipped content
plays in English unchanged: src/runtime/integration.test.ts and src/ui/shippedContent.test.ts pass
over content/tutorial-island.dsl, and no `# test` section was edited in this diff. `SAVE_VERSION`
stays 8; `SaveDiff` and the exhaustive `SAVE_FIELDS` table exclude `language` by name
(`Exclude<keyof GameState, 'log' | 'language'>`), so adding a state field still fails to compile
until it is classified. `.title` stays `string` on every registry type -- the branch changed the
view types, not the registry's. No authored content id moved: `use:<kind>.<objId>.<label>` still
carries the raw label. One published-shape change that c9 does not freeze and the diff discloses:
`PlayStatus.location.description` is now `Localized | undefined` where it was `string` defaulting
to `''`.

### Pass 2 — 2026-08-14

- base: `ae7232c5e9ab4a157da7ba445270ce0e0ac936c4`
- head: `5adaaaf4e7177c7eafcf3f97f6112d559871b839`
- proof 1: met — Re-measured from scratch, not inherited. The seven `@ts-expect-error` lines at
src/runtime/localized.test.ts:23-35 are the assertion and tsc is what runs them. Re-runnable:
replace `export type Localized = string & { readonly [LOCALIZED]: true }` in
src/runtime/localized.ts with `export type Localized = string` and run `npx tsc --noEmit` — it
reports exactly seven TS2578 "Unused '@ts-expect-error' directive" errors at lines
23,25,27,29,31,33,35 and passes again when restored (measured this pass). The brand's escape
hatch is closed: `describe('the brand is closed (c1)')` proves no file in src outside
localizedFixture.ts imports the fixture and no file outside localized.ts writes `as Localized`,
and I confirmed by grep that no file in scripts/ does either. Every writer of state.log goes
through the localizer (nine sites, checked one by one).
Graded against the fields the clause enumerates, which are all branded. The universal reading of
"every player-visible field" is false and I did not fold it into this grade because the failure
is behavioural and c3 owns it: PlayStatus.carried[].name, PlayStatus.planes[].title/.name and
ModalOption.label are plain `string`, so `GROWN_DESCRIPTOR = 'Modified'` in
src/runtime/carriedName.ts and the template literal at src/runtime/carriedScreen.ts:158 are raw
English in player-visible displays that compile. Filed as a high finding; the modal half of it
was already registered by the branch as a-modal-option-s-display-is-its-answer-value-so-neither-can-.
- proof 2: met — Both halves proven, the second one newly. "None remains as a literal in TypeScript":
src/runtime/localized.test.ts "leaves no engine sentence behind in TypeScript" now matches every
shipped pattern at any length, as the shape it would take in TypeScript (literal parts with a
template hole per parameter), across every non-test .ts/.tsx in src, and allows exactly two
disclosed identifiers. Mutation: replacing session.ts's `craftLabel` with
`` `Craft ${localizer.title('recipe', recipe)}` as Localized `` was KILLED by that named test,
re-run at its own file with the mutation still applied. Pass 1's two survivors are genuinely
identifiers now, not displays — a craft is shown through `engine.craft.label` over the recipe's
own title key (session.test.ts "labels the offer and the action under way with the same words"
asserts `Prepara Pan` in es), `recordEveryActionText` records no entry for a recipe action, and
a travel action under way is shown through `engine.travel.to` (mutation of that branch in
`actionUnderWay` KILLED by two named journey.test.ts tests re-run at their own file).
The union half: removing `'engine.talk.to'` from ENGINE_KEYS was KILLED by "ships an English
pattern for every key the union holds, and no other key". `export type EngineKey =
(typeof ENGINE_KEYS)[number]` -> `= string` SURVIVED the whole vitest suite (0 failed of 2941)
and produces two TS2578 errors under `npx tsc --noEmit` at localized.test.ts:42,44 — measured
this pass. The named vitest target cannot prove that half; tsc, which CI runs, does.
Thirty-two keys, not fifteen, and content/engine-en.dsl covers the union exactly.
- proof 3: unmet — The rule holds everywhere pass 1 looked and fails on three shipped surfaces it did
not. Proven: mutating src/runtime/localized.ts:37 `return base?.language === language ?
base.text : undefined;` to `return base?.text;` was KILLED twice, by "never renders the module's
own language to a player of another one" and by "shows the key for every string the played
language has no entry for", each re-run at its own file; and replacing
`localizer.title('location', location.id)` in sessionStatus with `location.title as Localized`
was KILLED too, so the view really does go through the localizer.
False: "never the module's own language". Measured with `npm run inspect` over an English module
`# item rope / title: Rope / slot: hand` plus `# locale es` supplying
`island.item.rope.title: Cuerda`, played in 'es' with the rope carried — `carriedListing()`
returns name 'Rope', `view().planes[0]` returns title 'Rope' and name 'Rope', and the carried
modal publishes option label 'Item' with values 'Rope x1 | Close'. The Spanish translation
exists and is ignored on all three, while the room's titles in the same view render correctly.
Also measured: for a `language: es` module `# item espada-larga`, the same surfaces render the
raw id `espada-larga` to a Spanish player, which is the humanized-id case c3 forbids by name and
the one c5's gate exists to prevent, arriving through a surface no clause enumerated. Sources:
src/runtime/carriedScreen.ts:97-99, src/runtime/planeReport.ts:183-184,
src/runtime/carriedName.ts:10-12, src/runtime/modals.ts:78-79,104,
src/runtime/carriedScreen.ts:148,154,158. play-cli prints all of them
(scripts/play-cli.ts:109-111, scripts/planeView.ts:83).
- proof 4: met — Three mutations at their own lines in src/runtime/localized.ts, all KILLED and
re-run at their own files. Replacing `if (value === undefined) throw new RuntimeError(...)` in
`substitute` with `return ''` was KILLED by "refuses a pattern naming a parameter the call site
did not supply". Changing `const PARAM = /\{([a-z][a-z0-9-]*)\}/g` to require doubled braces was
KILLED by "puts a value in by name". Replacing substitute's `return typeof value === 'number' ?
String(value) : value;` with `return name;` was KILLED by "resolves a localized parameter in the
active language before substituting it", which is the localized-parameter half stated directly;
end-to-end it shows as `Viaja a island.location.cove.title` in session.test.ts. The deliberate
asymmetry (an extra parameter is allowed) is tested. `spoken()` now hands a number to the
pattern and `substitute` stringifies it, which reproduces today's English exactly.
One unexercised edge, not against this grade: `logSwing` builds `engine.combat.player.*` with no
`{target}` when self and other are both the player, which now throws where it used to log a
sentence; reachable only through a hand-written `use-on ... player`, so not filed.
- proof 5: met — All three halves now mutation-proven at their own lines, each KILLED and re-run at
its own file. `src/content/info.ts` `defaultTitle` -> unconditional `humanizeEn(self.id)` was
KILLED by universe.test.ts "leaves the raw id standing in another language, rather than an
English phrase dressed as content". `src/content/registry.ts:248` with `&& language ===
DEFAULT_LANGUAGE` dropped was KILLED by "records a generated title as an entry only for a module
writing English". `src/content/registry.ts:268` `if (action.generatedLabel && language !==
DEFAULT_LANGUAGE) continue;` deleted was KILLED by "records the generated label only for a
module writing English" — this is pass 1's second call site, and I confirmed by grep that
info.ts:32, action.ts:20 and registry.ts:146 are the only `humanizeEn` call sites left, with the
last two gated at the recording seam rather than at the generator, which keeps the label
usable as an identifier. The article half: removing `if (localizer.language === 'en')` from
`itemExamine` (src/runtime/localized.ts:96) was KILLED by "refuses a language that asks for one,
rather than handing it English grammar", which asserts against a Spanish
`engine.item.examine: Esto es {article} {item}.` so the guard's absence is what the assertion
turns on — pass 1's untestable version is gone. Caveat filed as a low finding: `itemExamine` has
no caller anywhere in src or scripts, so the article gate is live code nothing reaches.
- proof 6: met — The equality test is the right shape and the line that carries it is no longer
inert. src/content/locale.test.ts declares `const FIELDS: Record<keyof Registry, 'content' |
'the locale table'>`, so a new Registry field stops the file compiling until somebody classifies
it, and the test compares all twenty-three content fields through `sameValue` with
`namespace.snapshot()` standing in for the Namespace. Mutation: deleting
`if (section.kind === 'locale') continue;` from registry.ts's mergePass was KILLED by "leaves
every content map identical to loading without it", re-run at its own file — pass 1 recorded
that line as inert, and the fix that made it live is `applySection`'s new
`case 'locale': throw new DslError(...)`, since `mergePass` is only ever called with
`owns: () => true` and a locale would otherwise reach the build. Re-runnable:
`npx vitest run src/content/locale.test.ts -t "leaves every content map identical"`.
- proof 7: unmet — The shape is right and mutation-proven; the set both functions answer over is
wrong, in both directions, for exactly the modules c5's fix created. Proven: replacing
`if (isEngineKey(key) || locales.base.has(key)) continue;` (locale.ts:216) with an unconditional
continue was KILLED by "names the key and the locale of a translation matching no base string",
and replacing `if (entry.language === language || declared?.has(key)) continue;` (locale.ts:198)
with an unconditional continue was KILLED by "answers which keys a language does not cover,
without a view". Both re-run at their own file. `missingTranslations` is pure over
(Locales, language).
False: "returns the keys it does not cover". Measured with `npm run inspect`: load
`# info isla / language: es` with `# entity puerta` (no title:) and `# action abrir` (no
title:). The base table is empty, so `missingTranslations(locales, 'en')` and
`missingTranslations(locales, 'es')` both return only engine keys — while an English player is
shown `isla.entity.puerta.title` and `isla.action.abrir.abrir` on screen. The report cannot see
a key that renders. The same measurement in the other direction: add a `# locale es` supplying
`isla.entity.puerta.title: Puerta`, and the translation works (`localizer.title` returns
'Puerta') while `unmatchedLocaleKeys` reports it as `{language:'es', key:
'isla.entity.puerta.title'}` — a working translation named to the translator as matching
nothing. Both follow from the base table being the universe of keys, when the universe the
localizer looks up is TEXT_FIELDS by registry object plus action slugs. Filed as a high finding.
- proof 8: met — Three mutations, all KILLED. `actionSlug`'s `.replace(/[^a-z0-9]+/g, '-')` with the
hyphen dropped was KILLED by "keys `pick up` as `pick-up`, and leaves the identifier the label",
which asserts both halves at once (base entry at island.entity.crab.pick-up, and
`entities.get('island.crab').actions[0].label === 'pick up'`). Removing the collision branch
`if (taken.has(slug)) return ...` was KILLED by "refuses two labels under one owner that reach
the same slug". Pass 1's disclosed narrowing is fixed and tested: "keys a label the id grammar
would have refused" asserts `3 Card Monte` keys as `3-card-monte` and loads, and what stays
refused is a label with no letter or digit, or one colliding with a field. Identifier untouched:
session.ts still emits `use:entity.${entityId}.${action.label}` with the raw label, and no
`# test` moved.
One weakness worth the next pass's attention rather than the grade: replacing
`actionLabel: (kind, ownerId, label) => self.content(kind, ownerId, actionSlug(label))` with a
lookup on the raw label SURVIVED src/content/locale.test.ts, the clause's own proof file, and
was killed only at whole-suite scope by scripts/play-cli.test.ts and src/ui/driver.test.ts,
re-run at their own files. The property is watched, but not by the file the clause names.
- proof 9: met — `npm run tasks -- merge-ready` this pass: tsc ok, npm test ok (2941 tests),
layer-check ok, audit-status ok, doctor ok (22 pre-existing warnings, none from this branch's
paths), bytes ok, tree ok. Three legs fail and none is behavioural: `base` (main has moved past
the merge base — this must be merged before it can land), `spec` (the two undelivered clause
records pass 1 opened) and `clauses` (pass 1's c2 and c5, which this pass re-grades). Shipped
content plays in English unchanged — integration.test.ts and shippedContent.test.ts pass over
content/tutorial-island.dsl and no `# test` section is edited in the diff. SAVE_VERSION stays 8;
`SaveDiff` and the exhaustive `SAVE_FIELDS` table exclude `language` by name
(`Exclude<keyof GameState, 'log' | 'language'>`), so a new state field still fails to compile
until it is classified. Registry `.title` stays `string` on every type. No authored content id
moved. Two published-shape changes the diff discloses and c9 does not freeze:
`PlayStatus.location.description` is `Localized | undefined` where it was `string` defaulting to
`''` (every reader — transcript.ts:50, play-cli.ts:124, render.test.tsx — tests truthiness or
supplies `?? ''`, so no reader changes), and `Item.examine` is optional where the schema used to
default an English sentence into it (nothing displays an item's examine; `itemExamine` has no
caller). Regression check beyond the clauses: every one of the nine `state.log` writers goes
through the localizer, and the shipped English text each produces is byte-identical to the
sentence it replaced. `content/engine-en.dsl` is picked up by the shipped glob
(src/ui/shippedContent.ts:6) and by play-cli's default content list, so the app is unaffected.

### Pass 3 — 2026-08-14

- base: `cfa1eb692c996ed4414390fa5cb492741856a0f2`
- head: `516a68b6c6325082a44c4e92cd4ba4c0e9ec2cd1`
- proof 1: met — Re-measured this pass, not inherited. The assertion is the seven `@ts-expect-error`
lines at src/runtime/localized.test.ts:23-35 and tsc is what runs them. Re-runnable: replace
`export type Localized = string & { readonly [LOCALIZED]: true };` in src/runtime/localized.ts
with `export type Localized = string;` and run `npx tsc --noEmit` — it reports exactly seven
TS2578 "Unused '@ts-expect-error' directive" errors at lines 23,25,27,29,31,33,35 and passes
again when restored (measured this pass; tree confirmed clean afterwards). Graded, as passes 1
and 2 were, against the fields the clause enumerates, which are all branded. Two escapes from
the universal reading measured this pass and filed as findings rather than folded into the
grade: `PlayView.said` is `string[]`, and `elideMiddle` writes the English engine string
`… N more lines` into it one line after the branded `state.log` is drained
(src/runtime/session.ts:104,365); and `ModalOption.label` is `string`, which is what lets
src/runtime/planeScreen.ts:120 compose an English heading around a localized name.
- proof 2: met — Both halves measured this pass at their own lines. Union coverage: mutating
`engine.talk.to: Talk to {entity}` to `engine.talk.too: ...` in content/engine-en.dsl was
KILLED by src/runtime/localized.test.ts "ships an English pattern for every key the union
holds, and no other key", re-run at its own file with the mutation still applied. No sentence
left in TypeScript: replacing session.ts's `travelLabel` body with
`` `Travel to ${localizer.title('location', target)}` as Localized `` was KILLED by
src/runtime/localized.test.ts "leaves no engine sentence behind in TypeScript", re-run at its
own file — a different line from the `craftLabel` pass 2 broke, so the property and not one
site is what is watched. The literal-union half is proven by tsc rather than by the named
vitest target: `export type EngineKey = (typeof ENGINE_KEYS)[number];` changed to `= string;`
produces two TS2578 errors at localized.test.ts:42,44 under `npx tsc --noEmit` (measured this
pass, restored clean). Thirty-five keys now, and engine-en.dsl covers the union exactly.
Graded on the reading passes 1 and 2 used — none of the counted engine sentences remains. The
universal reading is false and I did not fold it in: the test that carries this half matches a
TypeScript expression against the shipped patterns, so it can only ever find a duplicate of a
key that exists, and an English engine sentence that never had a key is invisible to it by
construction. Two exist — `… ${dropped} more lines` (session.ts:365) and the growth refusals
composed in src/runtime/itemInstance.ts:279-314. Both filed.
- proof 3: unmet — The rule holds on every surface pass 2 fixed and fails on the next one, which is
the modal label those fixes render a name into. Proven first: mutating localized.ts:37
`return base?.language === language ? base.text : undefined;` to `return base?.text;` was
KILLED by four named session.test.ts tests re-run at their own file; `carriedName.ts:12`
`const title = localizer.title(kind, id);` changed to `localizer.identifier(id)` was KILLED by
"names what the player carries in the language being played"; and planeReport.ts:184
`title: localizer.title('item', template),` changed to `localizer.identifier(template)` was
KILLED by "names the plane that copy carries the same way, and every title it reports". Pass
2's three surfaces are genuinely fixed.
False: "never the module's own language". Measured with `npm run inspect` over an English
module `# item rope / title: Rope / slot: hand / max-level: 1` plus a `# locale es` supplying
`isla.item.rope.title: Cuerda`, played in es with the rope carried and a level-capped feed
refused. `carriedEntries` correctly returns 'Cuerda'. The plane screen opened on the same item
publishes one option whose label is
`Cuerda at 0,0 — Rope is already at level 1, which is its maximum` — the noun in the played
language and the sentence about it in the module's own, with the Spanish entry present and
ignored. Two mechanisms produce it, both reachable and neither covered by a Decision that
excuses them. First, src/runtime/itemInstance.ts:305 builds an English engine sentence in
TypeScript and interpolates `item.title` read straight off the registry, which is the rule
"every screen a title reaches asks the localizer, not the registry" broken in a file pass 2 did
not reach. Second, src/runtime/planeScreen.ts:120-122 composes ` at ` and the refusal into a
`ModalOption.label`, which is a plain `string`, so nothing stops it compiling. The Decisions
place "a plane's growth refusal" in the prose door, but the prose door is for text the DSL
carries verbatim; this text is written in TypeScript, and the same refusal reaching `state.log`
through `prose` at session.ts:674 is shown as the bare marker `engine.text.untranslated`, so
one fact is said two different wrong ways on two surfaces of one screen.
The boundary rather than a longer list: c3 has now failed three passes on a surface nobody
enumerated, and it will keep failing while `ModalOption.label` is `string`. The compiler is
what the branch chose to carry this rule; branding that field is what puts this class of
surface back under it.
- proof 4: met — Two mutations at their own lines in src/runtime/localized.ts, both KILLED and
re-run at their own file with the mutation still applied. `const PARAM = /\{([a-z][a-z0-9-]*)\}/g;`
changed to require doubled braces was KILLED by src/runtime/localized.test.ts "puts a value in
by name". `if (value === undefined) throw new RuntimeError(...)` in `substitute` replaced with
`return '';` was KILLED by "refuses a pattern naming a parameter the call site did not supply".
The localized-parameter half is covered end-to-end by session.test.ts's
`Viaja a island.location.cove.title`, and the deliberate asymmetry (an extra parameter is
allowed) by "allows a parameter the pattern does not name". Filed as a finding, not against
this grade: the throw is enforced where the pattern is rendered rather than where it is
loaded, so a `# locale` value naming `{destino}` for `engine.travel.to` loads with no
complaint and then throws a RuntimeError out of `view()` for every screen. Measured.
- proof 5: met — All four halves mutation-proven at their own lines this pass, each KILLED and
re-run at its own file. src/content/info.ts `defaultTitle` reduced to an unconditional
`humanizeEn(self.id)` was KILLED by universe.test.ts "leaves the raw id standing in another
language, rather than an English phrase dressed as content". src/content/registry.ts:254 with
`&& language === DEFAULT_LANGUAGE` dropped was KILLED by "records a generated title as an
entry only for a module writing English". registry.ts:274
`if (action.generatedLabel && language !== DEFAULT_LANGUAGE) continue;` deleted was KILLED by
"records the generated label only for a module writing English". The article half:
src/runtime/localized.ts `if (localizer.language === 'en') params.article = articleEn(title)`
made unconditional was KILLED by localized.test.ts "refuses a language that asks for one,
rather than handing it English grammar". Grading the gate, not the serializer: the gate holds
at load and is defeated on the way back out for one kind. Measured with `npm run inspect` —
a `language: es` module declaring `# stat ataque` has no base entry for
`isla.stat.ataque.title` before serialization and `{ text: 'ataque', language: 'es' }` after a
serialize-and-reload, because serialize.ts:511 prints `title: ${stat.title}` without the
`titleLine` gate every other kind goes through. Filed high.
- proof 6: met — The equality test is the right shape and the line that carries it is live.
src/content/locale.test.ts declares `const FIELDS: Record<keyof Registry, 'content' | 'the
locale table'>`, so a new Registry field stops the file compiling until somebody classifies it,
and the test compares all content fields through `sameValue` with `namespace.snapshot()`
standing in for the Namespace. Mutation this pass: deleting
`if (section.kind === 'locale') continue;` from registry.ts:1001's mergePass was KILLED by
"leaves every content map identical to loading without it", re-run at its own file with the
mutation still applied. Re-runnable:
`npx vitest run src/content/locale.test.ts -t "leaves every content map identical"`.
- proof 7: met — Pass 2's failure is fixed and the fix is watched at four lines, each KILLED and
re-run at its own file. Restoring the pre-fix universe —
`for (const key of [...ENGINE_KEYS, ...locales.addressable])` in `missingTranslations` changed
back to `...locales.base.keys()` — was KILLED by locale.test.ts "reports a key no module has
any text for, in every language"; the same restoration in `unmatchedLocaleKeys`
(`locales.addressable.has(key)` back to `locales.base.has(key)`) was KILLED at file scope by
"stops reporting it once a locale supplies it"; dropping `field === GENERATED_FIELD ||` from
registry.ts:252 was KILLED by "reports a key no module has any text for, in every language";
and deleting `registry.locales.addressable.add(key);` from `recordActionText` was KILLED by
"answers which keys a language does not cover, without a view". `missingTranslations` is pure
over (Locales, language). I checked the set in both directions rather than re-confirming the
fix: every kind a localizer call site asks for (entity, location, item, passive, cluster-jewel,
recipe, resource, and action slugs on action/entity/location/item) is in `addressable`, and the
one fallback that is not — an actor or item the registry no longer holds — is the key c3 wants
shown. Over-reporting in the other direction, filed low rather than against the grade: stat,
skill, faction and event titles are addressable and no localizer call site asks for any of
them, so 15 of the 141 keys the shipped island's report asks a translator for change nothing on
screen.
- proof 8: met — Measured this pass at the line pass 2 named as the weakness rather than at the two
it had already killed. `actionLabel: (kind, ownerId, label) => self.content(kind, ownerId,
actionSlug(label))` in src/runtime/localized.ts changed to look the raw label up SURVIVED
src/content/locale.test.ts — the clause's own named proof file — and was killed only after the
run escalated to whole-suite scope, by scripts/play-cli.test.ts "narrates the pools of a fight
in place of the completion countdown" and src/ui/driver.test.ts "arms a spannable action rather
than resolving it", both re-run at their own files with the mutation still applied. So the
property is real and watched, and `proof: vitest src/content/locale.test.ts` is not what
watches it. The load-time halves are: pass 2 killed `actionSlug`'s
`.replace(/[^a-z0-9]+/g, '-')` and `actionSlugProblem`'s collision branch at their own lines in
that file, and both lines are unchanged in this diff. The identifier is untouched — session.ts
still emits `use:entity.${entityId}.${action.label}` with the raw label and no `# test` moved.
The proof-file gap is filed low, having now been measured on two consecutive passes.
- proof 9: met — `npm run tasks -- merge-ready` this pass: tsc ok, npm test ok, layer-check ok,
audit-status ok, doctor ok (22 pre-existing warnings, none from this branch's paths), bytes ok,
tree ok, base ok — main has not moved past the merge base since it was merged in at 198f18a.
The only failing legs are `spec` (the two undelivered clause records for c3 and c7) and
`clauses` (pass 2's c3 and c7, which this pass re-grades), neither behavioural. Shipped content
plays in English unchanged: no `# test` section is edited in the diff and integration.test.ts
and shippedContent.test.ts pass over content/tutorial-island.dsl. `SAVE_VERSION` does not move
in this diff — it is 9 at the merge base cfa1eb69 and 9 at head, the bump having come from
main's `buffs-generalized` (a517bcd), not from this branch. `SaveDiff` and the exhaustive
`SAVE_FIELDS` table still exclude `language` by name (`Exclude<keyof GameState, 'log' |
'language'>`), so a new state field fails to compile until it is classified. Registry `.title`
stays `string` on every type; the branch changed the view types, not the registry's. No
authored content id moved. Merge territory checked rather than assumed: buffs.ts's four
`engine.prune.buff.*` keys are in the union and covered by engine-en.dsl, and pass 2's
unexercised combat edge is closed — encounter.ts:252-254 now names both sides when a swing
lands on the player from the player, so the pattern is `engine.combat.other.*` and no parameter
is missing. Two published-shape changes the diff discloses and c9 does not freeze remain as
pass 2 recorded them: `PlayStatus.location.description` is `Localized | undefined`, and
`Item.examine` is optional. One thing that does get worse and is filed rather than counted
here: a serialize-and-reload of a `# stat` now materialises its generated title into an
authored one with `registryDiff` reporting nothing.

### Pass 4 — 2026-08-14

- base: `cfa1eb692c996ed4414390fa5cb492741856a0f2`
- head: `59f78f781573043a538c6b27f8325e8b1da782a9`
- proof 1: met — Re-measured this pass, not inherited, and graded on the fields the clause enumerates.
Re-runnable: replace `export type Localized = string & { readonly [LOCALIZED]: true };` in
src/runtime/localized.ts with `export type Localized = string;` and run `npx tsc --noEmit` — it
reports exactly seven TS2578 "Unused '@ts-expect-error' directive" errors at
src/runtime/localized.test.ts lines 23,25,27,29,31,33,35 and passes again when restored (measured
this pass; `git status` clean and `npx tsc --noEmit` green afterwards). All seven fields the clause
names — PlayChoice.label, PlayChoice.detail, PlayStatus.location.title, .description,
PlayStatus.entities[].title, Localized[] (the log) and PruneWarning.message — are branded and each
has its own line in the fixture. The brand's escape hatch is closed by
`describe('the brand is closed (c1)')`, and grep confirms no file in src or scripts writes
`as Localized` outside localized.ts and localizedFixture.ts.
Filed as a high finding rather than folded into this grade, because the clause's enumeration does
not reach them: the two fields pass 3 branded as c3's boundary — `ModalOption.label` and
`PlayView.said` — have no fixture line, and reverting both to `string` (dropping the now-unused
`Localized` import in modals.ts) leaves `npx tsc --noEmit` clean and src/runtime/localized.test.ts
18/18 green. Measured this pass, restored, tree clean.
- proof 2: met — Both halves measured this pass at lines no earlier pass broke. Union coverage:
`engine.plane.heading: {plane} at {hex}` in content/engine-en.dsl mutated to
`engine.plane.headings:` was KILLED by src/runtime/localized.test.ts "ships an English pattern for
every key the union holds, and no other key", re-run at its own file with the mutation still
applied. No sentence left in TypeScript: src/runtime/carriedScreen.ts's confirm label
`localizer.engine('engine.modal.confirm', { verb: ..., item: chosen.name })` replaced with
`` `${taking.value} ${chosen.name} for good?` as Localized `` was KILLED by
src/runtime/localized.test.ts "leaves no engine sentence behind in TypeScript" — a third distinct
site after pass 2's craftLabel and pass 3's travelLabel, so what is watched is the property.
The literal-union half is proven by tsc rather than by the named vitest target, unchanged from
passes 1-3: `export type EngineKey = (typeof ENGINE_KEYS)[number];` changed to `= string;` produces
two TS2578 errors at localized.test.ts:42,44. Forty-two keys now, and engine-en.dsl covers the union
exactly.
Graded on the reading passes 1-3 used — none of the counted engine sentences remains — and the
universal reading is still false and still not folded in. Measured newly this pass: the plane
screen's move vocabulary is English built in TypeScript with no key and is *displayed*, not merely
answered — `Go to ${hex}`, `allocate: slot ${direction}`, `feed: with ${name}`,
`slot: ${direction} with ${name}` (src/runtime/planeScreen.ts:57-64,108-113) and
`BACK = 'Back to inventory'`, `LEAVE = 'Close'`, `CONFIRMED = 'Go ahead'`, `RACES`. The test that
carries this half matches TypeScript expressions against shipped patterns, so a sentence that never
had a key is invisible to it by construction. Filed with c3's finding, since it is the same field.
- proof 3: unmet — The fixes hold everywhere they were aimed and the clause fails on the sibling field of
the one pass 3 branded. Proven first, this pass: mutating src/runtime/localized.ts
`return base?.language === language ? base.text : undefined;` to `return base?.text;` was KILLED by
four named src/runtime/session.test.ts tests, re-run at their own file with the mutation still
applied; `heading`'s `localizer.engine('engine.plane.heading', { plane, hex })` in
src/runtime/planeScreen.ts replaced with `localizer.prose(...)` was KILLED by "heads the plane
screen with the copy it is of, named in it"; and carriedScreen.ts's
`localizer.engine('engine.modal.item')` replaced with `'Item' as Localized` was KILLED by "labels
the carried screen in it". Pass 3's reproduction is genuinely fixed: the same repro played in es now
publishes the bare keys `engine.plane.heading` / `engine.plane.heading.said` instead of the module's
English, and the carried list reads `Cuerda` / `Miga`.
False: "never the module's own language". Measured with `npm run inspect` over an English module
`# info isla / language: en` holding `# entity sage`, a `# dialogue` with two menu choices, plus a
`# locale es` translating the room, the entity and `engine.talk.to`. Played in es, the whole screen
is right except the only part of it that carries words: the room is `Campamento`, the offer is
`Habla con Sabio`, the narration is correctly withheld as `engine.text.untranslated` — and the modal
publishes `{"key":"choice","label":"engine.modal.choice","values":["Nod politely.","Walk away."]}`.
The dialogue's own lines go through the prose door and show the marker; its menu, which is the whole
of what that screen says and the only thing the player can act on, renders the module's own language
verbatim. Same field, second surface, same measurement: the plane screen in es publishes
`values: ["allocate: slot e","feed: with Miga","Back to inventory"]` — English engine words composed
in TypeScript around a noun the localizer just translated.
The boundary, since c3 has now failed four passes and the lesson asks whether the rule is wrong: the
type is not what is missing this time, the split behind it is. Pass 3's fix rests on the Decision "a
label is read and a value is answered", and that premise is false in two directions in the branch's
own code. It is false for the dialogue modal, whose label is the constant word `Choice` and whose
values are the content. And it is false for identity, which is the half the Decision was defending:
`carriedEntries` builds `value` out of the localized name, so the same row is `Rope x1` in en and
`Cuerda x1` in es — measured, `submit-modal: item=Rope x1` is accepted in en and throws
`modal carried-items has no item that takes "Rope x1"` in es. A modal answer value is therefore
already neither a stable identifier nor an untranslated one. `ModalOption.values` is what escapes the
type, and no further branding closes it — what closes it is one presented-text-plus-answer-value pair
per option, or c3 narrowed in writing to exclude modal answer values. Filed high.
- proof 4: met — Mutation-proven this pass at its own line. `if (value === undefined) throw new
RuntimeError(...)` in `substitute` (src/runtime/localized.ts) replaced with `return '';` was KILLED
by src/runtime/localized.test.ts "refuses a pattern naming a parameter the call site did not supply",
re-run at its own file with the mutation still applied — so a `{name}` never reaches the player as a
literal. The named-substitution half is watched by "puts a value in by name" (pass 3 killed the PARAM
regex at its own line, unchanged in this diff); the localized-parameter half is covered directly by
"resolves a localized parameter in the active language before substituting it" and end-to-end by
session.test.ts's `Viaja a island.location.cove.title`; the deliberate asymmetry by "allows a
parameter the pattern does not name". The new load-time refusal is watched too:
`unsuppliedParameters`'s `return parametersOf(value).filter((name) => !known.has(name));` replaced
with `return [];` was KILLED by src/content/locale.test.ts "refuses one that does, naming the
parameter and the key".
The clause is met — it is an error, not a literal on screen. Filed high rather than against this
grade: the pass-3 promise that the error is raised where the value is assembled holds only for a
non-English locale value on a key an English pattern is already loaded for. Measured three cases with
`npm run inspect`, all of which load with no complaint and then throw RuntimeError out of `view()`:
a `# locale en` value on an en-authored key, a `# locale es` value on a key with no base entry at all
(the unauthored title of a `language: es` module, which is exactly what c5's gate creates), and any
locale value at all in a universe where the English reference has not loaded.
- proof 5: met — All four halves mutation-proven at their own lines this pass, each KILLED and re-run at
its own file with the mutation still applied. src/content/info.ts `defaultTitle` reduced to an
unconditional `humanizeEn(self.id)` was KILLED by src/content/universe.test.ts "leaves the raw id
standing in another language, rather than an English phrase dressed as content".
src/content/registry.ts's `else if (field === GENERATED_FIELD && language === DEFAULT_LANGUAGE)` with
the language test dropped was KILLED by "records a generated title as an entry only for a module
writing English". registry.ts's `if (action.generatedLabel && language !== DEFAULT_LANGUAGE)
continue;` neutralised was KILLED by "records the generated label only for a module writing English".
src/runtime/localized.ts's `if (localizer.language === 'en') params.article = articleEn(title) as
Localized;` made unconditional was KILLED by src/runtime/localized.test.ts "refuses a language that
asks for one, rather than handing it English grammar". Grep confirms info.ts:32, action.ts and
registry.ts's recipe label are the only `humanizeEn` call sites, the last two gated at the recording
seam so the label stays usable as an identifier. Pass 3's serializer escape for `# stat` is fixed and
watched: locale.test.ts "keeps a stat with no title of its own unentered across a round trip".
- proof 6: met — The equality test is the right shape and the line that carries it is live, re-measured
this pass. src/content/locale.test.ts declares `const FIELDS: Record<keyof Registry, 'content' | 'the
locale table'>`, so a new Registry field stops the file compiling until somebody classifies it, and
the test compares every content field through `sameValue` with `namespace.snapshot()` standing in for
the Namespace. Mutation: `if (section.kind === 'locale') continue;` in registry.ts's `mergePass`
neutralised was KILLED by "leaves every content map identical to loading without it", re-run at its
own file with the mutation still applied. Re-runnable:
`npx vitest run src/content/locale.test.ts -t "leaves every content map identical"`.
- proof 7: met — Mutation-proven at its own line this pass. Restoring the pre-pass-2 universe —
`for (const key of [...ENGINE_KEYS, ...locales.addressable])` in `missingTranslations` changed back to
`...locales.base.keys()` — was KILLED by src/content/locale.test.ts "reports a key no module has any
text for, in every language", re-run at its own file with the mutation still applied.
`missingTranslations` is pure over (Locales, language): no registry, no session, no view.
`unmatchedLocaleKeys` is the other half and pass 3 killed its `locales.addressable.has(key)` line,
unchanged in this diff. The known over-report stands as pass 3 recorded it: stat, skill, faction and
event titles are addressable and no localizer call site asks for any of them — `PlayStatus.stats` and
`.xp` publish ids and numbers, never titles — so a translator is asked for keys that change nothing
on screen. Not re-filed; the record pass 3 opened covers it.
- proof 8: met — Both halves mutation-proven this pass, and the proof-file gap pass 3 measured on two
consecutive passes is closed. `actionSlug`'s `.replace(/[^a-z0-9]+/g, '-')` with the hyphen dropped
was KILLED by src/content/locale.test.ts "keys `pick up` as `pick-up`, and leaves the identifier the
label" — the clause's own named proof file — which asserts both halves at once. The lookup that
survived that file on passes 2 and 3, `actionLabel: (kind, ownerId, label) => self.content(kind,
ownerId, actionSlug(label))`, changed to look the raw label up is now KILLED at its own file by
src/runtime/localized.test.ts "looks the display up under the slug, not under the label", re-run
there with the mutation still applied. The collision branch in `actionSlugProblem` is unchanged in
this diff and pass 2 killed it. The identifier is untouched: session.ts still emits
`use:entity.${entityId}.${action.label}` with the raw label and no `# test` section is edited in the
diff.
- proof 9: met — `npm run tasks -- merge-ready` this pass: tsc ok, npm test ok, layer-check ok,
audit-status ok, doctor ok (22 pre-existing warnings, none from this branch's paths), bytes ok, tree
ok, base ok. The only failing legs are `spec` (the one open clause record, c3) and `clauses` (pass
3's c3, which this pass re-grades) — neither behavioural. Shipped content plays in English unchanged:
no `# test` section is edited in the diff, and integration.test.ts and shippedContent.test.ts pass
over content/tutorial-island.dsl. `SAVE_VERSION` does not move in this diff (9 at cfa1eb69, 9 at
head). `SaveDiff` and the exhaustive `SAVE_FIELDS` table still exclude `language` by name
(`Exclude<keyof GameState, 'log' | 'language'>`), so a new state field fails to compile until it is
classified. Registry `.title` stays `string` on every type. No authored content id moved.
The two published-shape changes passes 1-3 disclosed stand: `PlayStatus.location.description` is
`Localized | undefined`, and `Item.examine` is optional. Two things this pass measured that are worse
than before the branch and are filed rather than counted here, because both need a locale file to
reach and no locale file existed before it: a contributed `# locale` value naming an unsupplied
parameter still makes every view throw for two whole classes of key, English among them; and a modal
answer value now moves with the played language, so a route recorded by `submit-modal:` replays only
in the language it was recorded in — `item=Rope x1` throws in es. Neither touches shipped English.

### Pass 5 — 2026-08-14

- base: `cfa1eb692c996ed4414390fa5cb492741856a0f2`
- head: `af7f80bc3c1fd1e723b0c8b4971311b6e3305a93`
- proof 1: met — Re-measured this pass, not inherited. The assertion is the `@ts-expect-error` block at
src/runtime/localized.test.ts:26-58 and tsc is what runs it. Re-runnable: replace
`export type Localized = string & { readonly [LOCALIZED]: true };` in src/runtime/localized.ts
with `export type Localized = string;` and run `npx tsc --noEmit` — it reports exactly fifteen
TS2578 "Unused '@ts-expect-error' directive" errors at localized.test.ts lines
27,29,31,33,35,37,39,43,45,47,49,51,53,55,57 and passes again when restored (measured this pass;
`git status --porcelain` empty and tsc green afterwards). Pass 4's escape is closed: the fixture
enumerated seven fields then and enumerates fifteen now — the original seven plus
ModalOption.label, ModalChoice.shown, PlayView.said, CarriedEntry.name, CarriedEntry.shown,
PlaneReport.name, ClusterReport.title and EncounterFoe.title — so unbranding any one of the fields
a later pass had to brand is a build failure rather than a silent reopening. The brand's escape
hatch is closed by `describe('the brand is closed (c1)')`, and grep confirms no file in src or
scripts writes `as Localized` outside localized.ts and localizedFixture.ts.
Graded, as passes 1-4 were, against the fields the clause enumerates. The enumeration's boundary,
named for the next pass rather than folded in: `Modal.leaving`, `CarriedEntry.value`,
`ModalChoice.value` and `PlayStatus.player` are plain strings by design, and two surfaces outside
the view — `src/ui/labels.ts` and command.ts's `said(...)` diagnostics, e.g. 'No local changes
staged.' at command.ts:364 — are English in TypeScript that a player reads. Neither is in this
diff and the spec defers the GUI half.
- proof 2: met — Both halves measured this pass at lines no earlier pass broke. Union coverage:
`engine.modal.race: Race` in content/engine-en.dsl mutated to `engine.modal.races:` was KILLED by
src/runtime/localized.test.ts "ships an English pattern for every key the union holds, and no
other key", re-run at its own file with the mutation still applied. A parameterised key had to be
avoided: renaming `engine.carried.worn` errors at load under this branch's own new parameter check
before any test runs, which is an ERROR row and not a verdict. No sentence left in TypeScript:
src/runtime/planeScreen.ts's `heading` — `localizer.engine('engine.plane.heading', { plane, hex })`
— replaced with a template literal cast to Localized was KILLED by src/runtime/localized.test.ts
"leaves no engine sentence behind in TypeScript", re-run at its own file: a fourth distinct site
after pass 2's craftLabel, pass 3's travelLabel and pass 4's confirm label, so what is watched is
the property. The literal-union half is proven by tsc rather than by the named vitest target,
unchanged from passes 1-4: `export type EngineKey = (typeof ENGINE_KEYS)[number];` changed to
`= string;` produces two TS2578 errors at localized.test.ts:64,66 (measured this pass, restored
clean). Forty-four keys now, and engine-en.dsl covers the union exactly.
Graded on the reading passes 1-4 used. The universal reading is still false and still not folded
in, and this pass measured the test carrying this half getting weaker rather than stronger: its
`IDENTIFIERS` allowlist went from two entries to four, two of them in carriedScreen.ts, and the
allowlist is per (file, pattern) — so replacing `localizer.engine('engine.carried.stack', ...)`
in carriedScreen.ts with the equivalent template literal SURVIVED the named test, killed only by
the unrelated brand-closure test at file scope. Filed medium.
- proof 3: unmet — The core rule and every fix aimed at pass 4's dialogue reproduction hold; the clause
fails on a mechanism this pass measured and on one that pass 4's finding named and its fix did not
reach. Proven first, this pass: mutating src/runtime/localized.ts
`return base?.language === language ? base.text : undefined;` to `return base?.text;` was KILLED by
four named src/runtime/session.test.ts tests, re-run at their own file with the mutation still
applied; and `shown: localizerOf(registry, state).prose(text)` in modals.ts's dialogue definition
replaced with `shown: text as Localized` was KILLED by "reads a dialogue menu through the prose
door, and answers it with the authored line". Pass 4's reproduction is genuinely fixed: the same
repro played in es now publishes values whose `shown` is `engine.text.untranslated`, and the
shipped island played in an untranslated language publishes keys and nothing else on every
enumerated field — measured with `npm run inspect` over content/engine-en.dsl plus
content/tutorial-island.dsl in language `zz`.
False: "never a humanized id", and "renders the fully qualified key". Measured with `npm run
inspect`: a module `# info isla / language: es` holding `# item cuerda-larga` with no `title:` and
`max-level: 1`, loaded beside the shipped engine locale and played in es — which is the
Deliverable table's own row "`language: es`, no title | es | the key". Every localized surface
obeys that row: `carried[].name` is `isla.item.cuerda-larga.title`, and `planes[].title` and
`.name` the same. `PlayView.said` does not: refusing a feed publishes
["cuerda-larga is already at level 1, which is its maximum"] — the raw id, which is the
un-humanized form of the very thing the clause forbids by name, on the one line of that screen
carrying words. The mechanism is src/runtime/itemInstance.ts:305, which reads `item.title` straight
off the registry into an English sentence built in TypeScript; it reaches the player because
`Localizer.prose` opens whenever every content module declares the played language, and
registry.ts:1028 excludes locale-only modules from `moduleLanguages`, so the shipped `en` engine
locale does not shut it. This is the line pass 3 named, and pass 3's fix branded `ModalOption.label`
instead of touching it — which hid the leak on the plane screen's heading and left it on `said`.
Second, unchanged from pass 4 and inside the field pass 4's finding named: the plane screen, the
carried verb list and character creation publish English engine vocabulary verbatim in every
language. Measured, in es: values [{"value":"allocate: slot e","shown":"allocate: slot e"},
{"value":"feed: with Miga","shown":"feed: with Miga"},{"value":"Back to inventory","shown":"Back to
inventory"}]; the verb list Grow / Equip / Destroy / Close; the races Human / Elf / Dwarf / Orc. The
`ModalChoice { value, shown }` pair the fix built is the right shape and both drivers honour it
(play-cli.ts:112 and ModalSheet.tsx:48 draw `shown`) — and on those three screens `shown` is set to
the answer through `spelled()`, which is `localizer.identifier`, the door the Decisions define as
"a value that is an id rather than words". "Back to inventory", "feed: with" and "Go to" are words.
The pair was built and then bypassed on three of the four modals.
The boundary, since the lesson asks after four failures whether the rule is wrong: the two
mechanisms are different and only one of them is arguable. The `identifier` half can honestly be
closed in writing — say in the spec that a modal's answer vocabulary is engine chrome outside c3,
and c3 stops failing on it. The itemInstance.ts:305 half cannot: it is content text read off the
registry and shown to the player without the localizer, in a case the Deliverable tabulates by hand.
Rewriting c3 does not reach it; deleting the read does. Both filed high.
- proof 4: met — Mutation-proven this pass at its own line. `if (value === undefined) throw new
RuntimeError(...)` in `substitute` (src/runtime/localized.ts:25) replaced with `return '';` was
KILLED by src/runtime/localized.test.ts "refuses a pattern naming a parameter the call site did not
supply", re-run at its own file with the mutation still applied — so a `{name}` never reaches the
player as a literal. The named-substitution half is watched by "puts a value in by name" (pass 3
killed the PARAM regex at its own line, unchanged in this diff); the localized-parameter half by
"resolves a localized parameter in the active language before substituting it" and end-to-end by
session.test.ts's `Viaja a island.location.cove.title`; the deliberate asymmetry by "allows a
parameter the pattern does not name". Pass 4's three cases are fixed and watched:
`unsuppliedParameters` now keys off `locales.english` rather than the merged table, and checks a
content key whether or not any module has text for it, watched by locale.test.ts's three new "the
parameter check reaches every locale, English included" tests.
The clause is met — it is an error, not a literal on screen. Filed high rather than against this
grade, because it is the neighbour of pass 4's finding rather than the finding: the load-time
refusal reaches `# locale` values only, and base authored text is now equally a pattern. Measured:
`# location camp / examine: The sign reads {open} and nothing else.` loads with no complaint and
then throws `isla.location.camp.examine takes a {open} the call site did not supply` out of
`view()`, so the module is unplayable in its own language; the identical string as a `# locale es`
value is refused at load with a message naming the key. Enforced where the value is written, and in
only one of the two places a value is written.
- proof 5: met — All four halves mutation-proven at their own lines this pass, each KILLED and re-run at
its own file with the mutation still applied. src/runtime/localized.ts's
`if (localizer.language === BASE_LANGUAGE) params.article = articleEn(title) as Localized;` made
unconditional was KILLED by src/runtime/localized.test.ts "refuses a language that asks for one,
rather than handing it English grammar". src/content/registry.ts:254's
`else if (field === GENERATED_FIELD && language === DEFAULT_LANGUAGE)` with the language test
dropped was KILLED by src/content/universe.test.ts "records a generated title as an entry only for
a module writing English". registry.ts:275's
`if (action.generatedLabel && language !== DEFAULT_LANGUAGE) continue;` neutralised was KILLED by
"records the generated label only for a module writing English". The `# info language:` half is
carried by the first of those and by info.ts's `defaultTitle`, which passes 2-4 killed at its own
line and which is unchanged in this diff. Grep confirms info.ts, action.ts and registry.ts's recipe
label are the only `humanizeEn` call sites, the last two gated at the recording seam so the label
stays usable as an identifier. Corroborated independently by measurement: a `language: es` module's
untitled item has no base entry, and every localized surface shows `isla.item.cuerda-larga.title`
rather than an English phrase. Pass 3's serializer escape for `# stat` stays fixed and watched by
locale.test.ts "keeps a stat with no title of its own unentered across a round trip".
- proof 6: met — The equality test is the right shape and the line that carries it is live, re-measured
this pass. src/content/locale.test.ts declares
`const FIELDS: Record<keyof Registry, 'content' | 'the locale table'>`, so a new Registry field
stops the file compiling until somebody classifies it, and the test compares every content field
through `sameValue` with `namespace.snapshot()` standing in for the Namespace. Mutation: deleting
`if (section.kind === 'locale') continue;` from src/content/registry.ts:1001's `mergePass` was
KILLED by src/content/locale.test.ts "leaves every content map identical to loading without it",
re-run at its own file with the mutation still applied. Re-runnable:
`npx vitest run src/content/locale.test.ts -t "leaves every content map identical"`.
- proof 7: met — Both halves mutation-proven at their own lines this pass, each KILLED and re-run at its
own file. Restoring the pre-pass-2 universe in `missingTranslations` —
`for (const key of [...ENGINE_KEYS, ...locales.addressable])` at src/content/locale.ts:254 changed
back to `...locales.base.keys()` — was KILLED by src/content/locale.test.ts "reports a key no module
has any text for, in every language". The same restoration in `unmatchedLocaleKeys` —
`locales.addressable.has(key)` at locale.ts:273 back to `locales.base.has(key)` — was KILLED by
"stops reporting it once a locale supplies it", at its own file this pass rather than only at
escalation. `missingTranslations` is pure over (Locales, language): no registry, no session, no
view. The known over-report stands as passes 3 and 4 recorded it — stat, skill, faction and event
titles are addressable and no localizer call site asks for any of them — and the record pass 3
opened covers it, so it is not re-filed.
- proof 8: met — Mutation-proven at the clause's own named proof file this pass. `actionSlug`'s
`.replace(/[^a-z0-9]+/g, '-')` at src/content/locale.ts:132 with the hyphen dropped was KILLED by
src/content/locale.test.ts "keys `pick up` as `pick-up`, and leaves the identifier the label",
re-run at its own file with the mutation still applied — one test asserting both halves at once,
the base entry at `island.entity.crab.pick-up` and `actions[0].label === 'pick up'`. The collision
branch in `actionSlugProblem` and the `actionLabel` lookup are unchanged in this diff and were
killed at their own lines by passes 2 and 4 respectively, so the proof-file gap pass 3 measured on
two consecutive passes stays closed. The identifier is untouched: session.ts still emits
`use:entity.${entityId}.${action.label}` with the raw label, and a `git diff --stat` of the range
over `content/` shows the only change under content/ is the new engine-en.dsl, with no `# test`
line added or removed anywhere in the diff.
- proof 9: met — `npm run tasks -- merge-ready` this pass: tsc ok, npm test ok, layer-check ok,
audit-status ok, doctor ok (22 pre-existing warnings, none from this branch's paths), bytes ok,
tree ok, base ok. The only failing legs are `spec` (the one open clause record, c3) and `clauses`
(pass 4's c3, which this pass re-grades) — neither behavioural. Shipped content plays in English
unchanged: `git diff cfa1eb69..af7f80b -- content/` is the new engine-en.dsl and nothing else, no
`# test` line moves anywhere in the diff, and integration.test.ts and shippedContent.test.ts pass
over content/tutorial-island.dsl. `SAVE_VERSION` is 9 at cfa1eb69 and 9 at head. `SaveDiff` and the
exhaustive `SAVE_FIELDS` table still exclude `language` by name
(`Exclude<keyof GameState, 'log' | 'language'>`). Registry `.title` stays `string` on every type. No
authored content id moved. The two published-shape changes passes 1-4 disclosed stand
(`PlayStatus.location.description` is `Localized | undefined`, `Item.examine` is optional) and this
pass records a third the diff discloses and c9 does not freeze: `ModalOption.values` is
`readonly ModalChoice[] | null` where it was `readonly string[] | null`, and `CarriedEntry` gains
`shown` — both drivers and every caller in the diff moved with it.
The regression question, answered against behaviour rather than against the clauses. Nothing in
shipped English moves. Two things are worse than before this branch, both reachable by a
contributor rather than by the shipped island, so neither is counted here and both are filed:
authored base text carrying a `{name}` now takes every view down with a RuntimeError where before
this branch it rendered inertly; and the plane screen's published answer values now move with the
played language, so `submit-modal: plane=feed: with Crumb` recorded in en throws
`modal item-plane has no plane that takes "feed: with Crumb"` in es, and the reverse. The second is
the same defect pass 4 filed and this branch fixed on the carried screen — `carriedEntries` now
spells `value` through a base-language localizer and `planeScreen.movesOn` does not — and at
cfa1eb69 that screen's values were language-free (`carriedName(item.title, false)`), so it is a
regression this branch introduced and half-fixed.

### Pass 6 — 2026-08-14

- base: `cfa1eb692c996ed4414390fa5cb492741856a0f2`
- head: `b8c620d58a3a56f4fa687436d53b66c9baf848cb`
- proof 1: met — Re-measured this pass, not inherited. The assertion is the `@ts-expect-error` block at
src/runtime/localized.test.ts:26-58 and `npx tsc --noEmit` is what runs it. Re-runnable: replace
`export type Localized = string & { readonly [LOCALIZED]: true };` in src/runtime/localized.ts with
`export type Localized = string;` and run `npx tsc --noEmit` — it reports exactly fifteen TS2578
"Unused '@ts-expect-error' directive" errors at localized.test.ts lines
27,29,31,33,35,37,39,43,45,47,49,51,53,55,57 and passes again when restored (measured this pass;
`git status --porcelain` empty afterwards). The fifteen fields are the original seven plus
ModalOption.label, ModalChoice.shown, PlayView.said, CarriedEntry.name, CarriedEntry.shown,
PlaneReport.name, ClusterReport.title and EncounterFoe.title, unchanged in this diff. The brand's
escape hatch stays closed by `describe('the brand is closed (c1)')`, and grep confirms no file in
src or scripts writes `as Localized` outside localized.ts and localizedFixture.ts.
Graded, as passes 1-5 were, against the fields the clause enumerates. The enumeration's boundary
this pass, measured rather than assumed: `Refusal.refused` in src/runtime/itemInstance.ts became
`Localized` in this diff and is NOT in the fixture, so the fixture's own stated rule — "Every field
a later pass had to brand, listed here so that unbranding one is a build failure" — is not kept for
it. Reverting it to `string` does fail tsc, but by one incidental call site
(`state.log.push(growth.refused)` at session.ts:672, TS2345) rather than by the fixture. Filed low,
not against this grade. `Modal.leaving`, `CarriedEntry.value`, `ModalChoice.value`,
`PlaneFrame.said` and `PlayStatus.player` remain plain strings; the first four by design, and
`PlaneFrame.said` is where c3 fails this pass.
- proof 2: met — Both halves measured this pass at lines no earlier pass broke. Union coverage:
`engine.plane.back: Back to inventory` in content/engine-en.dsl — a key this diff adds — mutated to
`engine.plane.backe:` was KILLED by src/runtime/localized.test.ts "ships an English pattern for
every key the union holds, and no other key", re-run at its own file with the mutation still
applied. No sentence left in TypeScript: src/runtime/itemInstance.ts's new
`localizer.engine('engine.growth.max-level', { item: carriedName(...), level: item.maxLevel })`
replaced with the equivalent template literal cast to Localized was KILLED by
src/runtime/localized.test.ts "leaves no engine sentence behind in TypeScript", re-run at its own
file — a fifth distinct site after pass 2's craftLabel, pass 3's travelLabel, pass 4's confirm
label and pass 5's plane heading, so what is watched is the property rather than one line.
Sixty-two keys now and content/engine-en.dsl covers the union exactly.
Pass 5's medium finding on this half is fixed and I re-measured the fix rather than reading it: the
`IDENTIFIERS` allowlist is one entry per occurrence rather than per (file, pattern) — it lists
`src/runtime/carriedScreen.ts: {item} ({slot})` twice, which is the exact shape pass 5 measured as
invisible — and the assertion is `toEqual` against the sorted offender list, so an eighteenth
occurrence anywhere in src fails it. The literal-union half is proven by tsc rather than by the
named vitest target, unchanged from passes 1-5: `export type EngineKey = (typeof ENGINE_KEYS)
[number];` changed to `= string;` produces TS2578 errors at localized.test.ts:64,66 (measured this pass, restored clean).
Graded on the reading passes 1-5 used. The universal reading is still false and still not folded
in: the engine's own refusal sentences in itemInstance.ts and clusterEffect.ts have no key at all,
so no scan built from the shipped patterns can see them — filed against c3, where they land.
- proof 3: unmet — Pass 5's two named mechanisms are genuinely fixed and I re-measured both; the clause
fails on the same refusal reaching a second surface, which is the neighbour rather than the finding.
Fixed and mutation-proven this pass, each KILLED and re-run at its own file with the mutation still
applied: src/runtime/itemInstance.ts's max-level refusal reverted to
`localizer.prose(\`${item.title} is already ...\`)` was KILLED by src/runtime/session.test.ts "shows
the key on what a refused growth says, and the translation where a locale supplies one";
src/runtime/carriedScreen.ts's `shown: localizer.engine(each.shown)` reverted to
`localizer.identifier(each.value)` — pass 5's `spelled()` — was KILLED by "shows the key for every
engine word the played language has no entry for"; src/runtime/planeScreen.ts's `base:
carriedName(base, ...)` changed back to the played localizer was KILLED by "offers the same answers
in every language, on every screen"; and the core no-fallback line
`return base?.language === language ? base.text : undefined;` changed to `return base?.text;` was
KILLED by four named session.test.ts tests. Measured independently: the shipped island played in
`zz` publishes keys and nothing else on location, entities, choices, resources, the
character-creation modal and the carried modal; and pass 5's own reproduction — `# info isla /
language: es`, `# item cuerda-larga` with no title, played in es — now says
`["engine.growth.max-level"]` where pass 5 measured the raw id.
False: "renders the fully qualified key", on the plane screen, and "never the module's own
language" in the other direction. `Growth.refused` became `Localized` in this diff, but
`PlaneFrame.said` is still a plain `string` and `planeScreen.ts:136`'s `heading` renders it with
`localizer.prose(frame.said)` — the door for un-keyed DSL text, applied to text that has already
been through the localizer. Measured with `npm run inspect`, a module `# info isla / language: es`
holding `# item cuerda` (max-level 1) and `# item miga`, loaded beside the shipped engine locale
and played in `en`: the log line is `isla.item.cuerda.title is already at level 1, which is its
maximum` — the key inside the English pattern, exactly what the clause asks for — while the plane
screen the growth was taken on shows `isla.item.cuerda.title at 0,0 — (untranslated)`. The same
refusal, two surfaces, and the one the player is looking at is the one that loses the key a
translator needs. The other direction, with a `# locale es` supplying `engine.plane.heading.said`
and the frame's `said` written by an English session (it is a save field): the heading reads
`Cuerda en 0,0 — isla.item.cuerda.title is already at level 1, which is its maximum` — a whole
English engine sentence to a Spanish player.
Second, and the reason the first is not the only one: six growth refusals are English sentences
built in TypeScript with no key, handed to `prose` — `you carry no {id}` (itemInstance.ts:243,292,
293), `there is no item or item instance called ...` (286), `... is not a base: only an item you can
wear has a plane to grow` (289), `... grants no item experience` (311), `... is not a cluster jewel`
(326), `... carries no cluster effect` (clusterEffect.ts:89). The prose door opens when every
content module declares the played language, which is a sound proxy for a `say:` and exactly
backwards for engine-built English: the case where the door opens is precisely the case where the
player reads the module's language. Measured, an `es` module played in es:
`["isla.cuerda-larga grants no item experience"]` and `["isla.miga is not a base: only an item you
can wear has a plane to grow"]`. This pass keyed one of the seven refusals and left six; the
Decision that blesses a growth refusal as prose argues it from a hex, a direction and a node, which
describes `plainly()`'s two callers and not these.
Both filed high. Neither is a regression against cfa1eb69 — that tree showed `frame.said` verbatim
in every language and built the same six sentences — so this is a clause that has not yet been met
rather than something this branch broke.
- proof 4: met — Both halves mutation-proven this pass at their own lines, each KILLED and re-run at its
own file with the mutation still applied. `if (value === undefined) throw new RuntimeError(...)` in
`substitute` (src/runtime/localized.ts:25) replaced with `return '';` was KILLED by
src/runtime/localized.test.ts "refuses a pattern naming a parameter the call site did not supply".
Pass 5's high finding on the second place a value is written is fixed and measured at its own new
line: `if (unsupplied.length > 0) throw new DslError(...)` in registry.ts's new `recordBase`
neutralised was KILLED by src/content/locale.test.ts "refuses an authored examine that names one,
naming the key and the parameter". Re-measured end to end with `npm run inspect`: `# location camp /
examine: The sign reads {open} and nothing else.` — pass 5's exact reproduction, which loaded with
no complaint and then threw out of every view — is now refused at load with
`isla.location.camp.examine names {open}, which nothing supplies`, naming the key and the parameter.
Both places a base entry is written route through `recordBase`, and both loops in `compileModules`
catch the DslError and attribute it to the module that wrote the section rather than to modules[0].
The named-substitution half is watched by "puts a value in by name", the localized-parameter half by
"resolves a localized parameter in the active language before substituting it" and end-to-end by
session.test.ts's `Viaja a island.location.cove.title`, and the deliberate asymmetry by "allows a
parameter the pattern does not name". Over-strictness checked rather than assumed: the refusal is
`/\{[a-z][a-z0-9-]*\}/`, so `{Hello}` and `{ x }` still load and only a lowercase token is refused;
`npm test` passes over the shipped island unchanged. The narrowing is real and is not recorded in
`## Decided while building it`, which still reads as covering `# locale` values alone — filed low.
- proof 5: met — Both recording gates mutation-proven this pass at their own lines, each KILLED and
re-run at its own file with the mutation still applied. src/content/registry.ts's
`else if (field === GENERATED_FIELD && language === DEFAULT_LANGUAGE) recordBase(...)` with the
language test dropped was KILLED by src/content/universe.test.ts "records a generated title as an
entry only for a module writing English"; `if (action.generatedLabel && language !==
DEFAULT_LANGUAGE) continue;` neutralised was KILLED by "records the generated label only for a
module writing English". Both lines moved in this diff (they now call `recordBase` rather than
`registry.locales.base.set`), so this is a measurement of the current text and not an inheritance.
The `# info language:` half is carried by info.ts's `defaultTitle`, killed at its own line by
passes 2-5 and unchanged here; the article half by src/runtime/localized.ts's
`if (localizer.language === BASE_LANGUAGE) params.article = articleEn(title) as Localized;`, killed
at its own line by pass 5 and unchanged here. Grep confirms info.ts, action.ts and registry.ts's
recipe label are still the only `humanizeEn` call sites. Corroborated by measurement rather than by
the tests alone: a `language: es` module's untitled item shows `isla.item.cuerda-larga.title` on
carried[].name, planes[].title and planes[].name, never an English phrase.
- proof 6: met — The equality test is the right shape and the line that carries it is live, re-measured
this pass. src/content/locale.test.ts declares `const FIELDS: Record<keyof Registry, 'content' |
'the locale table'>`, so a new Registry field stops the file compiling until somebody classifies it,
and the test compares every content field through `sameValue` with `namespace.snapshot()` standing
in for the Namespace. Mutation: deleting `if (section.kind === 'locale') continue;` from
src/content/registry.ts's `mergePass` was KILLED by src/content/locale.test.ts "leaves every content
map identical to loading without it", re-run at its own file with the mutation still applied.
Re-runnable: `npx vitest run src/content/locale.test.ts -t "leaves every content map identical"`.
Nothing in this diff touches the merge path.
- proof 7: met — Both halves mutation-proven at their own lines this pass, each KILLED and re-run at its
own file with the mutation still applied. Restoring the pre-pass-2 universe in `missingTranslations`
— `for (const key of [...ENGINE_KEYS, ...locales.addressable])` in src/content/locale.ts changed
back to `...locales.base.keys()` — was KILLED by src/content/locale.test.ts "reports a key no module
has any text for, in every language". The same restoration in `unmatchedLocaleKeys` —
`locales.addressable.has(key)` back to `locales.base.has(key)` — was KILLED by "stops reporting it
once a locale supplies it". `missingTranslations` is pure over (Locales, language): no registry, no
session, no view. The seventeen keys this diff adds to ENGINE_KEYS enter the report's universe
through `ENGINE_KEYS` itself, so the report grew with the set rather than needing a second list. The
known over-report stands as passes 3-5 recorded it and its record is open, so it is not re-filed.
- proof 8: met — Mutation-proven at the clause's own named proof file this pass. `actionSlug`'s
`.replace(/[^a-z0-9]+/g, '-')` in src/content/locale.ts with the hyphen dropped was KILLED by
src/content/locale.test.ts "keys `pick up` as `pick-up`, and leaves the identifier the label",
re-run at its own file with the mutation still applied — one test asserting both halves at once, the
base entry at `island.entity.crab.pick-up` and `actions[0].label === 'pick up'`. The collision
branch in `actionSlugProblem` and the `actionLabel` lookup are unchanged in this diff and were
killed at their own lines by passes 2 and 4. The identifier is untouched: `git diff
cfa1eb69..b8c620d -- content/` is the new engine-en.dsl and nothing else, no `# test` line is added
or removed anywhere in the diff, and `npm test` passes over the shipped `# test` sections.
- proof 9: met — `npm run tasks -- merge-ready` this pass: tsc ok, npm test ok (2994 tests, 125 files),
layer-check ok, audit-status ok, doctor ok (22 pre-existing warnings, none from this branch's
paths), bytes ok, tree ok, base ok. The only failing legs are `spec` (the one open clause record,
c3) and `clauses` (pass 5's c3, which this pass re-grades) — neither behavioural. Shipped content
plays in English unchanged: `git diff cfa1eb69..b8c620d -- content/` is the new engine-en.dsl and
nothing else, and I measured the English plane screen end to end — item values `Rope x1 / Crumb x5 /
Close`, verbs `Grow / Equip / Destroy / Close`, plane values `allocate: slot e / feed: with Crumb /
Back to inventory` and the heading `Rope at 0,0 — Rope is already at level 1, which is its maximum`,
all identical to what cfa1eb69 produces. `SAVE_VERSION` is 9 at cfa1eb69 and 9 at head. `SaveDiff`
and the exhaustive `SAVE_FIELDS` table still exclude `language` by name
(`Exclude<keyof GameState, 'log' | 'language'>`). Registry `.title` stays `string` on every type. No
authored content id moved. The published-shape changes passes 1-5 disclosed all stand, and this pass
records one more the diff discloses and c9 does not freeze: `destroyItem` now takes the registry,
and `Growth.refused` is `Localized` where it was `string`.
The regression question, answered against behaviour rather than against the clauses. Nothing in
shipped English moves. Pass 5's two named regressions are both closed, and I re-measured both rather
than reading the commits: authored base text carrying a `{name}` no longer takes every view down —
it is refused at load, naming the key and the parameter — and the plane screen's answers no longer
move with the played language (`answers(moves('es'))` equals `answers(moves('en'))`, mutation-proven
above). One behaviour is stricter than cfa1eb69 rather than worse than it: content whose authored
text contains a `{lowercase-token}` loaded there and does not load here. That is the alternative to
a render-time crash and the message names what to fix, so it is filed as an undisclosed narrowing
rather than as a regression. Nothing else measured worse: the plane heading's `(untranslated)` and
the six unkeyed refusal sentences both behave at cfa1eb69 as they do here (verbatim English in every
language there, verbatim English or the marker here), so they are c3 unmet and not a regression.

### Pass 7 — 2026-08-14

- base: `cfa1eb692c996ed4414390fa5cb492741856a0f2`
- head: `a91c3d35efc01608c2671127d13e58e07cd37d19`
- proof 1: unknown
- proof 2: unknown
- proof 3: deferred — Deferred by the author onto what-is-stored-or-replayed-is-an-id, which is where it can
be met. This is a scope decision, not a grade: pass 6 measured c3's two remaining surfaces and both
are unreachable from inside this spec. PlaneFrame.said is a plain string in the save, so a refusal
composed by an English session reads as English to a Spanish player however well the composing is
keyed, and giving the frame a key and its parameters instead moves the save shape - which this
spec's own c9 forbids by name. The second surface, twenty engine sentences still built in
TypeScript and handed to the prose door, is reachable here but settles only half of it, and half a
clause is what the last four passes each bought. The new spec's c3 and c4 are the same property
stated where the save may move; its c5 is the regression that stops this recurring. The record
reimplement-localization-clause-3 moves to that spec rather than being created afresh, so passes 2
through 6 stay its history. Everything else this spec promised is met as of pass 6: fourteen of
fourteen mutations killed, eight clauses met, and merge-ready green on every behavioural leg.
- proof 4: unknown
- proof 5: unknown
- proof 6: unknown
- proof 7: unknown
- proof 8: unknown
- proof 9: unknown
