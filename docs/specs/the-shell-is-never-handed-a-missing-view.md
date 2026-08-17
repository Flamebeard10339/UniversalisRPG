# the-shell-is-never-handed-a-missing-view

## Deliverable

`opening-a-universe-answers-rather-than-raises` makes a session something the door always hands back.
This is the half of that which the type system has to be told about.

`DriverSnapshot.view` is `PlayView | null` and stays so, and **29 sites across 10 files** under
`src/ui` still handle a state that can no longer occur: `src/ui/App.tsx` (10), `src/ui/discovery.ts`
(3), `src/ui/agent/testHarness.ts` (3), `src/ui/LocationBanner.tsx` (3), `src/ui/driver.ts` (2),
`src/ui/SkillsPane.tsx` (2), `src/ui/MapPane.tsx` (2), `src/ui/Home.tsx` (2),
`src/ui/StatusBanner.tsx` (1), `src/ui/authoringSurface.ts` (1, which is `NOWHERE` — what `standingIn`
answers when there is nobody standing anywhere). The counts are the shape of the sweep, not its extent:
c2 derives its own subjects, so a site this list has miscounted is still caught.

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
  for one is zero — derived by the same scanner `surface.test.ts` already reads the tree with, so a
  site written next month is caught rather than a list going stale. The branches are deleted rather
  than left unreachable behind a `!`, which is what makes this a clause and not a restatement of c1:
  a non-null assertion satisfies the compiler and leaves the reader exactly the question this spec
  removes.
  proof: vitest src/ui/surface.test.ts
- [c3] **Every screen draws exactly what it drew before.** The full render sweep passes unchanged. This
  is the clause that carries the whole risk of the sweep, because 29 mechanical deletions across ten
  files is a shape that fails silently or not at all.
  proof: vitest src/ui/render.test.tsx
- [c4] `npm run tasks -- merge-ready` passes before the spec is marked done.
  proof: command npm run tasks -- merge-ready

## Goal

Stop the type from describing a state the engine can no longer produce, so that nobody writes, tests
or reviews handling for it.

## Decisions

**This is a separate spec and not the tail of its predecessor.** It touches ten files and no behaviour,
where the predecessor touches behaviour and few files; folding a wide mechanical sweep into a branch
that has already taken two audits is how the last HIGH happened. The argument is about audit surface,
not clause count, so it survives this spec shrinking to four clauses. It runs on the same branch, after
the predecessor is closed, so the tree is never in the state this spec exists to prevent — a guaranteed
session with a type that denies it — for longer than one merge.

**A `!` is not a fix.** Unwrapping with a non-null assertion satisfies tsc and leaves the reader
exactly the question this spec removes. c2 is written against the deletion, not against the compile.

**`wordless()` is the predecessor's, not this spec's.** An earlier draft claimed it here. It is a
`loadUniverseWithDiagnostics` call under `src/ui` (`src/ui/driver.ts:277`), so the predecessor's c6 —
zero load path calls under `src/ui` — deletes it before this spec starts. Two specs both claiming one
deletion is the manual-sync shape in miniature, and the fix is that the clause which forces it owns it.

**Three clauses were cut from the first draft, each because something else proves it.** A "the words on
the screen are the session's" clause went with `wordless` to the predecessor. A "nothing that loads
today stops loading, and no content is edited" clause was dropped: this spec touches only `src/ui`, and
the predecessor's c8 makes that check on the same branch. A "deletes more than it adds" clause was
dropped: c2 already proves the branches left rather than being asserted away, which is the fact the
line count was standing in for, and `main...HEAD` would have measured the predecessor's additions too.

**Both open questions took the narrow answer, under the author's 2026-08-17 ruling.** `MapPane` and
`discovery.ts` go on taking a view; `drawnFor`'s parameter loses its null and nothing else moves, and
`walkLine` keeps its journey guard, because a view with no journey under way is a state the engine
still produces. `NOWHERE` survives in `authoringSurface.ts` and `standingIn` stops reaching for it:
c1 makes the state it answered for unreachable, and four test files name the value as the standing
with no entities, so deleting it would mint that literal three times over.

**c2's scanner walks `src/ui` with tests included**, one flag wider than the `SOURCES` set the file's
other rules use. It earned the width on the first run: 39 `snapshot().view!` assertions across five
test files, none of them in the ten files this spec counted, and the assertion is the exact spelling
the clause says is not a fix.

**Three survivors are declared rather than closed, and two are filed as findings.** `SkillsPane`'s
rate clock and `MapPane`'s recentre floor are read only after component state a click sets, which
CLAUDE.md's testing rule 5 leaves to the author. The driver's arming log is redundant with the tick
that follows it for every fixture in the tree — the only thing the arming view carries that the tick
cannot is what the world said as the action began, and nothing in the tree says anything there.

## Open questions

- Whether `MapPane` and `discovery.ts` keep taking a view at all, or take the fields they draw, is the
  worker's call — several of their null checks are about a view that has no journey rather than about
  there being no view, and those are a different question that this spec should not quietly answer.
- Whether `NOWHERE` survives as the answer for a session standing in the fallback's own location is the
  worker's call. c1 fixes that `standingIn` is total; it does not fix what it returns there.

## Requires

`opening-a-universe-answers-rather-than-raises`, closed. Starting before it is closed would mean
deleting the handling for a state the engine can still reach.
