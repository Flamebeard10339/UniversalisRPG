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
- [c7] **A control is offered when taking it changes the answer.** Clearing local changes is offered
  exactly where the door, asked what it would report over the text clearing leaves behind, answers
  differently — a question put to the door rather than a judgement about which module is at fault —
  and every state the door can leave the shell in has at least one control that changes it. The proof
  walks c1's generated family and asserts against **what the fixture broke**, never against the
  expression under test: the family stands a healthy local module beside every base breakage and
  expects clearing withheld there, and the expression that decides the controls is reachable from no
  test. Asserting the drawn set against the function that computes it is what let the predecessor's
  equivalent mutation survive its own named test, and it is what let this one survive its own.
  proof: vitest src/ui/driver.test.ts src/ui/shell.test.tsx
- [c8] **Nothing that loads today stops loading, and no shipped game content is edited.** Shipped
  content, every `# test` over it and the whole suite pass unchanged. The content check derives its
  subjects — everything under `content/` that is not an engine vocabulary file — so a third shipped
  module added next month is inside it, which two named filenames were not.
  proof: vitest src/runtime/integration.test.ts
  proof: command git diff --stat main...HEAD -- content/ ":!content/engine-*.dsl"
- [c9] `npm run tasks -- merge-ready` passes before the spec is marked done.
  proof: command npm run tasks -- merge-ready

**c7 was amended on 2026-08-17, after pass 1, and this is the record of it.** Its first half
promised that clearing is offered when the local module is among the modules the door reports against.
Pass 1 graded the clause unmet and showed why the sentence could not be kept: an unmet requirement is a
property of the merged universe, so naming the modules it is "against" means naming every module that
loaded, and a healthy local module standing beside broken shipped content is then offered a control
that destroys the author's work and fixes nothing. That is the same guess the Deliverable deletes from
control flow, surviving as a list. The replacement is the ruling of 2026-08-17: a control is offered
when taking it changes the answer. It is a question the door can be asked, because the door is total
and never raises, and it needs no attribution at all — which is why `modules` is now empty on a
requirement problem rather than populated with a guess. The clause got wider, not narrower: the second
half and the proof shape are unchanged and the first half now forbids a class of wrong answer the old
sentence permitted. One behaviour narrowed with it — an order-stage problem in the local module no
longer offers clearing, because `clearLocalSections` preserves the header and the control changed
nothing there.

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

## Audit passes

### Pass 1 — 2026-08-17

- base: `7a0081a19f28d556372123f479f8d0baec702d7c`
- head: `7051d8b0f76c7555b304bf4c9716c7d3de6e9aef`
- proof 1: met — `npx vitest run src/runtime/openUniverse.test.ts` — 14 pass. The family is derived, not
listed: `openUniverseFixture.ts` keys `BY_STAGE` `satisfies Record<ModuleLoadStage, Breakage>` and
`BY_REQUIREMENT` `satisfies Record<RequirementId, Breakage>`, so a stage or a requirement added next
month leaves the object missing a key and `tsc` (a merge-ready leg, green) refuses it. Each cell is
checked to land on the stage it claims by asking the loader, not the door
(`lands each fixture on the stage or the requirement it is keyed under`).
Mutation, manifest at C:\Users\yonat\AppData\Local\Temp\audit-opening-a-universe-answers-rather-than-raises-pass1-mutations-aimed.json:
c1a `if (unmet.length === 0)` -> `if (true)` in src/runtime/openUniverse.ts KILLED by
`returns a session for every cell, and the session opens on a place`, re-run at its own file with the
mutation still applied; c1b `loadUniverseWithDiagnostics([FALLBACK_SOURCE])` -> `([])` KILLED by the
same named test. I also probed for a raise the family cannot reach — a resource whose `max` or
`start` names an undeclared stat, over `npm run inspect` — and the loader disables the module and the
door answers in every case, so "never raises" survived the search as well as the family.
One reservation, filed as a finding rather than graded here: c1's own guard
`crosses both published spines with both placements` cannot fail when a placement is dropped, because
`CELL_COUNT` is computed from `PLACEMENTS.length` and both sides move together (mutation c1c: scope
`"crosses both published spines…" -> src/runtime/openUniverse.test.ts`, killed by a different test).
The clause's substance holds; the named guard for its derivation does not check what it reads as.
- proof 2: met — `npx vitest run src/runtime/openUniverse.test.ts src/ui/surface.test.ts`. Both halves are
derived. The per-module half: `openUniverse.ts:94` takes `modules: [diagnostic.moduleId]` straight off
`loaded.diagnostics`, and the test compares the reported set against `cell.names`, which the fixture
writes from what it broke — mutation c2a `modules: [diagnostic.moduleId]` -> `modules: []` KILLED by
`names, for every cell, exactly the modules the fixture broke or the modules that built the universe`,
re-run at its own file. The tree half: `surface.test.ts` walks every non-test module under `src/` and
`scripts/`, brace-matches whole `try` blocks and refuses `openUniverse(` inside one — mutation c2b
wrapped the driver's own call (`src/ui/driver.ts:182`) in `try { … } catch { throw … }` and it was
KILLED by `puts no call to the door inside one, under src/ui or scripts`. The scanner carries its own
vacuity guards (`reads a try block whole`, `finds the try blocks there are` > 6).
Noted and filed against c7 rather than here: the module list on an *unmet-requirement* problem is
`loaded.loadedModules`, which is the door's own construction rather than the loader naming a culprit.
The fixture encodes the same rule, so the clause's proof is internally consistent; what it costs shows
up as c7's report being wrong about which module.
- proof 3: met — `npx vitest run src/runtime/openUniverse.test.ts src/ui/shell.test.tsx`. Announced:
mutation c3a dropped the `...unmet.map(...)` spread from `openUniverse.ts:105` and was KILLED by
`says which requirement was unmet, wherever a requirement is unmet`. Hermetic by construction:
`FALLBACK_SOURCE` is a DSL string loaded through `loadUniverseWithDiagnostics([FALLBACK_SOURCE])`
alone, so nothing of the universe it stands in for is in scope; mutation c3b removed `starting` from
that string and was KILLED by `is hermetic by construction: it loads alone, clean, and meets every
requirement there is`. The strongest line here is not a promise —
`stands in the same session whatever it stood in for` compares `serializeSession` across every cell
that stood in and asserts one distinct value, which no read of the failed universe could survive. On
the screen half, mutation c3c replaced `{problem.message}` in `FaultBanner.tsx` with a fixed string
and was KILLED by `says what the door said, and nothing it did not`. Unmistakable: the fallback
carries no `# locale`, so every engine sentence draws as its own key, and
`is not a place the universe it stood in for could have offered` checks the location id is not one
the failed registry holds.
- proof 4: met — `npx vitest run src/runtime/openUniverse.test.ts src/runtime/saveSlots.test.ts`.
`openUniverse.ts:101` forces `options.save.synced = null` on the stand-in path only, and the test
walks every cell plus a universe that opens, asserting `save.synced === null` equals
`answer.unmet.length > 0` — the two sides are the door's answer and the save context, not one
restated. Mutation c4a/c4b `if (options.save)` -> `if (false && options.save)` KILLED by
`forces the live slot loose exactly where it stood in, and leaves it alone where it did not` and by
`refuses the autosave that a session over a universe that opened would have taken`, each re-run at
its own file. `saveNow` still takes the slot, so this is a refusal to autosave and not a refusal to
save, which the third test holds.
Filed as a finding and not graded here: the door never restores `synced`, so a session that recovers
by clear-local or reopen over the same `SaveContext` never autosaves again for the life of the page.
Measured with `npm run inspect`: open([]) then open([BASE]) over one context leaves
`synced: null, writesLive: 'not-ours'` and `autosave` returns `{ kind: 'held' }`.
- proof 5: met — `npx vitest run scripts/drift.test.ts scripts/play-cli.test.ts`. `openRepl`
(`scripts/play-cli.ts`) now calls `openUniverse(withEngineLocale(sources), { save: options.save })`
and `main`'s `try/catch` around it is gone, so the CLI takes lines from a universe it used to strand
on; `play-cli.test.ts` walks every cell of `OPENING_CELLS` and asserts a problem and a `/look` that
returns output for each. `drift.test.ts` compares the two drivers at the opening for the first time,
cell by cell, on both the reported problems and `serializeSession` — the bytes, not the view.
Mutation c5a/c5b spread `{ ...openUniverse(...), problems: [] }` over the REPL's answer: KILLED by
`answers over content that will not load, rather than stranding on it` and by
`reaches the same session and reports the same problems, cell by cell`, each re-run at its own file.
Both new tests carry vacuity guards (`taken === OPENING_CELLS.length`, `reported > cells - 1`).
- proof 6: met — `npx vitest run src/ui/surface.test.ts`. Both counts are derived by the tree walk
`surface.test.ts` already does — `modulesUnder` over `src/` and `scripts/` — so a site written next
month is caught and a rename does not satisfy it. Mutation c6a appended
`// loadUniverseWithDiagnostics` to a line of `src/ui/driver.ts` and was KILLED by
`calls the load path nowhere under src/ui`; c6b appended `// localTrouble` to a line of
`src/runtime/openUniverse.ts` and was KILLED by `names nothing that guessed, anywhere in the tree`.
Each re-run at its own file with the mutation still applied. `git grep` confirms the count directly:
no `FAULT_AT`, `FaultAt`, `Fault.at`, `localTrouble` or `wordless` anywhere but the scanner's own
list, and no load-path call in any shipped module under `src/ui`.
One narrowing, filed as a low finding: the scan's set excludes test modules, and five test files
under `src/ui` (authoringSurface, devMode, driver, mapEdit, render) still call
`loadUniverseWithDiagnostics`. The clause says "under `src/ui`" without that exclusion.
- proof 7: unmet — Two independent failures, each measured.
(1) The named proof compares the drawn set against the function that computes it — the exact shape
this clause's own last sentence forbids. `shell.test.tsx` asserts
`expect([...drawn.drivers].sort()).toEqual([...remediesFor(problems)].sort())` while `FaultBanner`
itself calls `remediesFor`, so both sides move together. Mutation c7b changed `driver.ts:26` to
`? ['clear-local'] : ['reopen']` — which withdraws the try-again control from every state where the
local module is at fault — and it SURVIVED: 0 failed of 3749, scope
`src/ui/shell.test.tsx "draws exactly the remedies the report has, for every state the door can leave"
-> src/ui/shell.test.tsx -> whole suite`. `driver.test.ts` does not catch it either: its
`leaves every state with something to do about it` asserts only `remedies.length > 0` and that the
union across cells equals `REMEDIES`, both of which the mutant satisfies. The half of c7 that a
mutation does kill is the offered/withheld direction (c7a, inverting the ternary, KILLED by
`offers clearing exactly where the fixture broke the local module`).
(2) The report is not right about which module. `openUniverse.ts:105` attributes an unmet requirement
to `loaded.loadedModules` — every module that loaded — so a shipped module that loads clean and
removes the starting location, standing beside a local module that loads clean, names `local-changes`
in the problem and `remediesFor` offers clear-local. Reproduced with `npm run inspect`:
base + `# remove location.base.hall` in a shipped module + a local module holding `# item lamp` gives
`problems: [{ modules: ['base','local-changes','shipped-bad'], message: 'no # location is marked
starting…' }]`, `remedies: ['clear-local','reopen']`. Taking it discards the author's work and leaves
the problem in place, since the fault is in the shipped module. That is the mirror of the defect this
whole spec exists to remove, and `OPENING_CELLS` cannot see it: `cellsFor` sets `local: ''` for every
base placement, so no cell has a breakage in the base with a healthy local module beside it.
- proof 8: met — `git diff --stat main...HEAD -- content/ ":!content/engine-*.dsl"` prints nothing, over
the audited range as well as against main. `npm test` is green on the whole suite
(`npm run tasks -- merge-ready`, npm test leg ok). The content check derives its subjects:
`src/runtime/integration.test.ts:26` builds `shippedSources()` from `readdirSync('content')` filtered
on `.dsl`, minus the local-changes module, so a third shipped module is replayed on the commit that
authors it — no filenames are named. Mutation c8a changed `start: 0` on `# resource rage` in
`content/combat-expansion.dsl` and 12 shipped `# test`s failed, re-run at
`src/runtime/integration.test.ts` with the mutation still applied, which is the derivation firing on
the second content module rather than on the one file the check used to name.
- proof 9: unmet — `npm run tasks -- merge-ready` exits 1. Every mechanical leg passes — tsc ok, npm test
ok, layer-check ok, audit-status ok, doctor ok (27 warnings, which do not fail the leg), bytes ok,
tree ok, base ok — and this spec's own legs read
`spec opening-a-universe-answers-rather-than-raises ok`. What fails is not only the circular
"no recorded audit pass" for this spec and its successor. Two legs fail on a different spec that this
branch declares: `spec the-shell-draws-what-the-session-answers FAIL 1 open member(s)` and
`clauses the-shell-draws-what-the-session-answers FAIL 3 outstanding across 2 pass(es): c4, c5, c14`.
The spec's own `## Decisions` claims otherwise — "its `-clause-4`, `-clause-5` and `-clause-14`
records are moved onto this spec rather than discharged in prose, so the clauses leg of `merge-ready`
accounts for them". The records were moved and closed (they show as member tasks of this spec), and
the leg still reports the three clauses outstanding, because it reads that spec's recorded passes and
not its records. So the gate does not pass, and the reason is a claim the branch made about it rather
than an artefact of this audit not being filed yet. Full output at
C:\Users\yonat\AppData\Local\Temp\audit-opening-a-universe-answers-rather-than-raises-pass1-mergeready.txt
