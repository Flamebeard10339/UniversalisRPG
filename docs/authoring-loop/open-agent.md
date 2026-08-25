# What is still wrong that an agent can take

The queue an autonomous lane picks from. Everything here is open; nothing here is
done. **A line is deleted the day it closes** — not struck through, not annotated,
deleted — and if what it settled is something a later agent could get wrong, one
sentence about it goes in `settled.md` instead. Git holds the reasoning, and the
commit that closes a line is where the reasoning belongs.

Each line says what is wrong, how it is known, and what would close it. A line
without evidence is a hunch and does not belong here yet.

Everything here is proved headlessly — `npm test`, `npm run probe`,
`npm run oracle`, `tsc --noEmit` — and the shape is already settled, so a lane can
take one to the end without asking. What waits on the owner's play, his reading of
the writing, or a ruling nobody has taken is in `open-human.md`.

**A line here that turns out to need his judgement does not stay here flagged — it
moves, carrying what you measured.** Guessing the ruling and abandoning the lane
are the two bad answers, and the second is worse, because the measurement dies with
the session. `deliverable-log.md` states how a line crosses, in both directions,
and is the one place that rule is written.

---

## From the owner's play, 2026-08-24

Not recorded through the playtest tool, so no `# test` stands behind any of it. The
wants are the owner's own and are not in doubt; anything below that reads as a bug
still has to be reproduced before it is diagnosed.

Several of these crossed from `open-human.md` on 2026-08-25 when the ruling each waited
on was taken. **The ruling is stated in the line and is authoritative** — a lane takes
it as given rather than reopening it, and a lane that finds it cannot be held sends the
line back with what it measured.

**Nothing can be unallocated.** The ruling: passive points refund for free and jewel
sockets do not, so a socketed jewel is semi-permanent, and a node whose removal would
strand a socket cannot be taken back. `src/runtime/clusterPlane.ts` only ever grows a
plane — there is no unallocate of any kind, free or costly, to build that rule on.
*Closes when:* a plane can shrink, and refuses to shrink out from under a jewel.

## Ours, and small
