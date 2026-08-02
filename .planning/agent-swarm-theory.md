# Trees and leaves
Descriptions of large tasks naturally take the shape of trees, with a goal at the root that subdivides recursively into basic units of work. Our swarm has two roles, both organized around that same tree-like decomposition:

Planner agents, powered by the smartest models, split a goal into pieces and delegate them.
Worker agents, generally powered by faster and less expensive models, execute those pieces.
The design is a superset of more rigid orchestration systems. Rather than imposing a fixed topology on the problem, the swarm’s shape grows to cover the problem’s contours, and compute and context scale in proportion to the task’s complexity.

We think this is why the design generalizes to tasks as diverse as building a browser, solving math problems, and optimizing GPU kernels. We’ve also used it internally to find and fix vulnerabilities in open-source software, raise test coverage on our own codebase, and generate billions of tokens of synthetic training data.

# What the tree does for memory
When a single agent takes on a complete task, it has to walk the entire tree itself, descending to each leaf while holding its ancestors, its current position, and the wider goal in context the whole time.

We think this explains why long-running single agents drift. They can either focus on the work in front of them and lose sight of the bigger picture, or hold the big picture and do a worse job on the piece.

In a swarm, a planner never implements, so its context never fills with low-level detail, and a worker never plans, so it can spend all its context on one narrow piece of work.

# What a planner owes the tree

A planner never implements, so its context stays clean. That is the benefit. The cost is that a
planner can accept the *shape* of the problem it was handed and spend the whole session executing
it well. Every item below was learned from a round where that happened: an audit returned 36
findings, five worker chunks fixed them, every chunk was mutation-verified and green — and the
next audit found the round had introduced three regressions, a 17-minute gate, and two proof
targets that proved nothing, while the actual defect went untouched.

**A finding list is evidence about a system, not a queue.** Read its shape before sequencing it.
Density in one file is a structural diagnosis. Two findings that contradict each other mean no
module owns that rule. A list that keeps regrowing after each fix round is telling you the fixes
are landing at call sites instead of at a seam.

**Measure before you schedule.** File length, handler count, output-site count, and the size of
the module that supposedly owns a concern cost one tool call. In the round above, the owning
module was 92 lines and the CLI file holding all its rules was 2139 — visible from the start, and
not looked at until five chunks had shipped.

**Ask what single change retires the most of the list.** If the answer is "a seam that does not
exist yet", build the seam first. Fixing items that dissolve under a restructure is work thrown
away, and it is worse than nothing because it also adds risk.

**Chunks touching one file are not independent.** Parallel or sequential, they are one change.
Local verification says nothing about their interactions — every chunk above mutation-tested
itself, and the interactions were verified by nobody.

**Your own orders are the least-audited work in the swarm.** Workers get audited; planner
instructions do not. After a fix round, commission an auditor whose only question is "is anything
worse than before" — clause-by-clause verification cannot see a regression, because each clause
looks fine in isolation. In the round above that auditor found all three; the two clause auditors
found none.

**Invite refusal, then believe it.** Briefs should say: flag anything where my prescribed design
turns out to be wrong. Twice that produced a correct refusal — a requested reproduction that was
information-theoretically impossible, and a fix that silently retracted a protection. Both would
have shipped otherwise.

**Fixing one defect can promote another.** Severity is a property of a finding plus everything
still broken around it. Re-rank after a round; do not carry the old ranking forward.

# References
https://cursor.com/blog/agent-swarm-model-economics
