# DSL Modules Independent Audit - Codex

Audited code snapshot: `17c011d` (`dsl-pass2-resources`) in isolated worktree
`.claude/worktrees/codex-independent-audit-20260729`.

Current checkout had advanced to `1d13661` before this document was written, but that commit only
adds another audit document, backlog edits, and audit-manifest edits. I did not use that audit's
findings as input.

## Verification

Baseline checks run from the main checkout after confirming the intervening commit was docs-only:

- `npm test` passed: 30 files, 419 tests.
- `npx tsc --noEmit` passed.
- `npm run layer-check` passed: 378 cross-file imports checked.
- `npm run build` passed.
- `npm run audit-status` passed, but see M5 for an audit-coverage concern.

Targeted loader smokes run against the isolated audit worktree with the root `node_modules`:

- `stats:` written as a block fails with `this field cannot be written as a block`.
- `speed: attack typo`, `requires: has coin typo`, `time: 1 typo`, `accuracy: attack typo`,
  `give: coin typo`, and `drain: 5 health typo` load successfully.
- A `~ target` dependency reference to `target.gem` fails when the referring module sorts before
  `target`.
- A dialogue pruned because it references an absent optional module leaves its node declared in
  `registry.namespace`, and `pruneStateForRegistry` keeps stale visits for that node.

## Findings

### H1 - `~` dependencies do not actually support cyclic references

`docs/dsl-modules/deliverable-log.md:305` defines `~` as required but not load-ordering, "for
breaking dependency cycles." The implementation only declares module ids up front
(`src/content/registry.ts:436`, `src/content/registry.ts:443`) and then resolves each module in
topological/name order (`src/content/registry.ts:444` to `src/content/registry.ts:449`).
`resolveModule` declares only the current module's created ids before resolving that same module
(`src/content/resolve.ts:75` to `src/content/resolve.ts:103`), while `Namespace.resolve` can only
match keys already declared (`src/content/namespace.ts:90` to `src/content/namespace.ts:95`).

Evidence smoke:

```text
# info target
# item gem

# info ref
dependencies: ~ target
# entity npc
use:
  give: target.gem
```

This loads only `target`; `ref` is disabled with
`# entity ref.npc action "use" give: names an unknown item: target.gem` when `ref` sorts before
`target`.

Impact: the advertised escape hatch for cyclic references works only accidentally when name order
declares the referenced module first. Real cyclic content cannot rely on it. A fix likely needs a
pre-resolution declaration pass over all loaded modules before rewriting references.

### H2 - GUI authoring acceptance criteria are still unmet

The deliverable says the engine must "Create new content of every DSL type, from both CLI and GUI"
(`docs/dsl-modules/deliverable-log.md:26`) and talks about the in-game editor emitting qualified
paths (`docs/dsl-modules/deliverable-log.md:173`). The implemented web entry point is still only a
placeholder: `src/main.tsx:6`, `src/main.tsx:17`, `src/main.tsx:24`. The same deliverable log marks
CLI authoring done but explicitly defers full structured GUI controls
(`docs/dsl-modules/deliverable-log.md:626`, `docs/dsl-modules/deliverable-log.md:658`).

Impact: the module deliverable is being recorded as done while one of its explicit user-facing
surfaces does not exist. This also keeps web/Android publishing tied to the placeholder app rather
than the authoring workflow.

### M1 - Action, dialogue, and test sub-parsers silently ignore trailing garbage

The generic section parser catches trailing tokens after normal fields, but custom sub-parsers do
not consistently require end-of-line consumption. `parseActionLine` returns immediately after
parsing action fields and result lists (`src/grammar/action.ts:45`, `src/grammar/action.ts:50` to
`src/grammar/action.ts:129`). Dialogue conditions and effects parse with fresh cursors and do not
check for leftover text (`src/content/dialogue.ts:83`, `src/content/dialogue.ts:87`,
`src/content/dialogue.ts:110`, `src/content/dialogue.ts:115`). Test `assert:` does the same
(`src/content/test.ts:40`, `src/content/test.ts:88`, `src/content/test.ts:89`).

Evidence smoke:

```text
LOADED requires: has coin typo
LOADED time: 1 typo
LOADED accuracy: attack typo
LOADED give: coin typo
LOADED drain: 5 health typo
```

Impact: author typos can be accepted as valid DSL and then disappear. This weakens the validation
and diagnostics acceptance criteria and creates tests that can repeat the implementation's current
assumption instead of testing malformed input.

### M2 - `stats:` is the inconsistent block outlier the user noticed

`src/grammar/list.ts:6` and `src/grammar/list.ts:22` provide the existing block-capable list parser,
and the generic section parser only allows blocks when a parser exposes `parseBlock`
(`src/grammar/section.ts:76` to `src/grammar/section.ts:78`). Entity `stats` uses a custom
`statBlock` parser with only inline `parse` (`src/content/entity.ts:30`, `src/content/entity.ts:31`)
and wires that parser directly into the schema (`src/content/entity.ts:40`).

Impact: `stats:` is author-hostile compared with neighboring fields. The simpler existing pattern
to reuse is `list(statAssignment)` plus an object conversion for both inline and block forms.

### M3 - Pruned registry entries leave stale namespace declarations

Optional dependency pruning deletes registry map entries for pruned objects
(`src/content/registry.ts:342`, `src/content/registry.ts:350`, `src/content/registry.ts:357`,
`src/content/registry.ts:364`) but does not undeclare those ids from `registry.namespace`.
`Namespace` has `undeclare` and `has` operations (`src/content/namespace.ts:58`,
`src/content/namespace.ts:65`), but the prune path only records pruned owner keys in a local set.
Runtime save pruning then trusts the namespace for dialogue visits
(`src/runtime/save.ts:121`).

Evidence smoke:

```text
dialogues (none)
node declared true
no warnings
visits {"base.chat.greet":2}
```

Impact: disabling an optional module can remove a dialogue/resource/test from the registry while
typed CLI resolution and save pruning still see old namespace declarations. For the user-raised
runtime pruning concern: explicit state pruning is justifiable for runtime-only state such as
active actions and buffs, but it needs the registry and namespace to describe the same surviving
universe.

### M4 - Failed modportal sync leaves the cache mutated

`sync` materializes incoming issues, writes DSL files, and writes the manifest before validating
the resulting enabled set (`scripts/modportal.ts:157` to `scripts/modportal.ts:165`). New entries
default to enabled in `upsertModportalEntries` (`src/content/modportal.ts:87` to
`src/content/modportal.ts:100`).

Impact: a bad approved issue can make `npm run modportal -- sync` exit non-zero after it has already
left a broken enabled mod in `content/modportal.local`. The tolerant loader will keep play alive,
but the failed command has still committed partial local state instead of rolling back or writing
the new mod disabled.

### M5 - Contribution/modportal code is not owned by the audit manifest

The current audit manifest still records "Contribution system" with no paths and a note saying it
is unbuilt (`docs/audits/systems.json:19` to `docs/audits/systems.json:23`), while contribution and
modportal behavior now lives in `scripts/publish-local-changes.ts:121` to
`scripts/publish-local-changes.ts:145`, `scripts/squash-local-changes.ts:122` to
`scripts/squash-local-changes.ts:158`, `scripts/modportal.ts:148` to `scripts/modportal.ts:214`,
and `src/content/contribution.ts:31` to `src/content/contribution.ts:60`.

Impact: future changes to contribution/modportal behavior will be charged to broad `scripts`
coverage under Testing Procedure (`docs/audits/systems.json:33` to
`docs/audits/systems.json:37`), not to the contribution system they implement. That weakens the
audit gate's architecture signal and makes cross-system risk easier to miss.

### L1 - `/dsl <kind> <id>` has no discovery/help path

The CLI exposes `/dsl <kind> <id> [body]` in help (`scripts/play-cli.ts:64`) and immediately stages
whatever section source the regex captures (`scripts/play-cli.ts:331` to `scripts/play-cli.ts:340`).
There is no mode-specific help for required fields, block-capable fields, examples, or the managed
`# remove` spelling.

Impact: authors must already know section kinds and field shapes. This matches the deliverable's
accepted boundary, but not the workflow the user raised: `/dsl <kind> <id>` should probably open a
kind-specific help/prompt path rather than either creating an empty defaulted section or returning
a loader error.

### L2 - The modportal CLI does not reuse the cache path guard used by play loading

The play CLI protects manifest file paths with an `inside` check before reading cached mod files
(`scripts/play-cli.ts:750` to `scripts/play-cli.ts:773`). The modportal CLI reads manifest entry
files directly for validation and `show` (`scripts/modportal.ts:134`, `scripts/modportal.ts:135`,
`scripts/modportal.ts:198` to `scripts/modportal.ts:205`).

Impact: sync-generated manifests are safe because filenames are generated from sanitized issue data,
but a corrupted local manifest can make `modportal show` or validation read outside the cache. This
is a small security/pattern-reuse gap.

## Requested Concern Notes

- Runtime pruning: I am not filing "pruning is too complex" by itself. The explicit pass covers
  runtime state that is not representable as simple content ids, especially active actions, actor
  resources, buffs, and current location. M3 is the correctness issue: the registry and namespace
  must agree before pruning can be trusted.
- Stats block grammar: filed as M2.
- CLI authoring help: filed as L1.
