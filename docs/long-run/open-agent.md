## The away run spends the whole window; the live clock does not

`ranWhileAway` in `src/runtime/session.ts:762` gates on something being under way when the
page closed, and then spends the **entire** away span through one `resolve` call. So an
action that completes once hands back its one result and the rest of the window passes with
nothing under way — buffs expiring, pools filling. Measured: a fixture dig, away one hour,
gained the same at 1× (ran 1h) and at 16× (ran 4h, capped), because the dig completes once.
Page-open cost 16–27ms.

The live clock does not behave that way. `advance` in `src/ui/driver.ts:280` returns at once
when nothing is running and calls `close()` the moment `progress.active` goes false, so live
time only passes while an action is rolling.

Ruled 2026-09-05: **offline progression mirrors the live tick exactly, by construction rather
than by anyone remembering.** The point is not that the away run should stop today — it is
that if the app is later made to tick with nothing under way, the away run must follow with
no second edit and nobody recalling that there were two places. So the fix is the two reading
one decision about whether a span is spent, not the away run being taught this year's answer.

*Closes when:* the away run and the live tick take that decision from one place, and a
fixture action that completes once leaves the remainder of the window unspent because the
live rule says so. A `# test` in `open-tests.dsl` walking a one-shot action across a long
away span is the cheapest way to pin it, and is the lane's first move.
