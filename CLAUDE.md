# Game Design Principles

Durable lessons from Tutorial Island content-review cycles. These are principles to
apply to *all* future content and engine work, not a changelog of past fixes — read
this before authoring NPCs, quests, items, or any state-driven UI.

## Dialogue

- Dialogue state (`activeDialogue`) is rendered unconditionally, independent of which
  tab is active, the same way the generic modal is (see below). Do not gate dialogue
  rendering behind `visibleActiveTab === 'home'` or similar — anything that can start
  a dialogue (item actions, entity actions, future systems) may be triggered from any
  tab, and the player must be able to see and finish that conversation regardless of
  where they triggered it from. Do not auto-cancel an active dialogue as a side effect
  of plain tab/sub-tab navigation; only cancel it for actions that meaningfully replace
  the whole screen (entering contribution mode, changing the display profile, starting
  a new action/travel).

## Quests

- Quest stage `descriptionKey`s are narrative progress summaries and hints
- Quest/stage conditions are runtime flag checks evaluated against live state, not
  merge-time object-id references. It is architecturally safe for a quest defined in
  an early-loading module (e.g. `foundation`) to reference flags that are only ever
  set by modules that load later — there is no forward-reference validation problem,
  unlike object-id references (entities, items, actions) which do need to resolve at
  merge time.

## State-driven UI

- Any state-driven popup (name editor, bank vault, future dialogs) shares one generic
  mechanism: `UniversePlayState.openModalId: string | null` plus an
  `{kind:'open-modal', modalId:string}` `ActionResult`, rendered unconditionally near
  the app root. Add a new `modalId` case, not a new boolean field, when a new popup is
  needed. Reserve ad-hoc `useState` booleans for popups with zero game-state
  involvement (e.g. a purely local confirm dialog).
- Item actions (`item.<itemId>.<actionId>`) are a first-class, reusable pattern for
  anything an item needs to "do" (read a note, drink a potion, etc.), mirroring entity
  actions (`entity.<entityId>.<actionId>`) exactly in shape.
- Item actions are **not location-scoped**. `isActionAvailableAtCurrentLocation` must
  treat any action with `itemId` set as always available — an item can be used
  wherever it's held. If you add a new "scope" concept to actions (item-scoped,
  entity-scoped, station-scoped, etc.), make sure the availability check has an
  explicit early-return for it; a missing case here silently rejects every action of
  that kind everywhere; it can look like it renders correctly (a button appears) while
  actually being unusable, so exercise it end-to-end (headless playtest *and* a manual
  click) rather than trusting that the button is visible.
- Repeatable state-dependent flavor text (e.g. "examine this thing, get a different
  description depending on what you've already taken from it") uses mutually
  exclusive `visibleWhen`-gated action variants that share one display title (see
  `gommi`'s `examine`/`examine-asleep`, or the guide-house drawer/bookshelf), not a new
  dialogue-branch-as-text mechanism. This needs zero engine changes.
- "Descriptive flavor text for an object" is **one** mechanism, not one per object
  kind: an Examine affordance that prints text to chat (`src/components/
  ExamineButton.tsx`), never a static paragraph rendered inline. For entities/items
  (which already have an action system) this is literally their own `examine:` action
  — same `say:` sugar, same `chat.<scope>.<id>.examine` message key, rendered as
  whichever button their other actions already render through (an item's Examine
  button is just one more entry in `availableItemActions`, nothing item-specific). For
  stats/skills/locations (no action system to hang it on) it's a locale-key lookup
  (`statExamineKey`/`skillExamineKey`/`locationExamineKey`) fed through the same
  `ExamineButton`. The DSL field is `examine:`, never `description:`, on every section
  that has one (`# item`, `# stat`, `# skill`, `# location`) — a new object kind that
  needs flavor text gets an `examine:` field or action, not a new "description" field
  with its own inline-rendered paragraph.

## Actions and combat

- Adversarial/continuous (enemy-shaped) actions and instant `chance`+`failureResults`
  actions are two intentionally different design tools: a graduated skill check with
  visible progress (health bar, multiple hits, XP per hit) versus a one-shot gamble
  (single roll, binary success/fail). Don't unify them for consistency's sake — e.g.
  the guide-house front door (adversarial lockpicking) and the mining locked chest
  (chance-based lockpicking) are both intentional, and represent different flavors of
  the same skill on purpose.
- A "the target never fights back" action (e.g. picking a lock) still reuses the full
  continuous/adversarial-action system — `interactionTypeId` + inline `enemy: {...}` +
  `rewards` — with `targetPlayerHealth: false` on the interaction type. This is a
  content-only pattern, not a new engine feature.

## Travel and the map

- Location connectivity is **always explicit**, never grid-position-derived. Every
  travel edge is a real, authored action (`# location`'s `adjacent:` block, or a
  free-standing entity action like a ladder/tunnel/portal) — there is no
  "grid-adjacent locations are automatically connected" behavior and no per-universe
  toggle for it. If two locations should be walkable between, that requires an
  explicit edge on at least one of them; if it should work both ways, both locations
  need one (edges are one-directional, the return trip is never implied). `x`/`y`/`z`
  positions are for travel-time calculation and map layout only — they never imply a
  connection.
- Any action that costs/rewards nothing and only relocates the player (optionally
  narrating it via `say:`) is automatically a pathfinding edge, whether it's a
  location-level `adjacent:` edge or a free-standing entity action (a ladder, tunnel,
  portal) — see `src/game/travel.ts`'s `getPureTravelDestination`. Don't special-case
  new "free move" content to make it map-navigable; if it's genuinely free (no other
  results, no rewards), it already is. An action that *also* sets a flag, grants an
  item, etc. alongside the relocate is deliberately excluded — that's a meaningful
  moment (a one-way portal that also flips a story flag), not a free hop, so it stays
  a manual button the player has to click, not something the map silently routes
  through.

## Resources and stats

- Never add a second effect that regenerates/drains a resource already covered by an
  existing effect on the same stat (e.g. don't add a second `regeneration`-keyed
  health effect for a "well fed" buff when the base health resource already has one).
  Buff the stat instead via a `StatModifierDefinition` (`statId`, `amount`, `kind:
  'added'|'increased'`, `activeWhen`), which composes with whatever effects already
  read that stat.

## UI feedback guarantees

- Any skill-XP-granting moment — whether it flows through `action.rewards`
  (`kind:'skillXp'`), an `ExperienceTrigger` (`skill.xp-event` run-log entries), or an
  inline `{kind:'skill-xp',...}` `ActionResult` — must produce floating text. This is
  a blanket UI guarantee across every skill and every action shape, not a
  combat-only feature.
- Any new "resource pool" or "location discovery" style progress signal should get an
  equivalent lightweight UI acknowledgement (e.g. the map tab flashing when a new
  location is discovered) rather than requiring the player to notice it themselves.

## Content pipeline

- Content is authored directly as DSL markdown (see `docs/content-dsl-grammar.md` and
  `scripts/contentDsl/samples/*.md`), edited either by hand or through the in-app DSL
  editor (Edit tab → Content, `src/components/contribution/DslModuleEditor.tsx`). The
  DSL compiles to the same `ContentModule` JSON shape (`src/game/types.ts`) that the
  loader/validators/engine have always consumed — no engine change is required to add
  DSL content. The old grid-based JSON editors (`ModuleEditor.tsx`,
  `ContentDataEditor.tsx`) and the Playwright pipeline that drove them
  (`scripts/build-tutorial-island.mjs` → `scripts/mod-editor-cli.mjs`) have been
  removed; there is no in-app authoring path left for content that only exists as
  legacy JSON.
- All Tutorial Island modules are now authored as DSL (`public/content/universes/base/
  modules/tutorial-island-*.md`). `base-core.json` remains hand-written JSON. It no
  longer hosts any standalone starter-world content (the old crossroads/emberwood/
  old-quarry location set was removed) — it's now purely the shared engine-plumbing
  foundation tutorial-island depends on: `displayProfile`, the universal `health`/
  `attack`/`defense`/`regeneration`/`action-rate` stats+skills (referenced by its own
  resources and the `melee-combat` interactionType, so they must live wherever those do
  — see `docs/content-dsl-grammar.md`'s stat/skill/flag section for why), resources with
  custom `effects`/`onFull`/`onEmpty` behavior, and an interactionType with an
  `experience` array. Stats/skills/flags now have DSL sugar (`# stat`, `# skill`,
  `# flags`) and could be ported; resources/effects/interactionType-`experience`/
  display-profiles still don't, so porting the rest would mean putting it through the
  `# advanced` raw-JSON escape hatch anyway. It keeps loading and playing fine via
  `loader.ts`'s JSON-first-then-DSL-compile fallback; only port it if/when enough of its
  remaining shapes gain real DSL sugar to make hand-authoring it actually easier.
- After any change that could affect module resolution or validation, actually run
  the full pipeline (`npx vitest run` → headless playtests) rather than trusting an
  isolated unit test of the new feature. A validation gap in one new action/item can
  silently disable unrelated modules via the module-conflict-cascade in
  `resolveAndApplyModules` — this has happened twice and is only caught by running the
  real thing end to end.
- No backwards-compatibility shims for pre-launch content: replacing a field or system
  means deleting the old one everywhere it's referenced, not migrating it or keeping a
  fallback path.

## Testing discipline

- The headless playtest harness (`scripts/playtestEngine.ts`'s `visibleChoices`) must
  stay in sync with whatever the real UI can trigger. When a new action *kind* is
  added (item actions, station/recipe actions, etc.), add the matching branch to
  `visibleChoices` in the same change — otherwise the new content is untestable and
  bugs in it (like the item-action location-gating bug above) only surface in manual
  testing, or not at all.
- A dialogue node with no `options` still needs a "Continue" affordance to close
  (mirrors `DialoguePanel.tsx`'s fallback button) even if it has a `gotoNodeId` to
  another node. `visibleChoices` must offer this as a synthetic choice; don't assume a
  no-options node is always terminal.
- The headless CLI (`scripts/playtestEngine.ts`) and the real app each used to build
  their own `ActionResolutionContext`/choice-derivation independently — this is
  exactly what let two real bugs (a hand-built context missing `recipes`/
  `statModifiers`; `restartAction` dropping `recipeId` on loop) ship silently, since
  the headless sim's separately-correct context could never surface a bug that only
  existed in the real app's wiring. `visibleChoices`/`describeLocation` now live once
  in `src/game/choices.ts`, imported by both. Never re-derive this logic a second
  time; if a new action/dialogue/UI-affordance kind needs new choice-listing logic,
  add it there.
- For verifying real-UI bugs during a session, prefer the dev-only
  `window.__test` harness (`src/game/testHarness.ts`, mounted from `App.tsx` behind
  `import.meta.env.DEV`) over ad-hoc `page.evaluate`/screenshot loops: `state.*`/
  `inventory.*`/`bank.*`/`equipment.*` for direct reads/writes, `location.teleport`,
  `choices.list()`/`choices.click(id)` (clicks the real DOM button when rendered —
  falling back to a direct store dispatch only if not found, flagged via `viaDom`),
  `dialogue.get()`/`choose()`, `nav.setTab`/`setHomeTab`/`setCharacterTab`,
  `time.skip(seconds)` (resolves idle timers at `Date.now() + seconds*1000` with zero
  real wait), and `profile.load/save/list` against `.playtests/profiles/*.json` (one
  fixture per module boundary — reuse an existing one or `profile.save(name)` a new
  one after manually reaching that point; there's no auto-solver). Every mutating
  command returns `{ok, error?}` with a short machine-matchable `error` string instead
  of requiring a screenshot to diagnose failure. When adding a new interactive UI
  element, give it a `data-action-id`/`data-dialogue-option-id`/`data-nav-tab`-style
  attribute (see `ActionPanel.tsx`/`DialoguePanel.tsx`/`InventoryPanel.tsx`) so the
  harness can click it for real instead of only being able to fall back to the store.
