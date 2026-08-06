# save-migration-system

## Deliverable

`checkSave` accepts one version and rejects every other, from both `loadSave` and `compareSave`. This
branch puts a ladder in front of it: a save is carried forward from the version it was written at to
`SAVE_VERSION` before anything else looks at it, so a build can read a save an older build wrote.

**It ships with no rungs, and that is the point.** This task is sequenced before
`pre-release-readiness-audit`, which is what sets 0.1.0 — so at the moment it lands, no build has
been released and there is no older build whose saves need carrying. What it delivers is the
mechanism and the obligation that goes with it: from here on, a branch that bumps `SAVE_VERSION` adds
the rung that carries the previous version across, and the bump is not done until it has. Testing the
mechanism against synthetic versions is better than testing it against real history anyway, because
the cases that matter — a gap in the chain, a rung that throws, a version from the future — are ones
real history will not contain until it is too late to discover them.

That obligation is the difference from `save-fixture-migration`, which is the same shape of transform
with the opposite retention policy: a one-shot rewrite, discarded after each bump, run over authored
fixtures. This branch keeps every rung forever and runs them on a player's file. Its two commitments
to this one come due here — `scripts/migrate-saves.ts` is deleted rather than maintained beside the
ladder, and `git log -p` over that file is where its discarded transforms can be read if any is
wanted as a rung.

Fixtures come along for free, and that needs a guard rather than celebration. Once the ladder runs
inside `loadSave` and `compareSave`, a `# save` section at any old version simply works — which
removes the forcing function a version bump currently provides, where a mismatch made someone look at
every fixture. So a test asserts every shipped fixture is at `SAVE_VERSION`: one migration mechanism,
and staleness stays loud.

| the save                                        | today                                | after |
| ------------------------------------------------- | ------------------------------------ | ----- |
| written at `SAVE_VERSION`                          | loads                                 | loads, no rung runs |
| written one version back, rung exists              | `save version mismatch`, refused       | carried forward, then checked as usual |
| written five versions back, every rung exists      | refused                                | carried across each rung in order |
| written below the ladder's floor                   | refused                                | refused, file untouched, told it can be exported |
| written by a newer build than this one             | refused                                | refused, file untouched, told it can be exported |
| a rung throws part-way along                       | —                                      | refused, file untouched, nothing partially written |
| a `# save` fixture at an old version               | refused                                | carried forward — and a test says the fixture is stale |

Proof:

- [c1] A save is carried from its own version to `SAVE_VERSION` before it is checked, and the same
  ladder runs for `loadSave` and `compareSave`. Neither has a second copy of the walk, so an
  `expect:` and a load can never disagree about what a save means.
  proof: vitest src/runtime/save.test.ts
- [c2] The mechanism is proven without real rungs. Synthetic versions exercise a full walk, a single
  step, a gap in the chain, a rung that throws, a version below the floor and a version above
  `SAVE_VERSION`, so the cases that matter are tested before history contains any of them.
  proof: vitest src/runtime/save.test.ts
- [c3] A save the ladder cannot carry is refused without being touched. Nothing is partially
  migrated, nothing is written back, and the refusal says the file can still be exported — so the one
  outcome a player cannot forgive, losing the file, is not reachable from here.
  proof: vitest src/runtime/save.test.ts
- [c4] Every shipped `# save` fixture is at `SAVE_VERSION`. The ladder would carry a stale one
  silently, which removes the forcing function a version mismatch used to provide, so the check that
  used to happen by accident happens on purpose instead.
  proof: vitest src/runtime/integration.test.ts
- [c5] `scripts/migrate-saves.ts` is deleted, along with its entry in `docs/audits/systems.json` and
  its npm script. `save-fixture-migration` promised this branch would retire it rather than maintain
  two answers to one question, and the whole-tree grep for its name comes back empty.
  proof: npm run audit-status
- [c6] Adding a rung is the documented cost of bumping `SAVE_VERSION`, stated where a bumping branch
  will meet it rather than in prose nobody reads at the right moment.
  proof: vitest src/runtime/save.test.ts

## Decisions

- **The ladder ships empty, because nothing has been released.** A rung for every version from 1 to 6
  would be six transforms carrying saves no player has ever held, written from git archaeology, and
  tested against nothing. The mechanism plus the obligation is the whole deliverable; the first real
  rung belongs to the first branch that bumps `SAVE_VERSION` after 0.1.0.
- **Synthetic versions are better test data than real history.** The failure modes worth proving —
  a gap in the chain, a throwing rung, a save from the future — will not appear in real history until
  a player has already hit one. Fabricating them costs nothing and is the only way to test them
  before they matter.
- **One ladder, run from one place, for player saves and fixtures alike.** Running it only for player
  saves would leave `scripts/migrate-saves.ts` alive for the fixture half, which is the two-answers
  outcome `save-fixture-migration` explicitly promised against. Running it everywhere and asserting
  fixtures are current keeps one mechanism and keeps the loud signal — the assertion replaces a
  forcing function that used to come free from a crash.
- **Refuse rather than best-effort, and never write back.** A partially migrated save written over
  the original is unrecoverable, and a player who loses a file does not care which rung failed. The
  refusal is cheap to make useful now that `/export` exists: the file is intact and can be carried to
  a build that understands it.
- **This waits on `auto-save-export-and-load`.** The record ordered this immediately before
  `pre-release-readiness-audit` on the reasoning that a real player's save first exists there. That
  is no longer where it first exists — `auto-save-export-and-load` builds the store, and c3's
  refusal path names `/export`, which is that task's. A ladder with no save to carry is untestable
  against the thing it protects.
- **Same shape as `save-fixture-migration`, opposite retention.** Both are `(diff at N) → (diff at
  N+1)`. That one discards its transform after each bump because keeping old versions loadable was
  explicitly not its job; this one keeps every rung forever because that is precisely its job. They
  were split so the cheap half could land while the save shape was still moving, and this half
  retires the cheap one on arrival.

## Open questions

- Whether a rung is registered in a map keyed by source version or composed as a list is the worker's
  call. c2 fixes that a gap in the chain is detected rather than skipped, which is the property
  either shape has to have.
- Whether the floor is implicit (the lowest rung present) or declared is left open. A declared floor
  gives a better refusal message; an implicit one cannot drift from the rungs that exist. c3 fixes
  only that a save below it is refused intact.
