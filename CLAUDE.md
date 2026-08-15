# Mission

Optimize for correctness, bounded scope, reuse, architectural coherence, strong evidence, and clean review—not patch volume. Passing tests is necessary. Avoid patches that accrue technical debt. Prefer self documenting code over comments or updating repository context. 

An audit reviews the diff a branch proposes to merge, not a running commit count. The workflow and the tool that carries it are specified in `docs/workflow.md`, which is kept current; a `docs/specs/<slug>.md` is one branch's promise and is history once merged. `npm run tasks` and `docs/tasks.jsonl` are the store. Keep independent systems independent. 

Do not create systems that are required to be manually kept in sync. This bears repeating because it is the single largest and most frequent failure mode in the entire repository. Do not, under any circumstances, create systems that are required to be manually kept in sync. A second audit turning up a HIGH is a signal that this failure mode occured. Pause immediately and define the invariant shape that satisfies the requirements instead of chasing surfaces endlessly. 

Make commits after each logical chunk.

Do not bloat CLAUDE.md with over 200 lines of instructions. 

# Context and task list

`.planning/.scratch.md` contains open thoughts — gitignored, so it exists only in the main checkout and an agent in a worktree cannot read it. Vetted work, its state, and its archive all live in `docs/tasks.jsonl`, reached through `npm run tasks` — `tasks next` for what to work on, `tasks show <id>` for a task's full record. A branch's own spec lives at `docs/specs/<slug>.md`. `docs/workflow.md` is the end-to-end protocol every agent follows — decompose against disjoint `writes` grants, grade the set with `tasks plan` before dispatching it, and let a worker correct its own grant, and register what it produces, before it writes code. `.planning/agent-swarm-theory.md` holds what a planner owes the tree — read it before decomposing a finding list into worker chunks.

## Advice that is known good

- Enforce where a value is assembled, not where it is written
- Do not create systems that are required to be manually kept in sync
- A gate earns its place by preventing something that actually happened.
- **Cut by write grants, not by layers.** The most expensive recurring mistake is slicing work so
  every slice touches the same file. Chunks touching one file are one task.
- **Do not add workers to buy speed.** Agent count is the one lever measured to correlate with
  nothing. Fewer workers over disjoint regions is not a compromise.
- **A finding cannot create work; an unmet clause creates work directly.** The first rule stops a
  spec growing without a human; the second stops it closing falsely. Both have happened here.
- **`met` carries evidence, `unmet` means checked-and-fails, `unknown` means nobody looked.** The
  three never collapse.
- **Red-green proves a test can fail; only mutation proves it fails for the right reason.**
  `npm run mutate -- <manifest.json>` is the tool; keep manifests in scratch, they rot.
- **Commission one auditor whose only question is "is anything worse than before".**
  Clause-by-clause verification cannot see a regression.
- **Read a finding list's shape before promoting it.** Density in one file is a structural
  diagnosis; ask what single change retires the most of the list, and build that seam first.
- **Independent audits parallelise; one task's workers still do not.** The ruling above is about
  splitting one piece of work, and it stands. N audits over N specs are N pieces, and they run
  concurrently on one condition: each auditor gets its own `git worktree`, because `npm run mutate`
  rewrites source in place and a second auditor sharing that tree reads a mutant as its own
  baseline. `audit-prompt` assumes one spec per branch and withholds the pass file and the manifest
  when the spec it infers for the branch is not the slug asked for — so name each worktree's branch
  after its spec and the strict route resolves it, needing no `--branch` override and printing
  nothing false. The gate is in the brief alone; `tasks audit` files whatever it is handed.
- **Filing is the one step that cannot be concurrent, and serialising it costs nothing.**
  `docs/tasks.jsonl` is read-modify-write under no lock, so two `tasks audit` or `tasks add` calls
  in flight lose records with no error raised. The pass file is already the hand-back artifact:
  auditors fill theirs, one actor runs `--args-from` over each in turn. That is seconds against a
  parallel run, and it is the only place cross-auditor duplicates are caught — parallel auditors
  cannot read each other's filings the way a serial third one can.
- **Persisting evidence is planner work.** Archive audit reports into `docs/audits/` before the
  session ends; the store is the record of note.
- **A commit body scales with what the commit touches.** The contract asks for one line past the
  subject, and a diff that changes code earns much more than that — it is the only place the shape
  of *that* diff is explained, and it is where `git blame` lands. A commit that changes only the
  store or a spec has already been recorded: `events.jsonl` holds who, when, branch and head for
  every store write, and the spec's `## Decisions` holds the reasoning. There, say what changed and
  point at where the reasoning lives rather than restating it — a judgement written in three places
  is three places to drift.

# Repository systems

A system owns a set of paths, declared in `docs/audits/systems.json` — the one place membership is defined, so a diff's system follows from the files it touches. Membership is a partition: every tracked file is owned by a system or listed under `unowned` (prose, audit records, repo-wide manifests). That partition is the one condition `npm run audit-status` fails on, because attributing a diff to a system depends on it.

Two relations, deliberately different. **Ownership** is single-valued — one file, one system, resolved by the most specific declaration, never by manifest order — and is what `tasks where` and `tasks system` answer from. **Coverage** stays many-to-many and is what an audit window is drawn from, so a file two systems both read is audited twice on purpose. A system's paths may also carry **concepts**, one per thing the system knows how to do; `tasks produces "<name>"` asks whether a capability already exists before anything is built, and two concepts claiming one file is the report that the file does two jobs.

`npm run audit-status` otherwise only reports: per system, how much has changed since its last whole-system sweep, which files sit in more than one audit window, and which files two concepts both claim. Those counts trigger nothing, and a sweep has no cadence — it is requested by hand and logged, so that a cadence can eventually be derived from how often that happens rather than guessed. Record one by setting that system's `lastAudit` to the reviewed SHA.

Audits are the one gate that has repeatedly caught real defects, so they stay. Resist adding new automated gates: a gate earns its place by preventing something that actually happened, not by sounding rigorous.

`git worktree remove` deletes through a worktree's `node_modules` junction and empties the shared target every other worktree points at. `rmdir` the junction first, which unlinks it without touching what it points at, and remove the worktree after.

`npm run tasks -- merge-ready` runs the merge gate (tsc, tests, layer-check, audit-status, doctor, byte check) in one invocation.

## Individual Systems (Needs to be relocated into the task system - This is literally `Concepts`)

See `docs\audits\systems.json` for a system's concepts. 

1. **DSL load path**
2. **Runtime**
3. **Contribution system**
4. **User interface**
5. **Task system**
6. **Testing procedure**
  1. `scripts/play-cli.ts` interactive REPL over `startSession`/`view`/`apply` (live `--live` real-time + instant piped/agent mode), named `# test` scripts run via `/test`
  2. `npm run probe -- <source>... [--show <kind>.<id>] [--round-trip] [--each]` asks the load path a question without building a runner for it — sources are files or stdin, `--each` surveys a table of variants split on `---`. `npm run mutate -- <manifest.json>` breaks a named line, runs the tests it names, restores from bytes it captured (never from git), and reports what the suite failed to notice. `npm run inspect -- "<expression>"` (or `-` for a body on stdin) evaluates against the repo's own module resolution and leaves no file behind, which is what a scratch `.ts` inside the worktree was for. None of the three is a gate; reach for them instead of a scratch `*.test.ts`
  3. `# test` sections in the DSL are the regression format: authored from a live session with `/create-test`, replayed with assertions by `runTest`, and run over the shipped content by `integration.test.ts`
  4. CI: `.github/workflows/test.yml` runs `npx tsc --noEmit`, `npm test` and `npm run layer-check` on push and PR, plus `npm run audit-status`, `npm run tasks -- doctor`, `tasks spec show` and `tasks plan` on the ubuntu leg. `doctor` fails on two conditions and no others: a `docs/tasks.jsonl` line that will not parse, and a reference that resolves to nothing — a system name, a spec file or a record id. Both are decidable; every other disagreement about the work is reported at exit 0. The last two are reads that report the branch's spec standing and grade its open plan on the PR page, and cannot redden a check
  5. **A UI feature is tested by the author, not by the agent.** Build it, hand it over in one line, stop. The author reloads and reports immediately, and a round trip of theirs costs less than a screenshot loop of yours — the pager took four of them and no amount of driving the browser would have produced "the header drags and the column doesn't", which was the whole diagnosis. Put the pure decisions in a `.ts` beside the component and test those; leave the DOM wiring untested and say so. Run `tsc` and the suite before handing over. Reach for the browser only to prove the app still boots, or when the author asks
  6. **Five minutes, wall clock.** `npm test` and every gate a PR must pass stay under it, each. A gate nobody can afford to run is a gate that does not run. Buy the time back by making logic pure and passing effects in as data — git facts, clocks, subprocess results — so tests exercise the decision rather than the world. Mock or fake the effect at its seam; keep a handful of real-git and real-subprocess tests to prove the seam itself, and never pay that cost per case.
7. **Build & deployment**
  1. Web: Vite build, tag-triggered publish to itch.io (`.github/workflows/publish.yml`)
  2. Android: Capacitor sync + Gradle release build, APK signing, attached to the GitHub release

# Layers

`grammar < content < runtime < ui < scripts`. Imports point downward only, gated by `npm run layer-check`. Cycles within a layer are allowed; reaching up is not. A file that needs something from the layer above is usually two files — that is how `tuning.ts` and `save.ts` split. Tests live in the folder of the layer they drive, not the one their name suggests.

# Comments

Comments are scarce by principle, not by quota. A gate that generates strip commits and cannot prove what it claims costs more than it prevents. Keep a comment only if the fact is **owned by this file**, **not derivable from reading it**, and expressible as neither a name, a type, nor a test. Otherwise it has a destination — rename it, type it, test it, or leave it in the commit message and the audit log. Deleting it loses nothing; git holds every word.

Never describe another module's contract. That comment drifts the moment its owner changes, and the owner is the ground truth a reader should go to instead.

Never close an audit finding by writing its rationale into the source. The finding lives in `docs/audits/`, its fix lives in the code, and every behavioural claim it makes lives in a test. A comment restating a finding is a third copy that cannot be executed and will rot.

A file drifting toward heavy commenting is a design signal — read it as "this needs a seam", not "this needs a strip pass". Audits are where that gets caught now.

# Additional repository context
- "descriptive flavor text for an object" is **one** mechanism
- modals are rendered unconditionally with guaranteed closing behavior
- quest/stage conditions are runtime flag checks evaluated against live state
- location/item/entity actions (`<obj>.<objId>.<actionId>`) are first-class patterns for anything the object can 'do'
- item actions are not location-scoped, location and entity actions are
- enemy-shaped actions and instant actions are two intentionally different design tools
- location connectivity is always explicit and directional
- travel actions without cost or reward are treated as pathfinding edges for multi step map navigation
- progress signals get lightweight UI acknowledgement (e.g. map tab flashing on location discovery)
- record a regression as a `# test` section via `/create-test` rather than writing an ad-hoc script
- the dev-only `window.__test` browser harness (`src/ui/agent/testHarness.ts`, batched checks via `window.__test.batch([...])`) is how the GUI is driven; reach for it rather than ad-hoc `page.evaluate`/screenshot loops
- there is no browser storage to clear and no reset command: `play-cli` starts fresh every run, and a `# save` fixture is how a session starts anywhere else. `single-dev-mode` is where a reset lands once there is a store to reset


