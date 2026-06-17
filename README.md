# UniversalisRPG

A JSON-driven text adventure idle RPG built with React, TypeScript, Vite,
Zustand, React Flow, Tailwind CSS, and Capacitor.

The game is designed around community-authored universes. Locations, edges,
actions, skills, and localization strings are loaded from JSON files rather than
being hard-coded in TypeScript.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Content

The base universe lives in `public/content/universes/base/`. Contribution mode
stores local drafts, validates them, previews them in the running game, and can
package the generated JSON into a GitHub issue.
