## Quest standing is derived, so a quest notice cannot be raised where it happens

Crossed over from `open-agent.md` on 2026-09-05, having been measured rather than read.

The line asked for the four comparators — `useNotices`, `useCrossings`, `useArrivals` in
`App.tsx`, over `RAISED_BY` in `notice.ts` — to be retired in favour of events the runtime
raises, and warned that whatever replaced `RAISED_BY` must derive its subjects rather than
be the same list one layer down. Four of the five facts can do exactly that, each beside
the mutation that makes it true and with no list anywhere:

- **xp gained** and **level reached** — `effects.ts` case `'xp'` is the only write of
  `state.xp[...]` in the tree, and it already computes `climbed` and pushes the levelled
  line to `state.log`.
- **items gained** — `receiveItem` in `itemInstance.ts` is the single door for both stacks
  and minted base copies.
- **a place found** — the two writes of `<location>.discovered`, both in `effects.ts`.

The fifth has no such site. **A quest's standing is nowhere in `GameState` and nowhere in
the save**: `journal()` recomputes it from conditions on every call, and those conditions
read flags, xp, inventory, location and visits — very nearly everything. So there is no
moment at which the runtime knows a quest advanced, and nothing to hang an event on. The
only shapes available are a diff at some coarser boundary — which is the same list re-homed
one layer down, the thing the line warned against — or making standing recorded state that
is updated when it changes.

Building the four and leaving the fifth is worse than building none: `App.tsx` would keep a
ref for the quest comparator, so the line's own closing condition would not be met, the lazy
view would stay blocked, and the world would run two notice mechanisms at once.

*Moves when:* you say whether a quest's standing becomes recorded state — a field in
`GameState`, written when the conditions that decide it are next evaluated, carried in the
save and migrated — or whether the diff stays and this line is dropped along with the lazy
view it was meant to unblock.

## What the log's scroll anchor should cost, now that CSS cannot replace it

Crossed over from `open-agent.md` on 2026-09-05. The line named CSS `overflow-anchor` as a
way out, and that reading of the effect is wrong: `overflow-anchor` only stops content
already on screen being pushed by an insertion above it. `Home.tsx`'s effect does the
opposite — it *moves* the scroll, to put the first line of the new batch at the top of the
column (`restingAt` clamps that offset to the furthest the column can scroll). No CSS
property scrolls to a line, so the measurement cannot simply be deleted, and every way of
asking the DOM where a line sits — `getBoundingClientRect`, `offsetTop`, `scrollHeight` —
forces the same layout.

Two routes are left and both are yours rather than a lane's:

- **Accept it.** 135ms of every 15 seconds of play, and the line already says it is small
  next to what has gone and named only because it is the last forced layout on the frame
  path.
- **Stop laying out lines nobody can see** — `content-visibility: auto` with a
  `contain-intrinsic-size` on each `Line`. This is the only route that keeps the behaviour,
  and it buys the saving by making the anchor's position an estimate wherever the anchor is
  off screen, which is exactly when a large batch lands.

The lane could not settle it either way, because jsdom has no layout engine: neither the
cost nor the correctness of an estimated anchor can be measured in this suite, and
`logRest.test.ts` proves the arithmetic rather than the layout. This is a change only the
author can see working.

*Moves when:* you say which of the two, having watched the log take a batch of lines in a
real browser.
