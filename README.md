# UniversalisRPG

A text adventure idle RPG built with React, TypeScript, Vite, Tailwind CSS and
Capacitor.

The game is designed around community-authored worlds. Everything a world is —
its places, the things standing in them, what a player may do, the skills those
pay into, and every word said to a player — is written in a small line-based
language under `content/`, and nothing about it is hard-coded in TypeScript.

`npm run oracle` prints that language, derived from the declarations rather than
written out beside them, and it is the whole reference for writing a world.
`npm run oracle -- --at content` reads the shipped world back and is the gate it
answers to. `CLAUDE.md` is the working reference for the repository itself.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Editor

Syntax highlighting for `.dsl` in VS Code lives in `editor/vscode/`, generated
from the section declarations by `npm run tmgrammar`. Its README says how to
link it.
