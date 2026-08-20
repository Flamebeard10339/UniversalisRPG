# Contribution System Audit - 2026-07-29

Audited the contribution system at `e45067b` using the prompt in `CLAUDE.md`.
Scope was the paths owned by `docs/audits/systems.json` for the Contribution
system, across the six commits that introduced and then fixed the local
authoring, issue packaging, squash, and approved-mod portal flows:

- `8465481` Implemented base stack
- `11d9335` Add local DSL authoring commands
- `65d764a` Add DSL contribution packaging scripts
- `731c3a6` Add approved issue modportal
- `339f106` Validate the modportal cache before writing it, and read it defensively
- `400ff94` Anchor contribution DSL extraction on its heading, and drop a dead branch

Validation observed during the audit: `npm run audit-status` fails only because
this system had no baseline audit. Full test/build commands were run after this
audit record was written.

## Findings

### H1 - `modportal enable` can persist an invalid enabled mod without validation

Files: `scripts/modportal.ts:139`, `scripts/modportal.ts:192`

`sync` validates the enabled cache before writing it, but `enable` does not.
`validateEnabled` exists and is used by `sync`, yet `toggle` sets
`entry.enabled = true` and writes the manifest immediately. A disabled entry can
therefore become enabled even if its DSL no longer parses, its file is missing,
or it fails reference validation against the selected content set. The next game
or tooling load will see the manifest as enabled and fail later, after the
operation that created the invalid state has already reported success.

Evidence: `scripts/modportal.test.ts` covers `sync` rejecting a broken enabled
mod and preserving a broken disabled mod, but the enable-path assertion only
re-enables a known-good synced mod. There is no regression that tries to enable a
broken cached mod and expects the command to fail without writing the manifest.

Impact: an approved mod cache can be put into a red/load-failing state by an
ordinary repair command. This weakens the validation guarantee the contribution
system is meant to provide.

Fix direction: when `enabled === true`, stage the toggle in memory, call
`validateEnabled`, and write the manifest only if diagnostics are empty. If the
entry file is missing or invalid, print the diagnostics and leave the previous
manifest untouched. Keep disable cheap and non-validating.

### M1 - approved-mod materialization rewrites raw DSL text with a regex

Files: `src/content/modportal.ts:59`

When an approved issue still declares `# info local-changes`,
`materializeApprovedModIssue` generates a unique module id and then calls
`replaceLocalChangesNamespace`, which changes every textual occurrence matching
`/(^|[^a-z0-9-])local-changes\./g`. That is not a reference-aware rewrite. It
will also alter contributor-authored prose such as `say: local-changes.vigor is
a useful example`, titles, examine text, dialogue text, or save payload strings.
The parser accepts the rewritten result, so the current parse-only check cannot
detect the corruption.

Evidence: `src/content/modportal.test.ts` proves the happy path for a stat
reference (`+2 local-changes.vigor`) but has no case where `local-changes.` is
literal text. The implementation assumes all matching substrings are references,
which is exactly the kind of raw-text transport the DSL rewrite was meant to
avoid.

Impact: approving a valid local contribution can silently change player-facing
content. The issue body remains correct, but the cached approved module differs
from what the contributor submitted.

Fix direction: rewrite the module id through parsed content, not through raw
text. Either require contributors to submit the final custom module id before
approval, or add a serializer-backed/reference-site-aware transform that changes
only resolved references and the `# info` id.

## Non-Findings

- The contribution code is now correctly owned by the Contribution system in
  `docs/audits/systems.json`; this audit exists to baseline that ownership.
- The previously reported wrong-fence extraction bug is closed: extraction is
  anchored on `## Local Changes DSL`, with regression coverage for a contributor
  note that contains its own DSL fence.
- The previously reported modportal cache escape risk is closed for manifest
  entry reads: `readModportalCache` skips entry files that resolve outside the
  selected cache directory.
