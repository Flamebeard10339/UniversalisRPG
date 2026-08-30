# Mission

Optimize for correctness, bounded scope, reuse, architectural coherence, strong
evidence, and clean review — not patch volume. Passing tests is necessary.
Avoid patches that accrue technical debt.

**Do not create systems that must be manually kept in sync.** This is the single
largest and most frequent failure mode this repository has had — 11.5% of its
commits undid one when it was last counted, on 2026-08-21. A derived proof beats
a listed one: if a rule says *every*, its proof should derive its own subjects
rather than enumerate them. The procedure for catching this before it is written,
and the seven shapes it takes here, live in the `one-home` skill. That skill is
the authority; this paragraph is why.

Make commits after each logical chunk. `git add <explicit paths>`, never
`git add -A`.

**A worker sharing this checkout does not commit at all.** Staging explicit paths
is **not** enough isolation: the index is shared too, so a commit takes whatever
anyone else has staged — three times in one session, here. Run no `git add`,
`commit`, `stash` or `checkout`; say what you changed and let the orchestrator
commit by pathspec. One writer at a time is what a shared checkout is for. Two or
more writers — or anyone who must run the suite and believe the answer — take a
worktree each, because a test run reads the whole tree and a disjoint file list
does not make its result trustworthy.

**File contents go through the file-writing tool, never through the shell.** This
checkout is on Windows: PowerShell has no heredoc, and the Bash tool's is one more
chance for a `$`, a backtick or a quote — which DSL bodies and TypeScript are made
of — to be eaten before the file lands. *Heredoc tripped on the quoting; writing
the file directly instead* is a sentence agents here write over and over, and it
costs a call every time. The writing tool has no quoting layer to trip on. The same
goes for a multi-line program handed to `node -e`: put it in a file under the
scratchpad and pass the path.

# The DSL

Game content is written in a small line-based language. A file is a sequence of
sections, each headed `# <kind> <id>`, and every kind is one file.

**Writing content reads none of what follows.** Every line that may be written,
under every kind, and every id the world declares, is printed by `npm run oracle`;
`npm run oracle -- --at <draft>` reads a draft back and says what the engine will
not take. That is the whole reference an author needs, it is derived from the
declarations rather than written out beside them, and nothing under `src/` has to
be opened to write a quest, an item or a town.

**Never rewrite a file under `content/` without reading it first.** These carry
`# save` bodies and `# test` sections that read like noise to anyone who has not
met them, and they are the proof the rest of the module still works. Add to a
module; replace one only having read what you are replacing.

The rest of this section is about changing the language rather than writing in it.

**One kind, one file: `src/content/sections/<kind>.ts`.** That file holds
everything anyone asks about the kind — its type, its fields (or its own
parser), its printer, its validation, its reference sites, which registry maps
it fills, and which of its fields are prose. To add or change a kind you read
that file, and nothing else needs editing.

`src/content/sections/index.ts` is the one list. The parser table, the
registry's map types, the build, the printer, the reference walk and the
locale's prose fields are all read off it, so adding a kind is one line there
and the file it names.

`src/content/sections/define.ts` is the contract. `section()` takes a kind's
declaration and fills in the schema-driven half. A kind that declares `fields`
gets its parser, printer and merge from them; a kind whose grammar does not fit
key/value declares its own `parse` and `print`. **That is the whole difference,
and it is not an exception** — there is no table of special cases, and adding
one would be the failure mode above.

Read `sections/item.ts` (fields, entries, validation, references),
`sections/droptable.ts` (its own parser and printer, in 25 lines) and
`sections/stat.ts` (the minimum) before writing a new one.

A module that a section file imports may not read the section list — that closes
a cycle and yields a list with an undefined in it. `scripts/lib/acyclic.test.ts`
is the guard.

# Work that outlives a session

A feature that runs longer than one sitting hands over through **two** files in
`docs/<feature>/`: `open-agent.md` is what is still wrong that a lane can close on
its own, and `open-human.md` is what is still wrong that waits on the author.
**Read both before touching that work, and keep them current as you go.** A finding
left only in a session transcript is lost.

Nothing is struck through in either — **done means deleted**, and the commit that
closed a line is where its reasoning lives. An open line that changes hands
**crosses between the two rather than being marked in place**, in either direction.
Every line names the thing that would close it, and `npm run handoff` reports one
that names none: a reader who cannot tell an open question from a decision already
taken invents work rather than doing it.

**A line about behaviour may name a proof instead of describing one.** Two more
files may stand in the folder, and no others: `open-tests.dsl` holds a route with
nowhere yet to stand, and `open-tests.test.ts` holds everything a route cannot say —
a refusal, the words a screen says. Each is named for the line it belongs to, each
pins the behaviour that line **asks for** rather than the behaviour it has, and each
is therefore red until the line closes. Nothing gates them: `npm test` names every
vitest project but that one. So the line closes on its proof passing and says
nothing the proof already says, `npm run handoff` runs them and reports a green one
as a line that may already be closed, and closing the line migrates the proof into
the suite by **moving** it. Not every line wants one — a judgement, a cost, a GUI
beat has nothing to pin — and a proof no line stands on is reported like a third
file.

**What is already settled is not written down here.** A third file was tried — a
`settled.md` that reached 1463 lines — and every fact in it was already in the code.
A decision about the game is a **test**. A rule about the work is a line in this
file. A workflow discovery is a memory, kept short and actionable. Why any of them
was decided is the commit message. **Never write a settled decision into a code
comment**: the *Comments* section already refuses it, and a folder of them is what
this paragraph replaced.

So a test that blocks the task in hand is one of two things, and both have the same
answer. Either the author decided that behaviour, in which case it stands and the
task is wrong; or an agent wrote the test, in which case **the task overrules it**,
because the task came from the author. Change it, say plainly that you did, and do
not stall hunting for a past ruling that would license the change.

`npm run handoff` says which of those folders have drifted from the work. The
`hand-over` skill is the procedure for writing them and for closing a session out.

# Layers

`grammar < content < runtime < ui < scripts`. Imports point downward only, gated
by `npm run layer-check`. Cycles within a layer are allowed; reaching up is not.
A file that needs something from the layer above is usually two files. Tests
live in the folder of the layer they drive.

# Comments

Comments are scarce by principle. Keep one only if the fact is **owned by this
file**, **not derivable from reading it**, and expressible as neither a name, a
type, nor a test. Otherwise it has a destination — rename it, type it, test it,
or leave it in the commit message. Deleting it loses nothing; git holds every
word.

Never describe another module's contract: that comment drifts the moment its
owner changes, and the owner is the ground truth a reader should go to instead.
Never write down what a past decision was, what was measured on some date, or
what the rejected alternative was — that is what commit messages are for. A file
drifting toward heavy commenting is a design signal: it needs a seam.

# Testing

`npm test` runs the whole suite in about twenty seconds. Keep it there. It names
every vitest project but `open`, which is the proofs standing under an open line in
`docs/<feature>/` — red on purpose, and described under *Work that outlives a
session*.

**Run the one file you are editing; that costs about a second.** `npm test` is the
gate, not the loop — the twenty seconds are import and transform, a function of how
many test files there are, so nothing you cache moves them.

**A test may not assert a balance number.** Balance churns continuously, and a change
to it must not redden the suite. Test that the mechanism works — that rage rises when
a blow lands, that a cap bites, that two swings differ — never that a number is the
number it is today.

**A `# test` in the corpus asks one question: is this path still walkable?** Does this
sequence of actions, taken in order, reach the end it names. Nothing else. Not how much
xp it earned, not what the pools stood at, not what the clock or the rng cursor read,
not what the loot rolled. A balance pass that makes the path *impossible* must fail here
— that is the whole point of the test — and a balance pass that merely changes the
numbers along the way must not. Balance is answered by running the world —
`npm run balance`, below — so a `# test` still gets no opinion about it. The reason
has changed rather than the rule: balance has somewhere better to live than an
assertion, not nowhere at all.

This is why `expect:` compares only what a path is made of. The state a route ends on is
filtered before it is compared, in one place, so a sheet **cannot** pin a balance-derived
field however it was recorded — see `WALKED` in `src/runtime/session.ts`. The filter is
the rule's proof: there is nothing to keep in sync, and a sheet written next month is
covered by having been written at all.

**A test is not added until it has been shown not to be redundant, and a duplicate
found is deleted rather than glossed over.** A proof has one home like anything else:
nine of tulsa's `# test` sections were written past this, one of them already caught
eight ways over. The procedure, and how to measure it, live in the `one-home` skill.
That skill is the authority; this paragraph is why.

**A route's verdict is reported once.** Three harnesses replay every corpus `# test` —
the shipped corpus, the corpus with every word replaced, and the consolidated tree. Only
the first asserts that a route passes. The other two assert that their transformation did
not *change* the verdict, so a genuinely broken route reddens one line and not eight. A
failure repeated by three files with unrelated names is what sends a reader into the
engine after a content bug.

`src/content/dsl.test.ts` is the general-purpose test and the one to extend
first. Every claim in it picks its own subjects — from the shipped corpus in
`content/`, from the section list, or from what a field's own parser says it
accepts — so a kind or a field added next month is covered with no edit. It
asserts the corpus loads clean, that printing every module and reloading it
yields the same registry, that no parser silently swallows an indented block,
that each kind's declaration is coherent, and that every field parser prints
back what it parsed.

Prefer adding a claim there over writing a new per-kind test file. Write a
focused test when the thing under test is a refusal — the error an author sees
for malformed input is the language's contract and the corpus cannot exercise it.

Tools, none of which are gates:

- `npm run play` — interactive REPL over a live session; `# test` scripts run with `/test`
- `npm run probe -- <source>...` — ask the load path a question without building a runner; `--test <id>` runs one `# test` (or a module's own) in about a second, `--help` prints the rest. A directory source stands for the `.dsl` files in it, so `content` names the corpus
- `npm run balance -- <save> [<action-spec>]` — what every offer the engine puts in front of a player standing on that save pays an hour, and whether the loop it was asked for finished. Every figure is read off a run rather than reckoned: it writes a `# test` per offer, walks it under several seeds, and prints cycles, game time, xp and items an hour, and the engine's own sentence wherever a run stopped short. A second loose word narrows the sweep; `--at`, `--seeds`, `--cycles` and `--all` narrow or widen it further, and `--help` prints the rest. Reach for this before changing any stat, drop or rate: it is a run per offer per seed, so it is called when there is a balance question and is never a gate
- `npm run oracle [-- <kind>... | --at <draft.dsl> [--walk [<line>]]]` — print the grammar the editing page offers, as a tree per kind, short enough with no kind named to read whole; or read a draft: every line the engine refuses, then its word on the whole file stood beside the shipped world. `--walk <line>` goes on to say, of one line, where it sits, what it is read as and what may stand there, which is what to reach for when one line has you stuck; `--help` prints the rest. Reach for this before writing anything under `content/`, and again after each pass
- `npm run authorbot -- --brief <file>` — hand one brief to a coding agent over a copy of `content/` and count what it reached for. The engine is refused unless `--open`, and every reach for it is a question the oracle did not answer, which is what the run is for. It writes nothing in this checkout
- `npm run inspect -- "<expression>"` — evaluate against the repo's own module resolution, leaving no file behind
- `npm run handoff` — which `docs/<feature>/` folders have drifted from the work they hand over, and how many commits have landed since they were last written. It also runs the proofs standing under their open lines and says which have gone green; `--quick` reports on the files without running them. `npm run open-tests` runs the `.test.ts` half alone, and `npm run probe -- content docs/<feature>/open-tests.dsl --test <id>` walks one route
- `npm run notes [-- <source>...]` — list every `@@@` the corpus holds: writing that is standing in for better writing, and what an author asked for that the engine cannot do
- `npm run review` — the next twenty sections still wanting a read, and `--read-next` signs off the same twenty. `--sheet` is the whole unbounded sheet, under the section that says it, in the order its module writes them; `[-- <module>...]` narrows either. The sheet a human reads to review the writing. Nothing has to be marked to appear on it, and a line someone rewrites after it was read comes back
- `npm run probe -- content --record <test-id>` — runs a `# test` and prints the state it ends on as the `# save` body that test closes on, to paste back over the stale one
- `npm run mutate -- <manifest.json>` — break a named line, run the tests it names, report what the suite failed to notice. It writes the break into the working tree and puts the file back afterwards, so never run it in a checkout someone else is working in: a second writer reads the broken file as if it were the code, and an interrupted run can leave it broken on disk
- `npm run rename-module -- <old id> <new id>` — writes a module id under a new name everywhere it is machine-meaningful: the `# info` heading, every address written whole in a body, every key and value inside a `# save`, the string literals under `src/` and `scripts/`, and the file itself. An id matches whole, so renaming `town` leaves `town-quests` alone, and nothing is written unless the corpus loads afterwards holding exactly the keys the rename should have left
- `npm run move-sections -- <from id> <to id> <kind>:<id>...` — lifts named sections out of one module into another, carrying the comment above each and landing it among the sections already of its kind, and rewrites every id they carry the same way. Nothing is written unless the registry afterwards differs by exactly the moved ids and nothing else. Both these tools reach into `src/` and `scripts/` by string, which means they also rewrite ids inside synthetic test fixtures that only happened to share a name — read the diff outside `content/` before believing either of them
- `npm run contribution:consolidate` — writes every section staged in the local-changes module back into the file that declared its id, and empties it. It refuses as a whole rather than in part, so a batch that would load into a different universe is not half-applied; `--dry-run` says what it would place and what it could not
- `npm run contribution:squash` — prints one module's canonical source with the staged changes folded in, so an edit can be read as the file it would become before anything is written. `--module <id>` picks which, `--out <file>` writes it rather than printing it
- `npm run contribution:issue` — prints the issue body a contributor's staged changes make. Only `--create` calls `gh issue create`, so nothing leaves the machine until it is asked for

**A UI feature is tested by the author, not by the agent.** Build it, hand it
over in one line, stop. Put the pure decisions in a `.ts` beside the component
and test those; leave the DOM wiring untested and say so. The dev-only
`window.__test` harness (`src/ui/agent/testHarness.ts`) is how the GUI is
driven — reach for it rather than screenshot loops. Run `tsc` and the suite
before handing over.

# Build & deployment

Web: Vite build, tag-triggered publish to itch.io (`.github/workflows/publish.yml`).
Android: Capacitor sync + Gradle release build, APK signed and attached to the release.
CI runs `tsc --noEmit`, `npm test` and `npm run layer-check`.

