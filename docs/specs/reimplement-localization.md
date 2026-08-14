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
