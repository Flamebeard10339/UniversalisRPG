## The Android chrome is Capacitor's indigo, and nothing in the app chose it

`android/app/src/main/res/values/styles.xml:7-9` sets `colorPrimary`, `colorPrimaryDark` and
`colorAccent` on `AppTheme`, which `AndroidManifest.xml:10` applies. Nothing in this repository
declares those three names.

They resolve anyway, and the build is not at risk: `android/capacitor.settings.gradle:2-3`
includes `:capacitor-android` from `node_modules/@capacitor/android/capacitor`,
`android/app/build.gradle:45` takes it as a project dependency, and that library ships
`src/main/res/values/colors.xml` declaring exactly those three — `#3F51B5`, `#303F9F`,
`#FF4081`, each marked `tools:ignore="UnusedResources"`, which is Capacitor shipping them so a
template `styles.xml` like this one links. So resource merging supplies them and aapt2 has
nothing to refuse.

What is left is smaller and is yours: the app's native chrome is Material indigo and pink,
picked by Capacitor's template, while `src/index.css` paints the page from a palette of its
own. Nobody chose the disagreement, and a player sees both at once.

*Moves when: you say whether the launcher and system chrome carry the app's palette — in which
case a `colors.xml` declares the three against `src/index.css` — or Capacitor's, in which case
the three `<item>` lines say so where somebody reading `styles.xml` will see it.*

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
