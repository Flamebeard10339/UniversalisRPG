## The app's name and its bundle id have no home, and giving them one is a build step

Two of the three facts that used to stand together here have been settled since the note was
written. The version is derived: `android/app/build.gradle:6-7` reads `package.json` and
computes `versionCode` from it, so the only copy left is the `Version 0.1.0` heading in
`public/changelog.txt`, which is a document naming what it describes rather than a second
authority. The theme colour is derived too — `index.html` now carries an empty `theme-color`
and the build fills it from `--color-surface`.

What is left is genuinely two hand-kept sets, and both live in files nothing generates:

- **Bundle id** `org.universalis.rpg`, in five places: `android/app/build.gradle:11` and `:14`,
  the Java package and its directory path under `android/app/src/main/java/`, and
  `android/app/src/main/res/values/strings.xml:5-6`. `capacitor.config.ts:6` declares it as
  well and `npx cap sync` does not rewrite any of the five.
- **Display name** `UniversalisRPG`, in three that ship: `capacitor.config.ts:7`,
  `android/app/src/main/res/values/strings.xml:3-4`, and `index.html:8`'s `<title>`.

Deriving either means a generator writing a Gradle file, an Android resource XML and a Java
package directory from `capacitor.config.ts`, and a `transformIndexHtml` reading that config
for the title. That is a build step the repository does not have, and inventing one to remove
a duplication nobody has yet been bitten by is the decision, not the work.

*Moves when: you say either that the app's name and id are worth a generated `strings.xml` and
Gradle block — in which case `capacitor.config.ts` becomes the one home and a script writes the
rest, checked in and byte-asserted the way `scripts/tmgrammar.ts` does the editor manifest — or
that they are set-once facts a rename would touch by hand anyway, in which case the five and
the three are annotated as copies of `capacitor.config.ts` and this closes.*

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

The browser's chrome has the same question one layer up, and it is now the only thing left to
decide about it. `index.html`'s `theme-color` is filled at build time from `--color-surface`,
which is what the hand-written literal said — but `body` is painted `--color-background`
(`src/index.css:26`), so the bar above the page and the page itself are deliberately different
colours, or were never meant to be. Nobody chose that either. Say which token the chrome should
read and `CHROME_TOKEN` in `scripts/lib/indexHtml.ts` is a one-word change.

*Moves when: you say whether the launcher and system chrome carry the app's palette — in which
case a `colors.xml` declares the three against `src/index.css` — or Capacitor's, in which case
the three `<item>` lines say so where somebody reading `styles.xml` will see it; and which of
`--color-surface` and `--color-background` the browser's own bar should read.*

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
