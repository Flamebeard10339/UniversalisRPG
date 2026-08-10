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
  added to the shared table is dispatchable from the GUI with no edit under `src/ui`.
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
- [c6] The layout is designed at a phone, and the claim is measured rather than asserted. At
  375×812 nothing in the tutorial route scrolls the page horizontally, every interactive control's
  touch target is at least 44 CSS pixels on its shorter side, the controls used every turn — the
  action sheet and the tab bar — sit in the bottom third, and no affordance requires hover, a
  right-click or a keyboard.
- [c7] The five tabs are one nav and each is one tap away. Home is the narrative log and the action
  sheet. Map renders the locations the player has discovered and how they connect, and acknowledges
  a newly discovered one. Character renders the published inventory, equipment, skills and stats.
  Settings and Edit are frames with no body — `gui-dev-mode-toggle-banner-and-editing-gate`,
  `mod-portal-gui`, `gui-locale-editor-missing-toggle-and-language-dropdown` and `edit-mode-memory`
  own their contents, and this branch owes them somewhere to land, not the landing.
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
- **The GUI is a driver, not a second engine, and the drift proof is executable.** The author's
  requirement is that the two play methods cannot drift in capability or function and that the GUI
  cannot alter state directly. The structural half is the prerequisite's — one command table,
  derived help, no reachable `GameState`. The behavioural half is c1 and lives here, because this is
  the first moment two drivers exist to compare. c1 drives the GUI's session container rather than
  React, so the comparison is of two drivers and not of a renderer.
- **Settings and Edit ship empty on purpose.** Four tracked records own their bodies. Building them
  here would absorb four records into a branch that already owes a whole directory, and each of them
  is blocked on something this branch does not deliver — a dev slot, a mod-set decision, a locale
  system, an editor. An empty frame is the seam they were split off to wait for.
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
- How the map draws. A graph of discovered locations is a layout problem with no settled answer
  here, and a list grouped by connection satisfies c7. `reactflow` was removed as an unimported
  dependency (UI-M3) and is not to be reintroduced without a reason written down.
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
