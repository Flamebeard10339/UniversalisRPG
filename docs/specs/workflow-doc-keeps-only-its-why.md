# workflow-doc-keeps-only-its-why

## Deliverable

`docs/workflow.md` has 176 lines, and its eleven numbered steps are a second copy of what the tool
already says at the moment it matters. That is measured, not assumed: `planPrompt.ts` carries steps 1
through 5 verbatim, down to "a survey that finds an owner is a success" and "not a data point to work
around". `workPrompt.ts` prints step 5's second half and step 6 as "Three things the workflow puts on
you before you write code", including the exact sentence "information, not a violation — correct the
record and say so in the commit body". `mergeReady.ts` computes step 9's per-leg next command, which
is `tool-friction-backlog`'s c18 and is met. And `audit.test.ts` already asserts the audit brief
carries step 8's rule, above a comment saying "the brief and workflow.md step 8 describe one rule from
two sides, so they have to agree."

**The retirement criterion is duplication, not section.** A passage leaves if a command says it at the
moment it matters, wherever that passage sits — which includes two bullets under `## Advice that is
known good`, since `audit.ts` already prints "only mutation proves it fails for the right reason" and
"is anything worse than before". A passage stays if no command says it, which includes parts of the
numbered steps. Sorting by section would both keep and lose the wrong sentences at the edges.

**How much is duplicated is not knowable by grep, and the branch must not pretend otherwise.** Three
deliberate passes over this document scored five steps duplicated, then six, then eight — each time
by reading code rather than by searching text, because the document and the tool word the same rule
differently often enough that a phrase search systematically undercounts. So the deliverable is not a
list of lines to delete. It is the criterion applied one passage at a time, with the command that
justifies each removal named in the commit body, so an auditor can check the judgement rather than
re-derive it.

**What survives is the rationale plus a one-line index of the commands.** Rationale alone would leave
nothing for the tool to disagree with, and CLAUDE.md's rule — that a disagreement between the tool
and this document is a defect in one of them — would become vacuous. A tool that certifies itself is
the failure the comment-budget gate demonstrated when it approved commits deleting CI steps. An index
that names each command in one line, and says its brief is generated rather than restating it, keeps
that invariant checkable in both directions at the smallest possible cost: every command named must
exist, and every command that prints a brief must be named.

| a passage in `workflow.md`                              | said by                                        | outcome |
| --------------------------------------------------------- | ---------------------------------------------- | ------- |
| step 1, "a survey that finds an owner is a success"        | `planPrompt.ts`, verbatim                       | retired |
| step 6, "information, not a violation"                     | `workPrompt.ts`, verbatim                       | retired |
| step 8, an auditor files but never promotes                | `audit-prompt`, reworded — "you never promote them" | retired |
| step 9, each failing leg names its next command            | `mergeReady.ts`, as behaviour rather than prose | retired |
| Advice, "only mutation proves it fails for the right reason" | `audit.ts`                                    | retired |
| Advice, "do not add workers to buy speed"                  | nothing                                        | kept |
| Why, forecast versus commitment and why the check moved    | nothing                                        | kept |
| the planner/worker split in the opening paragraphs         | nothing                                        | kept |
| a numbered step's sentence no command prints               | nothing                                        | kept, in place, until a command needs it |

The last row is the deliberate one. Moving those sentences into the briefs would be truer to the
task's title, and it is not done here: a command that re-explains something nobody asked about on
every invocation is the noise this task exists to reduce, and a documentation branch that also edits
four prompt files stops being auditable as a deletion.

Proof:

- [c1] Every passage removed is one a command prints, and the commit body names which command, for
  each. A reader can check the judgement without re-deriving it.
  proof: git log
- [c2] Nothing is removed that no command says. The Advice bullets with no counterpart, the whole of
  `## Why it is shaped this way`, the planner/worker split and any step-sentence the tool never
  utters all survive, in place.
  proof: git diff
- [c3] A one-line index of the commands survives, and it is checkable in both directions: every
  command it names exists, and every command that prints a generated brief appears in it. The index
  says what each command is for and that its brief is generated; it restates no brief.
  proof: vitest scripts/tasks/workflowDoc.test.ts
- [c4] No command's output changes. This branch edits documentation and the references to it, so the
  diff is a deletion plus an index, and every existing test over every brief passes untouched.
  proof: npm test
- [c5] References to the document by step number are swept. `audit.test.ts` names "workflow.md step
  8" in a comment that outlives the numbering, and any other reference of that shape is repointed at
  what the rule is rather than where it used to sit.
  proof: vitest scripts/tasks/audit.test.ts
- [c6] The two-sided invariant is stated in the document itself, in its new form: what the tool says
  and what this document says must agree, the tool owns procedure, this document owns reasoning, and
  the index is where the two meet.
  proof: git diff

## Decisions

- **Retire by duplication, not by section.** The task record asks for the numbered steps to go and
  `## Advice` to stay. Measured, that is not quite the line: two Advice bullets are already printed by
  `audit.ts`, and parts of the numbered steps are printed nowhere. Sorting by whether a command says
  it is the rule that survives contact with the evidence, and it is checkable one passage at a time
  rather than by section.
- **The count is not the deliverable, the criterion is.** Three passes scored 5, then 6, then 8 steps
  duplicated, each correction found by reading a source file rather than by searching for a phrase.
  Any number this spec asserted would be wrong in the same direction. Naming the justifying command
  per removal makes the work auditable without requiring the count to be right in advance.
- **Sentences no command says stay put rather than being pushed into a brief.** Truer to the title
  would be to move them, and it is deferred on two grounds: a brief that re-explains write grants,
  concepts and audit asymmetry on every invocation is the noise the task record itself names, and a
  branch that deletes from one document while editing four prompt files cannot be reviewed as a
  deletion. A sentence moves when there is a command whose output is the right moment for it, which
  is a judgement about that command, not about this document.
- **The index is what keeps the invariant from going vacuous.** Rationale cannot disagree with a
  tool in any way a reader can check mechanically. One line per command can: a command that vanishes
  leaves a dangling name, and a command that appears without a line is an unlisted brief. That is the
  cheapest form of the two-sided check, it restates no procedure, and `audit.test.ts` already shows
  the appetite for it — its comment asserts the two sides must agree while the test only checks one.
- **CLAUDE.md keeps its summary and is not treated as a third copy.** It restates the shape of the
  workflow in a sentence, which under the criterion above looks like duplication. It is not, because
  it is the one document read before any command has been run: there is no "moment it matters" for a
  brief to have arrived at yet. Orientation before the tool speaks is a different job from procedure
  while it does.
- **This is a documentation branch and stays one.** No prompt file changes, no brief grows, no
  behaviour moves. c4 is what makes that checkable, and it is what lets the audit be about the
  judgement — which sentences are protocol and which are reasoning — rather than about a mixed diff.

## Open questions

- Whether the index lives in `workflow.md` or becomes something the tool can print (`tasks help`
  already lists usage lines) is the worker's call. c3 fixes that it exists and is checkable both
  ways, not where it sits — though putting it in the tool would make the tool self-certifying again,
  which argues for the document.
- `docs/workflow.md` is `unowned` in the systems manifest today. Whether a document that the tool is
  checked against should stay unowned, or join the Task system it describes, is worth a decision but
  not necessarily this branch's.
