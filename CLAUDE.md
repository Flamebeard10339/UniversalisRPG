# Mission

Optimize for correctness, bounded scope, reuse, architectural coherence, strong evidence, and clean review—not patch volume. Passing tests is necessary. Avoid patches that accrue technical debt. Prefer self documenting code over comments or updating repository context. 

Track which systems commits impact and prompt an independent system audit when un-audited commits > 10. Keep independent systems independent. Do not create systems that are required to be manually kept in sync. 

Make commits after each logical chunk. 

Do not bloat CLAUDE.md with over 200 lines of instructions. 

`.planning/.scratch.md` contains open thoughts, `backlog.md` for vetted work, `completed-tasks.md` contains the archive. 

A feature large enough to span sessions gets a tracked deliverable log at `docs/<feature>/deliverable-log.md` (spec, chunk status, open decisions); `backlog.md` keeps only a pointer to it. Read the log before touching that feature's code. On merge, archive the log and lift anything unfinished back into `backlog.md`. Currently live: `docs/combat/deliverable-log.md`. 

# Repository systems
1. Content pipeline through DSL markdown files (commits since audit: 4)
  1. Contribution system: editor, validation/merge engine
  2. DSL system: grammar, parser, compiler, loader
2. User interface (commits since audit: 0)
  1. Main tabs: Map, Home, Character, Settings, Edit 
  2. Modals: dialogue, skills, stats
  3. Experience: floating text
3. Game Engine (commits since audit: 7)
  1. Core: State-driven UI, offline progression, travel and locations
  2. Data structures: locations, dialogue, quests, actions, resources, stats, skills, flags 
4. Build & deployment (commits since audit: 0)
  1. Web: Vite build, tag-triggered publish to itch.io (`.github/workflows/publish.yml`)
  2. Android: Capacitor sync + Gradle release build, APK signing, attached to the GitHub release
5. Testing procedure (commits since audit: 2)
  1. Human/agent testing: `scripts/play-cli.ts` interactive REPL over `startSession`/`view`/`apply` (live `--live` real-time + instant piped/agent mode), named `# test` scripts run via `/test`
  2. `scripts/playtest-cli.ts` headless replay of a saved choiceId script through `startSession`/`apply`, writing a transcript (zero browser, zero real wait)

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
- prefer expanding `scripts/playtest-cli.ts` over writing ad-hoc preview_eval scripts
- the dev-only `window.__test` browser harness (batched checks via `window.__test.batch([...])`) was removed with the legacy GUI; pending the GUI rebuild, reintroduce it rather than reaching for ad-hoc `page.evaluate`/screenshot loops
- manually clearing browser storage does not reliably give you a fresh state. Use `/cheat reset`


