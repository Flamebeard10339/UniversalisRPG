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

# The DSL

Game content is written in a small line-based language. A file is a sequence of
sections, each headed `# <kind> <id>`, and every kind is one file.

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

**Never rewrite a file under `content/` without reading it first.** These carry
`# save` bodies and `# test` sections that read like noise to anyone who has not
met them, and they are the proof the rest of the module still works. Add to a
module; replace one only having read what you are replacing.

# Work that outlives a session

A feature that runs longer than one sitting hands over through **two** files in
`docs/<feature>/` and nothing else: `open-agent.md` is what is still wrong that a
lane can close on its own, and `open-human.md` is what is still wrong that waits on
the author. **Read both before touching that work, and keep them current as you
go.** A finding left only in a session transcript is lost.

Nothing is struck through in either — **done means deleted**, and the commit that
closed a line is where its reasoning lives. An open line that changes hands
**crosses between the two rather than being marked in place**, in either direction.
Every line names the thing that would close it, and `npm run handoff` reports one
that names none: a reader who cannot tell an open question from a decision already
taken invents work rather than doing it.

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

`npm test` runs the whole suite in about twenty seconds. Keep it there.

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
- `npm run oracle [-- <kind>... | --at <draft.dsl>]` — print the grammar the editing page offers, as a tree per kind; or read a draft: every line the engine refuses, then its word on the whole file stood beside the shipped world, then line by line what may be written where
- `npm run inspect -- "<expression>"` — evaluate against the repo's own module resolution, leaving no file behind
- `npm run handoff` — which `docs/<feature>/` folders have drifted from the work they hand over, and how many commits have landed since they were last written
- `npm run notes [-- <source>...]` — list every `@@@` the corpus holds: writing that is standing in for better writing, and what an author asked for that the engine cannot do
- `npm run review [-- <module>...]` — every line the game can say, under the section that says it, in the order its module writes them; `--read-through <section>` marks a sitting as read. The sheet a human reads to review the writing. Nothing has to be marked to appear on it, and a line someone rewrites after it was read comes back
- `npm run mutate -- <manifest.json>` — break a named line, run the tests it names, report what the suite failed to notice

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

