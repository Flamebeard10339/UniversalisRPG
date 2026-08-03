# Tool friction — `npm run tasks`, session of 2026-08-03

Collected while running one spec end to end (`action-kinds-and-templates`): spec → plan → work →
audit → triage → fix. Ordered by how much each one cost.

## 1. `tasks audit` records a whole pass, so findings and verdicts cannot be filed separately

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

## 2. The command line for a real pass is unwritable by hand

Ten clauses with evidence and file references, plus nine findings with severity, system,
deliverable, evidence and files, is a single shell command of roughly 6000 characters, with
`--evidence` overloaded two ways (`--evidence 3="..."` binds to clause 3; a bare `--evidence "..."`
binds to the preceding `--finding`). Positional coupling that long is easy to get silently wrong —
a misplaced `--evidence` attaches to the wrong finding and nothing complains.

**What would fix it:** `tasks audit <spec> --from <file.json|md>`, or an interactive walk that also
covers findings (the clause walk already exists when `--proof` is omitted).

## 3. `tasks spec new` refuses when the spec file already exists

The workflow's own order is "the spec is the promise" first, then plan. Writing
`docs/specs/<slug>.md` and then registering it costs a failed command:

```
error: spec already exists: docs/specs/action-kinds-and-templates.md
```

Refusing to clobber is right. Refusing to adopt is not — there is nothing to clobber if the tool
would treat an existing file as the spec it was about to create.

**What would fix it:** adopt an existing file (and say so), or `--adopt`.

## 4. Clause standing reads clauses only from under `## Deliverable`, and says nothing when it finds none

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

## 5. Generated finding ids are truncated at ~60 characters and are unusable as handles

```
action-kinds-and-templates-pass2-the-kind-cadence-table-is-e
action-kinds-and-templates-pass3-grammar-md-which-agents-md-
```

Every id from one pass shares a 33-character prefix, so the distinguishing part is what gets cut.
`tasks show <id>` needs the whole string, and two of these differ only near the end.

**What would fix it:** a short stable handle (`akt-p2-h2`) alongside the slug, or accept an
unambiguous prefix/suffix match in `show`/`log`.

## 6. The uncommitted-store warning fires on every write

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

## 7. `# remove <kind>.<id>` vs `# remove <kind> <id>`

Not a tool issue but the same class: I wrote `# remove entitytype melee-foe` and got
`unexpected content`, because the syntax is `# remove entitytype.melee-foe`. The error named the
line but not the expected form, while `parseRemoval` has a good message
(`# remove names a kind and an id, as in \`# remove entity.mirror\``) that this path never reaches.

## 8. Closing a spec leaves no trace in the event log

`tasks spec done <slug>` on a spec whose members are all closed reports
"action-kinds-and-templates is done: every member is done or declined" and writes nothing — no
store change, no `docs/events.jsonl` line. The workflow says every store write appends to the log
automatically, and "a spec closed" is the one event a later reader most wants a date for. `tasks log
--spec <slug>` can tell you when every member closed but not when the spec did.

**What would fix it:** append a `spec-done` op even when the state transition is a no-op, or say
plainly that it recorded nothing.

## What worked, and is worth keeping

- `tasks plan` graded the two-task set in one command and correctly reported the sequencing note
  rather than a false defect, because the `requires` edge was present. It cost nothing and told me
  the decomposition was sound before any code was written.
- `tasks log --op decision` answered "what has been decided on this branch" exactly, with no text
  matching, which is the thing git genuinely cannot give you.
- An `unmet` clause creating an open `undelivered` member with no triage step is the right
  asymmetry, and it worked: c2 became work the moment it was graded.
- `tasks doctor` failing on exactly one condition, and reporting everything else, meant I never
  once fought the tool to land a commit.
