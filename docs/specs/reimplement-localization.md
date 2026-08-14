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
- **`Equip` and `Unequip` stay English.** They are the carried screen's answer *values* — the string
  a `submit-modal:` directive replays — so localizing them would move an authored id, which c9
  forbids. Splitting a modal option's display from its value is the GUI's task, and the two keys the
  deliverable listed are left out of the union rather than added and left dead.
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
