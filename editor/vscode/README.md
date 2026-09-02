# Universalis DSL, in VS Code

Syntax highlighting for `.dsl`. It is a folder extension: nothing is packaged and
nothing is published, so it is installed by putting it where VS Code looks.

Link it, from the repository root:

```bash
cmd /c mklink /J "%USERPROFILE%\.vscode\extensions\universalis-dsl" "%CD%\editor\vscode"
```

```bash
ln -s "$PWD/editor/vscode" ~/.vscode/extensions/universalis-dsl
```

Then restart VS Code. A junction rather than a copy is the point: the grammar is
generated, so a link picks up a regeneration with no second step.

## What it paints

`syntaxes/dsl.tmLanguage.json` is written by `npm run tmgrammar`, off the section
declarations in `src/content/sections/`. Nothing in it is typed out by hand, so a
kind or a field added next month is highlighted having added nothing here, and
`scripts/tmgrammar.test.ts` fails if the checked-in file has fallen behind.

- a `# <kind> <id>` heading, with a kind the engine does not have marked as an error
- the keys and bare words each kind takes, in the body of that kind and nowhere else,
  including the `+` and `-` that write over a body already there
- an action label, the line that names a block rather than fills a field
- `@@@`, the note that stands, and a `//` line without one, which `npm run comment-check` refuses
- a `# save` body as one opaque run, since it is written by the engine rather than by an author

It does not know whether an id resolves. That is the oracle's to say:
`npm run oracle -- --at <file>`.
