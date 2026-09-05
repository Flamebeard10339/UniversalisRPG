## The welcome-back screen has been looked at and needs work

The screen is the `welcome-back` modal, drawn by `ModalSheet` like every other, with the
summary arriving as the beat above the card because the away run pushes it through
`state.log` the way any spoken line travels. `src/ui/away.test.tsx` proves it is raised, says
what came of it, survives a page closed again before it is answered, and goes when it is
answered.

Played on 2026-09-05. Two things about it are now work rather than questions, and stand in
`docs/open/open-agent.md`: the typewriter has no way to be skipped, which is wrong for a
summary the player is reading rather than being told, and the modals have no API, so each
agent that touches one invents a new way in.

What is still a judgement is how the summary itself reads: how it is grouped, whether five
lines is the right amount, and whether a run that gained nothing should raise a screen at all
rather than a notice.

*Moves when:* you say what the summary should say and how much of it, having read one after
a real reopen rather than a fixture one.
