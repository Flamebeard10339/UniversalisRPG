# Contribution system — independent audit, 2026-07-29

Second, independent pass over the Contribution system as declared in `docs/audits/systems.json`
(15 files, 1803 lines), at `71822fd`. Written without reading `docs/audits/contribution-system-2026-07-29.md`
or `backlog.md`, so overlap with the first pass is agreement, not copying, and divergence is worth
reconciling rather than dismissing.

Every finding below was reproduced by running the code. Sections that were checked and found sound
are listed at the end, so the next pass does not spend its budget on them again.

Baseline: `vitest run` over the six test files in this system — 19 tests, all pass. Working tree clean.

---

## HIGH

### H1 — The shipped issue form and the extractor disagree, so the heading anchor is inert on every web-form contribution

`.github/ISSUE_TEMPLATE/content-contribution.yml:31` labels the DSL textarea **`Local changes DSL`**.
GitHub renders an issue-form field as an H3 of its label verbatim, so the submitted body contains:

```
### Local changes DSL

```dsl
…
```
```

`src/content/contribution.ts:13` anchors on `'## Local Changes DSL'` — capital **C**. `indexOf`
returns `-1`, and `contribution.ts:58` falls back to searching from offset 0, i.e. **the first
```dsl fence anywhere in the body**.

Reproduced against a faithful rendering of the shipped form:

```
--- issue-form body ---
"# info local-changes\nversion: 0.0.0\n# item gem\ntitle: Gem\n"        <- correct, by luck
--- issue-form body, fence in Summary ---
"# info local-changes\n# item gem\ntitle: ROCK\n"                        <- the Summary's fence wins
```

This is precisely the defect `400ff94` ("Anchor contribution DSL extraction on its heading") set out
to eliminate. It was fixed for the body `publish-local-changes.ts` generates, and only that body is
tested (`src/content/contribution.test.ts:45`). The other contribution path — the one the repo ships
an issue form for, and the only one available to a contributor without the CLI checked out — still
takes the first fence.

The mismatch is wider than the casing. The two paths produce two different body formats against one
parser:

| CLI (`buildContributionIssueBody`) | Issue form |
| --- | --- |
| `## Summary` | `### Summary` |
| `## Content Files` | *(absent)* |
| `## Validation` | `### Validation status` |
| `## Local Changes DSL` | `### Local changes DSL` |
| *(absent)* | `### Target universe` |

`Target universe` is required of every web contributor and read by nothing. `Content Files` — the
field that records *what the module was validated against* — cannot be supplied through the form at
all, so `materializeApprovedModIssue` ingests web contributions with no record of their base.

Fix: make one of the two authoritative. Either the extractor matches the form's rendered heading
(case-insensitively, and tolerating `##`/`###`), or the form is reduced to a pointer at
`npm run contribution:issue` and stops being a second, unvalidated ingestion path. Whichever, the
issue-form body shape needs a test — it is currently the only input format with no fixture.

### H2 — One broken approved issue blocks the whole portal, and the documented escape hatch cannot reach it

`scripts/modportal.ts:161-171` validates the entire enabled set and writes nothing if any diagnostic
appears. The comment at `:163-165` justifies this: *"a cache that already holds a broken enabled mod
needs repairing rather than switching off."* But the repair verb, `disable`, resolves its target
through `findEntry` against **manifest entries** — and on a first sync there are none, because sync
refused to create them.

Reproduced (two approved issues, #4 broken, #9 fine, empty cache):

```
--- first sync ---
approved-mod-4 [approved-mod-4] resolve: # entity approved-mod-4.gull action "peck" give: names an unknown item: no-such-item
Synced nothing: the approved mods do not load together, so <cache> is unchanged.
(exit 1)
--- can the operator disable the broken one? ---
No approved mod matches 4
(exit 1)
--- what is in the cache ---
base.dsl  issues.json
```

Nothing is recoverable from inside the tool. The operator must un-label the issue on GitHub or
hand-write `manifest.json`. The blast radius is total: any one bad approved issue — or any base
content regression — stops every other approved mod from reaching every operator.

The existing test (`scripts/modportal.test.ts:111`, *"lets a switched-off mod stay broken without
blocking the mods that are on"*) **pre-seeds `manifest.json` with #4 already present and disabled**
before it syncs. It certifies the recovered state and never exercises the path that gets you there.
That is a test repeating the implementation's assumption rather than challenging it.

Fix: materialize and validate per issue, write the ones that load, and record the ones that do not
as `enabled: false` with their diagnostic — which restores the escape hatch the comment already
assumes exists. Failing that, `disable`/`enable` need to accept an issue number that is not yet in
the manifest.

---

## MEDIUM

### M1 — `--notes` is copied verbatim ahead of the real heading, so notes can capture the extraction

`buildContributionIssueBody` places contributor notes before `## Local Changes DSL`
(`contribution.ts:36-45`), and `extractContributionDsl` takes the **first** occurrence of that
heading (`contribution.ts:57`). Notes containing the heading therefore win.

Reproduced: `--notes` carrying `## Local Changes DSL` + a fence yields

```
"# info local-changes\nversion: 0.0.0\ndependencies:\n  base\n\n# item gem\ntitle: NOT WHAT WAS VALIDATED\n"
```

The `## Validation` block in the same issue describes the *other* module. `sync` re-validates before
writing, so this cannot break loading — but it can ship content that never passed
`publish-local-changes` and that a maintainer reading the validation summary believes was checked.

Same root cause as H1: a delimiter with no discipline. Anchoring on the **last** heading occurrence,
or refusing a body where it appears more than once, closes it in one line.

### M2 — `scripts/modportal.ts` crashes where the shared cache reader promises tolerance

`scripts/lib/modportalCache.ts:27-30` states the contract: *"Everything reads this file… A truncated
write or an interrupted sync must take down neither."* It delivers the parse half and the
path-containment half. It does not deliver the **missing entry file** half — and that half is
implemented in exactly one of the two callers:

- `scripts/play-cli.ts:761-764` checks `existsSync` and downgrades to a warning.
- `scripts/modportal.ts:216` (`show`) and `:142` (`validateEnabled`) call `readFileSync` unguarded.

Reproduced — a manifest entry whose `.dsl` was removed:

```
Error: ENOENT: no such file or directory, open '…\9-approved-mod-9.dsl'
    at Object.readFileSync …
```

A raw stack out of the tool whose job is repairing that exact cache. This is one domain concept
("an entry may name a file that is not there") living in a caller instead of in the library that
owns the contract, which is why the second caller does not have it.

### M3 — The contributor-facing entry point has no test

`scripts/modportal.ts` (225 lines) has a 141-line CLI test. `scripts/squash-local-changes.ts` (158
lines) has a 101-line CLI test. `scripts/publish-local-changes.ts` (146 lines) has **none** — only
its library, `contribution.ts`, is covered.

It is the script that produces the artifact every downstream stage parses, and both M1 and L1 live
in the part of it that no test touches (`parseArgs` notes handling, `createIssue`). Argument
parsing, the `localModuleLoaded` gate, `--notes-file`, and `--create`'s process handling are all
unexercised.

### M4 — "Approved" is a label, and it grants full module powers, on by default

`materializeApprovedModIssue` renames the module and validates that it loads. It does not constrain
what the module may declare. A labelled issue can:

- declare `starting` on its own location, moving where a new game begins;
- redeclare a global `# variable`, rewriting engine tuning for everyone who syncs;
- carry `# remove entity.x` and delete base content;
- register `# save` and `# test` sections into the shared registry.

and `upsertModportalEntries` (`modportal.ts:99`, `enabled: previous?.enabled ?? true`) switches it on
by default. Validation proves a mod *loads*, not that it is benign, and the only gate between a
stranger's issue body and an operator's game state is one GitHub label.

That may well be the intended policy — the label *is* the review. But it is nowhere stated, the
enable-by-default choice is only justified in a comment about loadability (`modportal.ts:163-165`),
and there is no section-kind allowlist for third-party modules. Worth settling explicitly before the
editor and merge engine (still unbuilt) widen the surface.

---

## LOW

**L1 — `createIssue`'s `finally` never runs.** `publish-local-changes.ts:114-118` calls
`process.exit(result.status ?? 1)` inside the `try`; Node terminates without unwinding, so
`finally { rmSync(dir…) }` is dead code. Verified directly: the directory survives. Every `--create`
leaves a `universalis-issue-*` dir in the temp dir holding the full issue body. Capture the status,
clean up, then exit.

**L2 — A missing `gh` fails silently in one script and clearly in the other.** `modportal.ts:110-116`
wraps `execFileSync` and prints `Could not read approved mod issues with gh: …`.
`publish-local-changes.ts:114-115` ignores `result.error`; with `gh` absent, `spawnSync` returns
`status: null` and the contributor gets a bare exit 1 with no output at all.

**L3 — `ContributionIssueInput.title` is declared, passed, and never read.**
`contribution.ts:5`, set at `publish-local-changes.ts:135`, unused in the builder — the title reaches
GitHub only through the `gh` argv.

**L4 — `squash` absorbs local-created variables while refusing every other local-created kind.**
Reproduced: a local-changes file whose only content is a new `# variable travel-seconds-per-unit`
squashes cleanly into `# info base`. The same file with a new `# item gem` fails with *"publish
local-changes as its own module when it creates new content."* The variable path contradicts that
message. Variables being global rather than module-owned makes the asymmetry defensible, but nothing
states it and nothing tests it — the only tests are the item case both ways
(`scripts/squash-local-changes.test.ts`).

**L5 — `upsertLocalSection` appends, so re-editing a staged section moves it to the bottom.**
`localChanges.ts:84-88` filters the match out and pushes the replacement last, churning a file the
contributor reads. `localChanges.test.ts:17` asserts ordering but happens to edit `gem` *before*
adding `sprite`, so it never observes the move. Splicing in place is a one-line change.

**L6 — `serialize.test.ts` hand-picks assertions where the real proof already exists.**
`squash-local-changes.ts:108-120` owns `registryDiff`, the deep before/after comparison that is the
actual round-trip property. `serialize.test.ts:102-114` instead asserts nine cherry-picked fields on
a synthetic module. I ran the diff by hand (see below) and it is clean — but that property is held
by nothing in CI, and the printer is 356 lines that silently drop any field added to a domain type.

**L7 — Split constant.** `DEFAULT_MODPORTAL_CACHE` (the directory) is in `src/content/modportal.ts:6`;
`MODPORTAL_MANIFEST_FILE` (the file inside it) is in `scripts/lib/modportalCache.ts:6`. Only scripts
read either, and the content layer does no IO — both belong in the scripts lib.

**L8 — `serialize.ts:227` types its item parameter structurally** (`{ id; title?; examine?; tags?;
actions? }`) instead of importing `Item`, uniquely among the section printers, which all take their
domain type. It weakens the one compile-time signal the file has.

**L9 — Orphan cache files and resurrected enablement.** `upsertModportalEntries` replaces the entry
list with `incoming`, so an issue that is closed or unlabelled vanishes from the manifest while its
`.dsl` stays on disk forever. If that issue is later re-labelled, its `enabled: false` is gone and it
returns switched on.

---

## Checked and sound

Recorded so the next pass does not re-spend budget here.

- **`serializeRegistryModule` round-trips.** Ran load → serialize → reload → deep registry diff over
  (a) the shipped `content/tutorial-island.dsl` and (b) a fixture exercising every `Action` field
  (`target`, `dr`, `health`, `escape after`, `speed`/`accuracy`/`evasion`/`ability`, `repeating`,
  `retaliates`, all three `on …` blocks, `hidden if`), every `Directive` kind, `resource` with
  `start:`/`on full:`, dialogue `once`/`sticky`/`again`/interpolation/conditional segments/choice
  effects and gotos, stat-bonus ranges and percentages, compound durations, relative locations,
  conditional edges, entity stat assignments, recipe `burnt:`, saves and tests. **0 diffs, both.**
- **Condition serialization cannot lose grouping.** `src/grammar/condition.ts` has no parentheses,
  `parseNot` recurses only into a primary, and `parseAnd` binds tighter than `parseOr`. So a parsed
  `Condition` can never be a `not` wrapping a junction or an `and` containing an `or`, and
  `serialize.ts:35-49`'s unparenthesised join is faithful for every reachable shape.
- **No path traversal into the mod cache from an issue body.** `sync` writes to a filename derived
  from `parsed.info.id`, but `structure.ts`'s `HEADING` constrains an id to
  `[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*` — no separators, no `..`.
- **No fence injection from DSL text.** `extractContributionDsl` closes on `'\n```'`, i.e. a backtick
  fence at column 0. No valid DSL line can start there with a backtick (headings take `#`, field
  lines take an identifier, dialogue steps and save JSON are indented or `{`).
- **`readModportalCache` containment.** `insideCache` correctly rejects `..` and absolute paths, and
  the corrupt-manifest tolerance is tested (`scripts/modportal.test.ts:95`).
- **`registryDiff`'s `CONTENT_MAPS` is complete for its purpose.** It omits `recipeActions`,
  `dialoguesByOwner` and `namespace`; all three are derived from maps it does cover
  (`registry.ts:215`, dialogue `owner`), so nothing escapes the diff.
- **`content/modportal.local` is gitignored** via the `*.local` rule, so a synced cache cannot be
  committed by accident and does not disturb the `audit-status` partition.
- **Layer boundaries hold.** `src/content/*` reaches only into `src/grammar`; `scripts/lib` reaches
  down into `src/content`. Nothing reaches up.

---

## Reconciliation note

Findings here have not been lifted into `backlog.md` — that file was deliberately not read, so the
merge with the first pass is still owed. Per `CLAUDE.md`, `systems.json` should end up pointing at a
single reconciled doc (compare the `dsl-modules-2026-07-29-*` precedent); its `lastAuditDoc` is
untouched by this pass.
