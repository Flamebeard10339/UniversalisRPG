# Tool friction

Raw notes on where the tooling — repo scripts, the agent harness, the CLI — cost time or
produced a wrong state. Each entry is something that actually happened, not a speculative
improvement. Newest section last.

## architecture-map (2026-08-03)

### Verifying new library code against real repo data has no home

1. **A one-off probe of a `scripts/lib` module cannot live in the scratchpad.** Checking the new
   ownership rule against the live `systems.json` meant importing `./scripts/lib/systems` and
   running `git ls-files`. From the session scratchpad the relative import does not resolve, and
   `tsx` reports it as `MODULE_NOT_FOUND` against a path that looks nothing like what was written.
   The working move was to write a `scratch-check.ts` into the worktree root, run it, and `rm` it
   in the same command so a stray file could not be committed.

   `npm run probe` is the repo's sanctioned answer to "ask a question without building a runner
   for it", but it is bound to the DSL load path — it takes DSL sources and answers about the
   registry. There is no equivalent for the script layer, and CLAUDE.md's "reach for probe instead
   of a scratch `*.test.ts`" therefore has a gap exactly where this branch works.

   **Wishlist.** Either a `npm run probe -- --module <path> --call <export> <args...>` mode, or one
   documented sentence in CLAUDE.md saying a deleted-in-the-same-command scratch script at the
   worktree root is the sanctioned move for non-DSL code. The second costs nothing and would have
   saved a failed attempt.

### The Bash tool mangles backslashes inside a quoted heredoc

2. **`<<'EOF'` did not stay literal.** Writing a JS file containing `.replace(/\\/g, '/')` through a
   quoted heredoc produced `.replace(/\/g, '/')` on disk — one backslash eaten, which turned a
   valid regex into a syntax error two levels down. A quoted heredoc is supposed to suppress every
   expansion, so the corruption is silent and the error surfaces at parse time in a file that looks
   right in the transcript.

   It recurred in a different shape when appending a block of TypeScript to a test file: the shell
   failed with ``unexpected EOF while looking for matching `'`` at a line inside a `<<'TSEOF'`
   body, so the terminator was not recognised and *nothing was written*. That failure at least was
   loud; the backslash one was silent, which is worse. Both cost a round trip.

   The reliable path is the `Write` tool for any file containing backslashes or quote-heavy code —
   write to the scratchpad, then `cat` it into place. `Write` also refuses to overwrite a file that
   has not been read, which is the safer default.

   **Wishlist.** Either fix the escaping, or have the Bash tool warn when a heredoc body contains a
   backslash. Losing a character silently in a code-generating command is the worst shape of bug —
   it looks like the model wrote broken code.

### A git worktree gets no `node_modules`, and 97 tests fail for that reason alone

4. **`npm test` reported 98 failures across four files, and 97 of them were the environment.**
   `EnterWorktree` creates the worktree and the session works there, but nothing installs or links
   dependencies into it. `npx tsx` still works, because npx resolves upward — so every command
   used during development succeeds, and the gap stays invisible until the test suite runs.

   The suites that fail are the ones spawning a subprocess through a *hardcoded* interpreter path:

   ```
   const tsx = path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs');
   ```

   In a worktree that path does not exist, `node` exits 1 with `Cannot find module`, and the test
   sees empty stdout. The assertion that then fails is `expected '' to contain 'Enabled ...'` —
   which reads exactly like a logic bug in the code under test. I spent a stash-and-bisect cycle
   confirming the failures predated my changes before finding the real cause.

   Fix: `rm -rf node_modules && cmd //c "mklink /J node_modules <main-checkout>\node_modules"`.
   A junction rather than a copy, and `node_modules/` is already gitignored so nothing leaks.
   Worth noting the worktree also had an *empty* `node_modules/` containing only vitest's `.vite`
   cache, which is why a bare `ls -d node_modules` says it exists.

   **Wishlist.** `EnterWorktree` should link or install dependencies when the repo has a
   `node_modules` and the new worktree does not — or say, once, that it has not. Failing that, the
   test helpers should resolve the interpreter rather than hardcode a path
   (`require.resolve('tsx/cli')`), so a worktree run fails with a real message instead of an
   assertion about output that was never produced.

### `tasks` warns about uncommitted store state on every single write

3. **Six consecutive `tasks add` calls printed the same warning six times.** `docs/tasks.jsonl has
   uncommitted task-state changes` is a genuinely valuable warning — friction item 17 of
   `task-system-friction.md` is the incident that earned it. But it fires on the write that *itself*
   created the uncommitted state, so a planner adding a plan of six members is told six times about
   a condition it is in the middle of creating deliberately.

   **Wishlist.** Suppress it when the only uncommitted change is the one this invocation just made,
   or print it once at process exit rather than per write. The signal is right; the repetition
   trains the reader to skip it, which is exactly how the incident it guards against recurs.
