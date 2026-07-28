# Build & deployment audit — 2026-07-28

Independent audit of repository system 6 (**Build & deployment**) at `50a4f41`, covering the
7 code-changing commits recorded against it since the last baseline `83d81d2`:
`50a4f41, 3d1c389, 5e6eceb, 542f994, ee8c06e, 2905b41, 2e05502`. Declared paths per
`docs/audits/systems.json`: `.github/workflows/publish.yml`, `android/`, `capacitor.config.ts`,
`vite.config.mjs`, `package.json`, `tsconfig.json`. No `lastAuditDoc` was on record for this
system before this doc — per `backlog.md`, this audit resolves that gap.

Baseline: `npx tsc --noEmit` clean, 21 files / 315 tests green (pre-existing, not re-measured).

Every finding below marked **verified** was reproduced locally (build run, grep, `git show`,
`npm audit`, `npm ls`, or direct file inspection) and the method is stated inline. Findings
marked **reasoned** come from reading `.github/workflows/publish.yml` and `android/` line by
line, since actually exercising a release was out of bounds for this audit (no push, tag, or
workflow run was made). No prior open finding for this system exists in `backlog.md` to avoid
re-reporting.

---

## What the pipeline gets right

The things this audit could break, it didn't:

- **`npm run build` succeeds cleanly** — verified by running it: `tsc && vite build` completes
  in ~1.6s, 27 modules, emits `dist/index.html` + one JS chunk (143.92 kB, 46.26 kB gzip) + one
  CSS chunk (16.57 kB, 4.02 kB gzip). No source maps in the output (`build.sourcemap` is unset,
  Vite's default is `false`) — verified by `find dist -name "*.map"` returning nothing, so there
  is no IP-leak-via-sourcemap risk today.
- **`dist/` is correctly gitignored and not stale-committed** — `.gitignore:2` excludes it,
  `git ls-files dist` returns nothing, and `git status` after a full local build stayed clean
  except for an unrelated, external change to `docs/audits/systems.json` (a concurrent process,
  not this audit — confirmed by `git diff` showing no actual delta at the time I checked).
- **The three deleted scripts left no dangling references.** Commits `542f994` and `3d1c389`
  removed `scripts/playtest-cli.ts`, `scripts/readability-audit.ts`, and
  `scripts/readability-check.ts` along with their `package.json` entries. Verified: `grep -i
  "readability"` against `package.json` returns nothing, and every remaining script
  (`comment-budget`, `comment-only`, `layer-check`, `audit-status`) runs clean end-to-end
  (`npm run comment-budget` → 309/9575 lines, all files within budget; `npm run audit-status` →
  runs and reports; `npm run layer-check` → 279 imports checked, all downward).
- **`tsconfig.json`'s `include: ["src", "scripts"]` (added in `50a4f41`) does what it claims.**
  `npx tsc --noEmit` is clean with `scripts/` included, closing the gap the commit describes
  (nine script files, previously invisible to the type checker).
- **No unmet or extraneous dependencies** — `npm ls --depth=0` resolves cleanly, every declared
  dependency is present at a satisfying version.
- **No signing material is committed.** `git ls-files android | grep -iE
  "\.(jks|keystore|p12|pem|key)$"` returns nothing; the keystore and all four signing
  credentials come from GitHub Actions secrets, never from tracked files.
- **`tsconfig.json`'s `strict: true` is intact**, and the only escape hatches present
  (`skipLibCheck`, `allowJs: false`) are conventional, not `any`-permissive additions by the
  audited commits.

---

## H1 — the web build ships absolute asset paths, which itch.io's own docs say will 404 on their hosting

**Verified (build output) + reasoned (external corroboration).** `vite.config.mjs` never sets
`base`, so Vite's default `base: '/'` applies. Built and inspected `dist/index.html` directly:

```html
<script type="module" crossorigin src="/assets/index-Dz6W9R4m.js"></script>
<link rel="stylesheet" crossorigin href="/assets/index-DHU6Q_xh.css">
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
```

All three are root-absolute. itch.io's own HTML5 docs (https://itch.io/docs/creators/html5) and
its community support threads state that an HTML5 upload is served from a subdirectory of
itch's CDN, and an absolute path (`/...`) causes the browser to request outside that
subdirectory and 404 — the fix is `base: './'` so every path stays relative to
`index.html`'s own location. This is a known, specifically-Vite gotcha (confirmed by multiple
independent reports of the same symptom with Vite defaults). I did not push a build to itch to
reproduce the 404 directly — that would violate this audit's "never publish" constraint — but
the mechanism is externally documented, not inferred, and the absolute paths are directly
verified in the built artifact this pipeline emits.

This does not appear to regress Capacitor's Android build: Capacitor's WebView serves `dist/`
from a virtual host root (`https://localhost/`), so root-absolute paths already resolve
correctly there. Switching to `base: './'` should fix itch.io without affecting Android, since
relative paths resolve correctly from any serving root.

**Fix**: add `base: './'` to `vite.config.mjs`, rebuild, and diff `dist/index.html` to confirm
the paths become relative before the next tag push.

---

## H2 — the pipeline has no gate against publishing a non-functional placeholder, and today's build is exactly that

**Verified.** `src/main.tsx:6-20` renders a single fixed-size div with the text
`"Universalis — text-adventure GUI pending"` and nothing else — no import of the runtime, no
session, no router. This is a known, intentional placeholder (`src/ui` does not exist yet per
`docs/audits/systems.json`'s own note on the User Interface system), not a bug in this system's
files — but the *consequence* is squarely this system's: `.github/workflows/publish.yml` builds
and ships whatever `src/main.tsx` produces, unconditionally, to both itch.io and a GitHub
Release APK, on any `v*` tag push. There is no smoke test, no manual approval step, and no
check anywhere in the pipeline that the emitted artifact is more than a static placeholder div.

I built `dist/` locally and confirmed this is precisely what a tag push would ship right now:
opening `dist/index.html`'s app would render only the placeholder text, full-screen, with no
game content reachable — `public/content/` only holds `gui/locales/en.json` and
`universes/index.json` (`["base"]`, an empty manifest with no matching universe files
anywhere), and nothing in `main.tsx` fetches or renders it.

This is a cross-system finding: the defect's owner is System 4 (User interface, "pending the
GUI rebuild"), but the risk — a release pipeline that will happily publish a placeholder as a
real release, with no gate to catch it — belongs to Build & deployment. Recorded here rather
than left implicit, per the instruction to establish what the deployed artifact currently *is*.

**Fix direction**: not "fix the UI" (out of this system's scope) but give the pipeline a
minimal acceptance check — e.g., a post-build smoke assertion (headless load, assert the root
element contains more than the known placeholder string) that fails the workflow rather than
publishing silently. Cheap insurance against exactly this scenario recurring once the real UI
lands and a future regression reintroduces a blank/broken render.

---

## M1 — this system's path membership is dominated by commits that never touch its actual pipeline

**Verified.** `git show --stat` against each of the 7 audited commits, filtered to this
system's declared paths, shows all 7 touched **only** `package.json` or `tsconfig.json` — never
`.github/workflows/publish.yml`, `android/`, `capacitor.config.ts`, or `vite.config.mjs`:

| Commit | File(s) touched in this system |
| --- | --- |
| `50a4f41` | `tsconfig.json` (add `scripts` to `include`) |
| `3d1c389` | `package.json` (remove 2 script entries) |
| `5e6eceb` | `package.json` (remove 1 script entry) |
| `542f994` | `package.json` (remove 1 script entry) |
| `ee8c06e` | `package.json` (add 2 script entries) |
| `2905b41` | `package.json` (add 1 script entry) |
| `2e05502` | `package.json` (add 1 script entry) |

Every one of these is really **Testing procedure** work (the readability-gate build-and-retire
arc, documented in `docs/readability-gate/deliverable-log.md`) or **DSL/repo-wide tooling**
work, expressed as an edit to a shared config file. Confirmed the actual pipeline is untouched
further back than the audit window: `git log -1 -- .github/workflows/publish.yml android
capacitor.config.ts vite.config.mjs` resolves to `bda44e5`, and `git merge-base --is-ancestor
bda44e5 83d81d2` succeeds — meaning none of the four files that define the actual web/Android
pipeline have changed even once since *before* the previous recorded baseline. This system's
audit trigger fired entirely on noise from a neighboring system.

This is the flip side of CLAUDE.md's "keep independent systems independent": `package.json` and
`tsconfig.json` are legitimately shared infrastructure (every system's scripts and type
coverage live there), but attributing 100% of their edits to *this* system means Build &
deployment's audit budget is spent by whichever system happens to edit a script entry fastest,
while the pipeline that actually deploys the game can go unaudited indefinitely as long as
nobody touches it — which is exactly what's been happening.

**Fix direction**: narrow this system's ownership of `package.json`/`tsconfig.json` to the keys
that are actually build/deploy-relevant (e.g. the `build`/`sync`/`preview` scripts and the
`include`/`references` compiler fields), or accept `package.json`/`tsconfig.json` as
genuinely cross-cutting and stop assigning them to a single system in `systems.json`. Either
way, this is a `systems.json` design call for the user, not a code fix — flagged here as
evidence, not resolved.

---

## M2 — third-party publish actions are pinned to floating tags, not commit SHAs, and three of them handle secrets

**Reasoned**, from reading `.github/workflows/publish.yml` line by line. Three third-party
(non-`actions/`, non-`github/`) actions are referenced by mutable version tags:

- `josephbmanley/butler-publish-itchio-action@v1.0.3` (publish.yml:19) — receives
  `BUTLER_CREDENTIALS`.
- `r0adkll/sign-android-release@v1` (publish.yml:44) — receives the base64 signing key, alias,
  keystore password, and key password (publish.yml:46-49), i.e. everything needed to sign a
  release APK as this app.
- `softprops/action-gh-release@v1` (publish.yml:52) — has implicit `GITHUB_TOKEN` access to
  create/attach release assets.

A tag ref (`v1`, `v1.0.3`) can be moved by the upstream maintainer (or by an attacker who
compromises their account) to point at different code without the pin in this repo changing.
Since two of these three actions receive live secrets that can publish to itch.io or sign an
APK as this app, this is a real supply-chain surface, not a style nit. `actions/checkout@v4`,
`actions/setup-node@v4`, `actions/setup-java@v4` are lower-risk (GitHub-maintained, no secrets
passed) but share the same floating-tag pattern.

**Fix**: pin the three third-party actions to a full commit SHA (`uses:
owner/repo@<40-char-sha> # vX.Y.Z` for readability), per GitHub's own supply-chain hardening
guidance. GitHub-maintained actions are lower priority but the same treatment is cheap.

---

## M3 — no explicit `permissions:` block in `publish.yml`

**Reasoned.** Neither the workflow nor either job declares a `permissions:` block
(publish.yml:1-55), so both jobs run with whatever the repository/organization's default
`GITHUB_TOKEN` permissions are — a setting outside this repo, and therefore not verifiable from
here. `softprops/action-gh-release@v1` needs `contents: write` to attach the APK to a release;
the `web` job needs no GitHub API access at all (it only talks to itch.io via `BUTLER_CREDENTIALS`).
Relying on an implicit, externally-configured default is exactly the kind of ambient-scope
setup GitHub's own security hardening guide recommends against — a future org-level default
flip, or a new step accidentally added to either job, inherits whatever the default grants
with no visible ceiling in this file.

**Fix**: add an explicit `permissions:` block scoped per job — e.g. `contents: read` at the
workflow level, overridden to `contents: write` only on the `android` job's release-attach step
(or the whole `android` job).

---

## L1 — Android's version is hardcoded and has no relationship to `package.json`'s version

**Verified.** `android/app/build.gradle:10-11`:

```gradle
versionCode 1
versionName "1.0"
```

`variables.gradle` and `build.gradle` contain no reference to `package.json`'s `"version":
"0.1.0"` (package.json:4), and no CI step reads or writes either value against the other.
`versionCode` has been `1` since project inception (`android/` was last touched, in full, by
`8465481`/`bda44e5` — see M1's table — long before the current version-0.1.0 state), which
means an Android package manager or side-loader has no way to tell two successive published
APKs apart: both would report `versionCode 1`. This is the manually-kept-in-sync pattern
CLAUDE.md's mission statement calls out directly, except worse — currently *nobody* keeps it in
sync, by hand or otherwise.

**Fix**: derive `versionCode`/`versionName` from `package.json` at build time (a small Gradle
snippet reading the JSON, or a CI step that `sed`s the two fields before `assembleRelease`),
so there is one version number, not two silently-independent ones.

---

## L2 — `playwright-core` is an unused devDependency

**Verified.** `grep -r "playwright"` across the whole tracked tree (excluding
`node_modules`/lockfile) matches only `package.json` and `package-lock.json` — no source file,
script, or test imports it. Cross-checked `package-lock.json`: `playwright-core` has no
`dependencies` entry pointing to it from any other installed package (i.e. it's not a transitive
requirement of something else, such as `vitest`'s browser mode) — it is a direct, standalone
devDependency doing nothing. `git log -S"playwright-core" package.json` traces it to `35121b2`
("Implement balanced enemy combat editor"), a commit whose subject has no obvious connection to
browser automation, consistent with an accidental or exploratory addition that was never wired
up or cleaned up.

**Fix**: remove it, or if it's earmarked for the eventual reintroduction of the `window.__test`
browser harness (per CLAUDE.md's UI section), say so — an unused ~large native-binary
devDependency with no comment or backlog entry explaining its presence reads as dead weight.

---

## L3 — `tsconfig.node.tsbuildinfo` is committed to git

**Verified.** `git ls-files tsconfig.node.tsbuildinfo` returns the file — it is tracked.
`.gitignore` has no `*.tsbuildinfo` entry. It is also stale: its mtime and last commit
(`ee51578`) predate this audit's build run, and running `npm run build` (`tsc && vite build`)
did not regenerate it — the root `tsc --noEmit` invocation used by the build script does not
build the referenced `tsconfig.node.json` project in `-b` mode, so this file is dead weight
that nothing in the current pipeline even refreshes.

**Fix**: add `*.tsbuildinfo` to `.gitignore` and `git rm` the tracked copy.

---

## L4 — `vite.config.mjs` itself is outside the type-check gate

**Verified.** Root `tsconfig.json`'s `include` is `["src", "scripts"]`; `tsconfig.node.json`'s
`include` is `["capacitor.config.ts"]` only. `vite.config.mjs` — one of this system's own
declared paths, and the file responsible for H1 above — is covered by neither project, so
`tsc --noEmit` never looks at it (and `allowJs` is `false` at the root regardless). Low
practical impact today (the file is 27 lines and has no import errors), but notable given that
`50a4f41`, one of the seven commits under audit, closed exactly this kind of gap for `scripts/`
on the stated reasoning that an untype-checked build-relevant file "shipped silently" broken.
`capacitor.config.ts` gets this coverage via `tsconfig.node.json`; `vite.config.mjs` does not,
for no principled reason found in the config — it's simply a `.mjs` file and neither `include`
array reaches root-level `.mjs`/`.js` config files.

**Fix**: add `vite.config.mjs` (and, if desired, `postcss.config.js`/`tailwind.config.js`) to
`tsconfig.node.json`'s `include`, or accept the gap explicitly as low-value given the file's
size and change frequency.

---

## L5 — the Android CI job re-implements the `sync` npm script instead of reusing it

**Verified.** `package.json:11` already defines `"sync": "npm run build && cap sync"`. The
`android` job in `publish.yml:37-39` performs the same two steps inline instead:

```yaml
- run: npm run build
- run: npx cap sync android
```

Functionally near-identical (the npm script syncs all platforms; the workflow scopes to
`android` specifically, which `cap sync android` supports as an argument to the existing
script's `cap sync` call). Minor duplication of the same "build then sync" sequence in two
places — if the `sync` script ever grows a step (a pre-sync content check, say), the workflow
silently keeps skipping it, which is the exact kind of hand-synced drift the audit prompt asks
to flag as a place a simpler existing pattern should have been reused.

**Fix**: `npm run sync -- android` in the workflow, or accept the duplication as intentional
(CI wants only the Android platform, the local script wants both) and drop this as noise.

---

## L6 (informational, not actionable) — `npm audit` findings are all dev-tooling-only

**Verified.** `npm audit --json` reports 6 vulnerabilities (3 high, 3 critical): `tar` (via
`@capacitor/cli`), `brace-expansion` (transitive), `concurrently`→`shell-quote` (critical), and
`postcss` (via the Tailwind build toolchain). All four root packages are `devDependencies` or
build-time-only tools; none ship inside `dist/` (verified: `dist/assets/*.js` is Vite's
production bundle, and none of `tar`/`shell-quote`/`concurrently`'s code paths are reachable
from the app running in a browser — they only execute on a developer's or CI runner's machine).
Reporting honestly per the audit prompt's instruction not to inflate transitive dev-only
findings: **no user-facing or production security exposure found.** Worth a routine
`npm audit fix`/dependency bump pass at some point (the `@capacitor/cli` fix is a semver-major
jump to 8.x and should be tested against the other `@capacitor/*` packages still pinned to
`^6.2.1`), but this is maintenance, not a defect introduced by the audited commits.

---

## Design questions for the user (not defects)

1. **Should a tag be required to descend from a green `test.yml` run before `publish.yml` can
   ship it?** Today it deliberately isn't — `test.yml`'s own header comment
   (`.github/workflows/test.yml:3-7`) documents that `publish.yml` only runs `npm run build` on
   a tag push, by design, so a red test reports on the commit that broke it rather than blocking
   on a release. This is a pre-existing, self-aware tradeoff, not something these 7 commits
   introduced — noted for confirmation, not as a finding. One sharp edge worth being aware of:
   `test.yml` triggers on `branches: ['**']`, not `tags:`, so a commit that was tagged and
   pushed without ever being pushed to a branch (e.g. a local-only branch, or a detached-HEAD
   tag) would never have run `test.yml` at all before `publish.yml` ships it.
2. **Given H2, is a `v*` tag push imminent, or is the pipeline expected to sit idle until the
   GUI rebuild lands?** If idle, H2 is low-urgency housekeeping; if a tag could land soon, H2
   becomes the most important finding in this doc.
3. **Should the `web` and `android` jobs in `publish.yml` be sequenced, or is independent
   partial success acceptable** (e.g. itch.io updates successfully while the Android signing
   step fails, leaving no GitHub Release asset)? Neither job currently depends on the other.
