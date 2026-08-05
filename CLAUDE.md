# Mission

Optimize for correctness, bounded scope, reuse, architectural coherence, strong evidence, and clean review—not patch volume. Passing tests is necessary. Avoid patches that accrue technical debt. Prefer self documenting code over comments or updating repository context. 

An audit reviews the diff a branch proposes to merge, not a running commit count. The workflow and the tool that carries it are specified in `docs/workflow.md`, which is kept current; a `docs/specs/<slug>.md` is one branch's promise and is history once merged. `npm run tasks` and `docs/tasks.jsonl` are the store. Keep independent systems independent. Do not create systems that are required to be manually kept in sync. 

Make commits after each logical chunk.

# Comments

Comments are scarce by principle, not by quota. The 5% budget and its `comment-only` companion were retired 2026-07-28: the lesson had been extracted (they are what exposed `runtime.ts` hiding structure behind 521 comments), and the audit then showed `comment-only` certifying commits that deleted CI steps. A gate that generates strip commits and cannot prove what it claims costs more than it prevents.

Keep a comment only if the fact is **owned by this file**, **not derivable from reading it**, and expressible as neither a name, a type, nor a test. Otherwise it has a destination — rename it, type it, test it, or leave it in the commit message and the audit log. Deleting it loses nothing; git holds every word.

Never describe another module's contract. That comment drifts the moment its owner changes, and the owner is the ground truth a reader should go to instead.

Never close an audit finding by writing its rationale into the source. The finding lives in `docs/audits/`, its fix lives in the code, and every behavioural claim it makes lives in a test. A comment restating a finding is a third copy that cannot be executed and will rot.

A file drifting toward heavy commenting is a design signal — read it as "this needs a seam", not "this needs a strip pass". Audits are where that gets caught now.

Do not bloat CLAUDE.md with over 200 lines of instructions. 

`.planning/.scratch.md` contains open thoughts. Vetted work, its state, and its archive all live in `docs/tasks.jsonl`, reached through `npm run tasks` — `tasks next` for what to work on, `tasks show <id>` for a task's full record. A branch's own spec lives at `docs/specs/<slug>.md`. `docs/workflow.md` is the end-to-end protocol every agent follows — decompose against disjoint `writes` grants, grade the set with `tasks plan` before dispatching it, and let a worker correct its own grant, and register what it produces, before it writes code. `.planning/agent-swarm-theory.md` holds what a planner owes the tree — read it before decomposing a finding list into worker chunks.

# Wisdom that reduces audit issues
- Enforce where a value is assembled, not where it is written

# Repository systems

A system owns a set of paths, declared in `docs/audits/systems.json` — the one place membership is defined, so a diff's system follows from the files it touches. Membership is a partition: every tracked file is owned by a system or listed under `unowned` (prose, audit records, repo-wide manifests). That partition is the one condition `npm run audit-status` fails on, because attributing a diff to a system depends on it.

Two relations, deliberately different. **Ownership** is single-valued — one file, one system, resolved by the most specific declaration, never by manifest order — and is what `tasks where` and `tasks system` answer from. **Coverage** stays many-to-many and is what an audit window is drawn from, so a file two systems both read is audited twice on purpose. A system's paths may also carry **concepts**, one per thing the system knows how to do; `tasks produces "<name>"` asks whether a capability already exists before anything is built, and two concepts claiming one file is the report that the file does two jobs.

`npm run audit-status` otherwise only reports: per system, how much has changed since its last whole-system sweep, which files sit in more than one audit window, and which files two concepts both claim. Those counts trigger nothing, and a sweep has no cadence — it is requested by hand and logged, so that a cadence can eventually be derived from how often that happens rather than guessed. Record one by setting that system's `lastAudit` to the reviewed SHA.

Audits are the one gate that has repeatedly caught real defects, so they stay. Resist adding new automated gates: a gate earns its place by preventing something that actually happened, not by sounding rigorous.

1. **DSL load path** — `src/grammar` (text to syntax) and `src/content` (syntax to registry, incl. load-time reference resolution)
2. **Runtime** — `src/runtime`: state, travel, actions, encounters, resources, stats, skills, flags, dialogue, saves; `session.ts` is the entry point everything above plays through
3. **Contribution system** — unbuilt: editor, validation/merge engine
4. **User interface** — `src/ui`, pending the GUI rebuild. Main tabs: Map, Home, Character, Settings, Edit. Modals: dialogue, skills, stats. Experience: floating text
5. **Task system** — `scripts/tasks.ts` (entry) over `scripts/tasks/` (command families) and the task-workflow libs in `scripts/lib` (`taskStore`, `eventLog`, `specDoc`, `planCheck`, `producers`, `auditImport`, `commitContract`, `architecture`). The store, the spec machinery, the event log, the architecture queries, and the audit/triage workflow
6. **Testing procedure**
  1. `scripts/play-cli.ts` interactive REPL over `startSession`/`view`/`apply` (live `--live` real-time + instant piped/agent mode), named `# test` scripts run via `/test`
  2. `npm run probe -- <source>... [--show <kind>.<id>] [--round-trip] [--each]` asks the load path a question without building a runner for it — sources are files or stdin, `--each` surveys a table of variants split on `---`. `npm run mutate -- <manifest.json>` breaks a named line, runs the tests it names, restores from bytes it captured (never from git), and reports what the suite failed to notice. `npm run inspect -- "<expression>"` (or `-` for a body on stdin) evaluates against the repo's own module resolution and leaves no file behind, which is what a scratch `.ts` inside the worktree was for. None of the three is a gate; reach for them instead of a scratch `*.test.ts`
  3. `# test` sections in the DSL are the regression format: authored from a live session with `/create-test`, replayed with assertions by `runTest`, and run over the shipped content by `integration.test.ts`
  4. CI: `.github/workflows/test.yml` runs `npx tsc --noEmit`, `npm test` and `npm run layer-check` on push and PR, plus `npm run audit-status`, `npm run tasks -- doctor`, `tasks spec show` and `tasks plan` on the ubuntu leg. `doctor` fails on one condition only: a `docs/tasks.jsonl` line that will not parse; the last two are reads that report the branch's spec standing and grade its open plan on the PR page, and cannot redden a check
  5. **Five minutes, wall clock.** `npm test` and every gate a PR must pass stay under it, each. A gate nobody can afford to run is a gate that does not run. Buy the time back by making logic pure and passing effects in as data — git facts, clocks, subprocess results — so tests exercise the decision rather than the world. Mock or fake the effect at its seam; keep a handful of real-git and real-subprocess tests to prove the seam itself, and never pay that cost per case.
7. **Build & deployment**
  1. Web: Vite build, tag-triggered publish to itch.io (`.github/workflows/publish.yml`)
  2. Android: Capacitor sync + Gradle release build, APK signing, attached to the GitHub release

# Layers

`grammar < content < runtime < ui < scripts`. Imports point downward only, gated by `npm run layer-check`. Cycles within a layer are allowed; reaching up is not. A file that needs something from the layer above is usually two files — that is how `tuning.ts` and `save.ts` split. Tests live in the folder of the layer they drive, not the one their name suggests.

# Audits

The auditor's brief is generated, never hand-written: `npm run tasks -- audit-prompt <spec>` prints the whole thing — the eight steps an auditor takes, in order, over the diff range, clause standings, checklist and regression question they act on. It writes the mutation manifest and the pass file; the auditor fills the pass file in and hands it back with `tasks audit <slug> --args-from <it>`, which is the one filing route for a branch audit. Commission an auditor by telling it to run that command and do what it says. A worker is dispatched the same way: `npm run tasks -- work-prompt <id-or-spec>` prints its whole brief, and the one instruction is to run it and do what it says. `npm run tasks -- merge-ready` runs the merge gate (tsc, tests, layer-check, audit-status, doctor, byte check) in one invocation.

# Additional repository context (maximum 300 tokens)
- "descriptive flavor text for an object" is **one** mechanism
- modals are rendered unconditionally with guaranteed closing behavior
- quest/stage conditions are runtime flag checks evaluated against live state
- location/item/entity actions (`<obj>.<objId>.<actionId>`) are first-class patterns for anything the object can 'do'
- item actions are not location-scoped, location and entity actions are
- enemy-shaped actions and instant actions are two intentionally different design tools
- location connectivity is always explicit and directional
- travel actions without cost or reward are treated as pathfinding edges for multi step map navigation
- all skill-XP-granting moments must produce floating text
- progress signals get lightweight UI acknowledgement (e.g. map tab flashing on location discovery)
- record a regression as a `# test` section via `/create-test` rather than writing an ad-hoc script
- the dev-only `window.__test` browser harness (batched checks via `window.__test.batch([...])`) was removed with the legacy GUI; pending the GUI rebuild, reintroduce it rather than reaching for ad-hoc `page.evaluate`/screenshot loops
- manually clearing browser storage does not reliably give you a fresh state. Use `/cheat reset`


