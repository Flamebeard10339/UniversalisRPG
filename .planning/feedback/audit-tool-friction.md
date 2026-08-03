# Audit tool friction

## `tasks audit` with a full pass plus findings exceeds the Windows argument limit

2026-08-03, auditing `tasks-roadmap`.

`audit-prompt` asks for verdicts and findings "in the same `tasks audit` call". Nine clauses with
re-runnable evidence plus five findings with both halves came to roughly 13k characters of argv, and
the shell answered `The command line is too long.` — nothing ran, and the failure arrives after the
whole invocation has been composed.

Worked around by splitting into six calls: one carrying all nine `--proof`/`--evidence` pairs, then
one finding each. That is safe by the command's own design (`findings with no --proof flags are filed
without recording a pass`), and the output confirms it each time — but the prompt's phrasing reads as
though one call is required, so the split looks like a workflow violation until you check.

Worth considering: `tasks audit --from <file>` reading the same flags from a JSON or argfile, which
would also stop long evidence from being escaped through two shells.

## No cheap way to ask a `scripts/` renderer a question with a synthetic store

`npm run probe` asks the DSL load path questions without a scratch runner, and CLAUDE.md says to reach
for it instead of a scratch `*.test.ts`. There is no equivalent for the task-system CLI: verifying the
78-column clause against a store the real one cannot contain meant writing a throwaway `.ts` at the
repo root and deleting it, because `npx tsx -e` does not resolve the repo's relative imports. `npm run
mutate` covered the rest of the clauses well — twelve mutations, twelve killed — so the gap is
specifically "render this view over records I made up", not "test the logic".
