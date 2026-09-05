# Open — these wait on the author

## The welcome-back screen has not been looked at

`WelcomeBack.tsx` is proved by `src/ui/away.test.tsx`: it is drawn when a page
comes back on something under way, it says what came of it, and it goes when it
is answered. Nothing proves it reads well — how the summary is grouped, whether
five lines is the right amount, whether a run that gained nothing should draw a
screen at all rather than a notice.

*Moves when:* the author has played a reopen and said what should change.

## The clock runs the whole away window, even after what was under way ends

`ranWhileAway` spends the away span through `resolve`, which is the identical
call the live ticker makes each tick. So an action that repeats keeps repeating,
and an action that completes once completes and then the remaining span passes
with nothing under way — buffs expiring and pools filling as they would have.

That is defensible, and it is one mechanism rather than two, which is why it was
built this way. But it means a one-shot action left running at bedtime hands
back its one result plus four hours of idle world, and a player might read the
screen as though the four hours were the reward.

Measured: a fixture dig, away one hour, gained the same at 1x (ran 1h) and at
16x (ran 4h, capped) — because the dig completes once. Page-open cost 16-27ms.

*Moves when:* the author rules whether the away run stops the moment nothing is
under way, or goes on spending the window as it does now.

## How long a recorded run may get before the quota bites

Parts hold the *write* cost flat — measured over the shipped world, 12000 turns
wrote 557 MiB with no single write past 92 KiB, against 1.4 GiB for 4000 turns
before. What they do not hold flat is the *total*: every part stays in the store,
so a run costs about 0.18 MiB per 1000 turns and shares a roughly 5 MB
localStorage budget with the save, the transcript and the local-changes module.
Around 25000 turns that budget is gone.

What happens then is not silent: the recorder complains and the run goes on in
one piece rather than in parts. But the game's own autosave is writing into the
same budget, so a recorded run left going indefinitely can eventually starve it.

*Moves when:* the author says whether a run should stop itself at some length,
drop its oldest parts, or be left to the player to download and restart.
