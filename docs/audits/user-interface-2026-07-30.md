# User interface — audit, 2026-07-30

Scope: `50a4f41..f8c8c8d`. One code-changing commit touches this system's declared paths — `060dd3e`,
which deleted `public/content/` and roughly 200 lines of `src/index.css` while closing UI-H1, UI-M1,
UI-M2 and UI-M3 of `docs/audits/user-interface-2026-07-28.md`.

Baseline at `f8c8c8d`: `npx tsc --noEmit` clean, `npm test` 509 passing across 33 files (none touching
a UI path), `npm run build` clean at 6.98 kB CSS / 143.92 kB JS.

**Coverage statement, unchanged from 2026-07-28 and restated because it bounds everything below:**
`src/ui` does not exist. There is no routing, no tabs, no modals, no floating text. The system is a
26-line `PlaceholderRoot`, a 70-line stylesheet, an `index.html`, two build configs and two files in
`public/`. This audit verifies what the previous pass's fixes actually closed and what residue of the
same class they left; it is not an implementation review, because there is no implementation.

The one structural change since: `73a73f3` made `systems.json` a partition, so the 2026-07-28 **L3**
orphan list is resolved — `public/`, `postcss.config.js`, `tailwind.config.js` and `src/vite-env.d.ts`
are now declared members of this system and can put it on the audit clock. That is why this window
exists at all.

---

## M1 — `public/changelog.txt` is the file `060dd3e`'s own rule was written to delete, and it ships

`public/changelog.txt`, shipped to `dist/changelog.txt` (verified after a fresh build).

`060dd3e` deleted `public/content/` on the stated ground that no live code reads it. Its sibling in the
same directory meets the same test — `grep -rin changelog` across `src/`, `scripts/`, `index.html`, the
workflows and the configs returns nothing — and was left behind. Vite copies `public/` verbatim, so it
goes to itch.io on every publish and into the APK on every `cap sync`.

It is worse than inert, because it is product-facing prose asserting features that were torn out:

> Version 0.1.0
> - Added JSON-first community contribution mode.
> - Added editable map, locations, travel actions, skills, items, and localization data.
> - Added multiple universes with separate save state.
> - Added settings for universe switching, appearance, language, save import/export, changelog, debug
>   tools, and universe reset.

Every one of those describes the legacy GUI deleted across `c5d5da4`/`bda44e5`/`843d8b8`. "JSON-first
community contribution mode" contradicts the DSL-based system this repo now has; "multiple universes",
"localization" and the settings list describe screens that do not exist; the last bullet advertises a
changelog viewer that would have been this file's only reader. It also claims `0.1.0`, which
`package.json` still reads and which BD-H2 says is not shippable.

Severity M rather than L because it is user-visible output of the release pipeline, unlike the dead
CSS and unused dependencies the same commit removed.

**Fix.** Delete it, or make it a generated artefact of the release that closes BD-H2. Not a file to
hand-maintain alongside `package.json` — that is the pair CLAUDE.md forbids, and it has already drifted
once.

---

## L1 — `index.css` kept the half of the legacy stylesheet that has no consumer either

`src/index.css`. `060dd3e` removed the Tailwind-utility override block, the `.react-flow__handle` rule
and the four animation classes — the right cuts. What remains is 70 lines, and most of it is in the
same state the deleted parts were:

| Kept | Consumer |
| --- | --- |
| `--color-background`, `--color-text` | `:root`/`body` in this file |
| the other 14 `--color-*` custom properties | none — `grep -rn "var(--color"` outside this file returns nothing |
| `:root[data-font-size="tiny"…"huge"]`, 5 rules | none — nothing in `src/` or `scripts/` sets `data-font-size` |
| `:root[data-theme="light"\|"dark"]` | none — nothing sets `data-theme` |

Those seven attribute rules are the appearance settings from the deleted Settings screen, waiting for
an attribute no code writes. The 2026-07-28 pass's recommendation was explicit — *"`index.css` should be
rewritten from the CLAUDE.md-declared shape … not inherited — none of the current rules have a live
consumer to verify against"* — and this is the inherited remainder. Low, not medium: it is 2 kB of the
6.98 kB bundle and it is plausibly a deliberate palette seed for the rebuild. Worth *saying* it is that,
in the deliverable log for the GUI rebuild, rather than leaving it to be re-discovered as residue.

## L2 — `tailwind.config.js` scans every layer for a UI that emits no classes

`tailwind.config.js:3`: `content: ['./index.html', './src/**/*.{ts,tsx}']`. That glob sweeps
`src/grammar`, `src/content` and `src/runtime` — three layers below this system — for class-name-shaped
strings. `PlaceholderRoot` uses inline styles exclusively and emits no utility classes, so the JIT
currently has nothing legitimate to find and everything it *could* find would be a false positive out
of engine string literals. Noted in the 2026-07-28 pass as a fact; recorded as a finding now because
`tailwind.config.js` became this system's declared path in the interim, so it has an owner. Narrow it to
`./src/ui/**` when `src/ui` exists.

## L3 — `index.html`'s `theme-color` is a fourth hand-copy of a palette value

`index.html:7` sets `content="#111827"`, which is `--color-surface` in `src/index.css:8` written out
again. Two files that must agree with no mechanism keeping them in agreement. Trivial today; it is the
kind of pair the rebuild should not inherit.

---

## Verified closed

- **UI-H1 — the vitest config excluded `attic/**` and cited a deleted `attic/README.md`.** Fixed. The
  exclude list in `vite.config.ts:19-27` no longer names `attic`; its one remaining comment describes
  `.claude/worktrees/**`, which does exist.
- **UI-M1 — `src/index.css` was ~90% dead, including a comment describing `WorldMap.tsx` and
  `ContributionMapEditor.tsx`.** Fixed for the parts named: the file is 270 → 70 lines, the
  `.react-flow__handle` rule and its comment are gone, and the CSS bundle drops 16.57 kB → 6.98 kB.
  See L1 for the remainder.
- **UI-M2 — `public/content/` shipped 49 kB of legacy locale/universe JSON.** Fixed; the directory is
  gone and a fresh `dist/` holds only `assets/`, `favicon.svg`, `changelog.txt` and `index.html`. M1
  above is the one file of that sweep left standing.
- **UI-M3 — twelve unimported dependencies, including `reactflow` imported for its stylesheet alone.**
  Fixed. `src/main.tsx` no longer imports `reactflow/dist/style.css`, and the 125 `react-flow`
  occurrences the previous pass measured in the CSS bundle are gone with it.
- **L3 of 2026-07-28 — `public/`, `postcss.config.js`, `tailwind.config.js`, `src/vite-env.d.ts` owned
  by no system.** Fixed by `73a73f3`'s partition; all four are declared here now and
  `npm run audit-status` fails on any tracked file that is neither owned nor listed under `unowned`.

## Not findings

- **`index.html`'s absolute `/favicon.svg`.** Vite rewrites it under `base: './'` — the built HTML
  reads `./favicon.svg`. Checked because it looked like a second instance of BD-H1; it is not.
- **L2 of 2026-07-28 — `layer-check` does not check `src/main.tsx`.** Still true and still latent, but
  it is a `scripts/lib/layers.ts` defect and is already open as **M2** of
  `docs/audits/testing-procedure-2026-07-30.md`, which generalised it correctly to *any* file directly
  under `src/`. Not re-filed.
- **`src/main.tsx`'s `as HTMLElement` cast.** Standard Vite scaffolding against an element `index.html`
  guarantees.
- **No layer violations, no scope drift, no CI/test/type weakening.** `060dd3e` is a deletion commit
  and every deletion in it was justified by a grep the previous audit had already published.

## What the GUI rebuild still inherits

Unchanged from 2026-07-28 and re-verified: `src/ui` is the correct empty landing spot, the `ui` layer is
already wired in `layer-check` at depth 3, and the `window.__test` harness is recoverable only from git
history (`git show bda44e5:attic/game/testHarness.ts` and its two siblings), not from the working tree.
New for this pass: whatever closes **BD-H2** should also decide M1 (is there a changelog, and who
generates it) and L1 (is the palette a seed or residue), because both are questions about what the
first real release contains rather than about the placeholder.
