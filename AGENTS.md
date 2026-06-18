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
- Never hard-code English UI strings in the codebase. Use localization ids in
  code and put display text in JSON localization files, including GUI text.
- Locations, edges, actions, skills, and localizations live under
  `public/content/universes/*`.
- Shared app/UI localization lives under `public/content/gui/locales/`.
- Add or update schemas in `src/game/schema/` when changing JSON shape.
- Keep saves and contribution drafts isolated by universe id.

## Code Style

- Prefer small, typed helpers in `src/game/` for data loading and validation.
- Use Zustand stores for persistent runtime state.
- Keep contribution-mode edits local-first and reviewable as JSON.
