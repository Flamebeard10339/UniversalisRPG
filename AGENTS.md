# Agent Notes

UniversalisRPG is a JSON-driven React/TypeScript idle RPG intended for web,
Android via Capacitor, and open source community content contributions.

## Commands

- `npm run dev` starts the Vite web app.
- `npm run build` type-checks and builds the web app.
- `npm run dev:android` starts Vite and launches Capacitor Android live reload.
- `npm run sync` builds and syncs Capacitor assets.
- Vite commands use `--configLoader runner` so sandboxed builds do not trigger
  esbuild config-bundling reads outside the workspace.

## Content Rules

- Do not hard-code game content in TypeScript.
- Game content is authored as `.dsl` files under `content/` (e.g.
  `content/tutorial-island.dsl`), parsed by `src/game/contentDsl/`. See
  `docs/dsl-rewrite/grammar.md` for the authoritative grammar.
- Never create another persistence path for saving data. Only use the already
  existing local-universe storage API.
- Keep saves isolated by universe id.

## Code Style

- Prefer small, typed helpers in `src/game/` for data loading and validation.
- Use Zustand stores for persistent runtime state.
- Keep contribution-mode edits local-first and reviewable as JSON.
