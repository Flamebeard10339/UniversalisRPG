# opening-a-universe-answers-rather-than-raises

## Deliverable

Opening a universe is done twice in this repository and neither doing is the engine's.

`createDriver` (`src/ui/driver.ts`) loads the base sources, loads them a second time with the local
module on top, decides for itself whether the local module survived that second load, throws the whole
load away when it did not, and labels whatever went wrong `base` or `local` according to **which `try`
block the exception arrived in**. `play-cli` (`scripts/play-cli.ts:575`) does
`loadUniverseWithDiagnostics` then `startSession` bare, with no recovery at all — so the CLI strands on
exactly the input the GUI recovers from, and `drift.test.ts` compares every line the two drivers take
except the one that opens them.

Both of those are inference, and the second load is a second copy.
`loadUniverseWithDiagnostics` (`src/content/registry.ts:1342`) is already a fixpoint: it parses, and on
a failure it records a diagnostic, disables that module, and retries until what is left compiles. It
returns `emptyRegistry()` rather than raising when nothing survives. It reports `diagnostics`,
`modules[].loaded`, `loadedModules` and `disabledModules` — every one of them keyed by module name, and
none of them by exception. The driver's second load re-derives an answer the first load already gave
(`localTrouble` is a hand-rolled `modules.find(…).loaded`), and the label it computes is a *guess*
about a fact the loader had already stated.

The guess is what this branch measured going wrong. A local module that loads clean and leaves the
merged universe with no starting location is reported as a **base** fault, so the author is told a
shipped file is broken and is denied the one control that would clear it — the exact wrong answer
`the-shell-draws-what-the-session-answers` c5 forbids, in mirror. It is not a missing case. An
exception carries *where the code was standing*, never *which module is at fault*, so no amount of
care in the catch can recover the attribution, and no test can derive it: a label that is not computed
from data can only be checked against an enumeration, and an enumeration is missing a row forever.

The one thing standing between a loaded registry and a session is `startSession`'s single precondition
— `if (!state.location) throw` — and it announces itself by raising. That raise is the whole reason
anybody catches, and the catch is the whole reason anybody infers.

So: **one door, `openUniverse(sources)`, which answers and never raises.** It loads once. It reports
what the loader disabled, by name, out of the loader's own report. It checks what a session requires,
falls back to a universe it carries itself when that is not met, and says so. Both drivers call it, and
neither of them knows that loading has stages.

What leaves `src/ui/driver.ts`: the second load, the fall-through, `localTrouble`, `Fault.at`,
`FAULT_AT`, `wordless`, and every catch around opening.

Proof:

- [c1] **Opening answers; it never raises, and what it hands back is startable.** `openUniverse`
  returns a value for every input and the session in it always exists. The proof derives its subjects
  rather than listing them, on two published spines crossed with each other: every member of
  `ModuleLoadStage` (`'parse' | 'order' | 'resolve' | 'merge' | 'build' | 'validate'`), and every entry
  in the door's own requirements value. Each cell is a source set that trips that stage or violates
  that requirement, in the base sources and again with a local module over them, plus the empty set. A
  stage or a requirement added next month has no fixture and the test fails for want of one, which is
  the whole reason the family is spined on values the tree already publishes rather than on shapes
  somebody thought of.
  proof: vitest src/runtime/openUniverse.test.ts
- [c2] **What is at fault is read off the loader, never inferred.** Every problem the door reports
  names the module it came from, and that name comes from the loader's own per-module report. The proof
  is what makes this different from the branch it replaces: for each cell of c1's family it checks the
  reported module against **the module the fixture actually broke**, so a reproduction cannot be graded
  by the path it took through the code, and no assertion is keyed off a label the test itself wrote.
  No caller classifies a failure by where it was standing, which is derived from the tree: no `try`
  block under `src/ui` or `scripts/` contains a call to the door.
  proof: vitest src/runtime/openUniverse.test.ts src/ui/surface.test.ts
- [c3] **A fallback is announced, and is never mistaken for the game.** A universe the door could not
  start says so on the tool channel and says which requirement was unmet. The fallback is hermetic by
  construction rather than by promise — it is a DSL string the runtime carries, loaded through the same
  load path, reading nothing out of the universe it stands in for — and it is unmistakable on a screen
  rather than a plausible room. `nothing-authored-is-silently-dropped` is the standing rule this answers
  to: it keeps the shell mountable so an author has a surface to fix the content from, and it does not
  pretend the content is fine.
  proof: vitest src/runtime/openUniverse.test.ts src/ui/shell.test.tsx
- [c4] **A session opened over the fallback is no slot's game.** Autosave never writes it, `/save` takes
  it only when said out loud, and a broken release therefore cannot overwrite a player's slot with a
  stand-in. This is a hazard the fallback introduces and `auto-save-export-and-load` holds the machinery
  for, but not the answer: `createSaveContext` (`src/runtime/saveSlots.ts:53`) sets `synced` to the
  player slot whenever that slot is empty, which is exactly the state a first launch over a broken
  release is in. The door forces `synced` null, and `writesLive` refuses off that.
  proof: vitest src/runtime/openUniverse.test.ts src/runtime/saveSlots.test.ts
- [c5] **Both drivers open through the one door.** `play-cli` recovers from what the GUI recovers from,
  because it is the same call; `drift.test.ts` compares opening, which it cannot do today. A `# test`
  over content that will not load is a test both drivers reach the same state from.
  proof: vitest scripts/drift.test.ts scripts/play-cli.test.ts
- [c6] **`src/ui` does not open a universe, and the apparatus that guessed is gone.** The count of load
  path calls under `src/ui` — `loadUniverseWithDiagnostics`, `loadUniverse` — is zero, and so is the
  count of `FAULT_AT`, `FaultAt`, `Fault.at`, `localTrouble` and `wordless` anywhere in the tree. Both
  are derived by the scanner `surface.test.ts` already walks the tree with, so this cannot be satisfied
  by renaming and a site written next month is caught rather than a list going stale. The driver hands
  over sources and is handed back a session, the modules that loaded, and a list of problems.
  proof: vitest src/ui/surface.test.ts
- [c7] **The controls a state offers follow from the door's report, and the report is right about
  which module.** Clearing local changes is offered exactly when the local module is among the modules
  the door reports a problem against — one expression over the report, not a classification anybody
  computes — and every state the door can leave the shell in has at least one control that changes it.
  The proof walks c1's generated family and asserts against **what the fixture broke**, never against
  the expression under test: a cell that broke the local module expects clear-local offered, a cell that
  broke only a base module expects it withheld. Asserting the drawn set against the function that
  computes it is what let the predecessor's equivalent mutation survive its own named test.
  proof: vitest src/ui/driver.test.ts src/ui/shell.test.tsx
- [c8] **Nothing that loads today stops loading, and no shipped game content is edited.** Shipped
  content, every `# test` over it and the whole suite pass unchanged. The content check derives its
  subjects — everything under `content/` that is not an engine vocabulary file — so a third shipped
  module added next month is inside it, which two named filenames were not.
  proof: vitest src/runtime/integration.test.ts
  proof: command git diff --stat main...HEAD -- content/ ":!content/engine-*.dsl"
- [c9] `npm run tasks -- merge-ready` passes before the spec is marked done.
  proof: command npm run tasks -- merge-ready

## Goal

Make the attribution of an opening failure a thing the loader states rather than a thing a caller
guesses, so that "which state is this and what can be done about it" stops being answered by control
flow — and delete the apparatus that existed only to make the guess.

## Decisions

**This supersedes the unmet half of `the-shell-draws-what-the-session-answers`.** That branch's c4, c5
and c14 came back unmet at pass 2, and its `-clause-4`, `-clause-5` and `-clause-14` records are moved
onto this spec rather than discharged in prose, so the clauses leg of `merge-ready` accounts for them.
Its other eleven clauses were graded met twice and are not reopened. Its c4/c5 pair returns as c7 here,
stated over data instead of over a label. The banner, the gate, the teleport, the dial and the shadow
report all stand.

**The door lives in the runtime, beside `startSession`, and takes sources.** Not a registry: handing
over a registry is what leaves the caller holding the loading. The layering already permits it —
`session` is on the play surface `src/ui` may reach, `content/registry` is not — so this narrows what
the UI is allowed to know. `openUniverse` is added to `PLAY_SURFACE` in `surface.test.ts` as
`content/registry` leaves `src/ui`, which is a trade of one entry for one, not a widening.

**The door returns the modules that loaded, not only the session.** `createDriver` builds its
`AuthoringContext` with `dependencies: base.loadedModules` (`src/ui/driver.ts:243`), and an editing
surface reads a shipped section's text out of the base sources. Those come back through the door, so
c6's zero call sites is a design the driver can actually stand on rather than a rule it has to route
around.

**The fallback universe is a DSL string the runtime carries, not a minted location and not a shipped
module.** Ruled by the author on 2026-08-17, and it settles the first draft's open question in both
halves at once. Minting objects would make c3's hermeticism a promise the code cannot show; a shipped
base module every content module depends on resolves against itself, because
`src/content/registry.ts:1207` lets any later module `# remove` a location with nothing protecting a
starting one — the guarantee would need a new refusal rule, which is the same length-one requirements
check relocated into the load path rather than removed, and it would edit every content module besides.
A string loaded through the same load path is authored rather than constructed, reads nothing, and is
absent from every universe that opens normally, so no existing test's world moves.

**`withEngineLocale` does not move into the door.** It reads through `node:fs`
(`src/content/engineLocale.ts:14`), so a runtime module calling it puts `fs` in the browser bundle. It
is idempotent by module name and the GUI already gets `engine-en` through the content glob, so the CLI
keeps applying it to its sources before the call and the two drivers still open the same universe.

**`startSession` keeps its raise.** It becomes unreachable through the door rather than deleted,
because a raise that cannot happen costs nothing and a precondition removed entirely is one nobody can
find later. What changes is that nothing in a driver is positioned to catch it.

**Three clauses were cut from the first draft of this spec, each because something else proves it.**
Recorded because a cut clause is the thing an audit cannot see. A "requirements are declared in one
place" clause folded into c1: its second half *was* c1, and its first half is what c1's family proves by
deriving its subjects from that value — over a list with one entry, a separate clause was ceremony.
A "clearing local changes always works" clause was dropped: it is `the-shell-draws-what-the-session-answers`
c2, graded met at both passes, over code this branch does not redesign, and re-proving a met clause is
the standing regression auditor's question rather than a clause. A "deletes more than it adds" clause
was dropped: net lines is a proxy for the second copy leaving, c6 is that fact directly and cannot be
gamed, and the metric was unrunnable as written anyway — the same branch is already +496 lines
excluding tests from the predecessor, so `main...HEAD` measured the wrong thing.

**`the way out of a session that would not open` is restated, not retired.** The concept
(`docs/audits/systems.json`, User interface, `src/ui/FaultBanner.tsx`) carries a note saying a fault
carries where it came from and `remediesFor` turns that into controls. That design goes; the banner
stays and reads the door's report instead, so the note is rewritten in the same commit as the code.
Leaving it would be a description of a dead design in the one place membership is defined. The same
file takes `src/runtime/openUniverse.ts` and its test into Runtime in the diff that creates them: a
standing ruling from `a-parse-consumes-its-input-or-refuses-it` records that a new tracked file joining
its system later is an `audit-status` partition failure, and that grant was corrected after the fact
once already.

**A surviving mutation is not evidence that code is dead.** Recorded because it is the direct cause of
this spec existing. Pass 1 of the previous branch mutated the inner catch in `openOnce`; it survived
the whole suite. That was read as "nothing reaches this" and the catch was deleted, collapsing three
try/catches into one. It meant "nothing tests this" — a different claim, which the mutation does not
distinguish. See `worker/absence-is-not-evidence`.

## Open questions

- Whether the door reports problems as one flat list or grouped by module is the worker's call. c2
  fixes that every problem names its module; it does not fix the shape.
- Whether `openUniverse` also owns adopting a registry into a live session (`/dsl`, `/reload`, which
  load at `src/runtime/command.ts:430`) or stays the opening path only is the worker's call. Folding it
  in is more of the same simplification; it is not required by any clause here, and a spec that grew to
  hold it would be two specs.
- What `standingIn` answers for a session standing in the fallback's own location is left to the
  successor, which owns `NOWHERE`.

## What this branch already cost, for a planner grading the plan

The predecessor, `the-shell-draws-what-the-session-answers`, ran implementation → audit → triage →
audit on one worktree with one worker and two independent auditors. What the passes measured:

- **Pass 1:** 13 clauses met, c6 unmet — a dev banner named in the clause, in the Deliverable, in c13
  and in the absorbed record's own title was simply not built. 17 mutations aimed, 16 killed, 1
  survived on the inner catch in `openOnce`.
- **Triage:** the banner built; five findings fixed, including a false-proof shape (a test that proved
  `reopen` picks up a repaired shipped module only because the fixture mutated a `ModuleSource` in
  place, which no browser does). 8 mutations aimed, 7 killed, 1 equivalent mutant re-aimed and killed.
- **Pass 2:** 11 met; c4, c5 and c14 unmet. 14 mutations aimed, 14 killed. The regression was
  introduced *by the triage*, on clauses pass 1 had graded met.

Three things a planner should read out of that, because they are what this spec is shaped around:

1. **The defect was designed in, not typed in** (`worker/label-from-data`,
   `planner/proof-shape-follows-design`). Attribution by control-flow position cannot be derived-proved,
   so the proof was forced into an enumeration; the c4/c5 case table derived its base states and
   enumerated its local ones, and c5's expectation was keyed off the enumeration's own labels
   (`cell.local.startsWith('will not')`). Adding the missing row would still have graded the buggy
   answer correct. **A proof shape follows from a design. When the only available proof is a table, the
   design is the thing to change.**
2. **Two of the three fault-finding steps were spent on surfaces.** Pass 1's HIGH was a missing
   component; pass 2's HIGH was the root. A plan that budgets one audit would have merged this.
3. **The worker's own verification failed in a specific, repeatable way**
   (`worker/absence-is-not-evidence`). A probe concluded a code path was unreachable after seven
   attempts that were all the wrong *spelling* — `# remove location base.camp` (space) where the grammar
   takes `# remove location.base.hall` (dot). "No route found" is worth exactly what the routes tried
   are worth.

## Successor

`the-shell-is-never-handed-a-missing-view` follows this on the same branch, and must not start until
this is closed. Its whole content is the payoff of c1: once the door guarantees a session,
`DriverSnapshot.view` cannot be null, and 29 sites across 10 files under `src/ui` still handle a state
that cannot occur.
