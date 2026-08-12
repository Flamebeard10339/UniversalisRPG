# gui-rebuild

## Deliverable

`src/main.tsx` has rendered "Universalis — text-adventure GUI pending" since the legacy GUI was
decommissioned, and `src/ui` does not exist. This branch builds the play surface's second driver: a
React app over the command table and published view that
`in-process-module-api` establishes, with no way to reach the
runtime otherwise. Everything that makes the two drivers the same game is settled by then; what this
branch owes is that the GUI is genuinely one of them and not a second engine wearing a UI.

The screen is a chat log with a bottom action sheet. Home is one scrolling column of narration, the
choices sit in thumb reach beneath it, resources and the clock are pinned above, and the five tabs
are the bottom nav. Modals cover it and are rendered from the name and options the engine publishes,
never from a list of modal names the UI knows. Mobile is the form factor the layout is designed at,
not one it is adapted to afterwards.

Proof:

- [c1] The GUI cannot drift from the REPL, and the proof runs. One scripted sequence of commands
  replayed through the REPL's driver and through the GUI's leaves byte-identical serialized state
  and the same ordered messages. The GUI defines no command of its own and filters none: a command
  added to the shared table is dispatchable from the GUI with no edit under `src/ui`. One capability
  is carved out and named rather than equalised away: the REPL is opened with an authoring context
  and the GUI has none, so a command gated on it is refused by the GUI and runs in the REPL.
  `mod-portal-gui`, `gui-dev-mode-toggle-banner-and-editing-gate`,
  `gui-locale-editor-missing-toggle-and-language-dropdown` and `edit-mode-memory` own giving the GUI
  one; until they do, the proof opens the REPL the way `play-cli`'s `main` does and holds the two to
  identical output on every table entry the carve-out does not cover, so the drift that remains is
  visible as a count rather than hidden by a capability taken off the REPL first.
- [c2] The GUI cannot alter state. No file under `src/ui` reaches the runtime other than through the
  play surface, and none reads or writes `GameState`. The rule covers `src/main.tsx` as well as
  `src/ui`, which is what the prerequisite's layer-check clause is for — a driver whose entry point
  is exempt from the check has an unchecked door.
- [c3] Every line the player reads comes from the engine. Narration, choice labels, resource titles,
  modal prompts and error text are published values rendered as they are; `src/ui` composes layout
  and never prose. A string the player sees that no engine value produced is a second content
  source, and there is not one.
- [c4] A modal is rendered from its published name and options alone. No modal id appears as a
  literal anywhere in `src/ui`, a modal the UI has never heard of renders and is answerable, and a
  modal's closing path cannot be lost: answering it dismisses it and reveals whatever is beneath.
- [c5] Time runs, and it runs through the shared clock. A spannable action begun in the GUI advances
  simulated time from real elapsed time, shows its progress and can be cancelled; the same action
  begun through the REPL's `--live` reaches the same state over the same elapsed span. Nothing under
  `src/ui` schedules `resolve` or `wait` on a clock of its own.
- [c6] The layout is a two-dimensional navigation model designed at a phone, and the claim is
  measured rather than asserted. Vertical movement changes context — Map above, Home in the middle
  and where the app opens, Character below — and the boundary between two layers is one shared
  banner rather than two: the location banner is Map's bottom edge and Home's top edge, the
  character-status banner is Home's bottom edge and Character's top edge, and each banner is also
  the handle that swipes or taps to the layer it borders, which is why Map needs no top banner and
  Character no bottom handle. Horizontal movement changes subpage within a layer, through a tab bar
  fixed at the bottom whose entries are the current layer's; a layer re-entered opens on the subpage
  it was left on. Measured at 375×812: nothing in the tutorial route scrolls the page horizontally,
  every interactive control's touch target is at least 44 CSS pixels on its shorter side, the
  controls used every turn are in thumb reach — the tab bar sits in the bottom third and the action
  sheet takes the bottom half of the play surface, so nothing the player touches every turn is above
  the halfway line — no affordance requires hover, a right-click or a keyboard, and no layer or
  subpage is reachable only by a gesture.
- [c7] Every destination is one move from Home and each renders what it owes. Home is the narrative
  log and the action sheet. Map draws the discovered locations where they actually are — each at
  its own published position, with the roads between them — and acknowledges a newly discovered one.
  It pans under a finger and cannot be panned away from what it is drawing. It shows one z-plane at
  a time, plus whatever sits off that plane and is adjacent to the player, and it cycles between the
  planes. Character renders the published inventory, equipment, skills and stats.
  Edit carries the command console: a field that hands any line to the shared table, which is what
  makes c1's second sentence reachable from the GUI at all, and its output lands in Home's log like
  every other engine line. Settings is the frame with no body —
  `gui-dev-mode-toggle-banner-and-editing-gate`, `mod-portal-gui`,
  `gui-locale-editor-missing-toggle-and-language-dropdown` and `edit-mode-memory` own their
  contents, and this branch owes them somewhere to land, not the landing; the four that land on Edit
  land beside the console rather than instead of it.
- [c8] The web build carries its content. The shipped DSL reaches the browser through the build, so
  the itch.io bundle and the APK both start a session with no filesystem and no network.
  `public/content/` is not reintroduced: an audit deleted it once (UI-M2) and it is the obvious
  wrong turn back.
- [c9] The agent harness returns, batched, and only in development. A dev-only `window.__test`
  exposes actions registered by the components that own them plus a structured state read, so a
  driving agent calls a name and reads a result instead of scanning rendered text, and a batch of
  commands is one round trip returning one result per step. A production build contains no trace of
  it.
- [c10] Floating text has a channel and the channel is general. A moment the engine publishes can be
  rendered as transient text over the play surface without the component rendering it knowing which
  moment it was. The XP instance is deliberately not wired here — the event does not exist until
  `skill-levels-xp-events` — and `floating-text-for-xp-events` owns wiring it.

## Goal

The game becomes playable by a person on a phone, as a driver of the same surface the REPL drives.

## Decisions

- **Chat log with a bottom action sheet, tabs as the nav.** Settled by the author 2026-08-07. A
  phone is held in one hand, so the controls used every turn live in thumb reach and the narration
  scrolls above them; the tab bar is the only other chrome. The alternative considered was five peer
  full-screen panels — the legacy GUI's shape — which puts the play surface behind a tab and reads
  as a desktop app scaled down.
- **The nav is two-dimensional, and the banners are the vertical handles.** Settled by the author
  2026-08-11, superseding the nav half of the decision above; the chat log with the action sheet in
  thumb reach is unchanged, and Home is still where the app opens. Five peer tabs made every screen
  a sibling of every other and spent Home's scarcest resource, vertical space, on a header and a tab
  bar that each said something about a different subject. Three vertical layers with shared banners
  spend it once: the banner a player reads to know where they are is the same pixels they touch to
  go there, so the location strip pays for the Map and the status strip pays for the Character
  sheet. The tab bar survives because a fixed thumb target is worth keeping, but it stops being a
  five-way global switch and becomes the current layer's own — Edit and Settings are Home's
  neighbours, not the world's. Per-layer memory of the last subpage is part of the ruling, not a
  refinement of it: a model where leaving Character loses the player's place in Inventory is a
  worse model, not the same one unpolished. The example labels the author gave — Local/Region/World,
  Edit/Home/Settings, Stats/Equipment/Inventory — are illustrations of the shape, not a fixed
  vocabulary.
- **The GUI is a driver, not a second engine, and the drift proof is executable.** The author's
  requirement is that the two play methods cannot drift in capability or function and that the GUI
  cannot alter state directly. The structural half is the prerequisite's — one command table,
  derived help, no reachable `GameState`. The behavioural half is c1 and lives here, because this is
  the first moment two drivers exist to compare. c1 drives the GUI's session container rather than
  React, so the comparison is of two drivers and not of a renderer.
- **Settings ships empty on purpose, and Edit ships with the console.** Four tracked records own
  the bodies of both. Building them here would absorb four records into a branch that already owes a
  whole directory, and each of them is blocked on something this branch does not deliver — a dev
  slot, a mod-set decision, a locale system, an editor. An empty frame is the seam they were split
  off to wait for. Edit is the exception the author ruled on (2026-08-12): the command console is
  what makes c1 true and is an authoring affordance, and the four records queued against Edit are
  building the same room, so it belongs beside them. A fourth Home-layer subpage was rejected for
  disturbing a layout measured at 375×812 and pinned by `phone.test.tsx`, and folding the console
  into Home for putting an authoring surface in the middle of play.
- **No persistence.** The session starts fresh on every load, exactly as `play-cli` does.
  `auto-save-export-and-load` and `single-dev-mode` own storage and reset between them; a GUI that
  quietly wrote to `localStorage` would be a second answer to a question they are being planned to
  settle, and CLAUDE.md already records that there is no browser storage to clear.
  `the-browser-save-store-adapter` is where the two meet: it requires this branch and
  `auto-save-export-and-load`, and it is the only record that may put a slot in `localStorage`.
- **Content is bundled at build time.** The browser has no filesystem and the app must start with no
  network, so the shipped DSL is imported by the build rather than fetched. Recorded because
  `public/content/` was deleted by an audit and re-adding it is the reflex.
- **Floating text leaves CLAUDE.md and becomes a record.** The author ruled 2026-08-07 that the line
  "all skill-XP-granting moments must produce floating text" comes out of repository context and
  becomes `floating-text-for-xp-events`, requiring this branch and `skill-levels-xp-events`. That
  spec's Decision naming `gui-rebuild` as the renderer is re-pointed at the new record. A constraint
  exactly one task can act on is a task, not context every session pays to load.
- **The release gate is not this branch's.** `build-deployment-2026-07-28-h2` says the pipeline has
  no gate against publishing a non-functional placeholder. This branch removes the placeholder; it
  does not build the gate, which is a Build & deployment concern and stays open. Removing the
  symptom is not closing the finding.
- **The existing palette is the starting point, not a rewrite.** `user-interface-2026-07-30-l1`
  declined the unused custom properties in `src/index.css` as "plausibly a deliberate palette seed
  for the rebuild"; this is the branch that either uses them or deletes them, and either is an
  answer. The Tailwind content glob narrows to the layer that actually carries classes, which
  retires the low finding that it sweeps three layers below this one.

## Open questions

- Whether the GUI surfaces a command console in this branch or only the generated controls. The
  table is reachable either way. A console is what `single-dev-mode` will gate and what
  `quest-journal` will add `/quests` to, so building it before either exists may be premature —
  left to the worker with the frame in front of it.
- ~~How the map draws.~~ Settled by the author 2026-08-11: a spatial graph, each place at its own
  `x, y, z`, not a list. Still no library — the positions are authored and the roads are straight
  lines between them, so `reactflow` stays removed (UI-M3) and the drawing is plain SVG. What the
  ruling adds beyond drawing — walking to a place by tapping it, and lighting the route up on the
  way — is `travel-reaches-anywhere-the-roads-do`, because it is an engine capability both drivers
  owe and not a thing a renderer may do on its own.
- Whether the tutorial route is playable end to end when this merges. `starting-zone` is separately
  blocked, so `first-playtest` may still wait; that is a content question, not this branch's.

## Audit passes

### Pass 1 — 2026-08-10

- base: `d7ea6027bbc9c5dc23e31c055618ff70ce772318`
- head: `4e9997cfed86e84320aa5e07e7abed19c9fbc9f7`
- proof 1: unknown — Nothing in this diff replays a scripted sequence through play-cli's driver and the GUI's
and compares serialized state. driver.ts is built so that comparison is possible — every route in
(choose, answer, send) spells a line runLine parses, and the concept registered over it says as much
— but the comparison itself is not written and I did not stand one up. Nobody looked.
- proof 2: met — Three independent legs, all re-runnable.
(1) Structural: startSession hands back a PlaySession whose registry is a getter and whose
{registry, state, logCursor} live in a module-private WeakMap in src/runtime/session.ts (INTERNALS,
lines 70-96). GameState is not reachable from src/ui at all, whatever src/ui imports.
(2) The guard: src/ui/surface.test.ts sweeps every non-test module under src/ui plus src/main.tsx and
holds their runtime reaches to ['src/runtime/session', 'src/runtime/command'].
(3) Mutation, manifest at C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass1-mutations.json,
entry "c2 driver reaches the runtime off the play surface" — adds `import type { GameState } from
'../runtime/state'` to src/ui/driver.ts. KILLED by src/ui/surface.test.ts "reaches the runtime only
through the play surface", re-run at its own file with the mutation still applied and failing there.
Graded met on the property, which is true today. The guard's durability is a separate finding: it
reads only single-quoted `from` clauses, and a dynamic import of src/runtime/state SURVIVED the whole
suite (manifest audit-gui-rebuild-pass1-mutations-c2-bypass.json). See finding
"c2's structural guard reads one import spelling of three".
- proof 3: met — src/ui/render.test.tsx "renders nothing a player can read that the engine did not
publish" gathers the engine's own published values as the session moves (location title and
description, entity titles and examines, choice labels and details, resource titles, modal option
labels and values, said), renders <App> at four points of the tutorial route, strips the markup back
to text runs and requires every run to be in that set. Mutation, entry "c3 the shell writes prose of
its own" — Home.tsx's location header becomes "You are in {view.location.title}". KILLED by that
named test, re-run at src/ui/render.test.tsx with the mutation still applied and failing there.
Two exemptions the next pass should read rather than rediscover, and which the clause's own last
sentence ("there is not one") does not authorise:
(a) the five tab labels in src/ui/tabs.ts are skipped by `if (TAB_LABELS.includes(run)) continue`,
    and the skip is matched by VALUE, not by origin — any component may render the words Home, Map,
    Character, Settings or Edit and the guard will pass it.
(b) readable() keeps only runs matching /[A-Za-z]/, so formatClock's "1:05", the meter's "12/30" and
    ModalSheet's submit glyph are outside what this test can see.
Filed as "c3's guard exempts by value what the clause exempts by nothing".
- proof 4: unmet — Two of the three halves hold; the closing path does not.
Holds — "no modal id appears as a literal": surface.test.ts "names no modal, so it cannot be
rendering one it knows". Mutation entry "c4 the shell picks its modal by name" replaces
askedOption(...) in App.tsx with modals.find((m) => m.name === 'dialogue'); KILLED by that named
test, re-run at its own file.
Holds — "renders and is answerable": render.test.tsx "renders a modal it has never heard of from the
option alone", plus driver.test.ts "answers a modal by its published option key, and what was beneath
comes back". Mutation entry "c4 the answer no longer reaches the option it was asked for" appends a
character to the submitted value; KILLED by that named driver test, re-run at its own file.
(The first form of that mutation, a trailing space, was an equivalent mutant — runLine trims — and
reported SURVIVED. Recorded so the next pass does not read it as a real survivor.)
FAILS — "a modal's closing path cannot be lost". Reproduction, run with npm run inspect:
  ModalSheet with option {key:'choice', label:'Choice', values: []} renders {buttons: 0, inputs: 0}.
That state is reachable from authored content. src/runtime/modals.ts publishes the dialogue modal as
one option whose values are menuTexts(cursor), and src/runtime/dialogue-runtime.ts offered() filters
a menu's choices by their `when:`. A menu whose every choice is gated off publishes values: []. The
option is non-empty so publishModal keeps the modal open, and src/runtime/session.ts:222 withdraws
every world choice while any modal is open. The result is a screen with no control on it at all, and
unlike the REPL the GUI has no console to type /quit or /look into. Not reachable in today's shipped
content — content/tutorial-island.dsl puts `when:` on dialogue nodes only, never on a menu choice —
so this is latent, not live.
Also under this clause: nothing tests that App draws the modal the engine is asking for. The
unheard-modal test renders <ModalSheet> directly and the answer test drives the driver directly;
neither goes through App's `asking ? <ModalSheet …> : null`. Mutation "c4 the modal is dismissed by
the shell rather than by the engine" (manifest audit-gui-rebuild-pass1-mutations-c4b.json) suppresses
that render entirely and src/ui/render.test.tsx stayed green at its own file scope; the run escalated
to the whole suite and returned UNSTABLE on an unrelated known flake, so the whole-suite scope
answered nothing, but the file scope did. Both filed as findings.
- proof 5: unknown — Nothing in this diff schedules or advances a clock, and the-gui-runs-in-real-time is
open and owns it. I did not check whether a spannable action begun in the GUI reaches the same state
as the same action under --live, because there is no GUI path to begin one yet.
- proof 6: unknown — Not measured, and this clause's own standard is "measured rather than asserted". By
reading, every interactive control carries min-h-[48px] (Home's Sheet buttons, ModalSheet's buttons,
input and submit) or min-h-[52px] (TabBar), the sheet and the tab bar are the bottom two elements of
a h-[100dvh] column, the root is overflow-hidden with truncate/break-words below it, and no
affordance is hover-, right-click- or keyboard-only. None of that is a measurement at 375x812 over
the tutorial route, so recording met would be asserting exactly what the clause forbids.
- proof 7: unknown — The five tabs exist as one nav in src/ui/TabBar.tsx and each is one tap. Home is the
narrative log and the action sheet. Map and Character render `<div className="flex-1" />` — an empty
frame, not the discovered-location graph and published inventory this clause asks for — and
the-map-and-character-tabs is open and owns them. Settings and Edit are empty by the spec's own
Decision. I did not grade this because the half that is missing is another record's, and recording
unmet against this branch would misattribute it.
- proof 8: met — src/ui/shippedContent.ts bundles content/*.dsl through import.meta.glob with
query:'?raw', eager, filtering the play-cli local-changes module out.
Build check, re-runnable: `npx vite build` produces dist/assets/index-*.js, `grep -l guide-house`
finds the DSL text inside that bundle, dist/ contains no content/ directory, and surface.test.ts
"asks nothing of a network or a filesystem" holds every src/ui module against /fetch\(|XMLHttpRequest
|public\/content/. public/content/ is not reintroduced.
Mutation entry "c8 the build stops carrying the shipped DSL" points the glob at a suffix nothing
matches. KILLED by src/ui/shippedContent.test.ts "bundles the shipped DSL as text, with no path left
for the browser to fetch", re-run at its own file with the mutation still applied and failing there.
- proof 9: unknown — No window.__test appears anywhere in this diff, and grep finds none under src/.
the-agent-harness-returns-to-the-gui is open and owns it. Nobody looked further.
- proof 10: met — src/ui/transient.ts publishes TransientNote as {id, text} and nothing else, and
src/ui/FloatingText.tsx renders channel.notes() with no access to what produced any of them.
The channel takes its expiry scheduler as a parameter, so the test drives it with a fake clock rather
than a timer. Mutation entry "c10 a transient note learns where it came from" adds a `moment: 'xp'`
field to the note. KILLED by src/ui/transient.test.ts "carries any text at all, and nothing about
where it came from", re-run at its own file with the mutation still applied and failing there.
The XP instance is correctly not wired, as the clause requires.

### Pass 2 — 2026-08-10

- base: `d7ea6027bbc9c5dc23e31c055618ff70ce772318`
- head: `916a85862059df5e097329e4cec08dd886b857c4`
- proof 1: unknown — Still nobody has replayed a scripted sequence through play-cli's driver and the GUI's and
compared serialized state; I did not stand one up either, and this clause is owed by another record.
One observation the owner should not have to rediscover: nothing under src/ui calls driver.send.
grep for `.send(` across src/ returns no call site, so the GUI dispatches exactly two spellings, the
bare `<N>` choice line (driver.choose) and `submit-modal: key=value` (driver.answer). c1's second
sentence, "a command added to the shared table is dispatchable from the GUI with no edit under
src/ui", is therefore false today for every command that is neither of those two. The spec's own
Open questions leave the console to the worker, so this is not scope drift; it is the gap between
what the table can do and what the shell can reach, and it is filed as a finding rather than graded.
- proof 2: met — The property holds and pass 1's proof re-runs. What is new this pass is that pass 1's
open finding against the guard is closed and measured closed. The regex at src/ui/surface.test.ts:20
is now /['"`][^'"`]*\/runtime\/([\w.-]+)['"`]/g, any quote style and any bringing-in.
Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass2-verify.json:
(1) "c2 the guard now reads a double-quoted reach off the play surface" adds import "../runtime/state"
to src/ui/driver.ts. KILLED by src/ui/surface.test.ts "reaches the runtime only through the play
surface", re-run at its own file with the mutation still applied and failing there.
(2) "c2 the guard now reads a backticked dynamic reach off the play surface" adds
export const reachState = () => import(`../runtime/state`) — the exact spelling pass 1 recorded as
SURVIVED. KILLED by the same named test, confirmed at its own file.
The structural leg is unchanged: GameState lives behind the module-private WeakMap in
src/runtime/session.ts and is not reachable from src/ui whatever src/ui imports.
The guard's remaining hole is a coverage hole, not a property failure: SOURCES is built from a
non-recursive readdirSync of src/ui filtered by /\.tsx?$/, so nothing in a subdirectory is read at
all. Filed as a finding, and it is the next neighbour of the spelling finding rather than a repeat
of it, because it exempts a file from all four of this test's rules at once.
- proof 3: met — Every string src/ui puts on the screen still comes off a published value: Home renders
view.location.title/description, entity titles, choice labels and details, resource titles and the
transcript; ModalSheet renders option.label and option.values; FloatingText renders note.text.
Pass 1's mutation ("You are in {view.location.title}") remains the re-runnable kill.
The grade is on the property, and the property holds. The proof does not, in two measured places, and
both are the pass-1 finding rather than new ones. Manifest
C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass2-hunt.json:
(a) "c3 a component writes one of the nav's five words as its own prose" replaces Home's location
header with the literal word Character. SURVIVED, escalated
[render.test.tsx "renders nothing a player can read that the engine did not publish" ->
render.test.tsx -> whole suite], 0 failed of 2317. The skip is by VALUE, so it is not confined to the
nav: it lets a narration header this clause does enumerate be replaced by fabricated prose.
(b) "c3 the meter reads out a number the engine never published" replaces the meter readout with the
literal 999/999. SURVIVED at whole-suite scope, 0 failed of 2317, because readable() keeps only runs
matching /[A-Za-z]/.
Free-text fidelity checked and clean: answering the character-creation name option with
"Sir Robin", "A=B", "Bob: the Bold", "Zoe  Two" stores each byte for byte, so the composed
`submit-modal: key=value` line carries no injection or truncation the player could see.
- proof 4: unmet — One of pass 1's two halves is closed; the other still fails, and I reproduced it rather
than accepting the re-filing's reasoning.
CLOSED: "nothing tests that App draws the modal the engine is asking for". render.test.tsx now has
"draws the modal the engine is asking for, and stops once it is answered". Mutation "c4 the shell
stops drawing the modal the engine is asking for" replaces App.tsx's
{asking ? <ModalSheet …/> : null} with {null}: KILLED by that named test, re-run at its own file.
"c4 the shell picks its modal by name" re-KILLED by surface.test.ts "names no modal, so it cannot be
rendering one it knows".
STILL FAILS: "a modal's closing path cannot be lost". The re-filing's reasoning — a driver can only
answer with a value the engine published, so values: [] leaves no answer any driver could render — is
correct, and now executable. Body at
C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass2-c4probe.ts, run with npm run inspect -- -,
over a three-section DSL whose dialogue node holds a menu with every choice gated off:
  modals: [{ name: 'dialogue', options: [{ key: 'choice', label: 'Choice', values: [] }] }]
  worldChoices: 0
  '1'                              -> invalid choice: "1"
  'submit-modal: choice=anything'  -> modal dialogue has no choice that takes "anything"
  'submit-modal: choice='          -> modal dialogue has no choice that takes ""
  stillOpen: 1
So the session is locked for every driver, not only for the one with no console: optionRefusal
refuses every value because [] is truthy and includes nothing, and numberedModalAnswer returns null
because no index is in range. The seam is where publishModal keeps a modal whose one option accepts
nothing, which is why filing it under Runtime is right. Still latent, not live: content/tutorial-
island.dsl puts `when:` on dialogue nodes only, never on a menu choice, and talk() selects the last
node whose `when` is true, so no shipped route reaches it.
One thing the new test does not cover, measured: mutation "c4 the shell keeps drawing a modal the
engine has closed" (fabricates {key:'stuck', values: []} when askedOption returns nothing) was killed
at [render.test.tsx "draws the modal…" -> render.test.tsx] — the named test SURVIVED it, and a
different test in the file made the kill. That test asserts the option's values are gone, not that
the sheet is. A shell keeping an unanswerable sheet up passes it. Filed.
- proof 5: unknown — Nothing in this diff schedules or advances a clock; the-gui-runs-in-real-time is open and
owns it. Unchanged since pass 1, and the pager brought no timer with it: Pager.tsx reads
event.timeStamp and gesture.ts's velocity window is arithmetic over stamps handed in, never a clock
it started. Nobody looked further.
- proof 6: unknown — Not measured, and this clause's own standard is measured rather than asserted. CLAUDE.md
now says a UI feature is tested by the author, not by the agent, so I did not drive a browser. By
reading, the branch did not weaken this since pass 1: every interactive control still carries
min-h-[48px] (Home's Sheet buttons, ModalSheet's buttons, input and submit) or min-h-[52px] (TabBar),
the root is still overflow-hidden, index.html gained viewport-fit=cover and the insets that go with
it, and the pager's swipe is an addition to the tab-bar tap rather than a replacement for it, so no
affordance became gesture-only. Recording met would be asserting exactly what the clause forbids.
- proof 7: unknown — Unchanged in substance since pass 1 and still another record's half. The five tabs are
one nav, each is one tap, and the pager makes each also one swipe from Home. Map, Character, Settings
and Edit are now null panes inside the pager strip rather than one shared empty div — the same empty
frame, five of them instead of one. the-map-and-character-tabs owns the two that must not stay empty.
- proof 8: met — Unchanged and re-measured. src/ui/shippedContent.ts bundles content/*.dsl through
import.meta.glob with query:'?raw', eager, filtering the play-cli local-changes module out;
surface.test.ts "asks nothing of a network or a filesystem" holds every src/ui module against
/fetch\(|XMLHttpRequest|public\/content/; public/content/ is not reintroduced. Mutation
"c8 the build stops carrying the shipped DSL" points the glob at a suffix nothing matches: KILLED by
src/ui/shippedContent.test.ts "bundles the shipped DSL as text, with no path left for the browser to
fetch", re-run at its own file with the mutation still applied and failing there.
- proof 9: unknown — No window.__test anywhere under src/, unchanged since pass 1.
the-agent-harness-returns-to-the-gui is open and owns it. Nobody looked further.
- proof 10: met — Unchanged and re-measured. src/ui/transient.ts publishes TransientNote as {id, text} and
nothing else; src/ui/FloatingText.tsx renders channel.notes() with no way to ask what produced any of
them; the channel takes its expiry scheduler as a parameter so its test drives a fake clock. Mutation
"c10 a transient note learns where it came from" adds a moment:'xp' field: KILLED by
src/ui/transient.test.ts "carries any text at all, and nothing about where it came from", re-run at
its own file with the mutation still applied and failing there. The XP instance is still not wired,
as the clause requires.

### Pass 3 — 2026-08-11

- base: `c59b0a0d7820ee9ef3afaa2601065d32a2b57279`
- head: `f24fc80d6263108f1eed8d1da97823266c5a7ad1`
- proof 1: unmet — Graded unmet rather than unknown: I looked at both sentences and both fail, measurably.
Sentence 1, "the same ordered messages": the two session containers now demonstrably disagree, and
the branch knows it — it filed play-cli-loses-the-narration-a-live-run-produced rather than fixing
it. Reproduced independently, body at
C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass3-c1messages.ts, run with npm run inspect -- -
over a four-second action whose on-success says a line. Both drivers reach the same state; the say
rides on the completing tick's view and view() drains it behind that read. src/ui/driver.ts advance()
appends logging(progress.view) every tick, so the GUI's transcript ends
[place:Workshop, describe:A bench and a lathe., said:A spindle comes off the lathe.].
scripts/play-cli.ts runLiveAction prints only formatLive(progress), which is label, bar and clock and
carries no said, and then run.end(false)'s view.said is []. The engine's line never reaches the
terminal. Manufacturing a per-tick view output is the GUI container's decision, not its renderer's,
so this is c1's territory and not the renderer exclusion the spec's Decision carves out.
Sentence 1, "one scripted sequence replayed through both": still not written. The nearest thing,
src/ui/driver.test.ts:212, compares the GUI driver against newContext/runLine/tick/end written inside
the test, not against scripts/play-cli.ts, which src/ui may not import. Filed as a finding.
Sentence 2, "a command added to the shared table is dispatchable from the GUI with no edit under
src/ui": unchanged since pass 2 and still false. grep for `.send(` across src/ returns exactly one
hit, src/ui/driver.test.ts:203; no component calls it, so the GUI dispatches two spellings, `<N>` and
`submit-modal: key=value`, plus the new cancel, which is a run control rather than a command.
gui-rebuild-pass2-the-gui-can-dispatch-two-spellings-and-has is open against it.
What this branch did not break: the run does not filter commands. Mutation entry "c1 the GUI refuses
a dispatch while a run is under way" turns `if (running) close(true)` into `if (running) return` in
src/ui/driver.ts. KILLED by src/ui/driver.test.ts "stops the run under way before a command that is
not a choice at all", re-run at its own file. The late reversal is uniform over every dispatch rather
than special-cased by spelling, so no command is refused; the run under way is.
- proof 2: met — Both legs re-run, and the second is new this pass because the branch added a file.
(1) Path rule: src/ui/surface.test.ts "reaches the runtime only through the play surface" now sweeps
src/ui/live.ts and src/ui/LiveSheet.tsx as well. Mutation manifest
C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass3-clock-and-run.json, entry "c2 the GUI's
clock module reaches the runtime off the play surface", adds import "../runtime/state" to the new
src/ui/live.ts. KILLED by that named test, re-run at its own file with the mutation still applied and
failing there.
(2) Value rule, added by this branch: surface.test.ts "brings in only what a driver dispatches
through, so it cannot advance a clock of its own" holds every named value import off the play surface
to DISPATCHES. This matters more than it looks, because wait, apply, beginAction and cancelAction are
all exported from src/runtime/session, which the path rule already allows: the path rule cannot see
them and this is the only thing that can. Entry "c5 src/ui reaches for the runtime's own wait" adds
import { wait } from '../runtime/session' to src/ui/live.ts. KILLED by that named test, re-run at its
own file.
Structural leg unchanged: GameState stays behind the module-private WeakMap in src/runtime/session.ts
and is unreachable from src/ui whatever src/ui imports.
The value rule's own hole is measured and filed rather than left to be rediscovered: it reads only
`import { x } from`, so a dynamic destructured import reaches wait past it. See the finding.
- proof 3: met — The diff adds exactly one new prose surface, src/ui/LiveSheet.tsx, and the c3 guard was
extended to walk it. src/ui/render.test.tsx "renders nothing a player can read that the engine did
not publish" now arms the tutorial's roast-chestnuts action, renders App with the run on screen, then
cancels; and whatStoppingSays() takes "Stopped." off a session of its own rather than typing the word
into the test.
Mutation entry "c3 the run's sheet writes a label of its own" replaces LiveSheet's {progress.label}
with the literal "Working on it". KILLED by that named test, re-run at src/ui/render.test.tsx with
the mutation still applied and failing there.
Everything else LiveSheet draws is engine-published too: pool titles come off LiveProgress.pools, the
label off the run.
Pass 1's two exemptions still stand and this branch enlarges the second rather than closing it: the
stop control is the glyph U+2715, the implicit-attempt row reads U+00D7 followed by a count, and both
Meter readouts are digits and a slash, so readable()'s /[A-Za-z]/ filter cannot see any of them. That
is the pass-1 finding "c3's guard exempts by value what the clause exempts by nothing", not a new one.
- proof 4: unmet — Unchanged by this branch, and the half that fails is Runtime's. Re-measured what holds.
Holds, and re-measured because the diff edits src/ui/App.tsx: mutation entry "c4 the shell stops
drawing the modal the engine is asking for" replaces the ModalSheet render with {null}. KILLED by
src/ui/render.test.tsx "draws the modal the engine is asking for, and stops once it is answered",
re-run at its own file.
Holds: no modal id appears as a literal — src/ui/surface.test.ts "names no modal, so it cannot be
rendering one it knows" now sweeps src/ui/live.ts and src/ui/LiveSheet.tsx too, and neither names one.
Still fails, and I checked rather than assuming: pass 2's reproduction is untouched by this diff. The
only change to src/ui/ModalSheet.tsx is the .unbarred class on the values scroller; the branch of the
render that draws from option.values is byte-identical, and [] is still truthy, so an option whose
value list is empty still draws a sheet with no control on it. Nothing in this range touches
src/runtime/modals.ts or publishModal. gui-rebuild-clause-4 is the open undelivered record.
New this pass and checked clean: the run and the modal do not fight. A modal asked while a run is
under way draws over Home, and driver.answer goes through send, which does close(true) before
runLine, so the run is stopped and the modal is answered by the same tap. The closing path is not
lost by the addition.
- proof 5: met — Nine mutations, manifest at
C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass3-clock-and-run.json; eight killed, one
survivor which bounds the grade.
Advances simulated time from real elapsed time: "c5 the GUI advances a run by the interval it asked
for rather than the time that passed" makes src/ui/live.ts hand over everyMs instead of now - last.
KILLED by src/ui/live.test.ts "hands over the time that actually passed, not the interval it asked
for", re-run at its own file.
Through the shared clock: "c5 the GUI ticks at a cadence of its own rather than the shared one"
defaults createTicker to 200 instead of LIVE_TICK_MS. KILLED by src/ui/live.test.ts "ticks at the
cadence the command surface publishes, so both drivers round the same way", re-run at its own file.
LIVE_TICK_MS is now exported from src/runtime/command.ts beside LiveRun and both drivers import it.
Arms rather than resolves: "c5 the GUI resolves a spannable action instead of arming it" flips
driving to false in src/ui/driver.ts. KILLED by src/ui/driver.test.ts "arms a spannable action rather
than resolving it, and reports the run before any time passes", re-run at its own file.
Shows its progress: "c5 the run takes the choices away while it lasts" gates the Sheet on !live in
src/ui/Home.tsx. KILLED by src/ui/render.test.tsx "draws the run above the choices, which it does not
withdraw", re-run at its own file. That test also fixes the author's late reversal in place: the run
draws above the world's choices, outside the scroller, and they stay tappable.
Can be cancelled: "c5 the run cannot be cancelled, only completed" makes driver.cancel call
close(false). KILLED by src/ui/driver.test.ts "cancels on request, keeping the time already spent and
saying so in the engine words", re-run at its own file. And "c5 the GUI leaves its timer running
after the run is over" deletes stopTicking?.() from close: KILLED by src/ui/driver.test.ts "closes the
run when the action finishes, stops the ticker and gives the choices back", re-run at its own file.
Nothing under src/ui schedules resolve or wait on a clock of its own: "c5 src/ui reaches for the
runtime's own wait" adds import { wait } from '../runtime/session' to src/ui/live.ts. KILLED by
src/ui/surface.test.ts "brings in only what a driver dispatches through, so it cannot advance a clock
of its own", re-run at its own file. src/ui/live.ts's setInterval is not a clock of its own in the
clause's sense: it reads elapsed wall time and hands the number to the LiveRun the command surface
armed, which is the only thing that calls wait.
The same state over the same elapsed span: src/ui/driver.test.ts "reaches the state the REPL live
path reaches over the same elapsed span" replays [200, 200, 750, 3000, 200] through both and asserts
the two PlayViews are equal. I checked what that test can fail on, and it is the GUI wrapper only.
Its REPL side is newContext/runLine/tick/end written inside the test, not scripts/play-cli.ts, which
src/ui cannot import. Mutation "c5 the REPL advances its run by the interval it asked for rather than
the time that passed" replaces play-cli's `const elapsedMs = now - lastTick;` with LIVE_TICK_MS:
SURVIVED, escalated [scripts/play-cli.test.ts to whole suite], 0 failed of 2340. Filed as a finding.
The property holds today by reading — scripts/play-cli.ts runLiveAction reads Date.now() twice and
passes the difference, and ticks on the imported LIVE_TICK_MS — so this is graded met on the
property, with the REPL half of its proof recorded as absent rather than assumed.
- proof 6: unknown — Not measured, and this clause's own standard is measured rather than asserted, so
unknown is the honest grade for a third pass running. CLAUDE.md's rule that a UI feature is tested by
the author, not by the agent, is why no browser was driven; the author has manually accepted the
surface, but acceptance is not the 375x812 measurement this clause asks for.
By reading, the branch did not weaken it. The one new interactive control, LiveSheet's stop, carries
min-h-[48px] min-w-[48px]; the run sits in the bottom pane above the action sheet, so it is in the
bottom third with the controls used every turn; and it is a tap with no hover, right-click or
keyboard path.
One thing I checked that is not obvious from reading and that the eventual measurement should
include: LiveSheet is shrink-0 inside the bottom pane, so in an encounter with several pool meters it
wins the space fight against the choices scroller. At SPLIT_MAX (0.85, src/ui/gesture.ts) the pane is
roughly 96 CSS px on a 375x812 screen and the sheet is taller than that. The stop control survives it
— it is in LiveSheet's first row, so it stays at the top of the pane — and only the pool meters below
it are clipped by the shell's overflow-hidden root. Not filed, because the clause is about touch
targets, horizontal scroll and affordance kind, and none of those is what this is.
- proof 7: deferred — Deferred rather than unmet, because the goal — the game becomes playable by a person on
a phone — holds with Home alone, and the missing half is another open record's.
Checked: the five tabs are one nav in src/ui/TabBar.tsx and each is one tap and one swipe; Home is
the narrative log, the action sheet and now the live run above it. Map, Character, Settings and Edit
are still null panes — src/ui/App.tsx line 16, `TABS.map((tab) => (tab.id === 'home' ? <Home .../> :
null))` — so the discovered-location graph and the published inventory this clause asks for are not
drawn. the-map-and-character-tabs [task/open/medium] owns the two that must not stay empty; Settings
and Edit are empty by the spec's own Decision.
Re-run by reading src/ui/App.tsx: the clause is met the moment that ternary stops being the whole
pane map.
- proof 8: met — Unchanged by this diff and re-measured cheaply. git diff c59b0a0..HEAD touches neither
src/ui/shippedContent.ts nor public/, and public/content/ is still absent from the tree.
src/ui/shippedContent.ts still bundles content/*.dsl through import.meta.glob with query '?raw',
eager. The re-runnable guard now covers the branch's two new modules as well, because
src/ui/surface.test.ts "asks nothing of a network or a filesystem" sweeps every module under src/ui
and src/ui/live.ts and src/ui/LiveSheet.tsx are in it — neither reaches a network, and the ticker's
only effect is setInterval.
Pass 2's mutation still stands as the kill: "c8 the build stops carrying the shipped DSL" points the
glob at a suffix nothing matches, KILLED by src/ui/shippedContent.test.ts "bundles the shipped DSL as
text, with no path left for the browser to fetch".
- proof 9: deferred — Deferred rather than unmet, because a dev-only agent harness is not on the path to the
goal — the game is playable on a phone without one — and the-agent-harness-returns-to-the-gui
[task/open/medium, BLOCKED] owns it.
Checked, and this is the third pass to check it: grep for __test across src/ returns nothing. No
window.__test, no registration point, no batch entry. Nothing in this diff moved it either way.
Re-run: grep -rn "__test" src/.
- proof 10: met — Unchanged by this diff and confirmed unchanged: git diff c59b0a0..HEAD names neither
src/ui/transient.ts nor src/ui/FloatingText.tsx. TransientNote is still {id, text} and nothing else,
FloatingText still renders channel.notes() with no way to ask what produced any of them, and the
channel still takes its expiry scheduler as a parameter.
The new clock does not become a second channel: src/ui/live.ts hands elapsed milliseconds to a run
and publishes no note, and src/ui/App.tsx still mounts FloatingText with driver.transient.
Pass 2's mutation re-runs: "c10 a transient note learns where it came from" adds a moment:'xp' field,
KILLED by src/ui/transient.test.ts "carries any text at all, and nothing about where it came from".
The XP instance is still not wired, as the clause requires.

### Pass 4 — 2026-08-11

- base: `c59b0a0d7820ee9ef3afaa2601065d32a2b57279`
- head: `d992f794822d784b2b49f0effc748e1fc9b81efb`
- proof 1: unmet — Graded unmet: three sentences, one fixed, two still failing, all measured.
FIXED and now watched. Pass 3 graded c1 unmet partly on "the same ordered messages": the GUI logged
the completing tick's view and play-cli printed only the bar, so the engine's say never reached the
terminal. play-cli's live loop is now the exported driveRun (scripts/play-cli.ts:215) over the shared
createTicker, and formatTick returns [...progress.view.said, formatLive(progress)]. Manifest
C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass4-map-nav-and-sheet.json, entry "c1 the REPL
loses the line the world said as a tick passed", strips the said lines back out: KILLED by
scripts/play-cli.test.ts "prints what the world said as a tick passed, above the bar and not over it",
re-run at its own file with the mutation still applied and failing there. The other end, entry "c1 the
GUI loses the line the world said as a tick passed", removes driver.ts's per-tick logging: KILLED at
src/ui/driver.test.ts by "closes the run when the action finishes, stops the ticker and gives the
choices back". Both drivers now speak the same lines.
STILL FAILS, sentence 1: "one scripted sequence replayed through the REPL's driver and through the
GUI's leaves byte-identical serialized state". Not written. The nearest thing is src/ui/driver.test.ts
:211, which builds its REPL side out of newContext/runLine/tick/end inside the test and compares two
PlayViews, not two serialized states. What changed this pass is that the excuse is gone: driveRun is
exported and takes its ticker as a parameter, and scripts/ sits above src/ui in the layer order, so a
test in scripts/ may import both containers and drive them off one script. Nothing does.
STILL FAILS, sentence 2: "a command added to the shared table is dispatchable from the GUI with no
edit under src/ui". Re-measured: grep -rn "\.send(" src/ excluding tests returns nothing. The GUI
dispatches two spellings, "<N>" and "submit-modal: key=value", plus cancel, which is a run control.
gui-rebuild-pass2-the-gui-can-dispatch-two-spellings-and-has is the open record; not re-filed.
gui-rebuild-clause-1 is the open undelivered record.
- proof 2: met — Both rules re-measured on the modules this branch added, and the guard itself is stronger
than it was on pass 3.
Structural leg unchanged: GameState lives behind the module-private WeakMap in src/runtime/session.ts
and is unreachable from src/ui whatever src/ui imports.
Path rule, manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass4-map-nav-and-sheet.json,
entry "c2 the map reaches the runtime off the play surface", adds import '../runtime/state' to
src/ui/MapPane.tsx, the largest module in the diff. KILLED by src/ui/surface.test.ts "reaches the
runtime only through the play surface", re-run at its own file with the mutation still applied and
failing there.
Value rule, entry "c2 the map's pure half brings in something that moves the world", adds
import { wait } from '../runtime/session' to src/ui/discovery.ts. KILLED by src/ui/surface.test.ts
"brings in only what a driver dispatches through, so it cannot advance a clock of its own", re-run at
its own file.
Two holes earlier passes filed are closed and the closes are executable. Pass 2's subdirectory hole is
gone: SOURCES is built by a recursive modulesUnder, and src/ui/surface.test.ts "descends, so a module
in a directory is held to every rule below" proves it against a temporary tree rather than against the
tree it happens to be run on. Pass 3's dynamic-destructured-import hole is gone: MOVES_THE_WORLD reads
the call rather than the import, so (await import('../runtime/session')).wait(...) is caught by the one
spelling that cannot be avoided.
One thing the next pass should weigh rather than rediscover: MOVES_THE_WORLD is
/\b(wait|apply|applyDirective|beginAction|cancelAction|submitModal)\s*\(/ over raw text, so any future
src/ui module that writes fn.apply( or names a local helper apply fails a rule it is not breaking, and
there is no escape hatch. Not filed, because nothing in the tree trips it today.
- proof 3: met — Met on the property, and pass 1's exemption finding is now measured closed rather than
argued closed. The exemption did not vanish, though; it moved, and it grew from five words to nine.
CLOSED and measured: pass 2's mutant (a) replaced a narration header with one of the nav's own words
and SURVIVED, because the guard skipped those words by VALUE wherever they appeared. The skip is now
by REGION -- src/ui/render.test.tsx excises the <nav> element and asserts its runs equal the current
layer's labels exactly. Manifest audit-gui-rebuild-pass4-map-nav-and-sheet.json, entry "c3 a component
outside the nav writes one of the nav's own words", replaces src/ui/LocationBanner.tsx's title with the
literal "Settings": KILLED by src/ui/render.test.tsx "renders nothing a player can read that the engine
did not publish", re-run at its own file. The identical mutant SURVIVED on pass 2.
The new prose surface this pass is the same file, and it is held: entry "c3 the new banner writes prose
of its own" makes the location banner read "You are in {title}". KILLED by the same named test.
The published set the test compares against widened this pass to include the four dictionaries' keys
and each place's id, because the character sheet and the map draw keys where a word belongs. That is
the engine's own published value, so the widening is correct, and the record that owns the words is
the-view-publishes-ids-where-the-content-wrote-titles, declined by the author 2026-08-11 and triggered
on reimplement-localization.
WHAT THE GRADE DOES NOT COVER, and it is measured: the nav region is excised whole and compared against
LAYERS, which is the structure under test, so the tab labels are outside this clause however they are
worded. Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass4-nav-prose.json renames Home
to "Sanctuary of the Ninth Dawn": SURVIVED, escalated
[render.test.tsx "renders nothing a player can read that the engine did not publish" -> render.test.tsx
-> whole suite], 0 failed of 2422. c3's last sentence, "there is not one", is false as written and has
been since the shell shipped; the nav went from five such words to nine this pass. Filed, with the
fault on the clause rather than on the branch.
- proof 4: unmet — Unchanged by this branch, and I re-measured both halves rather than carrying pass 3's
grade forward.
STILL FAILS, and the failure is Runtime's: git diff c59b0a0..d992f79 -- src/runtime/modals.ts is empty.
src/runtime/modals.ts:167 still reads if (option.values && !option.values.includes(value)), so an
option published with values: [] is truthy, accepts nothing, and keeps the modal open with no control
on the sheet and no answer any driver could give. src/ui/ModalSheet.tsx's values branch is byte-
identical but for the .unbarred class and the submit control's aria-label. Pass 2's reproduction at
C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass2-c4probe.ts still applies unchanged.
gui-rebuild-clause-4 is the open undelivered record.
HOLDS, re-measured because this branch rewrote App.tsx around it: manifest
C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass4-carried-forward.json, entry "c4 the shell
stops drawing the modal the engine is asking for", replaces the ModalSheet render with {null}. KILLED
by src/ui/render.test.tsx "draws the modal the engine is asking for, and stops once it is answered",
re-run at its own file with the mutation still applied and failing there.
HOLDS: no modal id appears as a literal, and the sweep that says so now walks nine more modules --
MapPane, VStack, nav, discovery, sheet, Ledger, LocationBanner, StatusBanner, Meter -- because
src/ui/surface.test.ts descends into directories and reads every .ts/.tsx beneath src/ui. None names
one. The hand-copied MODAL_IDS list is still the open finding
gui-rebuild-pass1-the-modal-id-check-is-a-hand-copied-list-w.
New and checked clean: the modal draws over the whole VStack rather than inside a layer, so no layer or
subpage can hide it, and driver.answer still routes through send, which closes a live run first.
- proof 5: met — Met, and re-aimed, because pass 3's proof no longer exists. Pass 3 measured this clause at
src/ui/live.ts and src/ui/live.test.ts; commit b5a2a71 deleted both and moved the ticker down to
src/runtime/command.ts, so every mutation pass 3 recorded for c5 refuses to apply today. The next pass
should read pass 3's c5 entry as history and this one as the live proof.
Advances simulated time from real elapsed time: manifest
C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass4-map-nav-and-sheet.json, entry "c5 the shared
ticker advances a run by the interval it asked for", replaces const elapsedMs = now - last with
everyMs in src/runtime/command.ts. KILLED by src/runtime/command.test.ts "hands over the time that
actually passed, not the interval it asked for", re-run at its own file with the mutation still applied
and failing there.
Through the shared clock: entry "c5 the two drivers tick at cadences that only happen to agree"
defaults createTicker to 200 rather than LIVE_TICK_MS. KILLED by src/runtime/command.test.ts "ticks at
the cadence the command surface publishes, so both drivers round the same way", re-run at its own file.
The REPL half, which pass 3 recorded as an unmeasured SURVIVED and filed: closed. play-cli's live loop
is the exported driveRun (scripts/play-cli.ts:215), it takes the ticker as a parameter, its default is
the same createTicker the GUI takes, and scripts/play-cli.test.ts "play-cli drives a live run" has four
tests over it. Entry "c1 the REPL loses the line the world said as a tick passed" is KILLED there, so
the loop is watched at its own file for the first time.
Nothing under src/ui schedules resolve or wait on a clock of its own: the value-rule kill recorded
under c2 covers it, and MOVES_THE_WORLD now catches the call as well as the import.
The bar reads the cadence rather than restating it: src/ui/Meter.tsx builds FILL_TRANSITION from
LIVE_TICK_MS and src/ui/render.test.tsx "moves a bar over exactly one tick of the cadence both drivers
read" asserts the rendered duration against it, which closes pass 3's finding that the figure was
spelled a second and third time as a Tailwind duration.
Bound on the grade, carried from c1 and not re-filed here: the cross-driver equality test at
src/ui/driver.test.ts:211 still builds its REPL side inside the test rather than driving driveRun.
- proof 6: unmet — Graded unmet rather than a fourth unknown, because one of the five properties this clause
says it will be measured on is measurable without a browser, and it fails.
THE STRUCTURAL HALF HOLDS, and is proven. Manifest
C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass4-map-nav-and-sheet.json:
(1) "c6 a banner is a handle in one direction only" makes across() return the boundary whichever layer
the player is on. KILLED by src/ui/nav.test.ts "crosses a banner to whichever of its two layers the
player is not on", re-run at its own file.
(2) "c6 a layer re-entered opens on wherever the player was last, not on its own page" writes the
subpage into the standing layer's slot. KILLED by src/ui/nav.test.ts "remembers each layer separately,
so one page is never mistaken for another", re-run at its own file.
(3) "c6 the shared banner is paid for twice" steps the column down a whole screen per layer. KILLED by
src/ui/nav.test.ts "steps down by a screen less the banner it crossed, so the banner is not paid for
twice", re-run at its own file. That is the one-banner-not-two claim, in arithmetic.
THE MEASURED HALF, property by property, so the next pass knows what was and was not looked at.
(a) "every interactive control's touch target is at least 44 CSS pixels on its shorter side": MEASURED,
FAILS. src/ui/MapPane.tsx:255 draws each place as a button with px-3 py-2 text-xs and no min-h or
min-w. Under tailwindcss 3.4 that is a 16px line box plus 8px of padding each side plus 2px of border:
34 CSS px tall. The branch's own fixture agrees -- src/ui/discovery.test.ts:239 pins
BUBBLE = { width: 150, height: 34 }. It is worse under zoom, because the bubbles sit inside the
scale() transform at src/ui/MapPane.tsx:223, so at ZOOM_MIN (0.4) the target is 13.6 CSS px. It is the
one control in the tree without a floor: Home's sheet buttons carry min-h-[44px], ModalSheet's buttons,
input and submit min-h-[48px], TabBar min-h-[52px], LiveSheet's stop min-h-[48px] min-w-[48px], the
Splitter min-h-[44px], both banners min-h-[48px], and the plane picker in this same file
min-h-[44px] min-w-[44px]. Re-run: grep -rn "<button" src/ui/*.tsx and read the class list beside each.
Nothing tests it -- grep for 44, min-h or touch across every test under src/ui returns nothing. Filed.
(b) "no affordance requires hover, a right-click or a keyboard": checked by reading, holds. Every
control is a <button> or an <input>; onMouseDown handlers all guard on event.button !== 0.
(c) "no layer or subpage is reachable only by a gesture": checked by reading, holds. Each banner is a
<button> whose onClick calls across(), and the tab bar's entries are buttons; the drags in VStack and
Pager are additions to those taps, not replacements.
(d) "the controls used every turn sit in the bottom third": checked by reading, holds. The action sheet
is the bottom pane of Home's split and the tab bar is fixed below the VStack.
(e) "nothing in the tutorial route scrolls the page horizontally": NOT MEASURED. The root is
overflow-hidden and the pagers translate rather than scroll, but that is reading, not the measurement
the clause asks for, and CLAUDE.md's testing procedure is why no browser was driven.
So: unmet on (a), unknown on (e), holding on the rest. Unmet rather than deferred because the goal is a
game playable on a phone and this clause is the whole of what makes it one; the fix is a floor on one
control and a test that holds every control to it.
- proof 7: met — Pass 3 deferred this because Map and Character were null panes. They are not any more, and
seven mutations bound the grade with two survivors that are filed rather than swept up.
All entries in C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass4-map-nav-and-sheet.json.
"one z-plane at a time, plus whatever sits off that plane and is adjacent to the player": entry "c7 the
map hides the way out of the room the player is standing in" drops the here/reachable terms from
sheetAt. KILLED by src/ui/discovery.test.ts "draws a place off the plane only when the player could
step to it from here", re-run at its own file. It cycles between the planes through the picker at
src/ui/MapPane.tsx:268, drawn only when the world has more than one.
"cannot be panned away from what it is drawing": entry "c7 the map can be panned away from what it is
drawing" removes the clamp. KILLED by src/ui/discovery.test.ts "lets the furthest place be dragged to
the middle, and no further", re-run at its own file.
"draws the discovered locations ... with the roads between them", at the component and not only in the
pure module: entry "c7 the map stops drawing the places the engine published" empties sheet.nodes.
KILLED by src/ui/render.test.tsx "draws the discovered places where they are, with the roads between
them", re-run at its own file. That test reads MapPane's own data-place markup and asserts one <line>
for a mutual pair.
Tapped to set off, through the engine's own offer: entry "c7 a tap on a place dispatches the offer
before the one that leads there" takes one off the dispatch position. KILLED by src/ui/discovery.test.ts
"answers with the position a driver dispatches it at, counting from one", re-run at its own file.
"Character renders the published inventory, equipment, skills and stats": entry "c7 the character sheet
stops reading the published stats" hands Ledger an empty list. KILLED by src/ui/render.test.tsx "draws
what the player is carrying, and what they are made of, on the sheet", re-run at its own file.
The runtime half the map draws from, three kills at src/runtime/session.test.ts, each re-run at its own
file: "c7 a place the roads reach is never discovered by walking to it" (killed by "reveals what a way
was shutting the moment it opens, without leaving the room"), "c7 the map leaks the shape of what has
not been found" (killed by "carries how the discovered places connect, which is the other half of a
map"), "c7 every road is drawn as open, whether or not it can be walked" (killed by "says a road is
shut rather than hiding it, once both of its ends are known").
Settings and Edit are still null panes beside Home, which is the spec's own Decision.
TWO SURVIVORS BOUND THIS GRADE, both at whole-suite scope, 0 failed of 2422, both filed:
"c7 the map draws every place on top of every other" zeroes MapPane's pixels() and nothing notices, so
"each at its own published position" is proven in drawnAt and unproven in the component that draws it.
"c7 the map stops acknowledging a place that has just arrived" forces arrived to false and nothing
notices, so "acknowledges a newly discovered one" has no coverage at all -- newlyFound is tested, and
the wiring from it to something a player sees is not.
Read "every destination is one move from Home" as one move per layer: Map and Character are each one
banner tap, Settings and Edit one tab tap; Character's four subpages are then horizontal, which is what
c6 settled.
- proof 8: met — Unchanged by this diff and re-measured rather than assumed. git diff c59b0a0..d992f79 --
src/ui/shippedContent.ts public/ is empty, and public/content/ is absent from the tree.
Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass4-carried-forward.json, entry "c8 the
build stops carrying the shipped DSL", points import.meta.glob at a suffix nothing matches. KILLED by
src/ui/shippedContent.test.ts "bundles the shipped DSL as text, with no path left for the browser to
fetch", re-run at its own file with the mutation still applied and failing there.
The no-network rule now covers nine more modules than it did on pass 3, because src/ui/surface.test.ts
"asks nothing of a network or a filesystem" is built from a recursive sweep: MapPane, VStack, nav,
discovery, sheet, Ledger, Meter and both banners are all in it, and none reaches a network or a
filesystem. MapPane's only host reach is window.location.search, read once at module load for the
?debug box at src/ui/MapPane.tsx:9.
- proof 9: deferred — Deferred rather than unmet, for the same reason pass 3 gave and which still holds: a
dev-only agent harness is not on the path to the goal -- the game is playable on a phone without one --
and the-agent-harness-returns-to-the-gui [task/open/medium] owns it.
Checked, and this is the fourth pass to check it: git grep -n "__test" d992f79 -- src/ returns nothing.
No window.__test, no registration point, no batch entry, and nothing in this range moved it either way.
Re-run: grep -rn "__test" src/.
- proof 10: met — Unchanged by this diff and confirmed unchanged: git diff --stat c59b0a0..d992f79 --
src/ui/transient.ts src/ui/FloatingText.tsx is empty. TransientNote is still {id, text} and nothing
else, FloatingText still renders channel.notes() with no way to ask what produced any of them, the
channel still takes its expiry scheduler as a parameter, and src/ui/App.tsx:76 still mounts
FloatingText with driver.transient inside <main>, so it survived the nav rebuild that moved everything
around it.
Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass4-carried-forward.json, entry "c10 a
transient note learns where it came from", adds a moment: 'xp' field to the note. KILLED by
src/ui/transient.test.ts "carries any text at all, and nothing about where it came from", re-run at its
own file with the mutation still applied and failing there.
The XP instance is still not wired, as the clause requires, and the new clock did not become a second
channel: src/runtime/command.ts's ticker hands elapsed milliseconds to a run and publishes no note.

### Pass 5 — 2026-08-11

- base: `c59b0a0d7820ee9ef3afaa2601065d32a2b57279`
- head: `df68ee77a3fca0e0dc06b23162c7e9f582b5b89d`
- proof 1: met — Both sentences pass 4 recorded as still failing are now closed, and the proof is executable.
The proof is scripts/drift.test.ts, which drives the REPL's own container rather than a copy of it:
scripts/play-cli.ts now exports openRepl (line 409) and drift.test.ts:21 opens that beside
createDriver, armed the same way (driving: true on both). inStep compares, per line and not at the
end, gui.serialized() against serializeSession(repl.context.session) and the GUI's transcript
against appendOutputs(before, result.output) -- so a divergence that cancels itself out still names
the line it happened on.
Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass5-mutations.json.
"c1 the GUI says something other than what the REPL said" drops message outputs from the GUI's
transcript append: KILLED by scripts/drift.test.ts "reaches byte-identical state and says the same
things, over a scripted sequence", re-run at its own file with the mutation still applied and
failing there.
"c1 the two drivers are armed differently, so one resolves what the other arms" flips the GUI's
driving flag to false: KILLED, escalated to the suite, and confirmed at src/ui/driver.test.ts and
src/ui/render.test.tsx with the mutant still applied.
Sentence 2, "a command added to the shared table is dispatchable from the GUI with no edit under
src/ui": the corpus is read off COMMANDS itself (drift.test.ts:62), each entry dispatched bare and
with an argument, with the three shape-named entries given one line each of that shape -- so a
command added tomorrow is replayed on the day it exists and nobody edits drift.test.ts or src/ui.
The player's route in is src/ui/Console.tsx, whose only transform is consoleLine.typed (trim, and
refuse the empty line). Mutation "c1 the GUI filters a command the shared table defines" adds an
early return for any line beginning with a slash to driver.send: KILLED by drift.test.ts
"dispatches every entry in the shared table the way the REPL does", re-run at its own file.
TWO BOUNDS, neither re-filed as a defect against the property:
(a) the comparison is at CommandResult.output, which is upstream of play-cli's own printing layer --
    the exact seam pass 3's lost-narration divergence lived in. scripts/play-cli.test.ts covers the
    printing separately; nothing joins the two.
(b) openRepl is called with no authoring context, so the one capability the REPL has and the GUI
    structurally cannot -- /local, /create-test, the editing half of /dsl -- is removed from the
    REPL side before the comparison is made. Filed as a finding, fault on the clause.
- proof 2: met — Both rules re-measured on the two modules this branch added that take input, and the
structural leg is unchanged: GameState stays behind the module-private WeakMap in
src/runtime/session.ts and is unreachable from src/ui whatever src/ui imports.
Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass5-mutations.json.
Path rule: "c2 the console reaches the runtime off the play surface" adds import '../runtime/state'
to src/ui/Console.tsx, the module that takes a typed line straight from the player. KILLED by
src/ui/surface.test.ts "reaches the runtime only through the play surface", re-run at its own file
with the mutation still applied and failing there.
Call rule: "c2 the harness moves the world rather than dispatching through it" adds a wait( call to
src/ui/testHarness.ts, the one new module whose whole job is to let something else drive. KILLED by
src/ui/surface.test.ts "calls nothing that moves the world, however the name reached it", re-run at
its own file.
The sweep is recursive and covers src/main.tsx, so the nine modules this branch added -- Console,
consoleLine, labels, testHarness, journey's renderer half, phone's fixtures aside -- are all in it.
- proof 3: met — Met on the property, and the exemption pass 1 found by value and pass 4 found by region
is now a table with a rule of its own.
Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass5-mutations.json.
"c3 a component writes a word of its own outside the vocabulary table" makes src/ui/LocationBanner
read "You are in {title}": KILLED by src/ui/render.test.tsx "renders nothing a player can read that
the engine did not publish", re-run at its own file with the mutation still applied and failing
there. The test now compares against Object.values(LABELS) taken as a set rather than excising the
<nav> region, so the pass-4 hole -- a word inside the excised region could be reworded freely -- is
closed by construction: the words are checked wherever they appear and nowhere else may write one.
"c3 the shell's own vocabulary escapes the one table it lives in" replaces {LABELS.run} in
src/ui/Console.tsx with the literal 'Run': KILLED by src/ui/surface.test.ts "writes each of the
shell's own words in the table and nowhere else", re-run at its own file.
The clause's last sentence, "there is not one", remains false as written -- src/ui/labels.ts holds
ten words, one more than pass 4 counted, because the console's field and button needed names. That
is pass 4's finding gui-rebuild-pass4-c3-says-the-player-reads-no-string-the-eng, which this branch
closed the right way: a stated boundary in one file with an executable rule, rather than a longer
exclusion list. Not re-filed.
- proof 4: met — Pass 1 opened this and passes 2, 3 and 4 all reproduced it; it is now closed at the
seam and watched from every side.
The fix is in src/runtime/modals.ts:191, frameProblem: an option whose value list is empty is a
frame no answer can take down, so pruneModals drops it. Both entry points that move the world with a
stack up now settle it -- src/runtime/session.ts:513 (applyDirective) and :490 (submitModal).
Pass 2's reproduction re-run unchanged, npm run inspect --
C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass2-c4probe.ts, over a dialogue whose every
menu choice is gated off: modals: [], worldChoices: 1, stillOpen: 0. The screen with no control on
it is gone and the world's choices come back.
Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass5-mutations.json, three entries,
each KILLED by src/runtime/modals.test.ts "never leaves a menu standing that offers nothing, however
it came to offer nothing", each re-run at its own file with the mutation still applied and failing
there: "c4 an option that accepts nothing is left standing" (the frameProblem test itself), "c4 a
move of the world leaves the frame it stranded standing" (the prune in applyDirective), "c4
answering leaves behind a frame no answer takes down" (the prune in submitModal, which is the GUI's
own route). That one test walks all four ways in -- talked into, emptied under the player while it
is up, reached by answering the menu above it, and carried in by a save -- which is the neighbour
hunt rather than the reproduction.
The other two halves re-measured because the branch rewrote around them: no modal id appears as a
literal, and src/ui/surface.test.ts:144 now reads MODAL_NAMES off src/runtime/modals.ts:71 rather
than a hand-copied list, which closes gui-rebuild-pass1-the-modal-id-check-is-a-hand-copied-list-w.
"draws the modal the engine is asking for, and stops once it is answered" is unchanged and its
pass-4 kill stands.
ONE BOUND, unreachable today and recorded rather than filed: beginAction (src/runtime/session.ts:450)
is the one mutating entry point that does not prune, and it can resolve a zero-unit action whose
result opens a modal. Unreachable because the only modal a result can open by name is
character-creation, whose race values are a module constant and never empty.
- proof 5: met — Unchanged by this range -- git diff d992f79..df68ee7 -- src/runtime/command.ts is empty,
and re-measured rather than carried on pass 4's word.
Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass5-carried.json.
"c5 the shared ticker advances a run by the interval it asked for" replaces const elapsedMs = now -
last with everyMs in src/runtime/command.ts: KILLED by src/runtime/command.test.ts "hands over the
time that actually passed, not the interval it asked for", re-run at its own file with the mutation
still applied and failing there.
"c5 the two drivers tick at cadences that only happen to agree" defaults createTicker to 200 rather
than LIVE_TICK_MS: KILLED by src/runtime/command.test.ts "ticks at the cadence the command surface
publishes, so both drivers round the same way", re-run at its own file.
Nothing under src/ui schedules resolve or wait on a clock of its own: the call rule recorded under
c2 covers it, and it now reads the call as well as the import.
Pass 4's remaining bound is gone rather than carried: the cross-driver comparison no longer builds
its REPL side inside the test. scripts/drift.test.ts drives openRepl, which is the loop play-cli's
own main runs. See c1.
- proof 6: met — Pass 4 graded this unmet on one measurable property and said what the fix was -- "a
floor on one control and a test that holds every control to it". That is what landed, and it landed
at the seam rather than on the one control.
The floor is now set once, in src/index.css:44-51, over button/input/select/textarea: min-height and
min-width 44px. The one control that cannot take it from a stylesheet is a place on the map, because
the bubbles sit inside the sheet's scale() transform -- so src/ui/discovery.ts:120 counter-scales the
tap area, tapTarget(scale) = TOUCH_FLOOR / min(1, scale), and src/ui/MapPane.tsx:274 draws it inside
the button. Pass 4's reproduction is closed at both ends: 34 CSS px became the floor, and 13.6 px at
ZOOM_MIN became the floor too.
Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass5-mutations.json, six entries, all
KILLED and each re-run at its own file with the mutation still applied and failing there:
(1) "c6 a control may stand below the touch floor" drops the stylesheet rule to 24px -- KILLED by
    src/ui/surface.test.ts "floors every control in the stylesheet, on both axes".
(2) "c6 a component takes the floor back for itself" writes min-h-[20px] on the tab bar -- KILLED by
    src/ui/surface.test.ts "lets no control in the tree ask for less room than the floor". That is
    the other half of the same rule: a floor a component may undo is not a floor. Its scanner is
    brace-aware over the whole opening tag and is itself held by a test.
(3) "c6 a place on the map loses its floor as the sheet is zoomed out" fixes tapTarget at
    TOUCH_FLOOR -- KILLED by src/ui/discovery.test.ts "grows as the sheet shrinks, so what reaches
    the screen is the floor at every zoom", which asserts tapTarget(scale) * scale >= TOUCH_FLOOR
    across the whole zoom range rather than at one point.
(4) "c6 the shell lets a child push the page sideways" removes overflow-hidden from the shell root --
    KILLED by src/ui/phone.test.tsx "clips the shell to the window, so nothing can push the page
    sideways".
(5) "c6 an affordance answers only to a hover" adds hover:text-accent to the tab bar -- KILLED by
    src/ui/phone.test.tsx "offers nothing that answers only to a hover, a right-click or a key".
(6) "c6 a layer is reachable only by a gesture" renames data-boundary -- KILLED by
    src/ui/phone.test.tsx "gives every boundary between two layers a control that is tapped rather
    than swiped". The element carrying it is a real <button> (src/ui/VStack.tsx:100) whose onClick
    calls across(); the drag is the same control answering a longer press.
The structural half is unchanged since pass 4 and its three nav.test.ts kills stand.
Thumb reach: phone.test.tsx puts <nav after </main> in the rendered markup and holds SPLIT_DEFAULT
<= 0.5, so the narration never takes more than half of what it shares with the choices.
BOUND ON THE GRADE, and it is what the next pass should read rather than rediscover: every one of
these is a measurement of the stylesheet's text and of the rendered markup, not of a laid-out
viewport at 375x812. What a browser would add and this cannot -- a bubble's real hit box under the
transform, an actual horizontal overflow -- is what the branch's own filed record
the-browser-harness-reads-every-published-field-but-the-walk is about, and what CLAUDE.md's testing
procedure hands to the author. Graded met because the clause's own standard is "measured rather than
asserted", and every property above now fails a test when it stops holding, which asserting does not.
- proof 7: met — Pass 4's two survivors are closed, and the route highlight the branch added is watched
at the component that draws it.
Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass5-mutations.json, three entries.
"c7 the map draws every place on top of every other" zeroes MapPane's pixels(): KILLED by
src/ui/render.test.tsx "puts them as far apart as the engine put them, a unit of world at a time",
re-run at its own file with the mutation still applied and failing there. Pass 4 recorded this as a
whole-suite survivor.
"c7 the map stops acknowledging a place that has just arrived" forces arrived to false: KILLED by
src/ui/render.test.tsx "acknowledges the place that has just arrived, and leaves the known one
alone", re-run at its own file. Pass 4's second survivor.
"c7 the map lights up a road the walk is not taking" makes onWalk true for any place on the line:
KILLED, and confirmed at src/ui/discovery.test.ts "leaves the roads it does not take, including a
short cut between two places on it".
Everything pass 4 measured under this clause is untouched by this range and its kills stand.
Home, Map and Character each render what they owe; Settings is still a frame with no body, which is
the spec's own Decision. Edit is not: the command console is its body now. That is filed as a
finding against the clause's wording rather than graded against the branch, because the spec's Open
questions leave the console to the worker and only c7's Decision says the frame stays empty.
BOUND, and it is filed as a finding of its own: a travel offer more than one road away is withdrawn
from Home's action sheet (src/ui/choices.ts:21) and, when its destination is not yet discovered, has
no bubble on the map either -- so for that class of offer the only route in the whole shell is the
console. Measured, see the finding.
- proof 8: met — Unchanged by this range and measured against a real build rather than by reading.
git diff --stat c59b0a0..df68ee7 -- src/ui/shippedContent.ts public/ is empty and public/content/ is
absent from the tree; public/ holds changelog.txt and favicon.svg and nothing else.
Build check, re-runnable: npx vite build produces dist/assets/index-*.js; grep -c guide-house over it
returns 13, so the DSL text is inside the bundle; dist/ contains no content/ directory.
Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass5-carried.json, entry "c8 the build
stops carrying the shipped DSL", points import.meta.glob at a suffix nothing matches: KILLED by
src/ui/shippedContent.test.ts "bundles the shipped DSL as text, with no path left for the browser to
fetch", re-run at its own file with the mutation still applied and failing there.
The no-network rule now sweeps every module beneath src/ui recursively, the branch's five new ones
included, and none reaches a network or a filesystem.
- proof 9: unmet — Deferring again is no longer available: the-agent-harness-returns-to-the-gui, which
passes 3 and 4 deferred to, is closed. So this is graded on its own terms, and it half holds.
WHAT HOLDS, measured. src/ui/testHarness.ts publishes window.__test with a structured state read and
a batch that returns one result per step, including a failed step rather than a throw. Manifest
C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass5-mutations.json, entry "c9 a batch stops
returning one result per step" drops the success push for one target: KILLED by
src/ui/testHarness.test.ts "publishes named actions and batches one result per step", re-run at its
own file with the mutation still applied and failing there. A production build carries no trace of
it: npx vite build then grep -rl __test dist/ returns nothing, and the bundle is a single index-*.js
with no testHarness chunk.
WHAT FAILS. "exposes actions registered by the components that own them". No component registers
anything. src/ui/testHarness.ts:118-129 sets five actions over the driver and BrowserTestHarness
exposes no registration point, so nothing a component owns can be reached: an agent driving the GUI
cannot change layer, cannot change subpage, cannot pan, zoom or change plane on the map. Those are
exactly the surfaces this branch built, and they are exactly what the harness cannot drive. The
state read has the matching blind spot -- TestState carries no journey and no encounter, which is
the branch's own filed record the-browser-harness-reads-every-published-field-but-the-walk.
So a driving agent can drive the session behind the shell and not the shell. Graded unmet rather
than met-with-a-bound because the sentence that fails is the one that distinguishes this harness
from `driver` with a global name.
Separately measured and filed: the dev gate itself is untested. See the finding.
- proof 10: met — Unchanged by this range and confirmed unchanged: git diff --stat c59b0a0..df68ee7 --
src/ui/transient.ts src/ui/FloatingText.tsx is empty. TransientNote is still {id, text} and nothing
else, src/ui/App.tsx:80 still mounts FloatingText with driver.transient inside <main>, so it survived
the nav rebuild and the console that landed beside it.
Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass5-c10.json, entry "c10 a transient
note learns where it came from", adds moment: 'xp' to the note the channel makes: KILLED by
src/ui/transient.test.ts "carries any text at all, and nothing about where it came from", re-run at
its own file with the mutation still applied and failing there.
Recorded so the next pass does not read it as a survivor: the same mutation aimed at the TransientNote
interface as an optional field (manifest audit-gui-rebuild-pass5-carried.json) SURVIVED the whole
suite. That is an equivalent mutant -- an optional field nothing sets changes no behaviour -- not a
hole. Aim it at the note, not at the type.
The XP instance is still not wired, as the clause requires.

### Pass 6 — 2026-08-12

- base: `c59b0a0d7820ee9ef3afaa2601065d32a2b57279`
- head: `13374c4d97573c9f2d348a6443ac81641cb87d14`
- proof 1: met — Re-measured, and the one bound pass 5 filed against it is closed rather than carried.
 The carve-out is now inside the proof instead of removed from it: scripts/drift.test.ts:37
 builds an AuthoringContext the way play-cli's main builds it and opens the REPL with it, and
 inStep counts a line as carved only when the GUI says UNAVAILABLE and the REPL did not. The
 first test names the carved line rather than counting it (expect(carved).toEqual(['/dsl
 location tutorial-island.guide-house'])) and the bytes are compared on carved lines too; the
 table sweep asserts carved > 0, which is the assertion that a REPL opened with no authoring
 context cannot satisfy.
 Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass6-mutations.json, entry
 "c1 the drift proof compares two drivers with the REPL's authoring surface off" takes the
 authoring context back off openRepl: KILLED by scripts/drift.test.ts "reaches byte-identical
 state and says the same things, over a scripted sequence" and "dispatches every entry in the
 shared table the way the REPL does", re-run at its own file with the mutation still applied
 and failing there too. That closes gui-rebuild-pass5-the-drift-proof-opens-the-repl-with-no-aut.
 Also under this clause, because it is a divergence between what the engine did and what a
 driver was told: entry "c1 a walk the roads cannot make reports success" drops the failure
 src/runtime/session.ts:548 now returns from walkTo: KILLED by src/runtime/journey.test.ts
 "reports the refusal it showed the player, and leaves the world where it was" and "fails the
 `# test` line that asked for it, rather than passing on to the next one", re-run at its own
 file. Checked that this does not double-report to the player: src/runtime/command.ts:277
 runDirective ignores the returned failure and shows the view, which already carries the log
 line, so only assert/expect and runTest read it.
- proof 2: met — Both rules re-measured on the one module this range adds under src/ui, and the
 structural leg is unchanged: GameState stays behind the module-private WeakMap in
 src/runtime/session.ts and is unreachable from src/ui whatever src/ui imports.
 Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass6-carried.json.
 Path rule: "c2 the registration hook reaches the runtime off the play surface" adds
 import '../runtime/state' to src/ui/testSurface.ts. KILLED by src/ui/surface.test.ts "reaches
 the runtime only through the play surface", re-run at its own file with the mutation still
 applied and failing there too.
 Call rule: "c2 the registration hook moves the world rather than dispatching through it" adds
 a wait( call to the same file. KILLED by src/ui/surface.test.ts "calls nothing that moves the
 world, however the name reached it", re-run at its own file.
 The sweep is recursive and covers src/main.tsx, so testSurface.ts and bundle.test.ts are both
 in it. Neither the shell surface nor the map surface reaches past the play surface: both take
 their component's own state and setters as parameters and call nothing.
- proof 3: met — Met on the property and re-measured, with no new prose surface in this range.
 Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass6-carried.json, entry
 "c3 a component writes a word of its own outside the vocabulary table" makes
 src/ui/LocationBanner.tsx read "You are in {title}": KILLED by src/ui/render.test.tsx "renders
 nothing a player can read that the engine did not publish", re-run at its own file with the
 mutation still applied and failing there too.
 Checked rather than assumed: the five strings this range adds -- "no layer is named", "has no
 subpage named", "no plane is drawn at", "a zoom is a finite number", "a pan is an { x, y } of
 finite numbers" -- are thrown to a driving agent and returned in a TestResult.error. None is
 rendered; src/ui/testHarness.ts:200 puts them in the batch result and nothing in the tree puts
 a TestResult on the screen. So they are not prose a player reads and this clause does not
 reach them. They do reach the shipped bundle, which is c9's last sentence and is filed there.
 The clause's own last sentence, "there is not one", remains false as written because
 src/ui/labels.ts holds the shell's ten words behind an executable rule. That is pass 4's
 finding gui-rebuild-pass4-c3-says-the-player-reads-no-string-the-eng, closed the right way by
 pass 5. Not re-filed.
- proof 4: met — Unchanged by this range and re-measured rather than carried on pass 5's word.
 git diff df68ee7..13374c4 -- src/runtime/modals.ts src/ui/ModalSheet.tsx is empty.
 Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass6-carried.json, entry
 "c4 an option that accepts nothing is left standing" removes frameProblem's unanswerable test
 at src/runtime/modals.ts:191: KILLED by src/runtime/modals.test.ts "never leaves a menu
 standing that offers nothing, however it came to offer nothing", re-run at its own file with
 the mutation still applied and failing there too.
 The other two halves are untouched by this range: MODAL_NAMES is still read off
 src/runtime/modals.ts rather than hand-copied, and pass 4's kill on "draws the modal the
 engine is asking for, and stops once it is answered" stands.
- proof 5: met — Unchanged by this range and re-measured. The only edit to src/runtime/command.ts in
 df68ee7..13374c4 is an export keyword on UNAVAILABLE, which drift.test.ts reads to name the
 carve-out; nothing about the clock moved.
 Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass6-carried.json, entry
 "c5 the shared ticker advances a run by the interval it asked for" replaces
 const elapsedMs = now - last with everyMs at src/runtime/command.ts:791: KILLED by
 src/runtime/command.test.ts "hands over the time that actually passed, not the interval it
 asked for", re-run at its own file with the mutation still applied and failing there too.
 Nothing under src/ui schedules resolve or wait on a clock of its own: the call rule recorded
 under c2 covers it and now sweeps testSurface.ts as well, whose only effect is a dynamic
 import inside a branch the DEV constant folds away.
- proof 6: met — Unchanged by this range and re-measured rather than carried. git diff
 df68ee7..13374c4 -- src/index.css src/ui/phone.test.tsx src/ui/VStack.tsx src/ui/TabBar.tsx is
 empty, and the two components this range edits gained one hook call each and no markup.
 Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass6-carried.json, entry
 "c6 a control may stand below the touch floor" drops the stylesheet floor to 24px on both
 axes: KILLED by src/ui/surface.test.ts "floors every control in the stylesheet, on both axes",
 re-run at its own file with the mutation still applied and failing there too. The five other
 kills pass 5 recorded under this clause are untouched by this range and stand.
 Pass 5's bound is unchanged and is the right one to carry: every one of these measures the
 stylesheet's text and the rendered markup, not a laid-out viewport at 375x812. What this pass
 adds to that is small and worth recording -- the browser measurement is now cheaper than it
 was, because window.__test can put the shell on any layer and the map on any plane in one
 round trip, which is what the eventual 375x812 sweep would have had to drive by hand.
 gui-rebuild-pass5-the-phone-sweep-refuses-every-keyboard-han stays open against the sweep's
 over-strictness and is not re-filed.
- proof 7: met — Pass 5's bound is closed on the naming side, measured three ways, and what remains
 is a smaller neighbour that is filed rather than swept up.
 Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass6-mutations.json, entry
 "c7 the engine names a place the player has not found" puts src/runtime/journey.ts:86 back the
 way it was, so reachable names an undiscovered place and merely declines to walk past it:
 KILLED by four tests at src/runtime/journey.test.ts, led by "names no place the player has not
 found, however many roads reach it" and "offers only places the player has found, so nothing
 is named that the map cannot draw", re-run at its own file with the mutation still applied and
 failing there too.
 Over the shipped content rather than a fixture: a walk of every location reachable by an offer
 from a fresh session (body at
 C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass6-boundary.ts, run with
 npm run inspect -- -) visits three of the four authored places and finds no choice at any of
 them whose leadsTo is outside status.discovered. Problems: none.
 The other side of the boundary holds and I checked it rather than taking the worker's word.
 routeTo may still end at an undiscovered place, deliberately, but nothing in the shell can
 name one: locationChoices offers only edges whose condition is true, and spreadDiscovery
 (src/runtime/effects.ts:169) discovers exactly those targets on arrival, so every legs-1 offer
 names a place already found; journeyChoices reads reachable, which now names none; and
 beginAction refuses a choiceId that is not in computeChoices, so the arming path cannot reach
 one either. What is left for routeTo's carve-out is a content-authored travel: and the
 console, both of which name the id themselves. src/runtime/journey.test.ts "ends in a place the
 player has not found, and never crosses one" is where that stays watched.
 BOUND, filed as a finding of its own: a walk-away offer whose destination is on another
 z-plane is withdrawn from the action sheet and has no bubble on the plane the player is
 standing on. Measured live through the branch's own harness at localhost:5173 -- standing at
 tutorial-island.guide-house-upstairs the view offers "Travel to Basement" at legs 2,
 src/ui/choices.ts:21 withdraws it, and surfaces.map.places on plane 1 is guide-house and
 upstairs only; after map.plane -1 the basement bubble appears with goes 3. Two taps rather
 than one, so it is a route and not a dead end, which is why this is a finding and not a
 downgrade.
 Edit carrying the console is now the clause's own text and the author's recorded decision
 (op: decision, 2026-08-12, docs/events.jsonl), not a branch rewording its promise to match
 what it built; the four records queued against Edit were each notified. Settings is still the
 frame with no body.
- proof 8: met — Stronger this range than it has been, and measured against a build rather than a
 read. src/ui/bundle.test.ts builds the production bundle in memory with NODE_ENV forced to
 production and asserts index.html is emitted and that some emitted part contains guide-house,
 so a build that emitted nothing cannot pass it.
 Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass6-carried.json, entry
 "c8 the build stops carrying the shipped DSL" points import.meta.glob at a suffix nothing
 matches: KILLED by src/ui/bundle.test.ts "carries the content and no trace of the harness that
 drives it" and by src/ui/shippedContent.test.ts "bundles the shipped DSL as text, with no path
 left for the browser to fetch", re-run at both files with the mutation still applied and
 failing there too. public/content/ is still absent from the tree.
 The cost of the new build test was measured, because CLAUDE.md puts a five-minute wall clock on
 the suite: npm test is 101 files, 2498 tests, 34 seconds wall clock with the build in it.
- proof 9: met — Graded on the property, which is true and which I measured through the instrument
 the clause is about rather than by reading. The sentence pass 5 graded unmet -- "actions
 registered by the components that own them" -- is now true, and the registration is genuinely
 the components' rather than relocated to the hook: createSurfaceRegistry starts empty, App.tsx
 :45 and MapPane.tsx:127 each call useTestSurface with closures over their own React state and
 setters, the action bodies in nav.ts and discovery.ts take those hands as parameters and hold
 none of their own, names are namespaced by surface so neither component can shadow the other,
 and unmount drops the entry.
 Measured live, and re-runnable in one call: npm run dev, then in the page
 window.__test.actions() returns
 [answer, cancel, choice, choose, map.pan, map.plane, map.zoom, send, shell.layer,
 shell.subpage] and a nine-step batch returns nine results -- shell.layer map, map.plane 1,
 map.zoom 99 clamped to 3, map.pan {x:40,y:-10}, shell.layer character, shell.subpage inventory
 all ok with surfaces.shell and surfaces.map moving to match, then shell.layer 'nowhere',
 map.plane 7 and map.pan 'left' each ok:false carrying the sentence the component refused with.
 That is a name called and a result read, per step, with nothing scanned off rendered text.
 Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass6-mutations.json, three
 kills: "c9 a batch stops returning one result per step" (KILLED by src/ui/testHarness.test.ts
 "publishes named actions and batches one result per step" and "reports what a component
 refused rather than throwing out of the batch"); "c9 a surface whose component has gone is
 still driven" (KILLED by "forgets a surface whose component has gone, rather than driving one
 that is not there"); "c9 the registration hook stops being gated on the dev constant", which
 removes testSurface.ts's DEV check (KILLED by src/ui/bundle.test.ts "carries the content and no
 trace of the harness that drives it" and src/ui/surface.test.ts "reaches the harness only from
 a branch a production build folds away"). Each re-run at its own file with the mutation still
 applied and failing there too. That last pair closes
 gui-rebuild-pass5-the-harness-s-dev-gate-is-untested-so-one-.
 TWO BOUNDS, both measured, both filed, and neither of them the property:
 (a) the registration itself is watched by nothing. Entries "c9 the shell stops registering the
 layer and page it owns" and "c9 the map stops registering the pan, zoom and floor it owns"
 delete the two useTestSurface calls: both SURVIVED, escalated to the whole suite, 0 failed of
 2498. The cause is structural rather than an oversight -- the suite has no DOM environment
 (no jsdom in devDependencies, vitest's default node environment) and src/ui/render.test.tsx
 renders through renderToStaticMarkup, so useEffect never runs and no test in the tree can
 observe a registration. This is why the grade rests on the browser measurement above.
 (b) "A production build contains no trace of it" is false as written. npx vite build then
 grep -rlF over dist/ finds "a pan is an", "a zoom is a finite number", "no plane is drawn at",
 "no layer is named" and "has no subpage named" all inside dist/assets/index-*.js: strings that
 exist only to answer a driving agent, in functions the release calls on every render because
 the DEV guard sits inside the hook rather than at the call site. The three names
 src/ui/bundle.test.ts:52 does check -- __test, installTestHarness, registerTestSurface -- are
 genuinely absent, so the guard is true and the sentence above it is not.
- proof 10: met — Unchanged by this range and confirmed unchanged: git diff --stat
 df68ee7..13374c4 -- src/ui/transient.ts src/ui/FloatingText.tsx src/ui/App.tsx shows App.tsx
 only, and its two edits are the useTestSurface import and call; FloatingText is still mounted
 with driver.transient inside <main>.
 Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass6-carried.json, entry
 "c10 a transient note learns where it came from" adds moment: 'xp' to the note the channel
 makes: KILLED by src/ui/transient.test.ts "carries any text at all, and nothing about where it
 came from", re-run at its own file with the mutation still applied and failing there too.
 Aimed at the note and not at the TransientNote interface, which pass 5 recorded as an
 equivalent mutant. The XP instance is still not wired, as the clause requires, and the new
 surface registry did not become a second channel: it publishes state and takes actions and
 announces nothing.

### Pass 7 — 2026-08-12

- base: `c59b0a0d7820ee9ef3afaa2601065d32a2b57279`
- head: `545b2b38b6006559d11b8fb9aed509b916d4a2fd`
- proof 1: met — Untouched by this range and re-measured rather than carried.
 git diff 9a3f4c0~1..545b2b3 -- scripts/drift.test.ts src/runtime/command.ts src/ui/driver.ts
 scripts/play-cli.ts src/runtime/session.ts is empty, so neither the shared table nor either
 driver's route into it moved.
 Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass7-carried.json, entry
 "c1 the drift proof compares two drivers with the REPL's authoring surface off" takes the
 authoring context back off openRepl: KILLED by scripts/drift.test.ts "reaches byte-identical
 state and says the same things, over a scripted sequence" and "dispatches every entry in the
 shared table the way the REPL does", re-run at its own file with the mutation still applied
 and failing there too. Entry "c1 a walk the roads cannot make reports success" drops the
 failure walkTo returns: KILLED by src/runtime/journey.test.ts "reports the refusal it showed
 the player, and leaves the world where it was" and "fails the `# test` line that asked for it,
 rather than passing on to the next one", re-run at its own file.
 Checked rather than assumed that d00178a did not add a GUI-only command: src/ui/App.tsx's one
 edit is the registration argument and a whitespace fix, and the shell still reaches the table
 only through driver.send.
- proof 2: met — Re-measured on the one module this range adds under src/ui, and the structural leg is
 unchanged: GameState stays behind the module-private WeakMap in src/runtime/session.ts.
 src/ui/agentSurfaces.ts is inside surface.test.ts's recursive sweep (modulesUnder walks src/ui
 and it is a non-test .ts), and it reaches ../runtime not at all: its imports are ./discovery,
 ./gesture, ./labels, ./nav and a type from ./testSurface.
 Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass7-carried.json, both entries
 re-aimed at testSurface.ts's new useRef(held) line. Path rule: "c2 the registration hook
 reaches the runtime off the play surface" adds import '../runtime/state': KILLED by
 src/ui/surface.test.ts "reaches the runtime only through the play surface", re-run at its own
 file with the mutation still applied and failing there too. Call rule: "c2 the registration
 hook moves the world rather than dispatching through it" adds a wait( call to the same file:
 KILLED by src/ui/surface.test.ts "calls nothing that moves the world, however the name reached
 it", re-run at its own file. Neither builder in agentSurfaces.ts holds state of its own; both
 take the component's values and callbacks as parameters.
- proof 3: met — No new prose surface in this range, and this clause is measurably better off than it was.
 Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass7-carried.json, entry
 "c3 a component writes a word of its own outside the vocabulary table" makes
 src/ui/LocationBanner.tsx read "You are in {title}": KILLED by src/ui/render.test.tsx "renders
 nothing a player can read that the engine did not publish", re-run at its own file with the
 mutation still applied and failing there too.
 The five agent-facing strings pass 6 checked -- "no layer is named", "has no subpage named",
 "no plane is drawn at", "a zoom is a finite number", "a pan is an { x, y } of finite numbers"
 -- moved out of nav.ts and discovery.ts into src/ui/agentSurfaces.ts. They are still returned
 in a TestResult.error and rendered by nothing, and they now leave the release entirely: npx
 vite build then grep -rlF over dist/ for all five exits 1. Nothing new is written by a
 component; src/ui/labels.ts is unchanged.
- proof 4: met — Unchanged by this range and re-measured rather than carried. git diff 9a3f4c0~1..545b2b3
 -- src/runtime/modals.ts src/ui/ModalSheet.tsx src/ui/App.tsx shows App.tsx only, and its two
 edits are the shellSurface import dropped and the registration argument -- the modal render
 `asking ? <ModalSheet ...> : null` is untouched.
 Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass7-carried.json, entry
 "c4 an option that accepts nothing is left standing" removes frameProblem's unanswerable test:
 KILLED by src/runtime/modals.test.ts "never leaves a menu standing that offers nothing, however
 it came to offer nothing", re-run at its own file with the mutation still applied and failing
 there too. MODAL_NAMES is still read off src/runtime/modals.ts rather than hand-copied.
- proof 5: met — Unchanged by this range and re-measured. git diff 9a3f4c0~1..545b2b3 --
 src/runtime/command.ts src/ui/LiveSheet.tsx src/ui/Meter.tsx src/ui/live.ts is empty; nothing
 about the clock moved.
 Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass7-carried.json, entry
 "c5 the shared ticker advances a run by the interval it asked for" replaces
 const elapsedMs = now - last with everyMs: KILLED by src/runtime/command.test.ts "hands over
 the time that actually passed, not the interval it asked for", re-run at its own file with the
 mutation still applied and failing there too. Nothing under src/ui schedules resolve or wait on
 a clock of its own: the call rule recorded under c2 sweeps agentSurfaces.ts as well, and its
 only effects are the two callbacks a component handed it.
- proof 6: met — Unchanged by this range and re-measured rather than carried. git diff 9a3f4c0~1..545b2b3
 -- src/index.css src/ui/phone.test.tsx src/ui/VStack.tsx src/ui/TabBar.tsx is empty, and
 MapPane.tsx gained no markup in this range: its edits are the drawnFor composition, the
 registration argument and the import line.
 Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass7-carried.json, entry
 "c6 a control may stand below the touch floor" drops the stylesheet floor to 24px on both axes:
 KILLED by src/ui/surface.test.ts "floors every control in the stylesheet, on both axes", re-run
 at its own file with the mutation still applied and failing there too.
 Pass 5's bound is unchanged and still the right one to carry: every leg measures the
 stylesheet's text and the rendered markup, not a laid-out viewport at 375x812.
 gui-rebuild-pass5-the-phone-sweep-refuses-every-keyboard-han stays open and is not re-filed.
- proof 7: met — Met, and the pass-6 bound is genuinely closed -- but a28eea1 widened what the map draws
 beyond what this clause's own sentence describes, and I am filing that rather than letting the
 next pass discover the disagreement.
 What changed: src/ui/discovery.ts sheetAt gained a fourth predicate, offered.has(place.id), and
 a new drawnFor composes plane, here, sheet and travels so the two halves cannot disagree.
 Measured over the shipped content rather than a fixture, body at
 C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass7-c7-live.ts, run with
 npm run inspect -- - : walking guide-house, basement, guide-house-upstairs leaves the player on
 plane 1 with "Travel to Basement" at legs 2 withdrawn from the action sheet, and the map now
 draws [guide-house climb=-1 at (-0.42,0.42) goes=2, guide-house-upstairs climb=0 here,
 basement climb=-2 at (-0.84,0.84) goes=3]. sheetAt called without the offers -- which is the
 tree as it stood before a28eea1 -- draws guide-house and guide-house-upstairs only. So the
 withdrawn offer is now one tap on the plane the player is standing on, where pass 6 measured
 two, and gui-rebuild-pass6-the-map-does-not-offer-a-walk-away-destina is closed on the wider of
 the two routes it offered.
 Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass7-mutations.json, entry
 "c7 the map stops drawing a place the view offers a walk to" removes the new predicate: KILLED
 by src/ui/choices.test.ts "withdraws a walk-away offer only where the map is drawing the place
 it leads to" and src/ui/discovery.test.ts "draws a place the view is offering a walk to,
 however far off the shown plane it stands", re-run at both files with the mutation still
 applied and failing there too. Entry "c7 the composition stops handing the offers to the sheet"
 stops drawnFor passing travels into sheetAt: KILLED by the choices.test.ts case, re-run at its
 own file. That second kill is the one that matters, because the earlier shape of this fix left
 the composition inside MapPane's render where no test in this suite can reach it.
 The naming half is untouched: b8472a0's edit to src/runtime/journey.ts is comment lines only
 (git diff shows no non-comment line changed), and manifest
 C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass7-c7-naming.json re-measures pass 6's
 entry "c7 the engine names a place the player has not found", KILLED by four tests at
 src/runtime/journey.test.ts led by "names no place the player has not found, however many roads
 reach it". The comment itself is now in journey.ts's own terms: it names neither
 publishDiscovered nor the map driver's bubble, which is what
 gui-rebuild-pass6-journey-ts-s-new-comment-states-two-other- asked for.
 BOUND, filed as a finding of its own: this clause says the map "shows one z-plane at a time,
 plus whatever sits off that plane and is adjacent to the player", and the basement above is
 neither on plane 1 nor adjacent to guide-house-upstairs. Nothing c7 promises is missing, so
 this is met rather than unmet; but a third category is now drawn that the clause does not name,
 and the spec was not amended the way e8d65f9 amended it when Edit gained the console. Second
 bound in the same finding's neighbourhood and filed separately: because bounds() runs over the
 sheet, an offered place also enlarges the box the pan is clamped against, so withdrawing an
 offer narrows the box and moves a pan that was legal. Invisible in the tutorial, content-shaped,
 and unwatched.
- proof 8: met — Unchanged in intent by this range and stronger in measurement. src/ui/shippedContent.ts is
 untouched; public/content/ is still absent from the tree.
 Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass7-carried.json, entry
 "c8 the build stops carrying the shipped DSL" points import.meta.glob at a suffix nothing
 matches: KILLED by src/ui/bundle.test.ts "carries the content, and none of the modules only a
 driving agent reaches" and src/ui/shippedContent.test.ts "bundles the shipped DSL as text, with
 no path left for the browser to fetch", re-run at both files with the mutation still applied
 and failing there too.
 bundle.test.ts gained a second anchor that guards this clause specifically: a build that
 reported no modules would pass every absence check, so it now also asserts that some emitted
 part was rolled up from src/ui/App.tsx. Cost re-measured against CLAUDE.md's five-minute floor:
 npm test is 102 files, 2501 tests, 41.11s wall clock with the build in it.
- proof 9: met — Met, and pass 6's two bounds are both answered -- (b) as a fact about a real build, (a)
 only for the reproduction it named.
 (b) is now true as written. npx vite build, then grep -rlF over dist/ for "a pan is an", "a
 zoom is a finite number", "no plane is drawn at", "no layer is named", "has no subpage named",
 "__test", "installTestHarness" and "registerTestSurface" exits 1: the release is one 325.13 kB
 chunk and none of the eight is in it. The cause pass 6 identified is gone -- the DEV check is
 still inside useTestSurface's effect, but the call site now hands over plain values and names
 no builder, so nothing outside the folded branch references src/ui/agentSurfaces.ts and Rollup
 drops it.
 The instrument that proves it is load-bearing and I isolated which half fires. Manifest
 C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass7-mutations.json, entry "c9 the dead
 branch stops folding, so the builders reach the release" makes the DEV guard a condition Vite
 cannot fold: KILLED by src/ui/bundle.test.ts "carries the content, and none of the modules only
 a driving agent reaches", re-run at its own file with the mutation still applied and failing
 there too. Run by hand at the same mutation to see the assertion text, the failure is
 "...agentSurfaces.ts is rolled into the shipped bundle: expected [
 'assets/agentSurfaces-B1HH50SG.js' ] to deeply equal []" -- the Rollup module-graph half, not
 the export-name half. The worker's self-report that the name check is near-vacuous under
 minification is correct and does not matter: the graph assertion is what carries the clause,
 and its own anchor (App.tsx is among the modules some part was rolled from) stops it passing on
 a build that reported no modules at all.
 (a) is closed for deletion. Manifest ...pass7-mutations.json, entries "c9 the shell stops
 registering the layer and page it owns" and "c9 the map stops registering the pan, zoom and
 floor it owns" delete the two useTestSurface calls: both KILLED by src/ui/surface.test.ts
 "writes the registration call in every component that holds what an agent has to move", re-run
 at its own file with the mutation still applied and failing there too. Where pass 6 measured
 both surviving the whole suite, that is the reproduction answered.
 The batching half is unchanged and re-measured: manifest ...pass7-carried.json, entries "c9 a
 batch stops returning one result per step" (KILLED by src/ui/testHarness.test.ts "publishes
 named actions and batches one result per step" and "reports what a component refused rather
 than throwing out of the batch") and "c9 a surface whose component has gone is still driven"
 (KILLED by "forgets a surface whose component has gone, rather than driving one that is not
 there"), each re-run at its own file.
 BOUND, filed: the new rule reads that the call is written, not that it hands over what the
 component holds. Manifest
 C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass7-mutations-neighbour.json, entry "c9
 the map registers a floor it is not drawing" leaves the call in place and passes plane: 0
 instead of the plane being drawn: SURVIVED, escalated to the whole suite, 0 failed of 2501. The
 structural cause is the one pass 6 recorded -- no jsdom, render.test.tsx renders through
 renderToStaticMarkup, so useEffect never runs -- and this grade therefore still rests on the
 browser measurement pass 6 made, not on the suite.
- proof 10: met — Unchanged by this range and confirmed unchanged: git diff 9a3f4c0~1..545b2b3 --
 src/ui/transient.ts src/ui/FloatingText.tsx is empty, and App.tsx still mounts
 <FloatingText channel={driver.transient} /> inside <main>.
 Manifest C:\Users\yonat\AppData\Local\Temp\audit-gui-rebuild-pass7-carried.json, entry
 "c10 a transient note learns where it came from" adds moment: 'xp' to the note the channel
 makes: KILLED by src/ui/transient.test.ts "carries any text at all, and nothing about where it
 came from", re-run at its own file with the mutation still applied and failing there too. Aimed
 at the note and not at the TransientNote interface, which pass 5 recorded as an equivalent
 mutant. The XP instance is still not wired, and the surface registry did not become a second
 channel: it publishes state and takes actions and announces nothing.
