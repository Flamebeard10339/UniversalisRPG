# DSL load path audit — 2026-07-29

Independent audit of repository system 1 (**DSL load path**: `src/grammar`, `src/content`) at
`65d764a` after the DSL module chunks 1-7. The audit covered the ten code-changing commits since
`50a4f41` and included the Chunk 7 contribution/squash surface before it was committed.

Prompt used: the audit prompt from `CLAUDE.md`, with extra focus on `src/content/serialize.ts`,
local contribution packaging, BOM/dotted-reference grammar changes, and whether canonical squash
output preserves loaded behavior enough for integration tooling.

---

## Findings and resolution

### H1 — multi-result actions could serialize to different behavior

`serializeRegistryModule` printed simple actions inline. That is valid only while a `say:` result is
last, because the action-result parser consumes the rest of the line as the say text. A loaded action
with `set: a`, `say: hello`, `set: b` could print as one inline list and reload as `set: a` plus
`say: hello, set: b`.

Resolved in `65d764a`: actions with more than one result print as blocks, and the serializer test now
round-trips a middle `say:` with following effects.

### H2 — squash could silently drop local-created content

`scripts/squash-local-changes.ts` defaulted to the first content module and serialized only ids owned
by that module. A valid local module creating `local-changes.gem` could be squashed into `base` with
no diagnostics, producing output that lost the gem.

Resolved in `65d764a`: squash now reloads the remaining sources plus the emitted module and compares
the loaded content maps against the original base+local universe. If any content is missing, added or
changed, it fails with the affected keys. A CLI-level regression test covers the local-created item
case.

### M1 — BOM handling shifted parser spans used by local changes

The initial BOM fix stripped the BOM from a local copy of the source, so spans no longer lined up with
callers slicing the original text. `listLocalSections` could return text with a leading blank and a
truncated final character.

Resolved in `65d764a`: `splitSections` parses a cleaned line while preserving original offsets, and
diagnostic line/column formatting treats a leading BOM as invisible. `localChanges.test.ts` covers
section slicing with a BOM-bearing local file.

### M2 — CRLF DSL still failed to parse

The prior CRLF audit finding was still present. Splitting on `\n` left `\r` on headings, so CRLF DSL
could fail before the first section or reattribute a heading to the previous section body.

Resolved in `65d764a`: `splitSections` strips a trailing carriage return per line before heading and
body parsing. `parse.test.ts` covers CRLF line endings.

### M3 — `~` dependencies were visible as patch targets

The settled module spec says `~` breaks cycles and does not affect load order, so it cannot be used
for edits that require the target to load first. The resolver made every non-incompatible dependency
visible, letting `~ aaa` patch `aaa.coin` when lexical ordering happened to place `aaa` first.

Resolved in `65d764a`: namespace ownership is queryable, and the resolver rejects qualified edits or
removals whose owner is an unordered dependency. `resolve.test.ts` covers the rejection.

### L1 — contribution packaging accepted the wrong module id

`localModuleLoaded` accepted a source by source name even when its `# info` declared a module other
than `local-changes`, so the publishing script could package a file that did not match the issue
template or local-authoring contract.

Resolved in `65d764a`: the helper now requires the selected source to load as the managed
`local-changes` module id. `contribution.test.ts` covers the wrong-id case.

---

## Residual risk

The canonical serializer is intentionally not source-preserving: comments, shorthand and original
relative-location spelling are not retained. That boundary is recorded in the Chunk 7 deliverable log.
The `--create` path shells out to `gh issue create`; local verification covered body generation and
validation, not a networked GitHub issue submission.

Verification before the audit record: 413 tests green, `npm run build`, `npm run layer-check`,
`git diff --check`, and a script smoke packaging and squashing a BOM-bearing local-changes patch.
