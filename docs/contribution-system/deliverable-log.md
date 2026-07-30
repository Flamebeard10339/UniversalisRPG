# Contribution system — branch deliverable log

Live working document for the contribution system. Spec, progress and open decisions live here so any
session can resume without replaying the planning conversation. Lifted from
`backlog.md > Contribution system audit follow-ups` on 2026-07-29; on merge, archive this file and lift
anything unfinished back into `backlog.md`.

**Read this before touching contribution code.** `backlog.md` carries only a pointer.

Evidence for every finding below: `docs/audits/contribution-system-2026-07-29-reconciled.md`. Read the
reconciled doc, not the two source passes — it carries the agreement ranking and the reproductions.
Neither source pass is sufficient alone: the first certified issue-body extraction as closed and the
second reproduced a HIGH in it, while the second missed the raw-regex namespace rewrite the first found.

## Status

| Item | State |
| --- | --- |
| R1. Modportal enablement model | **done** `8cde0dc` — rebuilt on the tier model |
| R4. Missing-entry-file tolerance | **done** `8cde0dc` — closed with R1, same seam |
| R3. Web form as an ingestion format | **done** `efa64cd` — extraction, `Target universe`, fixture |
| R6. Enable-by-default | **done** `8cde0dc` — `intent[issue] ?? tierDefaultsEnabled(tier)`, covered |
| R2. Approved mods stored canonical | not started — tracked in `backlog.md` as its own settled item |
| R5. `publish-local-changes.ts` has no test | not started — **suggested next** |
| Decision 5. `squash` variable asymmetry | not started — state it and cover it |
| Decision 6. `registryDiff` as the serializer's CI property | not started |
| LOW L1, L2, L3, L5, L7, L8 | not started |

Gates green at `efa64cd`: `tsc --noEmit`, 498 tests, `layer-check`, `audit-status`.

## Deliverable

A contributor can author content, submit it, and have a maintainer's `modportal sync` turn it into a
mod other players can enable — with no step in that chain able to silently ship something other than
what was submitted, and no single bad submission able to withhold the portal from everyone.

The editor and the validation/merge engine remain unbuilt; this log covers the authoring, packaging,
ingestion and enablement path that does exist.

## The model — SETTLED 2026-07-29

The shipped game has a **canonical default modlist**: curated core mods, mostly project-owned, and
that is what a first-time player sees. The modportal is an explicit settings/discovery surface for
browsing, enabling, disabling and experimenting with community content.

**Labels are workflow states, not one flat trust bit.**

| label | means | portal | default activation |
| --- | --- | --- | --- |
| `mod-pending` | submitted, not ready | not listed | — |
| `mod-approved` | reviewed, listable | visible/installable | **off**; user opts in |
| `mod-auto-enabled` | reviewed for default activation | visible/installable | on, after validation |

`mod-auto-enabled` is a narrower, stronger channel than `mod-approved` — the curated trust surface,
alongside the canonical default modlist. The general portal is user choice.

This supersedes, in part, two things settled earlier against a single flat `approved-mod` label:
`backlog.md > Approved mods are stored canonical` and D10 in `docs/dsl-modules/deliverable-log.md`,
both of which read "no prompt before an approved mod goes live". No prompt still holds — the label is
still the human gate. What no longer holds is that reviewing a mod activates it.

Two consequences that keep the model safe:

- **The generated module id keeps its `approved-mod-<issue>` prefix.** It is content identity, not a
  workflow state: if it tracked the label, promoting an issue from `mod-approved` to
  `mod-auto-enabled` would rename its module and break every reference and save that names it. Only
  the label strings rename. Pinned by a test in `src/content/modportal.test.ts`.
- **`sync` fetches two labels.** `gh`'s repeated `--label` is an AND, so each listable tier is its own
  query and an issue carrying both keeps the stronger tier.

## Settled decisions — 2026-07-29

1. **The web issue form stays authoritative.** The lowest-friction community path, so it is a
   first-class ingestion format rather than a stale parallel one. The CLI stays the *preferred*
   authoring path, not the only valid submission path. Four parts: the extractor matches
   GitHub-rendered headings case-insensitively and tolerates `##`/`###`; the form gets a fixture;
   `Target universe` is actually read; the form captures or derives the base the contribution claims
   to validate against.
2. **Refuse duplicated machine headings.** A body holds exactly one `Local Changes DSL` section.
   Notes may carry fenced DSL examples but must not create a second parse target. Fail closed.
3. **Sync per issue, then validate the enabled set.** Materialize every fetched issue independently;
   write the valid entries; record broken ones as disabled carrying their diagnostic; `enable` stages
   and validates before persisting. One bad mod must never block the rest; enabling must never write
   a load-failing state.
4. **No section allowlist for portal mods.** Real mods need `# variable`, `# remove`, an alternate
   `starting`, saves, tests — total-conversion powers. The activation tier is the distinction that
   matters, not a restricted grammar.
5. **`squash` absorbing local-created variables is intended.** Variables are global tuning knobs, not
   module-owned content. State it explicitly and cover it. The asymmetry with `# item`/`# entity` is
   correct: those create namespaced content that would disappear when squashed into another module
   unless kept as its own module — which is what the failure message already says.
6. **`registryDiff` becomes the serializer's CI property.** The serializer's real contract is registry
   round-trip equivalence, not nine cherry-picked fields. Move `registryDiff` into shared content test
   tooling and drive serializer tests from it over shipped content plus a broad fixture. The
   DSL-load-path crossing is accepted: the serializer exists to preserve loaded content semantics.
7. **Prune orphan cache files; preserve enablement intent by issue number.** When an issue leaves the
   fetched labelled set its `.dsl` is pruned, but the user's decision survives: disabling `#123`, then
   unlabelling and re-labelling it, must not resurrect it as enabled. New mods default by tier.

## What is implemented, and where

**Policy is pure and lives in the content layer; IO lives in scripts.** That seam is what lets the
tier rules be tested without a temp directory, and it is the shape to preserve.

- `src/content/modportal.ts` — label constants and tiers, `issueTier`, `materializeApprovedModIssue`,
  and `planModportalSync`, which owns every enablement decision as a pure function.
- `scripts/modportal.ts` — the CLI: two-label fetch, file writes, orphan pruning, `enable`/`disable`,
  `list`, `show`, `sources`.
- `scripts/lib/modportalCache.ts` — manifest reading with its tolerance contract, `readEntryText`,
  `orphanEntryFiles`.
- `src/content/contribution.ts` — issue-body construction and the fence-aware section scan that
  extraction and `contributionBase` both read through.
- `src/content/issueForm.test.ts` — renders the shipped `.yml` and asserts the extractor reads it.

**Admission is incremental.** A candidate joins the enabled set only if the set still loads with it,
and is otherwise recorded switched off carrying the diagnostic that rejected it. Explicit intent is
admitted ahead of tier defaults, so a mod the user asked for wins a conflict against one merely on by
default. Cost is one universe load per candidate; the set that gets written is proved rather than
assumed.

**Manifest is v2.** `entries` carry `tier`, `base` and any `diagnostics`; `intent` is a separate
issue-number-keyed map, because a tier default is not a choice and must not be recorded as one — that
is what lets a promoted mod still enable. A v1 manifest surrenders its enable/disable choices and
nothing else, since the entries are a build artifact the next sync rewrites.

**Extraction finds the delimiter by what it says, not how it was typed.** Fence awareness is what
makes it safe both ways: the DSL block's own `# info` lines do not read as headings, and a contributor
quoting the delimiter inside an example cannot forge one. The first-fence fallback is deleted — a body
with no delimiter is an error, which is what makes the outcome deterministic rather than positional.

**`Target universe` is load-bearing.** A module that does not declare a dependency on the universe its
author named was validated against something other than what the maintainer is about to load, and is
refused at ingestion. What each contribution claims as its base is recorded on the manifest entry:
`Content Files` on the CLI path, `Target universe` on the form path.

## What is left

### R5 — `scripts/publish-local-changes.ts` has no test (suggested next)

146 lines, no test file; only its library is covered. Unexercised: `parseArgs` notes handling, the
`localModuleLoaded` gate, `--notes-file`, and `--create`'s process handling. L1 and L2 below both live
in that script, so they want doing in the same pass as the test that would catch them.

### Decision 5 — state and cover the `squash` variable asymmetry

`scripts/squash-local-changes.ts:137` folds the local module's `variable` ids into the target's
globals, so a new `# variable` squashes cleanly while a new `# item` trips `registryDiff` and fails
with *"publish local-changes as its own module when it creates new content."* Intended; untested and
unstated. The only existing tests are the item case both ways.

### Decision 6 — `registryDiff` as the serializer's CI property

Lives in `scripts/squash-local-changes.ts:108-120` and *is* the round-trip property;
`serialize.test.ts` instead asserts nine cherry-picked fields on a synthetic module. Verified clean by
hand during the audit over shipped content and a full-coverage fixture, but held by nothing in CI, and
the printer is 356 lines that silently drop any field added to a domain type. Note
`src/content/registry.ts` now exports `CONTENT_SECTION_MAPS`, which is the kind→map table this move
needs; `registryDiff`'s own `CONTENT_MAPS` is a third expression of the same knowledge and should
collapse into it.

### R2 — approved mods stored canonical

Tracked in `backlog.md` as its own settled item, *Approved mods are stored canonical*: replace
`replaceLocalChangesNamespace`'s global text substitution with re-serialization through
`serializeRegistryModule`. Sequence it **after** decision 6 — it makes the serializer the ingestion
path, so the round-trip property should be held by CI first.

### LOW

- **L1** `createIssue`'s `finally` is dead (`process.exit` inside the `try`), so every `--create` leaks
  a temp dir holding the issue body.
- **L2** a missing `gh` gives `publish-local-changes` a bare exit 1 with no output (`result.error`
  ignored) where `modportal.ts` prints a reason.
- **L3** `ContributionIssueInput.title` is declared, passed, never read.
- **L5** `upsertLocalSection` appends, so re-editing a staged section moves it to the bottom of a file
  the contributor reads. `localChanges.test.ts` asserts ordering but edits before adding, so it never
  observes the move.
- **L7** `DEFAULT_MODPORTAL_CACHE` and `MODPORTAL_MANIFEST_FILE` are split across layers though only
  scripts read either.
- **L8** `serialize.ts:227` types its item parameter structurally instead of importing `Item`.

## Open decisions

**One, and it is not blocking.** Decision 1 said the form must "capture **or derive**" the base
modlist. The derive route was taken: `Target universe` is the form's base declaration at module
granularity, checked against the module's `dependencies:`, and no file-paths field was added to the
form — asking a web contributor for `content/tutorial-island.dsl` is friction they cannot satisfy
without a checkout. If the stronger reading is wanted (the form literally listing content files), it is
one `input` in the `.yml` plus a branch in `contributionBase`.

## How to exercise it without GitHub

`sync --from <file>` takes a local JSON issue list of the same shape `gh issue list --json` returns, so
the whole ingestion path runs offline. Tier comes from each issue's `labels`, or from an explicit
`tier` field in a fixture; absent both, it defaults to `approved` — the off-by-default tier.

```bash
npm run modportal -- sync --from issues.json --cache /tmp/cache content=content/tutorial-island.dsl
```

Then `list`, `show <issue>`, `enable <issue>`, `sources`. `play-cli.ts` takes `modportal=<dir>` and
loads the enabled entries, which is how to confirm a synced mod reaches a live session.

**The networked path has still never run.** `gh issue create` and `modportal sync` against live
`gh issue list` are both unexercised — tracked in `backlog.md` as *Contribution publishing: first
authenticated end-to-end run*, and it is the one thing no local fixture can stand in for.

## Findings spun out of this work

Recorded in `backlog.md` because they belong to other systems, not here:

- **`# remove` validated by load order** — DSL load path. Found while building the R1 admission
  fixtures: resolution undeclared mid-pass, so a reference to a removed id failed or dangled depending
  on module order. Fixed in `5a3c4d0`; existence is now proved after merge.
- **A field edit can strip a member and leave references dangling** — DSL load path, open. The
  remaining half of the above: `-flags: unlocked` does not tell the namespace, so an action can require
  a key nothing can ever set and the universe loads clean.
- **`/dsl <kind> <id>` reads like a query and is a write** — grammar evidence, open. Kept for the
  `/dsl` redesign.
