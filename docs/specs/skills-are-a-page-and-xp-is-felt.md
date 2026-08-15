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

- [c1] No level, threshold or progress figure is stored, and none is derived twice. The curve is read
  once, in `src/runtime/skills.ts`, and the level a total has reached is published beside that total;
  the page states it. The page's own arithmetic is one pure module with no clock, no curve and no
  view in it.
  proof: vitest src/ui/skillPanels.test.ts
- [c2] The page draws one panel per row the view publishes under `xp`, each carrying the skill's own
  title and its level inside a ring filled by the fraction of the way to the next one.
  proof: vitest src/ui/render.test.tsx
- [c3] Opening a panel states the four figures the ring cannot: xp held, xp still to earn, xp an hour
  and the time that leaves. The rate is measured against the world's own clock, from what the session
  has watched rather than from a field the engine would have to keep.
  proof: vitest src/ui/skillPanels.test.ts
- [c4] Every xp gain the view carries reaches a line, and the line names the skills rather than
  restating a total per skill: one number per skill however many grants reached it, and skills
  standing at the same number named together. No more than one line *begins* in any 200ms, and
  anything arriving inside that window is not dropped but joins the next line.
  proof: vitest src/ui/xpNotes.test.ts
- [c5] A line leaves on its own after two seconds without anything asking it to, and the class it
  travels and fades with is written in `transient.ts` like every other.
  proof: vitest src/ui/xpNotes.test.ts
- [c6] Crossing a level is said in the log, by the engine, in the played language, naming the skill
  and the level reached. It is said where the xp is granted, so every route that grants xp says it.
  proof: vitest src/runtime/skills.test.ts
- [c7] A crossed level marks the banner between the play surface and the character sheet and keeps it
  marked until the skills page has been looked at; opening that page acknowledges exactly the skills
  that crossed and settles everything back.
  proof: vitest src/ui/levelling.test.ts

- [c8] A thing arriving is said the same way, and each on its own line: two things that arrive
  together are two lines one after the other, never one line naming both, because two things
  arriving are two events and the player is owed both names.
  proof: vitest src/ui/xpNotes.test.ts
- [c9] Every skill the world declares is on the page, at the level everyone starts at until it is
  earned in. A page inferring a skill's existence from a total that has moved is reading the save
  rather than the world.
  proof: vitest src/runtime/session.test.ts

- [c10] A line holds its place until it has gone. Lines leave in the order they arrived, and a stack
  that closed the gap would jerk every line still on screen upward the moment the oldest went — so a
  line is placed rather than stacked, and the place a line leaves goes to the next line that begins
  rather than to the ones beside it.
  proof: vitest src/ui/xpNotes.test.ts
- [c11] A page positions what it opens over itself against the page and never against the window. The
  pages ride on a strip the shell moves with a transform, and a transform is the containing block for
  everything `fixed` beneath it, so a page that reached for the window would draw its panel a page's
  width off screen. The rule reads the pages off the shell's own `pane` rather than off a list.
  proof: vitest src/ui/pages.test.ts
- [c12] A line already saying a thing counts up rather than being followed by a second line saying
  it again, and takes what it is told the moment it is told — there is nothing to space out about a
  number going up. It stays while the work feeding it lasts and starts again from nothing once that
  work has stopped for a lifetime, so a skill worked at for a minute is one line and not a column.
  proof: vitest src/ui/xpNotes.test.ts
- [c13] A line the column is told again is counted rather than written out again. It keeps its id and
  its place, so nothing above it moves and the acknowledgement it played when it first arrived is not
  played again; whose words it is counts, so a diagnostic reading like something the world said is
  still its own line.
  proof: vitest src/ui/transcript.test.ts

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
  animation is named. The banner's mark moves a window over a gradient that stands still rather than
  turning one on and off, because a wave that blinks reads as a fault rather than as progress.
- **Extends** what the view publishes for a skill rather than letting the shell read the curve.
  `src/ui` may not reach into the runtime except through the play surface — the rule
  `surface.test.ts` holds every module under it to — so a page deriving a level would either have
  broken that rule or forced it open. Publishing `level`, `earned` and `span` on the skill row makes
  the page a reader of the engine's answer, which is what every other page on the character sheet
  already is, and leaves exactly one implementation of `xpForLevel` in the tree.
- **Adds** one engine key and one log line to `src/runtime/effects.ts`. The level-up sentence is the
  engine's own words and belongs where the total moves, not in a shell that would have to infer the
  crossing from two views.

## Open questions

None.
