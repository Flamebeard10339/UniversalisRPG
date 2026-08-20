# dev-powers-are-one-gate

## Deliverable

Nothing in the tree is dev-only today. A grep for `devMode`, `debugMode`, `contributionMode` or `isDev`
across `src/` and `scripts/` returns nothing, `single-dev-mode` recorded that the two toggles its title
names went with the legacy GUI, and the Settings subpage renders `null` (`src/ui/App.tsx:150`). So this
is not a consolidation. It is the first dev power in the tree, and the shape it is given now is the
shape every later one inherits — which is why the clauses below are about the gate rather than about
the three powers behind it.

`single-dev-mode` builds the half that carries the guarantee: entering dev mode snapshots the player's
slot, everything done in dev runs against a separate slot, leaving restores the snapshot, and the
session reports which slot is live. This branch is that mechanism reached from a screen. The toggle in
Settings is that entry and not a second one; the orange banner is a rendering of the answer the session
already gives and not a second copy of the state; and the editing surfaces are gated on the same
answer.

The powers themselves are commands. Teleport does not exist in any form — there is no `/goto` and no
cheat command anywhere in the tree — and the action-speed multiplier already does: `/speed` turns
`LiveSettings.speed` (`src/runtime/command.ts:627`), which the live clock reads. Both go through the
shared command table for the reason `createDriver` already gives about every other route in: the table
decides what a command does, so the two drivers cannot reach different sets, and a `# test` can replay
a session that used one. A component that moved the player itself would be a second way to change
location, invisible to the recorder and unreplayable.

Proof:

- [c1] **One answer gates every dev-only control, and the banner reads the same one.** Which slot is
  live is asked of the session, and every dev-only surface — the editing surfaces, the teleport
  gesture, the speed control — and the banner are readings of that one answer. No component holds its
  own copy of whether dev mode is on. The proof derives its subjects from the tree: every control
  marked dev-only is gated, and one marked nothing is not reachable while dev is off.
  proof: vitest src/ui/devMode.test.tsx
- [c2] **The toggle is `single-dev-mode`'s entry, not a second one.** Turning it on takes the snapshot
  and moves writes to the dev slot; turning it off restores the snapshot and discards the dev slot. The
  guarantee an author gets from the screen is byte-for-byte the guarantee the REPL gets, because it is
  the same call. There is no path in `src/ui` that sets a dev flag without entering the slot.
  proof: vitest src/ui/devMode.test.tsx scripts/play-cli.test.ts
- [c3] **Every dev power is a line the shared command table parses.** Teleport and the speed multiplier
  are commands, available to both drivers, recorded by the recorder and replayable in a `# test`. No
  component mutates session state directly. The proof derives its subjects rather than listing the two:
  no module under `src/ui` writes to the session or its state except through the command table.
  proof: vitest src/ui/devMode.test.tsx src/runtime/command.test.ts
- [c4] **Tapping a place on the map has one handler and one decision.** With dev off it sets off for
  that place, exactly as it does today, arrival delay and all; with dev on it arrives there
  immediately. Both spell a command. A place the player could not reach on foot is reachable this way
  and the state after it resolves — the location is what the registry holds, discovery is spread, and
  anything the arrival would have triggered is triggered.
  proof: vitest src/ui/devMode.test.tsx src/runtime/command.test.ts
- [c5] **There is one time multiplier.** The control writes the dial `/speed` turns and reads the same
  value back; `src/ui` declares no second multiplier, default or clamp, and setting it from the screen
  and from the console are indistinguishable afterwards.
  proof: vitest src/ui/devMode.test.tsx
  proof: command grep -rn "speed" src/ui --include=*.ts --include=*.tsx --exclude=*.test.*
- [c6] **With dev off, nothing changes.** Saving, loading, autosave, travel and the live clock behave
  exactly as they do before this branch; no dev slot is created; every dev command refuses from the GUI
  and says so. A player who never opens the toggle cannot tell this branch landed. `play-cli` stays
  ungated, because it is a developer's tool and every `# test` in the repository goes through it.
  proof: vitest src/runtime/integration.test.ts src/ui/driver.test.ts
- [c7] **Every control added here names its driver.** Every button, input, select and textarea this
  branch adds carries `data-drive` naming a harness action, or `none:` with a reason, and each named
  action exists — the existing scanner's derivation, still passing over a tree with a dev banner and a
  Settings body in it.
  proof: vitest src/ui/surface.test.ts
- [c8] `npm run tasks -- merge-ready` passes before the spec is marked done: tsc, tests, layer-check,
  audit-status, doctor and the byte check in one invocation.
  proof: command npm run tasks -- merge-ready

## Goal

Give the first dev power a gate that the tenth one can be added behind without anyone deciding again.

## Decisions

**Takes over `gui-dev-mode-toggle-banner-and-editing-gate`, which is retired into this spec.** That
record is the presentation half of `single-dev-mode` and names exactly c1, c2, c6 and the banner. It
carries a 2026-08-12 note that the Edit subpage is not an empty frame — `gui-rebuild` shipped the
command console there and the author ruled it stays — and that note is honoured: the editing surfaces
land beside the console, and the toggle lands in Settings, which is the subpage that renders nothing
today. The record's `/dev` shortcut is folded into c3, where it is one more command rather than a
special case.

**Extends `the GUI shell` and `the two-dimensional nav`; registers `the dev gate` over `src/ui`.** The
Settings subpage already exists in `LAYERS` (`src/ui/nav.ts:42`) with no body, which is where
`gui-rebuild` c7 left it; filling it is extending that concept rather than adding one. The gate itself
is new and is registered once, because "is this power dev-only" is a question later branches will ask
and a survey should find an owner for.

**Requires `single-dev-mode` and `the-gui-authors-through-the-same-door`.** The first owns the slot and
the answer c1 reads; without it the toggle would have to invent both, and the save guarantee — the
whole reason the mode exists — would be reimplemented in a component. The second owns the editing
surfaces c1 gates; gating a surface that does not exist is untestable.

**Teleport is a command with no shipped content behind it, and that is deliberate.** It is dev-only at
the gate, not at the parser, so `play-cli` has it unconditionally the way `/dsl` does, and a `# test`
may use it to put a session somewhere without walking there. Making it refuse below the gate would put
the mode into the engine, which `single-dev-mode` explicitly declined: dev mode is a mode of the game,
and the CLI is not the game.

**c4 keeps one handler rather than two surfaces.** A separate dev map would be a second thing drawing
the same report, which is the shape the 2026-08-12 ruling on the plane pane already rejected once. One
tap, one decision point, and the decision is c1's answer.

## Open questions

- Whether the dev slot survives a page reload so a dev session can be resumed, or is discarded on exit,
  is the worker's call and is `single-dev-mode`'s own open question reaching the browser. c2 fixes what
  the toggle does, not what a second launch finds.
- Whether the speed control is a slider, a stepped set of multipliers or a number field is the worker's
  call, and is a UI decision the author tests. c5 fixes that there is one dial.
- Which further powers are dev-only is not decided here. c1 makes adding one a matter of marking it,
  and the mark is what a later branch reads.
