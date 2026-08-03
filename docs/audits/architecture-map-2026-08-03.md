# architecture-map — independent audit, 2026-08-03

A branch audit, not a whole-system sweep: it reviews the diff architecture-map proposes to merge.
No system lastAudit is advanced by it.

Independent pass over the `architecture-map` branch. Base `8f1de46`, head at audit time `768783e`.
The auditor did not write the code and verified every clause independently rather than reading the
commit messages. Its own finding labels are kept so downstream records can cite them.

## Required commands, as run by the auditor

| command | result |
| --- | --- |
| `npm test` | pass — 46 files, 1050 tests, 54.23s |
| `npx tsc --noEmit` | pass |
| `npm run layer-check` | pass — 501 imports, all downward |
| `npm run audit-status` | exit 0; reports 11 shared files, 1 concept overlap |
| `npm run tasks -- doctor` | pass — 306 tasks, 0 errors |

c11's single-failing-condition claim was tested rather than trusted: injecting two error-level and
three warning-level manifest issues printed all five and exited 0; removing `docs` from `unowned`
produced 45 orphans and exit 1.

## Clause verdicts at `768783e`

| clause | verdict | evidence |
| --- | --- | --- |
| c1 | met | All 11 double-claimed files resolve to the specific claim. `Math.max`→`Math.min` and tie-break reversal both killed. |
| c2 | met | Manifest diffed base↔head programmatically: `paths`, `lastAudit`, `note`, `unowned` identical for all six systems; only `concepts` added. `git grep owningSystem` at base shows no production caller. |
| c3 | met | Coverage-for-ownership mutation killed. Out-of-system path errors; nonexistent path warns; `../../../Windows/System32` refused. |
| c4 | met, defective | Answers all four parts; nothing written back. Export surface measurably wrong — see M4. |
| c5 | met | `tasks where` returns owner, coverers, concept, 5 imports out, 2 in. |
| c6 | met | Finds task claims and registered concepts; a miss prints an explicit weak-no. |
| c7 | met | Three mutations killed; `duplicate-produces` still fires; `findProducers` is the single implementation. |
| c8 | met | `audit-status` prints `src/grammar/action.ts — action parsing and the section field engine`, the spec's worked example, once. |
| c9 | met | Every one of the 23 citations checked: 9 finding ids exist, 5 task ids exist and are `done` with matching `produces`. No invented name. |
| c10 | met | Registration sits inside the existing step-4 round trip; no new step or role. |
| c11 | **unmet** | Budget met and `audit-status` verified, but `tasks plan` gained a failing condition — H3. |

## Findings

**H1 — `scripts/lib/architecture.ts` carried a raw NUL byte.** Line 129, byte 5463: the
`systemEdges` map key used a literal `U+0000` where a separator was meant. `git diff --stat`
reported `Bin 0 -> 9125 bytes`, so the file had no reviewable diff; ripgrep returned nothing for
its contents; two branches editing disjoint lines conflicted whole-file in a scratch reproduction;
`text=auto` skipped EOL normalisation for it. Self-defeating, since the spec cuts the symbol-graph
tier on the grounds that grep already answers "what calls this".
**Fixed** in `af0ef8b` — key is `JSON.stringify([from, to])`, plus a guard test scanning every
tracked `.ts` for control bytes.

**H2 — `tasks system` and `tasks where` crashed on a tracked file absent from the working tree.**
`repoSourceTree` enumerated from `git ls-files` (the index) and read from disk. Reproduced by
removing `src/runtime/rng.ts`: raw ENOENT stack, exit 1, at the moment the command exists for.
**Fixed** in `af0ef8b` — the tree is tracked *and* present, pinned by a real-git test.

**M3 — `tasks plan` gained a failing condition, contradicting c11.** `loadManifest` was called
unconditionally and `reportStoreErrors` caught only `StoreError`. Proven base-vs-head with the same
malformed manifest: `8f1de46` exit 0 with a full report, head exit 1 with an uncaught
`ManifestError`. `tasks plan` is an unguarded CI step at `.github/workflows/test.yml:66`.
**Fixed** in `af0ef8b` — the concept half degrades and says so; the read boundary now covers
`ManifestError`, which also fixes `doctor` crashing on the same input.

**M4 — `exportedNames` misses every `export type { … } from`.** Verified against the TypeScript
compiler's `getExportsOfModule` over all 124 tracked `.ts` files: `src/runtime/runtime.ts`
under-reports 8 names including `GameState`; `src/content/entity.ts` under-reports `Action`. The
module comment enumerates the gap as destructured exports only, which is a wrong enumeration
presented as complete. **Open** — `exportednames-misses-every-export-type-from-re-export`.

**M5 — concept paths resolved under two normalisation regimes.** `--paths "src/runtime/"`
registered with no warning, then claimed zero files while overlapping every one of them:
`conceptsClaiming`/`ownerOf`/`coveringSystems` used raw `covers` while
`pathsOverlap`/`overlappingConcepts` normalised first. **Fixed** in `af0ef8b` — `canonicalPath` is
the storage form, applied on registration and on parse.

**M6 — four surviving mutations.** 24 of 28 killed, including all 11 on `systems.ts`. Survivors:
the same-system filter in `fileView.importsOut` (the fixture has no same-system import to exercise
it); `RANK` reversal in `producers.ts` (nothing asserts cross-strength ordering); the
`paths.length === 0` guard in `cmdConcept`; and `stripComments` in `exportedNames` (the comment
test's fixture puts exports after `//` on the same line, which `^\s*export` never matches anyway).
**Open** — `four-mutations-survive-on-fileview-producer-ranking-cmdconce`.

**L7 — `trackedFiles()` and `repoSourceTree()` both run `git ls-files`.** Same layer, both written
by this branch. The branch's own thesis, applied to itself. **Open.**

**L8 — `cmdConcept` bypasses `parseManifest` for its read half.** An unchecked cast, so a truncated
manifest surfaces as a raw `SyntaxError` rather than a labelled `ManifestError`. Input is still
refused; this is presentation plus a second parse path. **Open.**

**L9 — comments the repository's own rule excludes.** The `audit-status.ts` block is c2's proof
written into the source, and there is no `audit-status.test.ts`, so the claim lives only in the
comment. `resolveImport`'s "as the Contribution system does ten times" is a count of another file's
contents. `systems.ts` went 0 → 64 comment lines. **Open.**

**L10 — a whitespace-only concept name was accepted and then unfindable.** `normalizeName` reduces
it to `''` and `matchStrength` returns null on empty. **Fixed incidentally** in `af0ef8b`.

**L11 — `tasks system` is superlinear.** ~210ms at 260 files; at a simulated 10× tree
`deriveModules` 1386ms and `systemView ×6` 669ms, because `systemView` recomputes `systemEdges`
per system. Not a problem at this size. **Open.**

## Is anything worse than before?

The auditor's answer at `768783e` was yes, on three counts: `tasks plan` refusing where it
answered (M3), `architecture.ts` being undiffable and ungreppable (H1), and `systems.json` gaining
its first programmatic writer while its write path stayed non-atomic.

The first two are fixed in `af0ef8b`; the merge diff now contains no binary file. The third stands
as a stated property rather than a defect: `tasks concept` writes with `writeFileSync`, the same
pattern `saveStore` has always used for `docs/tasks.jsonl`.

Everything else held: the ownership rule is correct and heavily mutation-tested, the 23 seeded
concepts survive full citation-checking with no invented name, and no audit window moved.
