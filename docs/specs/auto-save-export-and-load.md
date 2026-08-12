# auto-save-export-and-load

## Deliverable

There is no player save. `serializeSave` is called in exactly two places and both write `# save` test
fixtures; there is no store, no autosave, no export and no import, which is why `offline-progression`
defers its own trigger to a branch that did not exist. This is that branch.

What it builds is a named-slot store, not a save file. Three queued records already speak in slots —
`single-dev-mode` wants a parallel one so authoring cannot damage the slot being played,
`offline-progression` wants the instant a slot was written, `save-migration-system` wants a real
player save to protect — and each of them named that need before this branch was planned. So the
store is slot-keyed from its first line, its payload is opaque text it never inspects, and the one
thing it adds around that payload is when the slot was written. Autosave, export and import are then
three small things on top of it, and the whole of it is exercised through `play-cli` before `src/ui`
exists.

Proof:

- [c1] Persistence is a named-slot store behind one interface, and nothing in that interface is
  save-shaped: read a slot, write a slot, delete a slot, list them, and the payload is opaque text
  the store never parses. A driver supplies the implementation — a file under the CLI, an in-memory
  one under test — the way `writeLocalChanges` is supplied today, so nothing below the driver
  performs I/O of its own.
- [c2] A slot records when it was written, and the stamp belongs to the slot, never to the payload.
  `offline-progression` settled this and is built on it: the payload is exactly the text
  `serializeSave` returns, so an exported save and a `# save` fixture are the same bytes, and a
  payload carrying no store stamp reconciles nothing without anyone special-casing it.
- [c3] A slot reads back byte-identical to what was written. `single-dev-mode` c1 asks precisely
  this of the snapshot it takes on entering dev mode, and a store that normalises, reorders or
  re-encodes on the way through cannot give it.
- [c4] Autosave fires on a cadence and zero means never. The cadence is real seconds since the slot
  was last written, checked after a command that changed state and on each live tick, and it is held
  in a slot of its own — which is what proves c1's claim that the store is not save-specific rather
  than asserting it.
- [c5] No load path advances time. Loading a slot, importing a payload, a `# save` fixture and a
  `# test` doing `load:` each leave `state.time` at exactly what the payload holds.
  `offline-progression` puts its entry point outside `loadSave` for this reason, and this branch must
  not pre-empt it by putting a clock read anywhere a load can reach.
- [c6] Export and import use the spelling the DSL already has. `/export` prints the current save as a
  `# save` body, so its output pastes into `/dsl save <id>` unchanged and `/import` takes that same
  text back. No second save serialization is written.
- [c7] A save that will not load changes nothing and says why. A payload the existing checks reject
  leaves the session exactly as it was, and a slot that is absent, empty or unparseable is a message
  rather than a crash.
- [c8] All of it is exercised before `src/ui` exists. Every clause above is provable through
  `play-cli` against a file-backed store, and this branch ships no browser adapter and no stub of
  one — `browser-save-store` owns that and requires `gui-rebuild`.

## Goal

The player's progress survives closing the game, through a store three queued branches can build on.

## Decisions

- **Slot-keyed from the first line, because two consumers already asked for it.** `single-dev-mode`
  is written entirely in slots — "everything done while in dev runs against a separate slot", and the
  snapshot "is written to the store when dev mode is entered, not held in memory" — and
  `offline-progression` measures its span "from the last slot the store wrote". Growing a key onto a
  single-file save later would be the same work done twice, with a migration in between.
- **Settings are a slot, not a second system.** The record named the missing settings store as one
  of two gaps to close or declare. Building one would be a second persistence mechanism beside the
  one this branch is already building; a slot-keyed text store is what a settings store is. The
  autosave cadence is its first entry. What a full settings surface holds — `single-dev-mode` has a
  toggle, and `gui-rebuild` ships Settings as an empty frame waiting for a body — is nobody's yet
  and does not have to be, now that it has somewhere to live.
- **The stamp is offline-progression's ruling, not this branch's choice.** That spec reasons it out:
  a stamp inside the payload would mean an imported save carries someone else's clock, and a bare
  "last active" stamp is wrong when autosave is set to never, because the span the resumed state
  never lived through starts at the write. This branch implements that conclusion and does not
  relitigate it.
- **This branch does not wait for `in-process-module-api`.** Landing first means `/export`, `/import`
  and the autosave check are written into `handleCommand` and moved with everything else later;
  landing after means three table entries. Moving three more commands during a move of all of them
  is nearly free, and waiting would put `offline-progression`, `save-migration-system` and
  `single-dev-mode` behind `first-class-modals` and the entire GUI chain for no gain. The
  injected-effect pattern this branch uses is the one that seam generalizes, so nothing is built
  twice.
- **`runtime-2026-07-30-h1` is required, not absorbed.** `checkSave` gives `activeAction`, `player`
  and `activeBuffs` no check past `isObject`, so `loadSave` crashes with a raw `TypeError` from
  inside the validator that exists to prevent it. Today that is reachable only through a
  hand-written `# save`; this branch makes it reachable by any corrupt slot a player's disk hands
  back, which is exactly the promotion "fixing one defect can promote another" describes. It is its
  own fix in its own file, so this branch requires it rather than growing a clause around it.
- **The cadence is not a `# variable`.** Tuning variables are authored by content and are the same
  for every player; an autosave cadence is a preference of the person playing. They look alike, and
  putting the cadence in the registry would let a mod set how often someone's game is saved.

## Open questions

- Where the store interface lives, and whether the autosave decision — has the cadence elapsed,
  write the slot — sits beside it or in the command surface. Both drivers need that decision, so it
  belongs below `ui`; which module is for whoever has read the region.
- Whether a slot is one file or a directory per slot under the CLI. Nothing above the interface can
  tell, which is the point of c1, so the first implementation decides.
- How many player slots the game eventually offers. This branch needs the one being played and
  whatever `single-dev-mode` names; a save-slot picker is a question no record has asked yet.
