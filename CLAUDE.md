# Mission

Optimize for correctness, bounded scope, reuse, architectural coherence, strong evidence, and clean review—not patch volume. Passing tests is necessary. Avoid patches that accrue technical debt. Prefer self documenting code over comments or updating repository context. 

Prompt an independent system audit when a system's un-audited commits exceed the threshold; `npm run audit-status` derives the counts from git, so nothing needs incrementing by hand. Keep independent systems independent. Do not create systems that are required to be manually kept in sync. 

Make commits after each logical chunk.

# Comments

Comments are capped at 5% of a file's lines, gated by `npm run comment-budget` in CI. This is a hard budget, not an aspiration: spend it on the few facts that earn it.

Keep a comment only if the fact is **owned by this file**, **not derivable from reading it**, and expressible as neither a name, a type, nor a test. Otherwise it has a destination — rename it, type it, test it, or leave it in the commit message and the audit log. Deleting it loses nothing; git holds every word.

Never describe another module's contract. That comment drifts the moment its owner changes, and the owner is the ground truth a reader should go to instead.

Never close an audit finding by writing its rationale into the source. The finding lives in `docs/audits/`, its fix lives in the code, and every behavioural claim it makes lives in a test. A comment restating a finding is a third copy that cannot be executed and will rot.

Strip passes must pass `npm run comment-only -- <base>`, which proves no code changed. Renames go in their own commit so that proof stays honest.

Do not bloat CLAUDE.md with over 200 lines of instructions. 

`.planning/.scratch.md` contains open thoughts, `backlog.md` for vetted work, `completed-tasks.md` contains the archive. 

A feature large enough to span sessions gets a tracked deliverable log at `docs/<feature>/deliverable-log.md` (spec, chunk status, open decisions); `backlog.md` keeps only a pointer to it. Read the log before touching that feature's code. On merge, archive the log and lift anything unfinished back into `backlog.md`. Currently live: `docs/combat/deliverable-log.md`, `docs/readability-gate/deliverable-log.md`. 

# Repository systems

A system owns a set of paths, declared in `docs/audits/systems.json` — the one place membership is defined, so a commit's system follows from the files it touches. `npm run audit-status` reads it and reports commits since each system's last audit; record a completed audit by setting that system's `lastAudit` to the reviewed SHA.

1. **DSL load path** — `src/grammar` (text to syntax) and `src/content` (syntax to registry, incl. load-time reference resolution)
2. **Runtime** — `src/runtime`: state, travel, actions, encounters, resources, stats, skills, flags, dialogue, saves; `session.ts` is the entry point everything above plays through
3. **Contribution system** — unbuilt: editor, validation/merge engine
4. **User interface** — `src/ui`, pending the GUI rebuild. Main tabs: Map, Home, Character, Settings, Edit. Modals: dialogue, skills, stats. Experience: floating text
5. **Testing procedure**
  1. `scripts/play-cli.ts` interactive REPL over `startSession`/`view`/`apply` (live `--live` real-time + instant piped/agent mode), named `# test` scripts run via `/test`
  2. `# test` sections in the DSL are the regression format: authored from a live session with `/create-test`, replayed with assertions by `runTest`, and run over the shipped content by `integration.test.ts`
  3. CI: `.github/workflows/test.yml` runs `tsc --noEmit`, `npm test`, `npm run comment-budget`, `npm run layer-check` on push and PR
6. **Build & deployment**
  1. Web: Vite build, tag-triggered publish to itch.io (`.github/workflows/publish.yml`)
  2. Android: Capacitor sync + Gradle release build, APK signing, attached to the GitHub release

# Layers

`grammar < content < runtime < ui`. Imports point downward only, gated by `npm run layer-check`. Cycles within a layer are allowed; reaching up is not. A file that needs something from the layer above is usually two files — that is how `tuning.ts` and `save.ts` split. Tests live in the folder of the layer they drive, not the one their name suggests.

# Audit prompt
Audit the {repository-system} for correctness in the context of the last {N} commits impacting the system and global repository architecture. 

Do not assume the implementation approach is correct. Look specifically for:

- a simpler existing pattern that should have been reused.
- scope drift;
- CI, test, coverage, lint, type, or security weakening;
- unmet acceptance criteria;
- duplicated utilities or domain concepts;
- architecture-boundary violations;
- tests that repeat the implementation's assumptions;
- missing edge cases;
- public API, data, security, performance, or rollback risks;
- cross-system effects;
- comments that restate self-documenting code;

Report findings by severity with file references and evidence.

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


