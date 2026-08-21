# Make the grammar panel read its inputs instead of discovering them

## The problem

`src/content/completion.ts` (631 lines) is the machine behind the editing page's
grammar panel and behind `npm run oracle`. It answers, for a cursor in a draft:
which shapes this line could be, which hole the cursor is in, what may stand in
that hole, and what the engine refuses.

The section files under `src/content/sections/` **declare** the grammar. But
completion.ts does not read most of those declarations — it re-derives them by
experiment:

- `kindsStanding` (line 294) learns what kind a hole names by writing the
  sentinel `PROBE = 'zzprobezz'` into it, parsing the whole section, and seeing
  which reference kind the engine reports for that id.
- `describerIn` (line 322) learns which parser describes a hole by trying every
  multi-form parser in the universe (~20) and keeping the one that both reads
  the hole's example and whose own examples parse where the hole stands.
- `saysKind` (line 397) is `kindsStanding` again, for the note on an offer.

This is not a second *list* that drifts. It is a second *authority*: the kind
file is the truth and completion.ts guesses at it. Every bug found in the
2026-08-21 session was that guess going wrong.

## The evidence

| symptom | the guess behind it | how it was patched |
| --- | --- | --- |
| `on d` in an entity offered `tutorial-island.death` under a family called `<item>`, over an `<operators>` line reading `-` | `describerIn` tried 20 parsers; an entity nests actions, so `on 3 plank:` parses as an action *called* `on 3 plank` and nothing refuses it. Five parsers fitted; the one with the most forms won | commit `98147ea` — the hole's line already declared `names: 'event'`, so it is no longer searched for a grammar |
| the same id offered twice, bare and as a whole line | two paths independently deciding what fills a hole: `addressOffers` from probed kinds, `namedOffers` from the `names` declaration | commit `291df34` — `namedOffers` deleted; it could only ever fire where the bare offer already had |
| `on hit:` and `on <event>:` in different families, though both are events | the family came from *how the engine stores the field* (schema field vs grammar line) | commit `7ec102a` — the schema stops inventing a family; a kind declares what a line is for |
| combat fields (`respawn after:`, `on hit:`, `when hit:`, `aggressive`, `allies`) offered on an entity with no `stats:` | the `needs` gate asks a parsed section and read "could not parse" as "go ahead" | commit `910f2e3` — asks the section as far as the engine can read it |

Each fix replaced a guess with something the kind file already knew. The guessing
machinery is still there, and so is the next bug in this class.

## The measurement

Run over every kind's grammar (`sections()` and `owner.grammar`):

- 255 grammar lines, 306 placeholders in them
- **1** line declares what it names (`on <event>:` in `src/content/sections/entity.ts:95`)
- **29** lines are probed to learn they name a kind *that the hole's own name does
  not already say*

So the overwhelming majority of holes already say what they hold: a hole written
`<item>` names a `# item`, `<flag>` names a `# flag`, `<skill>` names a `# skill`.

## The proposed change

**A hole's name is the kind it names, unless its line says otherwise.**

1. Read `<item>` as naming a `# item` — no declaration needed, no probe.
2. The ~29 exceptions declare theirs. `names?: string` on `Written`
   (`src/grammar/parser.ts:12`) already exists and is the right facet; it may
   need to become per-hole rather than per-line, since one line can carry two
   holes naming different kinds.
3. A hole that is filled by a value grammar rather than an id says which parser
   writes it. For a keyed field the parser is already known — `fieldNamed`
   (`src/content/completion.ts`) returns it, and the shapes under a keyword are
   already built from `named.parser.forms`. It is only unknown for lines authored
   as raw forms in a kind's `grammar:` array.

Then delete: `PROBE` (74), `kindsStanding` (294), `describers` (301), `reads`
(306), `sat` (316), `takes` (318), `describerIn` (322), `heldIn` (349), `broken`
(360), `saysKind` (397). Estimate ~150 lines; verify rather than trust it.

**`namedIn` (245) must stay** — `undeclaredIn` uses it to collect the references
a section makes, which is a different job from probing. Only its probing caller
goes.

Do **not** move the panel machine into the section files. Alignment, narrowing,
grouping and the path are one machine; 24 copies would be the sync problem for
real. It is the machine's *inputs* that belong in the kind files.

## Constraints

From `CLAUDE.md`:

- One kind is one file under `src/content/sections/`. No per-kind table anywhere
  else. A module a section file imports may not read the section list —
  `scripts/lib/acyclic.test.ts` is the guard.
- Layers: `grammar < content < runtime < ui < scripts`, gated by
  `npm run layer-check`.
- Extend `src/content/dsl.test.ts` with claims that pick their own subjects from
  the section list, rather than writing per-kind tests. There are already
  several to build on: `a hole a line says it names`, `what the page offers where
  the cursor stands in a hole`, `a line that only makes sense once another is
  written`.
- `npm test` runs in about twenty seconds. Keep it there.
- Comments only for facts owned by the file and not derivable from reading it.

## How to check the work

- `npm run oracle -- <kind>` prints the grammar a kind offers; `npm run oracle --
  --at <draft.dsl>` walks a draft line by line. Both read the same machine as the
  page, so a change that breaks the panel breaks the oracle output first.
- `npm run inspect -- -` with a script on stdin evaluates against the repo's own
  module resolution — the fastest way to draw the panel for a given cursor
  without a browser. The panel is `offeringAt` + `pathOf`
  (`src/ui/grammarPath.ts`) + `gathered`/`shownIn` (`src/ui/offerGroups.ts`).
- The corpus claim in `dsl.test.ts` asserts that over content the engine loads
  clean, nothing is called amiss and no id is called undeclared. If the kind
  behind a hole is read differently, that claim is what will catch it.
- `npx tsc --noEmit`, `npm test`, `npm run layer-check`.

## Open questions for whoever picks this up

- Is `names` per-line or per-hole? `on <event>:` has one hole; a line with two
  holes naming different kinds needs the finer grain. Check whether any of the 29
  are such lines before choosing.
- What replaces `heldIn` for `<condition>`? It is the one hole with a genuine
  value grammar worth showing (`and`, `or`, `not`, `has`, the comparisons) *and*
  a kind it names. Its parser is a declared field parser, so it should be
  readable rather than discovered — confirm that before deleting `describerIn`.
- `saysKind` produces the "— names a # skill" notes on offers. Those should fall
  out of the hole's declared kind, but check the wording it currently produces
  for holes that name a kind *and* put something else there, e.g. `<weight>`.
