# Open — these wait on the author

## What a zero autosave cadence should mean while something is under way

`DEFAULT_CADENCE` is 0, `autosaveDue` reads that as "always", and `LiveRun.tick`
asks on every tick — so the player slot is serialized and written to
`localStorage` ten times a second for as long as anything is running. The
settings page calls cadence 0 "after every action", which is what `settle` does
after a command and is not what the tick does.

Measured on the shipped world: 2 reads and 1 write per tick, ~1.6 KB each way,
0.055ms of serializing. On a desktop that is half a millisecond a second and not
worth touching. It was left because the number that matters was not measurable
from here — a synchronous `setItem` in an Android WebView is disk-backed, and
nobody has run this build on a phone with a profiler.

Saving less often is not free either: the away run measures how long you were
gone from the slot's own `writtenAt`, so a rarer save means reopening
re-simulates further back.

*Moves when:* the author says what cadence 0 should mean for a tick — every tick
as now, once a second, or once per completed cycle — or reports that a phone
build stutters, which settles it.

## The page takes about 280ms to appear, all of it parsing the world

`createDriver` parses 410 KB of DSL across 23 modules at boot, and that is the
whole of the delay before anything is on screen. It is also paid again on every
`reopen()` — the fault banner's retry, turning a pack off, clearing local
changes — and twice more for an edit the loader refuses.

Nothing here is per-frame, so it is not lag; it is how long the game takes to
start. Cutting it means shipping something other than source — a registry built
at build time — which is a real build step, a second representation of the world
to keep honest, and an authoring surface that has to keep reading source anyway.

*Moves when:* the author says whether a 280ms cold start is worth a build step
that produces a second form of the corpus.
