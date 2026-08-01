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

# References
https://cursor.com/blog/agent-swarm-model-economics
