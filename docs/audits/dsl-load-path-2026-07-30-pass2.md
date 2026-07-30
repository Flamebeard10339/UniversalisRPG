# DSL load path — audit, 2026-07-30 (pass 2)

Scope: `49b7ca6..f8c8c8d`. One code-changing commit touches this system's paths — `2c2ccee` ("Store
the simulation in integers"), and it touches exactly two lines of `content/tutorial-island.dsl`: the
`# save` fixtures' `version` and `time`. The previous pass (`docs/audits/dsl-load-path-2026-07-30.md`)
covered the loader at `49b7ca6` and none of its findings have been fixed, so this pass does not
re-derive them. It audits the half of this system the previous passes have never looked at: **`content/`,
the shipped DSL the load path exists to load**, in the context of the scale change that rewrote its
save fixtures.

Baseline at `f8c8c8d`: `npx tsc --noEmit` clean, `npm test` 509 passing across 33 files,
`npm run layer-check` 433 imports all pointing downward. Every claim below was reproduced against the
working tree; reproductions are quoted inline.

---

## H1 — the shipped end-to-end regression plays the whole tutorial with the health pool never initialised, and the fixture pins that as correct

`content/tutorial-island.dsl:383` (`# save miki-route-end`), reached from `:349` (`# test
miki-route-full`) through `src/runtime/integration.test.ts:32`.

`integration.test.ts` runs every shipped `# test` from a bare `createGameState()`. That constructor
leaves `resources: {}` (`src/runtime/state.ts:37`); pools are filled by `initResources`, which only
`initialState`/`startSession` call (`src/runtime/save.ts:80-86`). So the route begins with no health
pool at all, and `setPoolLevel` (`src/runtime/effects.ts:118`) fires `on empty:` only when
`raw < current && current > 0` — with `current` already `0`, the guard can never be met. The player
takes three rat bites at zero health, does not faint, and the run ends where it started:

```
BARE start resources: {}
BARE result: {"passed":true}
BARE end resources: {"tutorial-island.health":0}
BARE fainted flag: undefined
BARE hits taken: 3
```

Run the identical test against a state a player could actually be in — which is what `/test` in
`scripts/play-cli.ts` does, since it passes the live `session.state` — and it fails:

```
LIVE start resources: {"tutorial-island.health":30000}
LIVE result: {"passed":false,
  "failure":"save mismatch tutorial-island.miki-route-end: resources.tutorial-island.health: 21000 vs 0"}
LIVE end resources: {"tutorial-island.health":21000}
```

Three consequences, in order of severity:

1. **The fixture asserts a state no player can reach.** `21000` is the true end of this route. `0` is
   an artefact of the harness. `expect: miki-route-end` — the directive whose own comment at `:375`
   claims "The whole sheet, not a handful of flags: inventory, visits, xp, pools, the clock and the
   rng cursor all have to land where they landed" — is pinning a pool that never moved.
2. **Health has no end-to-end coverage at all**, and health is the resource this content is built
   around: `# resource health` (`:53`) is the only one carrying `on empty:`, and the block's own
   comment (`:57-60`) says it "is where health becomes the fatal one". Nothing in the shipped content
   has ever executed it.
3. **`/test` and CI disagree about the same test.** A regression authored interactively and passing
   under `/test` can fail under `npm test`, and this one does the reverse. The two callers of
   `runTest` hand it structurally different states and nothing says which is the contract.

This is also the root cause of the Runtime audit's M1 ("the shipped `# test` regressions pass with
every pool off by 1000x… because the one save fixture pins `health` at `0`, the value a scale change
fixes"). That finding measured the symptom; `health` is `0` because the pool was never filled, not
because the route drained it. `2c2ccee` migrated `time: 107.2 → 107200` in the line above and left
`"resources":{"tutorial-island.health":0}` untouched — correctly, since `0` scales to `0`, which is
exactly why the migration could not see it.

**Fix.** Decide the contract for `runTest`'s starting state and make both callers use it. If a `# test`
is meant to describe a real playthrough, `integration.test.ts` should hand it `initialState(registry)`
and the fixture should be regenerated (the header comment at `:377` already says to use
`/create-valid-test` when the route changes on purpose). The `travel:` concern in `runTest`'s comment
(`session.ts:361`) is about the *location*, not the pools, so it does not require an empty state.
Note that fixing this alone will make `/create-valid-test` emit against a rewound session until the
Testing-procedure H1 is fixed too.

---

## M1 — the canonical route skips a whole questline beat, so the equipment system has no shipped coverage

`content/tutorial-island.dsl:313` (`node skills`), and `:349` (`# test miki-route-full`).

`miki-route-full` talks to Miki after baking (firing `baked`, which sets `made-bread`), then fights
three rats, then talks again. By that second talk `rats-killed >= 3` holds, so `sendoff` wins and
`node skills` — gated on `made-bread`, `once` — is never reached:

```
visits: { greeting: 1, buffs: 1, baked: 1, sendoff: 1 }
has iron-sword  : (never given)
has wooden-shield: (never given)
```

Four of the eight authored nodes never fire in the tested route (`skills`, `skills-annoyed`,
`remind-mirror`, `snub`), and `skills` is not an optional flourish: it is the beat that hands over
`iron-sword` and `wooden-shield` and says "gear changes your stats the moment you equip it" (`:318`).
Both items carry stat bonuses (`+2 attack`, `+2 defense`, `mainhand`/`offhand`, `:101-107`), and
**neither is obtained anywhere in shipped content**, so the equip/stat-bonus mechanism is exercised by
unit tests only. The player also fights all three rats at base `attack 10` rather than the `12` the
authored progression intends, which means the fixture pins combat numbers from a route the content
does not describe.

`node skills-annoyed` (`:323`) is gated on `skills.visits >= 5`, so it is unreachable as long as
`skills` never fires at all.

**Fix.** Add a `talk: miki` between `assert: made-bread` and the first `use: entity.giant-rat.fight`,
and regenerate the fixture. This is content, not engine — the selection behaviour is correct, the
route just does not walk it.

---

## M2 — `dependencies:` in block form silently drops the version constraint

Fresh evidence for the open **H1** of the previous pass (`list.parseBlock` does not require the line
to be consumed), on a field that table did not cover and that decides load order and compatibility:

```
block  "base 1.0.0"             -> [{"prefix":"required","module":"base"}]
inline "base 1.0.0"             -> REJECTED: unexpected content: "1.0.0"
block  "base >= 1.0.0"          -> [{"prefix":"required","module":"base","operator":">=","version":[1,0,0]}]
block  "base 1.0.0 garbage here" -> [{"prefix":"required","module":"base"}]
```

`dependency.parse` (`src/grammar/dependency.ts:66`) requires an operator before a version and returns
early without one; `parseBlock` then discards the rest of the line. The correct form is
`base >= 1.0.0`, and `base 1.0.0` — the form a contributor is most likely to write, and the form the
issue template's `placeholder: base` does nothing to discourage — becomes an *unversioned* dependency
with no diagnostic. Inline rejects the same text.

This matters beyond the load path: the contribution system records what a mod "was validated against"
(`src/content/modportal.ts:50-53`), and the version half of that record can be silently erased at
parse time. Filed here rather than against that system because the defect is `list.parseBlock`'s.

It is also the strongest argument yet for the previous pass's H1 fix ordering: this is the fourth
distinct field found dropping authored text, all through the same one line.

---

## L1 — `parseSaveSection`'s comment says something the code does not do

`src/content/saveSection.ts:11`:

> The body is one line of JSON; the grammar has no multi-line support.

`section.body.map((line) => line.text).join('')` concatenates without a separator, so a multi-line
body parses fine:

```
# save two-liner
{"version":5,
"time":1000}
-> {"version":5,"diff":{"time":1000}}
```

Either the tolerance is intended, in which case the comment is false, or it is accidental, in which
case a body split across lines should be refused. As written the file states a constraint it does not
hold, which is the class CLAUDE.md sends to a test.

## L2 — shipped content carries members nothing can reach

Not defects in the loader; recorded because `content/` is this system's path and nothing else reviews it.

| Member | State |
| --- | --- |
| `# item cooked-shrimp` (`:96`) | no `give:`, no recipe, no drop — unobtainable in shipped content |
| `# flag fainted` (`:70`) | set by `health`'s `on empty:` (`:63`), read by nothing |
| `# flag snubbed-miki` (`:80`) | set by the `snub` choice (`:284`), read by nothing |

`roasted-chestnut` and `lockpick` are both obtainable and are not in this table; the thieving stub
(dresser → lockpick → `pick lock` → `xp: thieving 4`) is fully wired, just untested.

---

## Verified still open

No commit in this window touched `src/grammar` or `src/content`, so every finding of
`docs/audits/dsl-load-path-2026-07-30.md` stands. Two were re-run rather than assumed:

- **H1 — a block-form list line silently drops what it does not understand.** Still open.
  `src/grammar/list.ts:22` is unchanged; `adjacent:` / `far whille gate` still loads as an
  unconditional edge while the same text inline is rejected with `expected a direction`. M2 above is
  a fourth field on the same seam.
- **The `# save` body carries no validated references, by design.** Re-confirmed, and extended: a
  `# save` whose `version` is stale (`{"version":1,…}`) also loads clean at content level and fails
  only when a `# test load:` or `expect:` reaches `checkSave`. Both shipped fixtures are reached by a
  directive, so `2c2ccee`'s bump was covered; an unreferenced `# save` would not be.

M1, M2, M3 and L1–L5 of that pass were not re-derived here.

## Not findings

- **No layer violations, no scope drift, no CI/test/type weakening.** `2c2ccee`'s content change is
  exactly the fixture migration its message describes.
- **Sub-milli authored values.** `base: 0.0004` loads and stores `0.0004`, then rounds to `0` at
  `toMilliUnits`. The scale is the runtime's and the grammar is right not to know it; the interesting
  case (`ability: 2.5` differing across the two fight paths) is already Runtime M2.
- **A module with no `# info`** takes its id from the source name, but `loadUniverseWithDiagnostics`
  refuses it with a clear diagnostic when anything else is loaded. Checked while testing the
  contribution path; the guard holds.

## Recommended work order

1. **H1** — it is the reason a whole subsystem has no coverage, and it invalidates the one fixture the
   repo treats as its end-to-end contract. Blocked-adjacent on Testing-procedure H1: fix that first or
   the regeneration step cannot be trusted.
2. **M1** — one directive, then regenerate the same fixture H1 forces you to regenerate anyway. Do
   them in one pass.
3. **M2** — no new work; fold into the open list-parser H1 as its fourth reproduction.
4. **L1**, **L2**.
