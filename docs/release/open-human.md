## Three colours the Android theme names and nothing declares

`android/app/src/main/res/values/styles.xml:7-9` sets `colorPrimary`, `colorPrimaryDark` and
`colorAccent` from `@color/colorPrimary`, `@color/colorPrimaryDark` and `@color/colorAccent`.
No `colors.xml` exists — the only `<color>` under `res/values/` is `ic_launcher_background`.
`AppTheme` is applied at `AndroidManifest.xml:10`, so those references are linked rather than
dead, and aapt2 should refuse them.

Nothing has caught it because nothing has run it. `publish.yml` triggers on `tags: ['v*']` and
there are no `v*` tags, so the Android job has never built once; `styles.xml` has stood
untouched since `84654819`, the second commit in the repository. The first release tag is the
first time this is exercised.

Two ways out, and they are a design call rather than a repair: define the three, in which case
they are the app's own colours and want picking against `src/index.css`; or take the three
`<item>` lines out of `AppTheme` and let the AppCompat parent supply them, in which case the
native chrome is whatever the platform gives. I did not guess, and I cannot run Gradle here to
confirm either.

*Moves when: you say whether the launcher and system chrome carry the app's palette or the
platform's, and — either way — somebody runs `assembleRelease` once before a tag is pushed.*

## Two colour tokens the stylesheet declares and Tailwind cannot reach

`src/index.css` declares nineteen `--color-*` tokens; `tailwind.config.js:6-24` names
seventeen of them. `--color-flash` and `--color-gilt` are absent, so there is no `bg-flash` or
`text-gilt` and never was — which is why both are reached only through raw `var()` rules in
the stylesheet itself, at `src/index.css:97` and `:252`.

Nothing is broken today, and the config could derive the whole set by reading the stylesheet
it already sits beside. But deriving it would mint `bg-flash` and `bg-gilt` as utilities, and
whether those two are part of the palette a component may reach for — or deliberately the
stylesheet's own, spent on one highlight and one sweep — is a decision about the design
system rather than about the config.

*Moves when: you say whether every `--color-*` token is a utility a component may use, in
which case the config reads them off `index.css` and stops being a list; or whether `flash`
and `gilt` are the stylesheet's alone, in which case the seventeen are right and the two are
named in the config as deliberately withheld.*
