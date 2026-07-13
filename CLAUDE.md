# Mission

Optimize for correctness, bounded scope, reuse, architectural coherence, strong evidence, and clean review—not patch volume. Passing tests is necessary. Avoid patches that accrue technical debt. Prefer self documenting code over comments or updating repository context. 

Track which systems commits impact and prompt an independent system audit when un-audited commits > 10. Keep independent systems independent. Do not create systems that are required to be manually kept in sync. 

Do not bloat CLAUDE.md with over 200 lines of instructions. 

`.planning/.scratch.md` contains open thoughts, `backlog.md` for vetted work, `completed-tasks.md` contains the archive. 

# Repository systems
1. Content pipeline through DSL markdown files (commits since audit: 0)
  1. Contribution system: editor, validation/merge engine
  2. DSL system: grammar, parser, compiler, loader
2. User interface (commits since audit: 0)
  1. Main tabs: Map, Home, Character, Settings, Edit 
  2. Modals: dialogue, skills, stats
  3. Experience: floating text
3. Game Engine (commits since audit: 0)
  1. Core: State-driven UI, offline progression, travel and locations
  2. Data structures: locations, dialogue, quests, actions, resources, stats, skills, flags 
4. Build & deployment (commits since audit: 0)
  1. Web: Vite build, tag-triggered publish to itch.io (`.github/workflows/publish.yml`)
  2. Android: Capacitor sync + Gradle release build, APK signing, attached to the GitHub release
5. Testing procedure (commits since audit: 0)
  1. Human testing: cli.ts, dev-mode
  2. Agent testing: `window.__test` harness (`testHarness.ts`), `scripts/playtest-cli.ts` headless engine (nonfunctional pending DSL rewrite — see Content pipeline TODO), `agentSession.ts` GM/agent message protocol

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
- prefer the dev-only `window.__test` harness (`src/game/testHarness.ts`, mounted from `App.tsx` behind `import.meta.env.DEV`) over ad-hoc `page.evaluate`/screenshot loops
- prefer batching multi-step checks into one round trip with `window.__test.batch([{path, args}, ...])`
- manually clearing browser storage does not reliably give you a fresh state. Use `/cheat reset`

# Content pipeline TODO

The DSL/JSON content-authoring pipeline (grammar, parser, compiler, loader,
validation/merge engine, and the GitHub contribution/patch system built on top
of it) was deleted wholesale on 2026-07-11 and is being redesigned from
scratch on the `dsl-rewrite` branch — see `docs/dsl-rewrite/postmortem.md` for
why, and `docs/dsl-rewrite/implementation-plan.md` for the rewrite plan. No
backwards-compatibility shims or migration path from the old format: the new
system starts clean and content is being hand-authored fresh against it.

For a check worth running again later (a regression you just fixed, a flow you want
covered going forward), don't leave it as a one-off `preview_eval` transcript —
convert it into a headless playtest via `scripts/playtest-cli.ts`/`scripts/
playtestEngine.ts`, which replay a saved choiceId script against the pure engine
(zero browser, zero real wait) and write a transcript. **This tooling is currently
nonfunctional**: its `readModule`/`loadStagedBundle` functions depend on the DSL/
JSON content pipeline deleted on 2026-07-11 (see `docs/dsl-rewrite/postmortem.md`),
and the `.playtests/` fixtures (`profiles/*.json`, `scripts/*.json`) were deleted
along with it since they were tied to now-gone content. Once the pipeline rewrite
(`docs/dsl-rewrite/implementation-plan.md`) has a working loader, rewire these two
scripts to it and re-establish this workflow rather than reinventing it.

