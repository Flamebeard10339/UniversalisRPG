# Tool friction

Raw notes on where the tooling — repo scripts, the agent harness, the CLI — cost time or
produced a wrong state. Each entry is something that actually happened, not a speculative
improvement. One section per session, newest last.

## `npm run tasks`, running action-kinds-and-templates end to end

Collected while running one spec end to end (`action-kinds-and-templates`): spec → plan → work →
audit → triage → fix. Ordered by how much each one cost.

### 1. `tasks audit` records a whole pass, so findings and verdicts cannot be filed separately

**Cost: highest. It silently discarded ten graded clauses.**

I recorded pass 1 with ten `--proof` verdicts. I then ran `tasks audit` again to file the four
findings, because the command line for both together is enormous. Pass 2 graded nothing, so:

```
pass 1: outstanding: c2 (unmet)
pass 2: outstanding: c1 (unknown), c2 (unknown), ... c10 (unknown)
clause standing (latest pass 2): all unknown
```

The standing reads from the *latest* pass only. Filing findings wiped the verdicts. I had to restate
all ten in a pass 3, and the store now carries a permanent pass 2 that says nobody looked at
anything — which is false, and is exactly the confusion the `unknown`/`unmet` distinction exists to
prevent.

The tool is self-consistent: a pass is an atomic statement about the branch. But a finding is not a
statement about a clause, and it is the only thing that made me want to invoke the command twice.

It then happened **a second time**, in the same session, after I had written this entry. Filing two
new findings from a second audit reset all ten clauses to unknown again, and pass 6 exists only to
restate pass 4's verdicts. Knowing about the trap did not avoid it, because the natural unit of work
is "file this finding", not "restate the entire branch's standing". A footgun you cannot avoid by
knowing about it is a design problem, not a discipline problem.

**What would fix it:** either carry the latest verdict forward for a clause the new pass does not
grade, or split finding-filing out of `audit` entirely (`tasks finding ...`), or accept `--proof`
and `--finding` from a file so one pass is writable in one invocation without a 4000-character
command line.

### 2. The command line for a real pass is unwritable by hand

Ten clauses with evidence and file references, plus nine findings with severity, system,
deliverable, evidence and files, is a single shell command of roughly 6000 characters, with
`--evidence` overloaded two ways (`--evidence 3="..."` binds to clause 3; a bare `--evidence "..."`
binds to the preceding `--finding`). Positional coupling that long is easy to get silently wrong —
a misplaced `--evidence` attaches to the wrong finding and nothing complains.

**What would fix it:** `tasks audit <spec> --from <file.json|md>`, or an interactive walk that also
covers findings (the clause walk already exists when `--proof` is omitted).

### 3. `tasks spec new` refuses when the spec file already exists

The workflow's own order is "the spec is the promise" first, then plan. Writing
`docs/specs/<slug>.md` and then registering it costs a failed command:

```
error: spec already exists: docs/specs/action-kinds-and-templates.md
```

Refusing to clobber is right. Refusing to adopt is not — there is nothing to clobber if the tool
would treat an existing file as the spec it was about to create.

**What would fix it:** adopt an existing file (and say so), or `--adopt`.

### 4. Clause standing reads clauses only from under `## Deliverable`, and says nothing when it finds none

I wrote the spec with a prose `## Deliverable` and a sibling `## Proof` heading holding `- [c1]`…
`- [c10]`. The tool reported:

```
clause standing (no audit pass recorded): no clause to grade
```

which reads as "this spec has no clauses" rather than "I looked under `## Deliverable` and found
none". The spec looked well-formed and graded nothing. Moving the list under `## Deliverable` fixed
it instantly.

**What would fix it:** name the heading it searched in the message, or accept clauses anywhere in
the document.

### 5. Generated finding ids are truncated at ~60 characters and are unusable as handles

```
action-kinds-and-templates-pass2-the-kind-cadence-table-is-e
action-kinds-and-templates-pass3-grammar-md-which-agents-md-
```

Every id from one pass shares a 33-character prefix, so the distinguishing part is what gets cut.
`tasks show <id>` needs the whole string, and two of these differ only near the end.

**What would fix it:** a short stable handle (`akt-p2-h2`) alongside the slug, or accept an
unambiguous prefix/suffix match in `show`/`log`.

### 6. The uncommitted-store warning fires on every write

```
warning: docs/tasks.jsonl has uncommitted task-state changes; commit them before
cleanup/reset, or another session may miss working-tree-only state
```

Printed on every `add`/`edit`/`start`/`done`/`audit`. A session that legitimately writes fifteen
records before its first commit sees it fifteen times, which is how a real warning becomes
invisible. It is also self-fulfilling: the write that triggers it is the one that made the tree
dirty.

**What would fix it:** warn once per invocation at most, or only when the working-tree changes are
older than this process.

### 7. `# remove <kind>.<id>` vs `# remove <kind> <id>`

Not a tool issue but the same class: I wrote `# remove entitytype melee-foe` and got
`unexpected content`, because the syntax is `# remove entitytype.melee-foe`. The error named the
line but not the expected form, while `parseRemoval` has a good message
(`# remove names a kind and an id, as in \`# remove entity.mirror\``) that this path never reaches.

### 8. Closing a spec leaves no trace in the event log

`tasks spec done <slug>` on a spec whose members are all closed reports
"action-kinds-and-templates is done: every member is done or declined" and writes nothing — no
store change, no `docs/events.jsonl` line. The workflow says every store write appends to the log
automatically, and "a spec closed" is the one event a later reader most wants a date for. `tasks log
--spec <slug>` can tell you when every member closed but not when the spec did.

**What would fix it:** append a `spec-done` op even when the state transition is a no-op, or say
plainly that it recorded nothing.

### What worked, and is worth keeping

- `tasks plan` graded the two-task set in one command and correctly reported the sequencing note
  rather than a false defect, because the `requires` edge was present. It cost nothing and told me
  the decomposition was sound before any code was written.
- `tasks log --op decision` answered "what has been decided on this branch" exactly, with no text
  matching, which is the thing git genuinely cannot give you.
- An `unmet` clause creating an open `undelivered` member with no triage step is the right
  asymmetry, and it worked: c2 became work the moment it was graded.
- `tasks doctor` failing on exactly one condition, and reporting everything else, meant I never
  once fought the tool to land a commit.

# Tool friction — `audit-probe-tooling`, session of 2026-08-03

A second pass, collected while building `npm run probe` and `npm run mutate`. Same ordering: what
cost the most first. Items 1 and 2 are not `tasks` at all.

## 1. Nothing can answer "is another agent writing to this tree right now"

**Cost: highest. It produced a confident, wrong diagnosis that I nearly reported as a finding.**

Measuring the suite before starting, `npm test` came back `2 failed | 983 passed`, naming two tests
by name. Both passed when run alone. I formed a test-pollution hypothesis, ran a comparison with
`--exclude`, and was one step from filing it. The next plain run returned `989 passed` — four more
tests than ninety seconds earlier. Another agent was mid-edit in the same working tree, which I
learned only because the user said so.

Every read I had — `git status`, `npm test`, `Read` — answers about a tree that is being written
underneath the answer, and none of them says so. The cost is not the wasted runs; it is that a
snapshot of someone else's half-finished edit is indistinguishable from a real defect, and reads
*more* like a real defect the more precisely you measure it.

**What would fix it:** anything that makes concurrent writers visible — a session registry, a lock
file with a holder, or `git status` noting that the index changed during the command. Failing that,
a convention that agents working a shared tree announce it somewhere a sibling can read.

## 2. `vitest --exclude` on the command line did not exclude, and said nothing

Testing the pollution hypothesis, I ran `npx vitest run --exclude '**/zzprobe*' --exclude
'**/node_modules/**'` and got `45 passed (45)`, against `2 failed | 43 passed (45)` moments before.
That reads as proof. It is not: the test count was `985` both times, so the same set had run and the
difference was the concurrent edit, not my exclude.

A flag that silently matches nothing is bad; a flag that silently matches nothing while the run
*looks* different is worse, because the surrounding noise supplies a false confirmation. Only the
identical test total gave it away, and nothing in the output invited me to check it.

**What would fix it:** report the filter that was applied and how many files it removed. Zero
removed is the interesting case.

## 3. `tasks decision` reads a leading `--` in the message as a flag

```
npm run tasks -- decision "--each added mid-branch: ..."
```

printed the usage line. The message is a positional string that happens to start with a dash,
and the tool has no `--` terminator of its own, so the text is unwritable as typed. I dropped the
dashes and the sentence now records a flag name that is not spelled the way the flag is spelled.

**What would fix it:** treat the first positional after `decision`/`note` as text unconditionally, or
say "that looks like a flag; pass it after `--`" instead of the usage block.

## 4. `tasks doctor` calls the normal mid-branch state an error

```
[error] apt-mutate is done only in the working tree (committed state: open)
```

This is what every branch looks like between `tasks done <id>` and the commit that carries the store
change — which is *the documented order*, since `done --commit HEAD` needs the commit to exist. It
is reported at `[error]`, one level above the two genuine warnings beside it. An error that fires on
the correct workflow trains you to read past errors.

**What would fix it:** it is a warning, or it is suppressed when the working-tree change is the
current branch's and newer than its last commit.

## 5. The uncommitted-store warning still fires on every write

Item 6 of the previous session, unchanged and reconfirmed: eight `add`/`edit`/`done`/`start` calls,
eight identical warnings. Worth recording only because it is now the second session in which every
single store write printed it, which is the definition of a warning nobody reads.

## 6. The scratchpad path is 130 characters and appears in every command that uses it

```
C:/Users/yonat/AppData/Local/Temp/claude/C--Users-yonat-Projects-UniversalisRPG/<uuid>/scratchpad
```

This is not cosmetic. The probe that motivated this branch **hard-coded that absolute path into
TypeScript source** and committed the file to `src/content/`, because writing it once into a `const`
was cheaper than passing it around. A path that expensive to mention gets captured into whatever
file is nearest.

**What would fix it:** an environment variable set in the session (`$CLAUDE_SCRATCH`), so the path
is nameable without being quotable.

## What worked, and is worth keeping

- Running `tasks spec new <slug>` **before** writing the spec avoided item 3 of the previous
  session entirely. The friction doc paid for itself the first time it was read.
- `tasks plan --spec <slug>` graded four tasks in one command, reported the two sequencing notes as
  `[note]` and zero defects, and cost one call before any code existed.
- `tasks edit <id> --writes ...` mid-branch, to record that the work had reached two files the grant
  did not name, is the workflow's own §5 and it worked exactly as written — the correction is a
  record rather than an argument.
- `npm run audit-status` exiting non-zero on an unowned file is the one gate that caught a real
  omission here: two new scripts and a moved module, none of which would have been attributable to a
  system without it.

# Tool friction — `audit-probe-tooling`, hardening pass, 2026-08-03

Two more, both from running one audit through `tasks` end to end.

## 1. Archiving an audit document breaks a test, because a test pins the corpus totals

`scripts/lib/auditImport.test.ts` asserts `{ high: 21, medium: 54, low: 63 }` across every file in
`docs/audits/`. Archiving one new report — the ordinary, required act of persisting evidence — turns
the suite red, and the repair is to hand-edit the expected numbers to match reality. That is a
system required to be manually kept in sync with another, which `CLAUDE.md` forbids by name.

It also fails *late*. I ran the whole suite green, then archived the report, then committed; the
break arrived in the next run, and for two commits the branch was red for a reason unrelated to any
code in it.

The test is trying to prove the parser handles the real corpus, which is worth proving. The totals
are not what proves it — parsing every document without throwing, and mapping every one to a system,
is. `unmapped` in the same test already does the second half and needs no maintenance.

**What would fix it:** assert the invariants (every doc parses, every finding maps to a system,
counts are non-negative) rather than a snapshot of the numbers. If a total is genuinely wanted, read
it from a manifest the import writes, so archiving updates it.

## 2. Closing a finding list is one invocation per finding

Seventeen findings, seventeen `tasks done <id> --commit HEAD` calls, each with its own store write
and its own copy of the uncommitted-store warning. Triage has a batch walk (`tasks triage`); closing
does not. A fix round that retires a whole audit pass is the normal shape here — the previous
session's was 36 — and the tool treats it as seventeen unrelated events.

**What would fix it:** `tasks done <id>...` taking several ids, or `--spec <slug> --state open` to
close what a commit retired in one call.

## What worked

- `tasks import <audit-doc>` is the answer to item 2 of the first session — the 6000-character
  command line for filing findings. Sixteen findings from a markdown document in one invocation, and
  the document is the archive anyway. It should be the documented path; the `--finding` flags on
  `tasks audit` are for the case where no document exists yet, which is rare.
- Grading twelve clauses in one `tasks audit` call, with findings already filed by `import`, avoided
  the verdict-wiping trap of item 1 entirely. `import` and `audit` do not contend.

## 3. The scratchpad path is per-session, and only the session id varies

Recorded once already as item 6 of the previous session, sharpened by a second session of using it.
The path is:

```
C:/Users/yonat/AppData/Local/Temp/claude/C--Users-yonat-Projects-UniversalisRPG/<session-uuid>/scratchpad
```

Everything but `<session-uuid>` is fixed and derivable — it is the temp root, a slug of the project
directory, and a literal. Yet there is no way to name it except in full, so every command that
touches it either carries 130 characters inline or opens with a `SCRATCH=...` assignment that has to
be repeated in each new shell invocation, because shell state does not persist between calls.

The cost is not typing. It is that a path this expensive to mention gets captured into whatever file
is nearest, which is exactly how the probe that started this work ended up with an absolute
scratchpad path hard-coded into `src/content/` and committed.

**What would fix it:** export it into the environment (`$CLAUDE_SCRATCH`) so it can be named without
being spelled.
## The harness and the worktree, running architecture-map

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

3. **`npm test` reported 98 failures across four files, and 97 of them were the environment.**
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

4. **Six consecutive `tasks add` calls printed the same warning six times.** `docs/tasks.jsonl has
   uncommitted task-state changes` is a genuinely valuable warning — friction item 17 of
   `task-system-friction.md` is the incident that earned it. But it fires on the write that *itself*
   created the uncommitted state, so a planner adding a plan of six members is told six times about
   a condition it is in the middle of creating deliberately.

   **Wishlist.** Suppress it when the only uncommitted change is the one this invocation just made,
   or print it once at process exit rather than per write. The signal is right; the repetition
   trains the reader to skip it, which is exactly how the incident it guards against recurs.

   The `npm run tasks` session above found this independently as its item 6. Two sessions
   reaching the same entry without seeing each other is the strongest evidence in this file.

### `doctor` reports a merge in progress as 31 defects in the store

5. **Resolving a conflict in `docs/tasks.jsonl` produced 3 errors and 28 warnings that were all
   artifacts.** `doctor` anchors two of its checks to git: a record whose state differs from its
   committed state is "done only in the working tree", and a `closedCommit` not reachable from
   HEAD is a closure that was reverted. Both are exactly right on a normal working tree, and both
   are meaningless mid-merge, because HEAD is still the pre-merge commit — every record the *other*
   side closed looks like an uncommitted edit, and every commit that closed one looks unreachable.

   ```
   [error] action-time-taxonomy is done only in the working tree (committed state: open)
   [warning] the-once-tag-... closed by a commit not reachable from HEAD: aeb9af8
   ```

   Committing the merge cleared all 31 with no other change. The cost is that the report is at its
   most alarming — three *errors*, in a tool that fails on one condition and reports everything
   else — at the exact moment a human is deciding whether their hand-resolution of the store was
   correct. I read the list twice looking for a resolution mistake before noticing that HEAD had
   not moved yet.

   **Wishlist.** Detect the merge — `.git/MERGE_HEAD` exists, and `git rev-parse MERGE_HEAD` names
   the other side — and either compare against both parents or say once that git-anchored checks
   are suspended until the merge is committed. The store checks that need no git (duplicate ids,
   unresolved requires, cycles) stay useful throughout and are the ones actually worth reading
   while resolving a conflict.

### A guard that asks the wrong directory which branch it is on

6. **`block-main-git-writes.sh` reported the primary checkout's branch for every worktree.** Line 8
   was a bare `git rev-parse --abbrev-ref HEAD`, which answers for whatever directory the hook
   process runs in — never the directory the blocked command was going to run in. It cut both ways
   and neither was the intended rule: while the primary checkout sat on a feature branch the guard
   passed *every* write, including any genuinely on main; the moment that checkout moved to `main`
   it blocked *every* worktree, on any branch. Eleven commits landed under the first mode and the
   twelfth was refused under the second, with nothing about this branch having changed in between.

   The fix reads the `cwd` the hook payload already carries and asks `git -C "$cwd"`. It needed one
   other change: `hook-field.js` drains stdin, so a second call returns an empty string that is
   indistinguishable from an absent field. The payload is captured into a variable once and every
   field taken from that.

   Two things learned applying it. The hook that runs is the **primary checkout's** copy, because
   `settings.json` names it by a relative path resolved from the hook process's own directory — so
   a worktree cannot repair its own guard, and the fix stays inert until the branch merges. And the
   pattern matches the whole command string, so a command that merely *quotes* the blocked verbs —
   a heredoc writing this very entry — is blocked as though it were performing them.

   **Wishlist.** A hook that decides something about a repository should be handed the repository
   rather than inferring it from its own working directory. Worth checking every other hook for the
   same assumption before one fails open the way this one did.

### A `bash`-tagged command block runs in PowerShell

7. **A `cd … && …` one-liner failed with "The token '&&' is not a valid statement separator in this
   version."** The harness asks for shell commands in bash-tagged blocks so the app can offer a Run
   button, but the button runs them in the user's shell, which here is a PowerShell old enough to
   reject `&&`. The tag that makes a command runnable is also the tag that makes it wrong.

   **Wishlist.** Either translate on the way to the Run button, or let the block declare its target
   shell. Failing both, chain with `;` rather than `&&` when handing commands to a Windows user.
