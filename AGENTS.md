# Agent Notes

UniversalisRPG is a JSON-driven React/TypeScript idle RPG intended for web,
Android via Capacitor, and open source community content contributions.

## Commands

- `npm run dev` starts the Vite web app.
- `npm run build` type-checks and builds the web app.
- `npm run dev:android` starts Vite and launches Capacitor Android live reload.
- `npm run sync` builds and syncs Capacitor assets.

## Content Rules

- Do not hard-code game content in TypeScript.
- Locations, edges, actions, skills, and localizations live under
  `public/content/universes/*`.
- Add or update schemas in `src/game/schema/` when changing JSON shape.
- Keep saves and contribution drafts isolated by universe id.

## Code Style

- Prefer small, typed helpers in `src/game/` for data loading and validation.
- Use Zustand stores for persistent runtime state.
- Keep contribution-mode edits local-first and reviewable as JSON.
