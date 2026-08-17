# the-shell-is-never-handed-a-missing-view

## Deliverable

`opening-a-universe-answers-rather-than-raises` makes a session something the door always hands back.
This is the half of that which the type system has to be told about.

`DriverSnapshot.view` is `PlayView | null` and stays so, and **29 sites in 8 files** under `src/ui`
still handle a state that can no longer occur: `src/ui/App.tsx` (10), `src/ui/discovery.ts` (4),
`src/ui/agent/testHarness.ts` (3), `src/ui/SkillsPane.tsx` (3), `src/ui/MapPane.tsx` (3),
`src/ui/LocationBanner.tsx` (3), `src/ui/StatusBanner.tsx` (2), `src/ui/driver.ts` (1). Plus
`wordless()`, which exists so that a shell with no session still has somewhere to ask for the words on
its own tabs, and `NOWHERE`, which is what `standingIn` answers when there is nobody standing anywhere.

A type that is merely wide is a nuisance. A type that lies is a defect generator: the next reader
writes handling for the impossible state, a test written against that handling can never fail, and a
reviewer cannot tell the difference between a branch that is dead and a branch that is untested — which
is the confusion that cost the predecessor branch its HIGH. Leaving the nullable in place after the
door guarantees a session is choosing to keep that confusion.

This deletes and does not add. There is no new behaviour here at all: every one of the 29 sites is
either an unreachable branch to remove or a `?.` to unwrap.

Proof:

- [c1] **The published type says what is true.** `DriverSnapshot.view` is `PlayView`. The harness
  publishes a view rather than a maybe-view, and `standingIn` answers where the player is rather than
  whether there is one.
  proof: command npx tsc --noEmit
- [c2] **Nothing under `src/ui` asks whether there is a view.** The count of the spellings that test
  for one is zero — derived by the same scanner `surface.test.ts` already uses to read the tree, so a
  site written next month is caught rather than a list going stale. The branches are deleted rather
  than left unreachable behind a `!`.
  proof: vitest src/ui/surface.test.ts
- [c3] **The words on the screen are the session's, always.** `wordless()` and the registry it loads
  are gone; `driver.localizer()` is `sessionLocalizer(context.session)` with nothing beside it, which
  is what c3 of `both-drivers-read-their-own-words-from-the-localizer` asked for and could not have
  while a shell could exist without a session.
  proof: vitest src/ui/render.test.tsx
- [c4] **Every screen draws exactly what it drew before.** The full render sweep passes unchanged, and
  a session opened over a repair draws the repair's own location rather than an empty frame — which is
  the state that used to be `view: null` and is the one thing whose appearance moves.
  proof: vitest src/ui/render.test.tsx src/ui/shell.test.tsx
- [c5] **Nothing that loads today stops loading**, and no shipped game content is edited.
  proof: vitest src/runtime/integration.test.ts
  proof: command git diff --stat main...HEAD -- content/tutorial-island.dsl content/combat-expansion.dsl
- [c6] **The change deletes more than it adds**, net, across `src/` excluding tests.
  proof: command git diff --numstat main...HEAD -- src
- [c7] `npm run tasks -- merge-ready` passes before the spec is marked done.
  proof: command npm run tasks -- merge-ready

## Goal

Stop the type from describing a state the engine can no longer produce, so that nobody writes, tests
or reviews handling for it.

## Decisions

**This is a separate spec and not the tail of its predecessor.** It touches 8 files and no behaviour,
where the predecessor touches behaviour and few files; folding a wide mechanical sweep into a branch
that has already taken two audits is how the last HIGH happened. It runs on the same branch, after the
predecessor is closed, so the tree is never in the state this spec exists to prevent — a guaranteed
session with a type that denies it — for longer than one merge.

**A `!` is not a fix.** Unwrapping with a non-null assertion satisfies tsc and leaves the reader
exactly the question this spec removes. c2 is written against the deletion, not against the compile.

## Open questions

- Whether `MapPane` and `discovery.ts` keep taking a view at all, or take the fields they draw, is the
  worker's call — several of their null checks are about a view that has no journey rather than about
  there being no view, and those are a different question that this spec should not quietly answer.
- Whether `NOWHERE` survives as the answer for a session standing in the repair's own location is the
  worker's call. c1 fixes that `standingIn` is total; it does not fix what it returns there.

## Requires

`opening-a-universe-answers-rather-than-raises`, closed. Starting before it is closed would mean
deleting the handling for a state the engine can still reach.
