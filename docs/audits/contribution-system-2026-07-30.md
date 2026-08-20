# Contribution system — audit, 2026-07-30

Scope: `745659a..f8c8c8d`, the six code-changing commits touching this system's declared paths since
the reconciled baseline (`docs/audits/contribution-system-2026-07-29-reconciled.md`):

| Commit | Subject |
| --- | --- |
| `8cde0dc` | Rebuild modportal enablement on the label-tier model (R1, R4) |
| `efa64cd` | Make the web issue form a real ingestion format (R3) |
| `6299045` | Cover contribution publisher and low fixes |
| `edba422` | Pin squash variable absorption |
| `c9c88e1` | Assert serializer registry round trips |
| `bd77f26` | Store approved mods canonically |

Baseline at `f8c8c8d`: `npx tsc --noEmit` clean, `npm test` 509 passing across 33 files,
`npm run layer-check` 433 imports all pointing downward. Every claim below was reproduced against the
working tree; reproductions are quoted inline. The editor and the validation/merge engine are still
unbuilt and are not in scope.

---

## H1 — canonicalising an approved mod silently discards every edit and removal it makes

`src/content/modportal.ts:118` (`canonicalLocalChangesModule`), via `serializeRegistryModule`
(`src/content/serialize.ts:339`).

`bd77f26` routes an approved `local-changes` contribution through the serializer so its ids can be
renamed structurally instead of by regex. The serializer emits a *module*: every loop is guarded by
`inModule(moduleId, id)`, i.e. `id.startsWith('approved-mod-7.')`. But a contribution's edits to
existing content merge into **the base module's** sections, and a `# remove` is not a registry entry at
all. Neither survives the filter. Reproduced against a two-location base module:

```
authored                                   stored canonically
─────────────────────────────────────────  ─────────────────────────────
# info local-changes                       # info approved-mod-7
version: 0.0.0                             version: 0.0.0
dependencies:                              dependencies:
  base >= 1.0.0                              base >= 1.0.0
                                           (nothing else)
# location base.home
examine: Home, now with a path to the shed.
+adjacent: base.shed
```

```
# remove item.base.lamp    ->    # info approved-mod-7 … and nothing else
```

The additive case is the only one that survives:

```
# location cave / x: 2, y: 0 / examine: A cave.
  ->  # location cave / x: 2, y: 0, z: 0 / title: Cave / examine: A cave.
```

Nothing downstream notices. `materializeApprovedModIssue:172` re-parses the canonical text, and an
empty module parses fine. `planModportalSync:226` loads it against the base, gets no diagnostics, and
records `enabled: true`. `scripts/modportal.ts` reports it under "Synced … enabled". The maintainer
approved "adds a path from home to the shed"; the portal ships a file that does nothing, and every
signal it produces says success.

Editing and removing existing content is not an edge case for this system — it is what a mod *is*, and
the DSL has a whole merge/removal machinery (`src/content/merge.ts`, `src/content/removal.ts`) built
for it. The reconciled baseline's R1/R4 work assumed a mod is additive; this is where that assumption
became a silent data loss.

**The fix already exists in this system, one file over.** `scripts/squash-local-changes.ts:125` does
the identical serialize-then-reload and then refuses to proceed unless the universe is unchanged:

```ts
const differences = registryDiff(loaded.registry, checked.registry);
if (differences.length > 0) fail([`Squashed output would not preserve the loaded universe for module ${targetId}.`, …]);
```

Its error text even names this failure mode: *"publish local-changes as its own module when it creates
new content."* `c9c88e1` promoted `registryDiff` out of that script into `src/content/registryDiff.ts`
precisely so it could be shared — and `bd77f26`, the next commit, built a second serialize-and-reload
path without it. Reloading the canonical text against the base and diffing against the authored load
turns this from a silent no-op into a rejected contribution in about four lines.

---

## M1 — `enable`, `sources` and `show` can be answered against a different universe than `sync` proved

`scripts/modportal.ts:200` (`validateCachedEnabled`), `:45`.

`ModportalManifest` records `version`, `syncedAt`, `entries` and `intent`
(`src/content/modportal.ts:65-70`) — it does **not** record the content files the sync was planned
against. Every command falls back to `defaultContent = 'content/tutorial-island.dsl'` (`:11`). So:

```
tsx scripts/modportal.ts sync   content=a.dsl,b.dsl   # admitted against a+b
tsx scripts/modportal.ts enable 7                     # proved against tutorial-island
tsx scripts/modportal.ts sources                      # emitted for whatever loads them next
```

`enable` stages and proves before writing (`8cde0dc`'s correct fix for R1), but it proves against a
universe the operator may never have synced against, and `sources` — the output the game consumes —
carries no record of which. The three-line comment at `:198` says this check is "whether the cache as
it would stand loads"; the cache as it would stand is only defined relative to a base that is not in
the cache.

This is the same gap `efa64cd` closed one level down. That commit's rationale — *"closing the gap where
web contributions were ingested with no record of their base"* — added `ModportalEntry.base` for what
each *contribution* claimed. The *portal* has no such record of its own, and it is the one that was
actually proved.

**Fix.** Write `contentFiles` onto the manifest at sync, and have `enable`/`sources`/`show` read it,
warning when an explicit `content=` disagrees with what is recorded.

## M2 — the publisher refuses one half of the delimiter contract and not the other

`src/content/contribution.ts:90` (`buildContributionIssueBody`).

`efa64cd` made the builder refuse notes containing the `Local Changes DSL` heading, with the stated
reason that *"a contributor learns before they submit rather than after a maintainer approves something
ambiguous."* Section boundaries are decided by two things, though — the heading **and** the fence state
(`issueSections:45`) — and only the heading is guarded. Notes carrying an unbalanced code fence build
clean and are then unreadable:

```
notes: "I tried this and it broke:\n```\n# info local-changes"

A. unbalanced fence in notes: ACCEPTED at build
   round-trip extract: ERROR -> issue body has no Local Changes DSL heading
```

An open fence swallows every later heading, so the delimiter the module is read from disappears. Notes
describing a DSL problem are the single likeliest place a contributor pastes a code fence, and the
failure lands after submission and approval — exactly the outcome the sibling guard exists to prevent.

**Fix, reusing what is there:** build the body, run `extractContributionDsl` over it, and refuse if it
does not round-trip. That covers this case and any future one, and replaces a guard that enumerates
one hazard with one that checks the property.

## M3 — two `dsl` fences under one heading resolve by position, which is what the commit says it refuses

`src/content/contribution.ts:60` (`fencedDsl`), `:113`.

The comment above `extractContributionDsl` states the rule:

> Exactly one section may be the module, and a body carrying two is refused rather than resolved by
> position: whichever one a rule picked, the other is what somebody believed they were submitting.

It holds at heading granularity and not at fence granularity — `fencedDsl` takes `findIndex`, the first
fence, silently:

```
4. two dsl fences, one heading: EXTRACTED -> "# info local-changes\nversion: 0.0.0\n"   (the 9.9.9 block is dropped)
5. two headings:               ERROR -> issue body has 2 Local Changes DSL headings, so which block is ambiguous
```

The realistic route to it is the web form: `content-contribution.yml:29` sets `render: dsl`, so GitHub
wraps the textarea in a ```` ```dsl ```` fence itself. A contributor who pastes a module that already
carries its own fence produces nested fences, and the extractor returns an **empty** module:

```
B. web form, contributor pasted their own fence: EXTRACTED -> "\n"
```

That one is caught today, but only by the optional `Target universe` check (`modportal.ts:167`), which
does not run on the CLI path. Applying the existing rule to fences — refuse a section holding more than
one ```` ```dsl ```` block, refuse an empty extraction — closes both.

---

## L1 — the canonicalisation tests only ever exercise the case that works

`src/content/modportal.test.ts:74-101`. All three `materializeApprovedModIssue` tests build an additive
contribution and assert substrings of the output (`toContain('# info approved-mod-43')`,
`toContain('+2 approved-mod-43.vigor')`). None edits a base section, none removes one, and none asks
whether the universe the canonical text produces matches the one the authored text produced. They pin
the shape the implementation emits for the input it handles — which is why H1 is green in CI. The
assertion that would have caught it (`registryDiff`) landed in this same window.

## L2 — the failing branch still rewrites the namespace by regex

`src/content/modportal.ts:120`. When the contribution does not load cleanly, canonicalisation falls back
to `replaceInfoId`, the raw-regex `# info` rewrite the reconciled baseline flagged. It is the safer
branch of the two given H1 (it preserves the authored text verbatim, edits and removals included), but
it means the stored form of a mod depends on whether it loaded, and only the non-loading branch keeps
what the author wrote. Worth stating as a decision once H1 is fixed rather than leaving as fallout.

## L3 — a pre-tier manifest entry with no `issue` writes an `"undefined"` intent key

`scripts/lib/modportalCache.ts:96`: `intent[String(entry.issue)] ??= entry.enabled`. `isEntry` (`:33`)
validates `moduleId` and `file` only, so a v1 entry missing `issue` lands under the literal key
`"undefined"`, where it can never match a real issue and never be pruned. One-line fix in `isEntry`.

---

## Verified closed

Each re-run with the reproduction that used to fail.

- **R3 — the issue-body extractor never matched the shipped form.** Fixed and verified against the
  real `content-contribution.yml`: `### Local changes DSL` (H3, lowercase 'c') is found by label, and
  the first-fence fallback is gone — a body with no delimiter errors rather than guessing. See M2/M3
  for the two edges the new scan still resolves positionally.
- **R1/R4 — enable wrote enablement without proof; sync's proof failing wrote nothing.** Both fixed.
  `planModportalSync` (`modportal.ts:202`) admits incrementally, so one bad mod records its own
  diagnostic and switched-off state without withholding the rest; `toggle` (`scripts/modportal.ts:213`)
  stages, proves and only then writes, while `disable` needs no proof, so a cache holding a broken
  enabled mod stays repairable. `readEntryText` (`modportalCache.ts:50`) owns the missing-entry-file
  half of the tolerance contract and both callers use it.
- **Intent outliving its entry.** Verified: intent is keyed by issue number and survives an entry being
  pruned, so re-labelling an issue the user switched off does not resurrect it enabled, while promoting
  one to `mod-auto-enabled` still can.
- **Manifest v2 with a v1 fallback.** A v1 manifest surrenders its entries and keeps its enable/disable
  choices as intent, with a warning naming the next step.
- **Squash variable absorption** (`edba422`) and the **serializer round trip** (`c9c88e1`) both hold;
  the round-trip assertion is real and is what makes H1's fix cheap.

## Not findings

- **Path handling.** `mod.file` is `${issue}-${moduleId}.dsl` with `issue` validated as a positive
  integer (`modportal.ts:157`) and `moduleId` constrained to `[a-z][a-z0-9-]*` by the grammar;
  `insideCache` (`modportalCache.ts:28`) rejects a manifest-supplied path escaping the cache; pruning is
  scoped to `ENTRY_FILE`. No traversal found.
- **A contribution with no `# info`.** Takes its id from the source name, but
  `planModportalSync`'s load refuses it with a diagnostic naming the missing namespace and records it
  blocked. Fails safe.
- **A contribution colliding with a base module id.** Loads as a duplicate, gets diagnostics, is
  recorded blocked. Fails safe.
- **`base 1.0.0` losing its version constraint** is real but belongs to the DSL load path — it is
  `list.parseBlock` dropping the rest of the line. Filed as M2 of
  `docs/audits/dsl-load-path-2026-07-30-pass2.md`; noted here because it degrades the base record
  `efa64cd` built.
- **No layer violations, no scope drift, no CI/test/type/security weakening.** Policy moved into the
  content layer as a pure function and the script kept the IO, which is the boundary the layer rule
  wants.

## Recommended work order

1. **H1** — silent content loss on the system's central use case, with the fix already written in a
   sibling file. Do it with L1's test (edit-a-base-section and `# remove` fixtures asserted through
   `registryDiff`), since the test is what makes the fix provable.
2. **M2**, then **M3** — both are "the delimiter contract is enforced at one granularity and not the
   next one down", and M2's round-trip fix is the pattern for both.
3. **M1** — record the base on the manifest.
4. **L2**, **L3**.
