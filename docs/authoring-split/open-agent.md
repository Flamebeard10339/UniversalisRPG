## Nothing reports a fixture shape that no claim reaches any more

`src/content/fixture/` is four modules under two packs — `core`, `fixture-town`,
`fixture-combat` and `fixture-quests`. Every piece of it went in because a claim had nothing
to fire on without it, which is the right reason, and that half is enforced by the claims
themselves going vacuous when a shape is missing.

The other half is not enforced at all. A shape no claim reaches any more is filler, and
filler is what stops a fixture being readable whole — which is the only property that makes
it cheaper to stand a test in than the shipped corpus.

Ruled 2026-09-05 that this wants reporting rather than being left to whoever next reads the
world end to end.

*Closes when:* a sweep names a fixture section that no test and no route reaches, deriving
both sides — the sections off the registry, the reaches off the suite and
`fixtureRoutes.test.ts` — so that nothing is listed and a module added next month is covered
by having been added.
