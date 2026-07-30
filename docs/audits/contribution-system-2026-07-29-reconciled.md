# Contribution system — reconciliation of two independent audits, 2026-07-29

Two audits of the same code ran without knowledge of each other:

- **A** — `docs/audits/contribution-system-2026-07-29.md`. First pass, at `e45067b`, scoped to the
  six commits that built the local authoring / issue packaging / squash / approved-mod portal stack.
  Two findings (1 HIGH, 1 MEDIUM) plus three non-findings.
- **B** — `docs/audits/contribution-system-2026-07-29-independent.md`. Independent pass at `71822fd`,
  written without reading A or `backlog.md`. Two HIGH, four MEDIUM, nine LOW, plus a
  "checked and sound" ledger.

Ranking is by **agreement first**, then by whether one pass contradicts the other. Every claim below
was re-reproduced during reconciliation against the working tree at `745659a`; where the two passes
disagree, the disagreement is resolved against the code, not against the more confident prose.

---

## Tier 1 — found by both passes

### R1 — the modportal enablement model is unsound in both directions (A-H1 + B-H2)

The highest-confidence item in the set. Both passes landed on `scripts/modportal.ts`'s validation
seam from opposite sides, and each found the half the other missed:

| | claim | verified |
| --- | --- | --- |
| **A-H1** | `sync` validates the enabled set; `enable` does not | `toggle` (`scripts/modportal.ts:199-200`) sets `entry.enabled = enabled` and calls `writeManifest` with no `validateEnabled` on the enabling path |
| **B-H2** | `sync` validates *too much*, and the documented repair verb cannot reach the state it leaves | `sync` (`:166-171`) writes nothing when any diagnostic appears; `toggle`/`show` resolve their target via `findEntry` over **manifest entries** (`:148-149`), and on a first sync there are none |

Together they describe one wrong model: **enablement is written without proof, and proof failing
writes nothing at all.** The `enable` path can put the cache into a load-failing state that `sync`
would have refused; and one bad approved issue — or any base-content regression — stops every other
approved mod from reaching every operator, with no in-tool recovery. The comment at `:163-165`
(*"a cache that already holds a broken enabled mod needs repairing rather than switching off"*)
assumes an escape hatch that `findEntry` does not provide on an empty manifest.

Both passes independently flagged the covering test as certifying the recovered state rather than the
path to it: `scripts/modportal.test.ts:111` **pre-seeds `manifest.json` with the broken issue already
present and disabled** before syncing. A test repeating the implementation's assumption.

The two halves must land as one change: per-issue materialize-and-validate, write the entries that
load, record the ones that do not as `enabled: false` carrying their diagnostic, and make `enable`
stage-then-validate against that. Disable stays cheap and non-validating. Fixing A-H1 alone leaves
the portal blockable; fixing B-H2 alone leaves `enable` able to re-break it.

### R2 — the approved-mod materializer rewrites raw DSL text (A-M1, and previously DSL-modules M6)

`src/content/modportal.ts:60`, `replaceLocalChangesNamespace`, substitutes every textual occurrence
matching `/(^|[^a-z0-9-])local-changes\./g` — titles, `examine:`, `say:` text, dialogue, save
payloads, comments. The parser accepts the rewritten result, so the parse-only check at
`modportal.ts:71` cannot detect the corruption.

B did not restate this; A found it independently, and the DSL-modules audit had already found it as
M6. Two separate audit sessions is agreement, so it keeps Tier 1 despite B's silence.

**It is already settled in `backlog.md`** as *"Approved mods are stored canonical"* — re-serialize
through `serializeRegistryModule` rather than text-substitute. The contribution follow-up list
carried a second copy of the same finding; reconciliation deletes the duplicate and keeps the
settled item.

---

## Tier 2 — divergence: B found a HIGH that A certified as closed

### R3 — the shipped issue form and the extractor disagree, so the heading anchor is inert on every web contribution (B-H1 + B-M1, contra A's non-finding)

A's non-findings state: *"The previously reported wrong-fence extraction bug is closed: extraction is
anchored on `## Local Changes DSL`."* That is true of the body the CLI generates and false of the
body GitHub generates. Verified directly:

- `.github/ISSUE_TEMPLATE/content-contribution.yml:31` labels the DSL textarea `Local changes DSL`
  (lowercase *c*), with `render: dsl`, so the submitted body carries `### Local changes DSL` followed
  by a ```` ```dsl ```` fence.
- `src/content/contribution.ts:13` anchors on the constant `'## Local Changes DSL'` — two hashes,
  capital *C*. `indexOf` returns `-1`, and `:58` falls back to offset `0`: **the first ```` ```dsl ````
  fence anywhere in the body wins.**

So the only contribution path available without the CLI checked out still takes the first fence —
precisely the defect `400ff94` set out to eliminate. A's non-finding is withdrawn. Resolution favours
B because the mismatch is mechanical and reproducible from the two files alone.

B-M1 is the same root cause on the CLI path: `buildContributionIssueBody` places `--notes` verbatim
*before* the heading (`contribution.ts:36-45`) and the extractor takes the **first** occurrence, so
notes carrying the heading plus a fence capture the extraction. `sync` re-validates, so this cannot
break loading — it can ship a module that never passed `publish-local-changes` while the
`## Validation` block in the same issue describes a different one.

Two format families against one parser, which the shipped form does not satisfy:

| CLI (`buildContributionIssueBody`) | Issue form |
| --- | --- |
| `## Summary` | `### Summary` |
| `## Content Files` | *(absent)* |
| `## Validation` | `### Validation status` |
| `## Local Changes DSL` | `### Local changes DSL` |
| *(absent)* | `### Target universe` |

`Target universe` is required of every web contributor and read by nothing. `Content Files` — the
record of *what the module was validated against* — cannot be supplied through the form at all, so
`materializeApprovedModIssue` ingests web contributions with no record of their base. The issue-form
body shape is the only input format in the system with no fixture.

---

## Tier 3 — single-pass findings, all reproduced

All from B. Each was re-verified here.

### R4 — `scripts/modportal.ts` crashes where the shared cache reader promises tolerance (B-M2)

`scripts/lib/modportalCache.ts:27-30` states the contract — *"Everything reads this file… A truncated
write or an interrupted sync must take down neither."* It delivers parse tolerance and path
containment, not **missing entry file**, and that half is implemented in exactly one of the two
callers: `scripts/play-cli.ts:762-765` checks `existsSync` and downgrades to a warning;
`scripts/modportal.ts:142` (`validateEnabled`) and `:216` (`show`) call `readFileSync` unguarded and
throw a raw `ENOENT` stack out of the tool whose job is repairing that cache. One domain concept
living in a caller instead of in the library that owns the contract — which is why the second caller
does not have it.

### R5 — the contributor-facing entry point has no test (B-M3)

`scripts/publish-local-changes.ts` (146 lines) has no test file; only its library,
`contribution.ts`, is covered. Confirmed: `scripts/` holds `modportal.test.ts`,
`play-cli.test.ts`, `squash-local-changes.test.ts` and nothing for `publish-local-changes`. It is the
script producing the artifact every downstream stage parses, and R3's notes half plus L1 and L2 below
all live in the part of it no test touches (`parseArgs` notes handling, `createIssue`). Also
unexercised: the `localModuleLoaded` gate, `--notes-file`, `--create`'s process handling.

### R6 — "approved" is a label, and it grants full module powers, on by default (B-M4)

`materializeApprovedModIssue` renames the module and validates that it loads. It constrains nothing
about what the module may declare, and `upsertModportalEntries` (`src/content/modportal.ts:99`,
`enabled: previous?.enabled ?? true`) switches it on by default. A labelled issue can declare
`starting` on its own location, redeclare a global `# variable`, carry `# remove entity.x`, or
register `# save`/`# test` sections into the shared registry.

`backlog.md` already settles the adjacent question — *no additional prompt before an approved mod
goes live; the `approved-mod` label is the human gate*. It does **not** settle whether a third-party
module may hold every section kind. Validation proves a mod loads, not that it is benign. Worth
stating before the editor and merge engine widen the surface.

### LOW (all B, all reproduced)

- **L1 — `createIssue`'s `finally` never runs.** `publish-local-changes.ts:115` calls `process.exit`
  inside the `try`; Node terminates without unwinding, so `finally { rmSync(dir…) }` at `:116-118` is
  dead. Every `--create` leaves a `universalis-issue-*` temp dir holding the full issue body.
- **L2 — a missing `gh` fails silently in one script and clearly in the other.**
  `modportal.ts:112-116` catches and prints; `publish-local-changes.ts:114-115` ignores
  `result.error`, so with `gh` absent `spawnSync` returns `status: null` and the contributor gets a
  bare exit 1 with no output.
- **L3 — `ContributionIssueInput.title` is declared, passed, never read.** `contribution.ts:5`, set
  at `publish-local-changes.ts:135`; the builder ignores it and the title reaches GitHub only through
  `gh` argv.
- **L4 — `squash` absorbs local-created variables while refusing every other local-created kind.**
  `squash-local-changes.ts:137` folds the local module's `variable` ids into the target's globals, so
  a new `# variable` squashes cleanly while a new `# item` trips `registryDiff` and fails with
  *"publish local-changes as its own module when it creates new content."* Variables being global
  rather than module-owned makes the asymmetry defensible; nothing states it and nothing tests it.
- **L5 — `upsertLocalSection` appends, so re-editing a staged section moves it to the bottom.**
  `localChanges.ts:83-88` filters the match out and pushes the replacement last, churning a file the
  contributor reads. `localChanges.test.ts:17` asserts ordering but edits `gem` *before* adding
  `sprite`, so it never observes the move. Splicing in place is a one-line change.
- **L6 — the serializer's real round-trip property is held by nothing in CI.**
  `squash-local-changes.ts:108-120` owns `registryDiff`, the deep before/after comparison that *is*
  the round-trip property; `serialize.test.ts:102-114` instead asserts nine cherry-picked fields on a
  synthetic module. B ran the diff by hand over shipped content and a full-coverage fixture: 0 diffs.
  The printer is 356 lines that silently drop any field added to a domain type.
- **L7 — split constant.** `DEFAULT_MODPORTAL_CACHE` (the directory) is in
  `src/content/modportal.ts:6`; `MODPORTAL_MANIFEST_FILE` (the file inside it) is in
  `scripts/lib/modportalCache.ts:6`. Only scripts read either and the content layer does no IO.
- **L8 — `serialize.ts:227` types its item parameter structurally** (`{ id; title?; examine?; tags?;
  actions? }`) instead of importing `Item`, uniquely among the section printers.
- **L9 — orphan cache files and resurrected enablement.** `upsertModportalEntries` replaces the entry
  list with `incoming` (`src/content/modportal.ts:89`), so an issue that is closed or unlabelled
  vanishes from the manifest while its `.dsl` stays on disk forever; if it is later re-labelled its
  `enabled: false` is gone and it returns switched on.

---

## Checked and sound

B's ledger, carried forward so the next pass does not re-spend budget. Re-spot-checked here.

- **`serializeRegistryModule` round-trips.** load → serialize → reload → deep registry diff over the
  shipped `content/tutorial-island.dsl` and over a fixture exercising every `Action` field, every
  `Directive` kind, resources, dialogue forms, stat-bonus ranges, compound durations, conditional
  edges, recipes, saves and tests. **0 diffs, both.** (The property itself is unheld in CI — L6.)
- **Condition serialization cannot lose grouping.** `src/grammar/condition.ts` has no parentheses and
  `parseAnd` binds tighter than `parseOr`, so no reachable `Condition` shape needs them.
- **No path traversal into the mod cache from an issue body.** `sync`'s filename derives from
  `parsed.info.id`, which `structure.ts`'s `HEADING` constrains to `[a-z][a-z0-9-]*(\.…)*`.
- **No fence injection from DSL text.** `extractContributionDsl` closes on `'\n```'`; no valid DSL
  line starts with a backtick at column 0.
- **`readModportalCache` containment.** `insideCache` rejects `..` and absolute paths; corrupt-manifest
  tolerance is tested (`scripts/modportal.test.ts:95`). A reached the same conclusion independently.
- **`registryDiff`'s `CONTENT_MAPS` is complete for its purpose** — the three omitted maps are derived
  from maps it covers.
- **`content/modportal.local` is gitignored** via `*.local`, so a synced cache cannot be committed and
  does not disturb the `audit-status` partition.
- **Layer boundaries hold.** `src/content/*` reaches only into `src/grammar`; `scripts/lib` reaches
  down into `src/content`. Nothing reaches up.

---

## Disposition

`backlog.md` carries the reconciled set as one item, ordered R1 → R3 → R4… , with the duplicate of
R2 removed in favour of the already-settled *"Approved mods are stored canonical"*. The seven
decisions the reconciliation surfaced were settled the same day and are recorded there, not here,
because the audit is the evidence and the backlog is the contract. Two of them supersede earlier
settled text: approval and activation became separate labels, so reviewing a mod no longer activates
it (D10 in `docs/dsl-modules/deliverable-log.md`).

`docs/audits/systems.json` points the Contribution system's `lastAuditDoc` at this file; the two
source docs stay in the tree as the provenance for the agreement ranking.
