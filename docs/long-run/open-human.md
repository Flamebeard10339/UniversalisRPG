## The welcome-back screen has not been looked at

The screen is the `welcome-back` modal, drawn by `ModalSheet` like every other,
with the summary arriving as the beat above the card because the away run pushes
it through `state.log` the way any spoken line travels. `src/ui/away.test.tsx`
proves it is raised, says what came of it, survives a page closed again before it
is answered, and goes when it is answered. Nothing proves it reads well — how the
summary is grouped, whether five lines is the right amount, whether a run that
gained nothing should raise a screen at all rather than a notice.

Looked at on 2026-09-05 and it needs work; the notes saying what were not yet
written down.

*Moves when:* you say what should change about how the summary reads.
