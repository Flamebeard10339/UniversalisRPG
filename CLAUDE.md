# Mission

Optimize for correctness, bounded scope, reuse, architectural coherence, strong
evidence, and clean review — not patch volume. Passing tests is necessary.
Avoid patches that accrue technical debt.

**Do not create systems that must be manually kept in sync.** This is the single
largest and most frequent failure mode this repository has had — 11.5% of its
commits undo one. A derived proof beats a listed one: if a rule says *every*, its
proof should derive its own subjects rather than enumerate them. The procedure
for catching this before it is written, and the seven shapes it takes here, live
in the `one-home` skill. That skill is the authority; this paragraph is why.

Make commits after each logical chunk. `git add <explicit paths>`, never
`git add -A`. When more than one worker shares this checkout, note that staging
explicit paths is **not** enough isolation: the index is shared too, so a commit
takes whatever anyone else has staged. It has happened here three times in one
session. If you are one of several, either work in your own worktree or expect
your files to land under someone else's message.

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
- `npm run probe -- <source>... [--show <kind>.<id>] [--round-trip] [--each]` — ask the load path a question without building a runner
- `npm run oracle [-- <kind>... | --at <draft.dsl>]` — print the grammar the editing page offers, as a tree per kind; or read a draft: every line the engine refuses, then its word on the whole file stood beside the shipped world, then line by line what may be written where
- `npm run inspect -- "<expression>"` — evaluate against the repo's own module resolution, leaving no file behind
- `npm run notes [-- <source>...]` — list every `@@@` the corpus holds: writing that is standing in for better writing, and what an author asked for that the engine cannot do
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

# Content facts worth knowing

- "descriptive flavor text for an object" is **one** mechanism
- modals are rendered unconditionally with guaranteed closing behavior
- a `# quest` is one section: stages, what the journal reads at each, and what an
  entity says while the quest stands there. A stage is a flag, `goto` names a
  stage, and the quest gives its lines to entities rather than editing them
- quest/stage conditions are runtime flag checks evaluated against live state
- `<obj>.<objId>.<actionId>` is a first-class pattern for anything an object can do
- item actions are not location-scoped; location and entity actions are
- enemy-shaped actions and instant actions are two intentionally different tools
- location connectivity is always explicit and directional
- travel actions with no cost or reward are pathfinding edges for map navigation
- progress signals get lightweight UI acknowledgement
- there is no browser storage to clear and no reset command: `play-cli` starts
  fresh every run, and a `# save` fixture is how a session starts anywhere else
