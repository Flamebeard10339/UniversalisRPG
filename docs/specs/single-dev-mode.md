# single-dev-mode

## Deliverable

The record asks for one dev-mode toggle in place of two — contribution mode and debug mode. Neither
exists: both went with the legacy GUI, and a grep for `devMode`, `debugMode`, `contributionMode` or
`isDev` across `src/` and `scripts/` returns nothing. Nor is there anything to gate in the CLI, where
`/dsl` and `/local` are open unconditionally, because `play-cli` is a developer's tool and always has
been. So consolidation is not the work. Introducing the thing is, and the part of it that carries a
guarantee has nothing to do with a toggle.

**The guarantee is that authoring content cannot damage the save you play.** Entering dev mode
snapshots the current state; everything done while in dev runs against a separate slot; leaving
restores the snapshot. Autosave follows the slot, so a session spent editing content writes nothing
to the player's file, and neither a corrupt edit nor an hour of testing appears in it. That is the
whole of what this branch delivers, and it is provable in `play-cli` today because it is a property
of the store rather than of a user interface.

What is left over is genuinely a GUI: a toggle, a `/dev` shortcut so cheat commands do not need
menu navigation, gating the editing surface, and the bright orange banner that says the state on
screen is not the one being kept. Those are filed separately, behind `gui-rebuild`, because a banner
cannot be specced against a UI nobody has chosen and because none of them is what stops a save being
bricked.

| what happens                                                | the player's slot        | the dev slot |
| ------------------------------------------------------------- | ------------------------ | ------------ |
| enter dev mode                                                 | snapshotted, then untouched | starts as a copy of the snapshot |
| edit content, play, die, cheat, break something                | untouched                 | changes freely |
| autosave fires while in dev                                    | untouched                 | written |
| leave dev mode                                                 | restored to the snapshot   | discarded |
| the process dies while in dev                                  | still the snapshot        | whatever it last held |
| never enter dev mode                                           | behaves exactly as today   | does not exist |

Row five is why the snapshot is written before anything else happens rather than held in memory: a
crash mid-dev must not be the one case that loses the file.

Proof:

- [c1] Entering dev mode snapshots the player's slot before anything is editable, and leaving
  restores it. Anything done in between — content edits, play, cheats, a save-breaking mistake — is
  gone on exit and the slot is byte-identical to the snapshot.
  proof: vitest scripts/play-cli.test.ts
- [c2] Autosave follows the slot. While dev mode is on, every write goes to the dev slot and the
  player's slot receives nothing, so a session spent authoring cannot appear in the file being
  played.
  proof: vitest scripts/play-cli.test.ts
- [c3] A crash while in dev loses nothing. The snapshot is persisted at the moment dev mode is
  entered, not held in memory, so a process that dies mid-session leaves the player's slot intact and
  recoverable without an orderly exit.
  proof: vitest scripts/play-cli.test.ts
- [c4] Not entering dev mode changes nothing. With the mode off, saving, loading and autosave behave
  exactly as they do before this branch, and no slot is created.
  proof: npm test
- [c5] Which slot is live is answerable, not inferred. A session reports whether it is in dev mode
  and which slot it is writing, so the banner the GUI will show renders an answer rather than
  tracking its own copy of the state.
  proof: vitest scripts/play-cli.test.ts

## Decisions

- **Consolidation is not the work; there is nothing to consolidate.** The two toggles the record
  names do not exist in the tree — a grep for all four spellings comes back empty — and the CLI gates
  nothing today. Recording this rather than quietly redefining the task matters because the title
  will keep suggesting a merge to whoever reads it next.
- **The save guarantee is separable from the toggle, and it is the half worth having.** A banner, a
  `/dev` command and a gated editing surface are conveniences; a snapshot that makes authoring
  non-destructive is the promise. It is also the half with no UI in it, so it can be built and proven
  now instead of waiting behind `first-class-modals` and the rest of the decided chain.
- **The snapshot is persisted on entry, not on exit.** Holding it in memory would make an orderly
  exit the only path that protects the file, and the sessions most likely to crash are exactly the
  ones spent editing content. c3 is that reasoning as a test.
- **This waits on `auto-save-export-and-load`.** A parallel slot presupposes slots. That task builds
  the store, the autosave cadence and `/export`, and this one is a second slot plus a rule about
  which one autosave writes.
- **Time spent in dev ages the player's world, and does so without a special case.** An hour spent
  authoring is an hour the player was away, so exiting dev and resuming reconciles it. Nothing is
  written to make that true: the snapshot carries the stamp the store gave it when it was taken, at
  entry, and `offline-progression` measures from when the store wrote the slot. The behaviour falls
  out of the two mechanisms meeting, which is the reason to state it here — a later reader finding
  the world aged after a dev session should see that it was intended rather than assume a leak.
- **`play-cli` stays ungated.** Adding a gate there would restrict a developer's tool to protect a
  player who is not using it, and every `# test` and authoring command in the repository goes through
  it. Dev mode is a mode of the *game*, and the CLI is not the game.
- **`/cheat reset` was struck from CLAUDE.md separately and immediately.** It named a command that
  does not exist, and the file is loaded into every session — including the ones that will never
  touch this task. Waiting for this branch to land would have left it misleading for as long as the
  store took to arrive. A reset command belongs here when there is a store to reset, and the replaced
  line says so.

## Open questions

- Whether the dev slot survives a restart, so a dev session can be resumed, or is discarded on exit
  as c1 requires, is the worker's call for the slot's lifetime beyond a single run. c1 fixes what
  exiting does, not what a second launch finds.
