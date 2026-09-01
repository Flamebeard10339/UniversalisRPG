# Authoring and the engine, split apart — open, for a lane

Nothing. The split is done and gated.

No test reads a line of `content/` — `shipped.ts` refuses to open it under vitest, and
`scripts/corpusReach.test.ts` holds that door shut. The suite stands in `src/content/fixture/`,
walks its seventeen routes in `src/runtime/fixtureRoutes.test.ts`, and holds that world to the same
ten remarks an author's world is held to. `npm run oracle -- --at content` is the corpus's whole
verdict and CI runs it beside `tsc`, `npm test` and `npm run layer-check`.

What is left waits on the author, in `open-human.md`.
