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
`loadUniverseWithDiagnostics` (`src/content/registry.ts:1362`) is already a fixpoint: it parses, and on
a failure it records a diagnostic, disables that module, and retries until what is left compiles. It
reports `diagnostics`, `modules[].loaded`, `loadedModules` and `disabledModules` — every one of them
keyed by module name, and none of them by exception. The driver's second load re-derives an answer the
first load already gave (`localTrouble` is a hand-rolled `modules.find(…).loaded`), and the label it
computes is a *guess* about a fact the loader had already stated.

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
repairs what it can, and says what it repaired. Both drivers call it, and neither of them knows that
loading has stages.

This should delete more than it adds. What it removes from `src/ui/driver.ts` alone: the second load,
the fall-through, `localTrouble`, `Fault.at`, `FAULT_AT`, and every catch.

Proof:

- [c1] **Opening answers; it never raises.** `openUniverse` returns a value for every input, and the
  session it returns always exists. The proof derives its inputs rather than listing them: a family of
  source sets generated over the shapes the load path distinguishes — no sources, sources that will not
  parse, sources that parse and resolve against nothing, a local module over each of those, and a local
  module that loads clean while leaving the merged universe unstartable — and the assertion is over all
  of them at once.
  proof: vitest src/runtime/openUniverse.test.ts
- [c2] **What is at fault is read off the loader, never inferred.** Every problem the door reports
  names the module it came from, and that name comes from the loader's own per-module report. The proof
  is what makes this different from the branch it replaces: for each generated failure it checks the
  reported module against **the module the fixture actually broke**, so a reproduction cannot be graded
  by the path it took through the code. No caller classifies a failure by where it was standing, which
  is derived from the tree: nothing under `src/ui` or `scripts/` catches an error out of opening.
  proof: vitest src/runtime/openUniverse.test.ts src/ui/surface.test.ts
- [c3] **What a session requires is declared in one place, and what the door hands back meets it.** The
  requirements are a value, not a set of raise sites, and the door's output satisfies every one of them
  for every input in c1's family. Adding a requirement is adding an entry; there is no second place
  that would also have to learn about it.
  proof: vitest src/runtime/openUniverse.test.ts
- [c4] **A repair is announced, and is never mistaken for the game.** A universe the door had to repair
  says so on the tool channel and says which requirement it repaired. The repair is hermetic — it reads
  nothing out of the universe it is repairing, so it cannot itself fail — and it is unmistakable on a
  screen rather than a plausible room. `nothing-authored-is-silently-dropped` is the standing rule this
  answers to: the repair keeps the shell mountable so an author has a surface to fix the content from,
  and it does not pretend the content is fine.
  proof: vitest src/runtime/openUniverse.test.ts src/ui/shell.test.tsx
- [c5] **A session opened over a repair is no slot's game.** Autosave never writes it, `/save` takes it
  only when said out loud, and a broken release therefore cannot overwrite a player's slot with a
  repaired stand-in. This is a hazard the repair introduces and `auto-save-export-and-load` already
  holds the machinery for: `synced` is null and `writesLive` refuses.
  proof: vitest src/runtime/openUniverse.test.ts src/runtime/saveSlots.test.ts
- [c6] **Both drivers open through the one door.** `play-cli` recovers from what the GUI recovers from,
  because it is the same call; `drift.test.ts` compares opening, which it cannot do today. A `# test`
  over content that will not load is a test both drivers reach the same state from.
  proof: vitest scripts/drift.test.ts scripts/play-cli.test.ts
- [c7] **`src/ui` no longer knows that loading has stages.** Nothing under `src/ui` names
  `loadUniverseWithDiagnostics`, a diagnostic, a module status, or a disabled module; the driver hands
  over sources and is handed back a session and a list of problems. Derived from the tree, and it
  narrows `surface.test.ts`'s play surface rather than widening it.
  proof: vitest src/ui/surface.test.ts
- [c8] **Clearing local changes is always available in that state, and always works.** Carried whole
  from `the-shell-draws-what-the-session-answers` c2, which pass 1 and pass 2 both graded met: the
  control is reachable whenever the local module was set aside, and taking it leaves the session a
  first-ever launch would produce. It cannot fail on text it cannot parse, because it writes a fresh
  module rather than editing the broken one.
  proof: vitest src/ui/driver.test.ts
- [c9] **The controls a state offers are read off the disabled set.** Clearing local changes is offered
  exactly when the local module is among what the loader disabled — one expression over the door's
  report, not a classification anybody computes — and every state the door can leave the shell in has
  at least one control that changes it. The proof walks c1's generated family rather than a table of
  named states.
  proof: vitest src/ui/driver.test.ts src/ui/shell.test.tsx
- [c10] **Nothing that loads today stops loading.** Shipped content, every `# test` over it and the
  whole suite pass unchanged, and no shipped game content is edited.
  proof: vitest src/runtime/integration.test.ts
  proof: command git diff --stat main...HEAD -- content/tutorial-island.dsl content/combat-expansion.dsl
- [c11] **The change deletes more than it adds.** Net lines across `src/` and `scripts/`, excluding
  tests, is negative. A recovery apparatus that grew while being replaced would be the second copy
  arriving rather than leaving, and this is the cheapest check that says so.
  proof: command git diff --numstat main...HEAD -- src scripts
- [c12] `npm run tasks -- merge-ready` passes before the spec is marked done.
  proof: command npm run tasks -- merge-ready

## Goal

Make the attribution of an opening failure a thing the loader states rather than a thing a caller
guesses, so that "which state is this and what can be done about it" stops being answered by control
flow — and delete the apparatus that existed only to make the guess.

## Decisions

**This supersedes the unmet half of `the-shell-draws-what-the-session-answers`.** That branch's c4, c5
and c14 came back unmet at pass 2 and its `-clause-4`, `-clause-5` and `-clause-14` records are
discharged here. Its other eleven clauses were graded met twice and are not reopened; c2 and the
c4/c5 pair are carried into c8 and c9 above because they are the same promises stated over data
instead of over a label. The banner, the gate, the teleport, the dial and the shadow report all stand.

**The door lives in the runtime, beside `startSession`, and takes sources.** Not a registry: handing
over a registry is what leaves the caller holding the loading. The layering already permits it —
`session` is on the play surface `src/ui` may reach, `content/registry` is not — so this narrows what
the UI is allowed to know rather than widening it.

**`startSession` keeps its raise.** It becomes unreachable through the door rather than deleted,
because a raise that cannot happen costs nothing and a precondition removed entirely is one nobody can
find later. What changes is that nothing in a driver is positioned to catch it.

**A surviving mutation is not evidence that code is dead.** Recorded because it is the direct cause of
this spec existing. Pass 1 of the previous branch mutated the inner catch in `openOnce`; it survived
the whole suite. That was read as "nothing reaches this" and the catch was deleted, collapsing three
try/catches into one. It meant "nothing tests this" — a different claim, which the mutation does not
distinguish. See `worker/absence-is-not-evidence`.

## Open questions

- **Is a length-one list of requirements better than making the requirement unnecessary?** The author
  leans to keeping the explicit list: it is visible at the point of failure and names its own failure
  condition, where a structural guarantee is invisible until it stops holding. The alternative is a
  base module that always loads — one location, hermetic, depended on by everything including
  `tutorial-island.dsl` — so that a startable universe is structural and no requirement has to be
  checked at all. Two things a worker should establish before choosing, because they may collapse the
  distinction: (a) whether that base module's location can be removed or overridden by another module,
  since `# remove` exists — if it can, the guarantee needs a rule refusing it, which is the same
  length-one list relocated into the load path rather than removed; and (b) that it would make every
  content module gain a dependency, which is an edit to shipped content that this branch's predecessor
  refused on principle. If (a) resolves against the base module, keep the list.
- Where the repair's location comes from — minted by the runtime, or an authored hermetic module the
  build always includes — is the worker's call, and interacts with the question above. What c4 fixes is
  that the repair reads nothing out of the universe it is repairing.
- Whether the door reports problems as one flat list or grouped by module is the worker's call. c2
  fixes that every problem names its module; it does not fix the shape.
- Whether `openUniverse` also owns adopting a registry into a live session (`/dsl`, `/reload`) or stays
  the opening path only is the worker's call. Folding it in is more of the same simplification; it is
  not required by any clause here, and a spec that grew to hold it would be two specs.

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

1. **The defect was designed in, not typed in** (`worker/label-from-data`, `planner/proof-shape-follows-design`). Attribution by control-flow position cannot be
   derived-proved, so the proof was forced into an enumeration; the c4/c5 case table derived its base
   states and enumerated its local ones, and c5's expectation was keyed off the enumeration's own
   labels (`cell.local.startsWith('will not')`). Adding the missing row would still have graded the
   buggy answer correct. **A proof shape follows from a design. When the only available proof is a
   table, the design is the thing to change.**
2. **Two of the three fault-finding steps were spent on surfaces.** Pass 1's HIGH was a missing
   component; pass 2's HIGH was the root. A plan that budgets one audit would have merged this.
3. **The worker's own verification failed in a specific, repeatable way** (`worker/absence-is-not-evidence`). A probe concluded a code
   path was unreachable after seven attempts that were all the wrong *spelling* — `# remove location
   base.camp` (space) where the grammar takes `# remove location.base.hall` (dot). "No route found" is
   worth exactly what the routes tried are worth. See `worker/absence-is-not-evidence`.

## Successor

`the-shell-is-never-handed-a-missing-view` follows this on the same branch, and must not start until
this is closed. Its whole content is the payoff of c1: once the door guarantees a session,
`DriverSnapshot.view` cannot be null, and 29 sites in 8 files under `src/ui` still handle a state that
cannot occur.
