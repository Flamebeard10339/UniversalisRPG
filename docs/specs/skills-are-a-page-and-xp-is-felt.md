# skills-are-a-page-and-xp-is-felt

## Deliverable

Skills stop being a two-column ledger of totals nobody can act on. The page becomes a panel per
skill carrying the level inside the ring that fills toward the next one, and opening a panel says
what the ring cannot: how much has been earned, how much is left, how fast it is arriving and how
long that leaves. Earning is felt as it happens — a line of text at the top of the screen naming
what was gained, and, when a level is crossed, a message in the log and a mark on the banner that
persists until the player has gone and looked. Nothing here stores a level: the curve
`skill-levels-xp-events` shipped is the one that answers, and everything on the page is derived from
the xp total the view already publishes.

Proof:

- [c1] No level, threshold or progress figure is stored or restated. Every number the page draws is
  derived from a published xp total through `src/runtime/skills.ts`, and the page's arithmetic is one
  pure module with no clock and no view in it.
  proof: vitest src/ui/skillPanels.test.ts
- [c2] The page draws one panel per row the view publishes under `xp`, each carrying the skill's own
  title and its level inside a ring filled by the fraction of the way to the next one.
  proof: vitest src/ui/render.test.tsx
- [c3] Opening a panel states the four figures the ring cannot: xp held, xp still to earn, xp an hour
  and the time that leaves. The rate is measured against the world's own clock, from what the session
  has watched rather than from a field the engine would have to keep.
  proof: vitest src/ui/skillPanels.test.ts
- [c4] Every xp gain the view carries produces one line, and the line names the skills rather than
  restating a total per skill: skills that gained the same amount are named together. No more than
  one line begins in any 500ms, and a gain arriving inside that window is not dropped but joins the
  next line.
  proof: vitest src/ui/xpNotes.test.ts
- [c5] A line leaves on its own after two seconds without anything asking it to, and the class it
  travels and fades with is written in `transient.ts` like every other.
  proof: vitest src/ui/xpNotes.test.ts
- [c6] Crossing a level is said in the log, by the engine, in the played language, naming the skill
  and the level reached. It is said where the xp is granted, so every route that grants xp says it.
  proof: vitest src/runtime/effects.test.ts
- [c7] A crossed level marks the banner between the play surface and the character sheet and keeps it
  marked until the skills page has been looked at; opening that page acknowledges exactly the skills
  that crossed and settles everything back.
  proof: vitest src/ui/levelling.test.ts

## Goal

Progress the player can see arriving and go and read about, from the totals the engine already
publishes and a curve that is already shipped.

## Decisions

- **Takes over** the skills reading of "the map and the character sheet": the `Ledger` stays for
  stats, equipment and inventory and stops being what Skills is drawn with. Skills is the one of the
  four with a shape of its own — a level, a fraction and a rate — and drawing it as a dictionary was
  what made it unreadable.
- **Discharges** `floating-text-for-xp-events`, which has been open since 2026-08-07 waiting for
  exactly this: the channel `gui-rebuild` c10 built, wired to the event `skill-levels-xp-events`
  publishes.
- **Extends** the one channel every played moment is begun on rather than opening a second: the xp
  line and the banner's mark are classes written in `transient.ts`, which is where the rule says an
  animation is named.
- **Adds** one engine key and one log line to `src/runtime/effects.ts`. The level-up sentence is the
  engine's own words and belongs where the total moves, not in a shell that would have to infer the
  crossing from two views.

## Open questions

None.
