# User interface audit — 2026-07-28

Independent audit of repository system 4 (**User interface**) at `50a4f41`, branch
`dsl-pass2-resources`. Declared paths (`docs/audits/systems.json`): `src/ui`,
`src/main.tsx`, `src/index.css`, `index.html`.

Baseline: `npx tsc --noEmit` clean, **21 files / 315 tests** green (none of them touch
any UI path — confirmed by listing all `*.test.ts*` files in the repo).

At the start of this audit `systems.json` recorded `lastAudit: "83d81d2"` with
`lastAuditDoc: null` for this system, and `git log 83d81d2..HEAD -- src/ui src/main.tsx
src/index.css index.html` returns **zero commits** — nothing has touched these paths
since that marker. Partway through this audit the marker was reset to `null` (a
concurrent process; `systems.json` now reads `"note": "...The 83d81d2 marker was reset
to null on 2026-07-28: it recorded a counter reset with no audit behind it."`), which is
consistent with CLAUDE.md's own rule that an undocumented reset "fails the same check."
Either way the fact this audit verifies is the same: **no commit in this repository's
history that this audit could attribute to a "User interface" system has ever been
audited**, and the system today is a single 26-line placeholder plus a stylesheet and
config left over from a GUI that was deleted before this branch existed.

**Coverage statement:** `src/ui` does not exist. There is no routing, no tabs, no
modals, no floating text, no map/character/settings screens — none of the CLAUDE.md
`User interface` shape has been built yet. This audit therefore has almost nothing to
review for *implementation* correctness; it instead verifies the *declared state*
(does "awaiting the GUI rebuild" hold up), what residue the legacy-GUI teardown left
in the paths that do exist, and whether the system's path declaration itself is
accurate. Every finding below is about hygiene/declaration, not about a bug in running
UI code, because there is no running UI code to have a bug in.

---

## What exists (verified)

- **`src/ui` does not exist.** `ls src/ui` → `No such file or directory`.
- **`src/main.tsx`** (26 lines) renders a single `PlaceholderRoot` component — a
  centered div reading "Universalis — text-adventure GUI pending," using inline
  styles only. It imports `react`, `react-dom/client`, `reactflow/dist/style.css`,
  and `./index.css`. No routing, no state, no CLI/session wiring.
- **`index.html`** references `/favicon.svg` (resolves to `public/favicon.svg`,
  present) and `/src/main.tsx` (present). Both references resolve; no broken links.
- **`src/index.css`** (270 lines) is almost entirely dead: Tailwind directives,
  ~150 lines of `!important` overrides mapping Tailwind utility classes
  (`.bg-slate-950`, `.text-cyan-300`, `.border-rose-500`, …) onto CSS custom
  properties, React Flow node/handle rules, and four bespoke animation classes
  (`.dialogue-panel`, `.quick-workbench-sheet`, `.continuous-action-progress`,
  `.instant-action-pulse`). **None of these class names appear anywhere else in the
  live tree** — `grep -rl` for each returns only `src/index.css` itself. See M1.
- **`tailwind.config.js`** / **`postcss.config.js`** exist at repo root, are wired
  into the Vite build, and are **declared in no system** — see L2/L3 below. The
  Tailwind `content:` glob (`./index.html`, `./src/**/*.{ts,tsx}`) still resolves
  (it doesn't point at a deleted directory), but it scans every layer's `.ts`/`.tsx`
  files, not just UI-owned ones.

## What is stranded from the legacy GUI teardown

Two teardown commits are relevant, both confirmed by `git log`/`git show`:

- `c5d5da4` "Delete the dead legacy engine and React GUI" — an earlier purge that
  removed, among other things, `WorldMap.tsx`.
- `bda44e5` "Decommission dead legacy GUI/contribution layer; quarantine GUI work to
  attic/" (2026-07-17) — deleted `src/components/contribution/*`, `src/stores/*`
  (`gameState.ts`, `universeState.ts`, ~1,180 lines), and moved `App.tsx`,
  `ContributionMapEditor.tsx`, and the `window.__test` harness
  (`testHarness.ts`/`testHarnessDom.ts`/`testHarness.test.ts`) to `attic/`.
- `843d8b8` "spring cleaning" (2026-07-26) — **deleted `attic/` in full**, 3,595
  lines across `App.tsx`, `README.md`, `ContributionMapEditor.tsx`, and the three
  test-harness files.

**`attic/` does not exist today** — confirmed by `find . -iname "*attic*"` (no hits)
and `git ls-files | grep -i attic` (no hits). It was quarantine, not permanent
storage, and the quarantine was fully emptied nine days after it was created. See H1
for the stale reference this left behind.

`public/` is not attic, was never part of the quarantine, and was never cleaned up:
`public/content/` (49 KB: `universes/index.json` listing `["base"]`, and
`gui/locales/en.json`, 730 lines) is legacy-GUI localization/universe-picker data.
`grep -rl "universes\|locales"` across `src/` and `scripts/` returns nothing — no
live code reads either file. `npm run build` still copies both into `dist/content/`
on every build (verified: `dist/content/gui/locales/en.json` and
`dist/content/universes/index.json` both present after a fresh build). See M2.

`package.json`'s `dependencies` (not `devDependencies`) still lists `zustand`,
`@uiw/react-codemirror`, all six `@codemirror/*` packages, `@lezer/highlight`, and
`diff` — the exact dependency set the deleted contribution editor and Zustand stores
used. `grep -rl "from '<pkg>'"` across `src/` and `scripts/` for every one of these
returns zero hits. `reactflow` is imported once, CSS-only (`main.tsx`'s
`import 'reactflow/dist/style.css'`) — no `.tsx` file imports the `reactflow` JS
package. See M3. (`package.json` is a **Build & deployment**-declared path, not
User interface's; reported here because it is the direct residue of the teardown
this audit was asked to trace, and flagged for that system to pick up.)

## Is the declaration honest

Yes, on the two claims that matter: `src/ui` genuinely does not exist, and the
system genuinely has zero attributable commits. The declaration is *incomplete*,
not false — see L2/L3 for the specific gaps (unowned `public/`, `postcss.config.js`,
`tailwind.config.js`, `src/vite-env.d.ts`).

---

## Findings

### H1 — `vite.config.mjs` documents a directory and a README that have not existed for nine days

**File:** `vite.config.mjs:20-22` (Build & deployment's declared path, reported here
as direct fallout of the UI/GUI teardown this audit traces).

```js
// attic/ holds quarantined pre-rewrite GUI salvage — intentionally not
// type-checked or tested (see attic/README.md).
'attic/**',
```

`attic/` and `attic/README.md` were both deleted in `843d8b8` (2026-07-26), two days
before this audit's HEAD. The exclude glob is now a no-op (nothing under `attic/**`
exists to exclude), and the comment cites a file (`attic/README.md`) that cannot be
opened. This is exactly the pattern CLAUDE.md's comment policy calls out —
"[comments] that restate a finding is a third copy that cannot be executed and will
rot" — except here it's not a restated finding, it's a comment whose only content was
always "read this other file," and that file is gone. Severity is H not because of
runtime impact (there is none — an empty glob matches nothing, harmlessly) but
because it is a **verified false statement sitting in a CI-relevant config file**,
undetectable by any existing gate: `npm run comment-budget` only scans `.ts`/`.tsx`
(see L1), and nothing checks that a path named in a comment still exists.

**Fix:** delete the `'attic/**'` line and its comment in a future Build & deployment
commit; there is nothing left to exclude.

### M1 — `src/index.css` is ~90% dead CSS, unrestrained by any gate, and its one substantive comment names two files that no longer exist

**File:** `src/index.css:183-187`.

```css
/* Hidden by default (no visible connection dots); a node that needs React
   Flow to actually measure its handle bounds (for edge routing) overrides
   this with an inline `display: 'block'` — see WorldMap.tsx/
   ContributionMapEditor.tsx's location node types. */
.react-flow__handle {
  display: none;
}
```

`WorldMap.tsx` was deleted in `c5d5da4` (before this branch's DSL rewrite began).
`ContributionMapEditor.tsx` was deleted in `843d8b8`, same as H1's `attic/`. Neither
file exists at any path in the current tree (`git log --all -- '**/WorldMap.tsx'`
shows its last-touching commit was the deletion). The comment describes a contract
owned by two modules that are both gone — the specific thing CLAUDE.md's comment
policy prohibits ("Never describe another module's contract. That comment drifts the
moment its owner changes.") The owner didn't just change; it was deleted, twice.

More broadly: every Tailwind-utility override block (`.bg-slate-950`,
`.text-cyan-300`, `.border-rose-500`, …, roughly lines 60–170) and all four animation
classes (`.dialogue-panel`, `.quick-workbench-sheet`, `.continuous-action-progress`,
`.instant-action-pulse`) target class names that appear nowhere else in the repo
(verified: `grep -rln` for each returns only `src/index.css`). `PlaceholderRoot` uses
inline styles exclusively. This is dead CSS, and it compiles: `npm run build`
produces `dist/assets/index-*.css` at 16.57 kB (4.02 kB gzip) — almost entirely this
file's Tailwind-directive expansion, since nothing in the live tree emits Tailwind
utility classes for the JIT scanner to need overrides for.

**Why no gate catches this:** `npm run comment-budget` (`scripts/comment-ratio.ts`,
via `scripts/lib/sourceFiles.ts`) hardcodes `SOURCE_EXTENSIONS = ['.ts', '.tsx']`.
CSS files are invisible to CLAUDE.md's comment budget entirely — the policy exists in
name for this file but has never been enforced against it, verified by re-running
`npx tsx scripts/comment-ratio.ts --all` and confirming `src/index.css` is absent
from its output list of scanned files.

**Fix:** when the GUI rebuild starts, `index.css` should be rewritten from the
CLAUDE.md-declared shape (Map/Home/Character/Settings/Edit tabs, three modals,
floating text), not inherited — none of the current rules have a live consumer to
verify against.

### M2 — `public/content/` ships 49 KB of legacy GUI data (locales, universe list) that no live code reads

**Files:** `public/content/universes/index.json` (10 bytes of content, `["base"]`),
`public/content/gui/locales/en.json` (730 lines).

Confirmed unreferenced: `grep -rl "universes\|locales" --include=*.ts --include=*.tsx
src/ scripts/` returns nothing. Confirmed still shipped: after `npm run build`,
`dist/content/gui/locales/en.json` and `dist/content/universes/index.json` are both
present (Vite copies `public/` verbatim). `public/` predates the DSL rewrite (its
locale/universe files were last touched by pre-rewrite commits like `79c4bf5 Added
full localization support`) and survived both teardown commits untouched — it was
never attic, so it was never in scope for the cleanup that hit `src/stores` and
`src/components/contribution`.

**Impact is small (49 KB) but the pattern matters**: `public/` is not a declared
path of any system (see L2), so nothing will ever flag it as due for review, and
nobody currently owns deciding whether this data seeds the rebuilt localization
system (per the backlog's "Reimplement localization" item) or should be deleted.

### M3 — `package.json` `dependencies` names eight packages nothing imports

**File:** `package.json:23-40` (Build & deployment's declared path).

`zustand`, `@uiw/react-codemirror`, `@codemirror/autocomplete`,
`@codemirror/commands`, `@codemirror/language`, `@codemirror/lint`,
`@codemirror/state`, `@codemirror/view`, `@lezer/highlight`, `diff` — every one
returns zero hits from `grep -rl "from '<pkg>'" src/ scripts/`. These are the
Zustand-store and DSL-module-editor dependencies removed by `bda44e5`; the deletion
commit removed the *code* but not the *manifest entries*. `reactflow` is a partial
case: still imported, but CSS-only (`main.tsx:3`, `import
'reactflow/dist/style.css'`) — no `.tsx` file imports the `reactflow` JS package
itself. Verified via `npm run build`: `grep -c "ReactFlow\|reactflow" dist/assets/*.js`
→ 0 (the JS component code is never pulled in), but `grep -o "react-flow"
dist/assets/*.css | wc -l` → 125 occurrences — reactflow's own 9,214-byte stylesheet
is compiled whole into the 16.57 kB production CSS bundle for a component that is
never rendered.

This is a Build & deployment finding by path ownership, surfaced here because it's
the direct residue of the same teardown H1/M1/M2 trace, and because the GUI rebuild
will need to decide fresh whether React Flow (for a map view) is worth keeping before
these entries are cleaned or kept deliberately.

### L1 — `npm run comment-budget` cannot see CSS, HTML, or JSON at all

Not specific to this audit's files, but discovered while checking M1: CLAUDE.md
states "Comments are capped at 5% of a file's lines, gated by `npm run
comment-budget`" without qualification, but the tool
(`scripts/lib/sourceFiles.ts:4`, `SOURCE_EXTENSIONS = ['.ts', '.tsx']`) only ever
governs TypeScript. `src/index.css`'s now-false comment (M1) could not have been
caught by this gate under any circumstance — it isn't a gap in vigilance, the gate
structurally does not apply to the file type where this audit's one clear "false
comment" finding lives.

### L2 — `src/ui` is a no-op in `layer-check`, and `src/main.tsx` is checked by nothing

`scripts/layer-check.ts:19` sets `ROOTS.ui = 'src/ui'`; `sourceFiles('src/ui')`
(`scripts/lib/sourceFiles.ts:12-14`) catches the `readdirSync` failure and returns
`[]`. Confirmed by running `npx tsx scripts/layer-check.ts` directly: it reports
"279 cross-file imports checked... every import points downward" with zero
violations, which is true only because zero files were checked for the `ui` layer.

Separately, and more consequentially for the rebuild: `layerOf()` matches a file to
a layer only if its path `startsWith('${ROOTS[layer]}/')`. `src/main.tsx` is not
under `src/ui/`, so it is not attributed to *any* layer — `layer-check` does not
check it today (currently harmless, since `main.tsx` only imports `react`,
`react-dom`, and two CSS files — no upward violation exists to catch), but if the
rebuild wires session/runtime calls directly into `main.tsx` rather than routing
everything through `src/ui/`, `layer-check` would not catch a boundary violation
there. This is a structural blind spot in the checker, not a live violation.

### L3 — `public/`, `postcss.config.js`, `tailwind.config.js`, and `src/vite-env.d.ts` are owned by no system

Requested cross-check of `docs/audits/systems.json` against the repo tree. Every
top-level tracked path, matched against the six systems' declared paths:

| Path | Owning system |
| --- | --- |
| `src/grammar`, `src/content` | DSL load path |
| `src/runtime` | Runtime |
| `src/ui`, `src/main.tsx`, `src/index.css`, `index.html` | User interface |
| `scripts`, `.github/workflows/test.yml` | Testing procedure |
| `.github/workflows/publish.yml`, `android`, `capacitor.config.ts`, `vite.config.mjs`, `package.json`, `tsconfig.json` | Build & deployment |
| `src/vite-env.d.ts` | **none** — inside `src/` but matches none of the four UI paths |
| `public/` (incl. `favicon.svg`, `changelog.txt`, `content/`) | **none** — referenced by `index.html`/build output but not declared |
| `postcss.config.js` | **none** — transforms `src/index.css`, declared nowhere |
| `tailwind.config.js` | **none** — generates most of `src/index.css`'s bulk, declared nowhere |
| `.claude/` | **none** |
| `content/` (top-level, `tutorial-island.dsl` — distinct from `src/content`) | **none** |
| `docs/` | **none** |
| `.github/ISSUE_TEMPLATE/` | **none** (only two specific files under `.github/workflows/` are owned) |
| `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `backlog.md`, `package-lock.json`, `run-web.cmd`, `tsconfig.node.json` | **none** |
| `tsconfig.node.tsbuildinfo` | **none** — and it is a tracked build artifact (`git ls-files \| grep tsbuildinfo` finds it; `.gitignore` has no `*.tsbuildinfo` rule) |

The three most relevant to this audit are `public/`, `postcss.config.js`, and
`tailwind.config.js`: all three directly determine what ships as "the UI" (M2's dead
locale data lives in the first; the second and third together produce M1's CSS
bundle), yet none can ever cause the User interface system's audit-due counter to
trigger, because none is in its `paths` array. An orphaned path never becomes overdue
— `npm run audit-status` only walks a system's own declared paths.

Governance files (`CLAUDE.md`, `backlog.md`, `docs/`, `.claude/`) and generic repo
plumbing (`.gitignore`, `README.md`, `package-lock.json`) being unowned is expected
and not a finding — no audit prompt asks "who owns CLAUDE.md." `tsconfig.node.tsbuildinfo`
being tracked is a minor Build & deployment hygiene item, noted here only because it
surfaced in this ownership sweep, not investigated further as it's outside this
system's paths.

---

## What the GUI rebuild inherits

**Constraints already committed to, from CLAUDE.md and the backlog, unaffected by
anything in this audit:**

- Tabs: Map, Home, Character, Settings, Edit. Modals: dialogue, skills, stats,
  rendered unconditionally with guaranteed closing behavior. Floating text on every
  skill-XP-granting moment. Lightweight progress-signal UI (e.g., a flashing map
  tab on discovery). None of this exists in the current tree to contradict or
  confirm — `PlaceholderRoot` predates all of it.
- Backlog: "Make the thin RPG GUI work again — thin wrapper that only calls CLI
  commands, mobile-first." The current `main.tsx` is consistent with "thin" (26
  lines, no logic) but calls no CLI commands yet — there is nothing to check this
  constraint against.
- `src/ui` is the correct, empty landing spot: `layer-check.ts` already has a `ui`
  layer wired at depth 3 (above `runtime`, below nothing but `scripts`), so once
  files land under `src/ui/`, boundary enforcement activates automatically. L2's
  finding is that code landing directly in `src/main.tsx` instead would bypass that
  enforcement — worth deciding to route everything through `src/ui/` explicitly for
  that reason alone.

**One correction to carry forward:** the memory note "the `window.__test` harness
was removed with the legacy GUI... reintroduce it (not textContent-scanning) when
the GUI is rebuilt" could read as if a salvageable copy is waiting in `attic/`. It is
not — `attic/` was fully deleted in `843d8b8` (H1). The harness is recoverable only
from git history, not the working tree: `git show bda44e5:attic/game/testHarness.ts`
(535 lines), `testHarnessDom.ts` (127 lines), and `testHarness.test.ts` (379 lines)
are the last surviving versions, one commit before deletion. "Reintroduce" means
pulling those three files out of history and adapting them to whatever `src/ui`
shape the rebuild takes, not wiring up a directory that's already there.

**What does not need to be inherited:** M1's dead CSS, M2's orphaned locale/universe
JSON, and M3's unused dependencies are all safe to leave behind rather than carry
forward — none has a live consumer, and the rebuild's tab/modal shape is different
enough from the deleted `App.tsx`/`ContributionMapEditor.tsx` that inheriting their
leftover styling would likely fight the new design rather than save time.
