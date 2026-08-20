# Build & deployment — audit, 2026-07-30

Scope: `50a4f41..f8c8c8d`, the two code-changing commits touching this system's declared paths since
`docs/audits/build-deployment-2026-07-28.md`:

| Commit | Subject |
| --- | --- |
| `060dd3e` | Stop the publish pipeline shipping broken paths, floating actions and dead weight (BD-H1, BD-M2, BD-M3, BD-L1–L5) |
| `4b6e383` | Pin LF in the index and run CI on Windows too |

Baseline at `f8c8c8d`: `npx tsc --noEmit` clean, `npm test` 509 passing across 33 files,
`npm run layer-check` 433 imports all pointing downward, `npm run build` clean. Every claim below was
reproduced against the working tree; reproductions are quoted inline.

---

## H1 — the signed release APK is built in development configuration and points its WebView at a dev server

`capacitor.config.ts:3`, `package.json` (`"sync": "npm run build && cap sync"`),
`.github/workflows/publish.yml:44`.

```ts
const isDev = process.env.NODE_ENV !== 'production';
const config: CapacitorConfig = {
  …,
  ...(isDev && { server: { url: 'http://10.0.2.2:5173', cleartext: true } }),
};
```

`npm run build` sets `NODE_ENV=production` **inside the Vite process only**. `cap sync` is a separate
process in the same `&&` chain, and the android job sets no environment, so it reads
`NODE_ENV === undefined` and takes the dev branch. Reproduced with the exact environment the workflow
provides:

```
--- config as CI's `cap sync` sees it (NODE_ENV unset) ---
NODE_ENV=undefined
{ "appId": "org.universalis.rpg", "appName": "UniversalisRPG", "webDir": "dist",
  "server": { "url": "http://10.0.2.2:5173", "cleartext": true } }

--- with NODE_ENV=production ---
{ "appId": "org.universalis.rpg", "appName": "UniversalisRPG", "webDir": "dist" }
```

The local synced artefact confirms the same output reaches the build:
`android/app/src/main/assets/capacitor.config.json` carries `"url": "http://10.0.2.2:5173"`.

`cap sync` bakes that into the APK's assets. `10.0.2.2` is the Android emulator's alias for the host's
loopback; on any real device it resolves to nothing routable. The published APK — assembled, signed
with the release key, and attached to the GitHub Release by `publish.yml:52-62` — therefore ignores its
own bundled `dist` and tries to load a dev server that does not exist. It also ships with cleartext
HTTP enabled, and Capacitor emits a network-security config permitting it.

Nothing catches this: the workflow's success does not depend on the app loading, and the tracked tree
holds no synced config to review (`android/app/.gitignore` excludes the build output, correctly).

**Fix.** Make the release path explicit rather than ambient — set `NODE_ENV: production` on the
android job (or gate on a dedicated flag), and assert the absence of `server` in the synced
`capacitor.config.json` before `assembleRelease`. An ambient default that produces a *broken* release
when unset is the wrong direction for the default to fail in; `isDev` should have to be asked for.

This is the same shape as **BD-H2**, still open from 2026-07-28: a tag push publishes something that
cannot work. That one ships the placeholder GUI; this one ships an APK that would not render even a
finished GUI. Both want the same gate.

---

## M1 — `publish.yml` pins its actions by commit; the release itself is pinned to nothing

`.github/workflows/publish.yml:15-62`.

`060dd3e` correctly closed BD-M2/BD-M3 — all five actions are pinned by commit with the tag in a
trailing comment, and the two steps that read the itch.io credentials and the signing key say why in
place. Verified: no floating tag remains in this file, `permissions: contents: read` is set at the top
level, and only the android job raises to `contents: write`.

What the pass did not reach is that neither job pins what it *builds*. `npm ci` is honest to the
lockfile, but `setup-java` takes `temurin`/`21` (a moving patch line), the Gradle wrapper resolves its
own distribution at build time, and `assembleRelease` pulls plugin and AndroidX versions from
`variables.gradle` as ranges the lockfile does not cover. The threat model `060dd3e` wrote down —
"a moved tag would hand those secrets to code nobody here reviewed" — applies unchanged to the Gradle
dependency graph running in the same job as `SIGNING_KEY`.

Filed M, not H: it is a supply-chain surface rather than a demonstrated defect, and the same job's
action pinning means the cheap half is already done.

## M2 — `web` and `android` publish independently, so a tag can ship half a release

`.github/workflows/publish.yml:11,29`. The two jobs have no `needs:` between them and no shared gate.
If `web` succeeds and `android` fails (or the reverse), the tag is half-published: itch.io carries a
build with no matching APK on the release, or a release carries an APK for a web build that never went
out. There is no rollback step, and re-running the workflow re-pushes to itch.io — `butler` treats it
as a new upload to the same channel, so the itch side is idempotent, but the GitHub release asset is
not.

Also: **neither job runs the test suite.** `test.yml` runs on `push: branches: ['**']` and
`pull_request`, and a tag push matches neither, so the one workflow that runs `tsc`, `npm test`,
`layer-check` and `audit-status` does not gate a publish. In practice the tagged commit was usually
tested as a branch head first — but "usually" is the whole finding, and `060dd3e`'s own header comment
in `test.yml` notes that `publish.yml` "only runs `npm run build` on a tag push" without treating it
as a gap.

---

## L1 — `.gitattributes` justifies itself with a claim `4b6e383` made false in the same commit

`.gitattributes:1-3` says the index keeps LF "so a checkout on any platform parses the same bytes",
and `test.yml:15` justifies the Windows matrix leg as the place a CRLF checkout is seen. Both cannot be
load-bearing at once: with `* text=auto eol=lf` in effect, both runners check out identical bytes, so
the Windows leg never sees CRLF. The real CRLF guard is the in-memory synthesis in
`integration.test.ts:15`, which `4b6e383` added and which is correct. This is TP-L2 of
`docs/audits/testing-procedure-2026-07-30.md` seen from the other side; recorded here because
`.gitattributes` is this system's file and carries half the false pair. The Windows leg is still worth
keeping — it covers `posix()`, tsx and vitest on the development platform — the comment just names the
wrong reason.

## L2 — `run-web.cmd` starts a server the repo cannot render

`run-web.cmd` is a user-facing entry point ("Starting UniversalisRPG at http://127.0.0.1:5174/") for a
tree whose only page is `PlaceholderRoot`. Harmless while BD-H2 is open and known, but it is the third
artefact promising a working app; it should be part of whatever closes BD-H2 rather than discovered
after.

## L3 — `capacitor.config.ts` hardcodes the emulator host

`capacitor.config.ts:9`. `10.0.2.2:5173` only works for an AVD; a physical device on the same LAN needs
the host's address. `npm run dev:android` uses `cap run android --livereload`, which supplies its own
URL, so the literal is doing nothing for the workflow that would need it and everything for the one
that must not have it (H1).

---

## Verified closed

- **BD-H1 — `base` was never set, so `dist/index.html` emitted absolute `/assets/...`.** Fixed and
  verified by building at `f8c8c8d`:

  ```
  <link rel="icon" href="./favicon.svg" …>
  <script type="module" crossorigin src="./assets/index-Cj9FBF_3.js"></script>
  <link rel="stylesheet" crossorigin href="./assets/index-BoKxJmHt.css">
  ```

  Note this covers `index.html`'s `/favicon.svg` too — Vite rewrites it — so the absolute reference in
  the source is not a second instance of the bug.
- **BD-M2 + BD-M3 — floating action tags on the secret-handling steps.** Fixed; see M1 for what pinning
  still does not cover.
- **BD-L1 — hand-synced `versionCode`/`versionName`.** Fixed. `android/app/build.gradle:6-7` derives
  both from `package.json` (`0.1.0 -> versionCode 100`), which is the manually-synced pair CLAUDE.md
  forbids, removed.
- **BD-L5 — the android job re-implementing `npm run sync`.** Fixed; it calls the script. That is what
  makes H1 a single-point fix.
- **BD-L3 + BD-L4 — a tracked `tsbuildinfo`, and `vite.config.mjs` outside every tsconfig project.**
  Fixed: `vite.config.ts` is inside the one project and is type-checked, and no `tsbuildinfo` is
  tracked (`git ls-files | grep tsbuildinfo` is empty).
- **M1 of 2026-07-28 — `package.json`/`tsconfig.json` as members of this system.** Correctly removed;
  the counter now moves only when a pipeline file changes, which is why this window is two commits
  rather than twelve.
- **The android tree is clean.** 53 tracked files, all sources, resources and wrapper; no `.gradle`
  cache, no `build/`, no prebuilt web bundle. The stale `assets/public/content/universes/…` on disk is
  untracked local sync output, not repo weight.

## Not findings

- **`android/app/build.gradle`'s `minifyEnabled false`.** A size and reverse-engineering choice, not a
  defect, and irrelevant while the app is a placeholder.
- **`.gitattributes` binary opt-outs.** `*.png`, `*.jpg`, `*.jar`, `*.keystore` cover what the tree
  actually holds; the gradle wrapper jar is the one that mattered and it is listed.
- **No scope drift.** Both commits do what their messages say, and `060dd3e`'s reach into `src/index.css`
  and `public/` is the UI system's paths, audited in `docs/audits/user-interface-2026-07-30.md`.

## Recommended work order

1. **H1** — the release artefact does not work, and the fix is one environment variable plus one
   assertion. Pair it with the assertion, or the next config change reintroduces it silently.
2. **M2's second half** — make `publish.yml` depend on the test suite. Cheapest real gate available.
3. **BD-H2** (carried over) — stop tag pushes shipping the placeholder; H1 and this want the same
   release-readiness check, so design them together.
4. **M1**, **M2's first half**, then **L1**–**L3**.
