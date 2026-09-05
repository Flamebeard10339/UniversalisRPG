## The app's name, its id and its version are each spelled in several files and derived from none

Nothing composes what the built app calls itself, so every one of these is a hand-kept copy and
the build will not notice when they part.

- **Android bundle id** `org.universalis.rpg` — five places across `android/` and the Capacitor
  config. `npx cap sync` does not rewrite them.
- **Display name** — seven spellings, including `index.html`'s `<title>` and three in
  `run-web.cmd`.
- **Version** — `public/changelog.txt` states one, `android/app/build.gradle` states one, and
  `package.json` is the file that owns it.
- **Theme colour** — `index.html:7` sets `<meta name="theme-color" content="#111827">`, which is
  `--color-surface` in `src/index.css:8`, spelled again as a literal. Worth noting the two
  already read as a disagreement about intent: the browser chrome is painted *surface* while
  `body` is painted `--color-background` (`src/index.css:26`), so retuning the palette splits
  the chrome from the page.
- **Dev port** — `.claude/launch.json` and `package.json`'s `dev:android` both say 5173, which
  is also Vite's default; `run-web.cmd` deliberately uses 5174 so a human's server does not
  fight an agent's. That last one is a real second fact and should stay — but it should say so.

Shape 3 throughout. The awkward part is that most of these live in files nothing generates —
a Gradle file, a manifest, a `.cmd` — so "derive it" means a build step that writes them from
`package.json`, which is a decision about the build rather than a tidy-up.

The theme colour is the one that can be derived cheaply and alone: a Vite `transformIndexHtml`
hook substituting the token read out of `src/index.css`, about eight lines.

*Closes when:* the name, the id and the version each have one home that the others are written
from at build time, or each copy is annotated with what it is a copy of — and `run-web.cmd`'s
port says why it differs.

## `editor/vscode/package.json` restates what `tmgrammar.ts` declares

`scripts/tmgrammar.ts` writes `editor/vscode/syntaxes/dsl.tmLanguage.json` from the section
declarations, and `scripts/tmgrammar.test.ts` asserts the checked-in bytes are what it prints —
so the grammar file itself cannot drift. `editor/vscode/package.json` is outside that: it names
the scope, the grammar path, the language name and the file extensions again, by hand, and
nothing checks them against the generator's own constants.

Rename the scope or the output path and the extension silently stops colouring anything, with
every gate green.

*Closes when:* the extension manifest's language block is written by `npm run tmgrammar` too, or
`scripts/tmgrammar.test.ts` asserts the manifest agrees with `SCOPE_NAME` and `GRAMMAR_PATH`.
