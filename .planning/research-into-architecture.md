# Current status

## Tried this session, refuted before dispatch

1. **Shape-vs-answer import census** (v1, `7b8463a`) — rank modules by how many others import their types. Refuted: Spearman 0.195 vs real change frequency; `serialize.ts` ranked 163/234; the calibration row was already true before the fix it "detected"; beaten by a barrel re-export already in the tree; duplication has no import edge, so the gradient rewards it.
2. **Systems-touched-per-feature, hard gate** (v2, `501a9ed`) — declare systems from the grant, fail on drift and on >2 systems. Refuted: blocks `reimplement-localization` and `openUniverse`; new files have no owner at the merge base (2 of its own 8 files invisible to it); the escape is worker-issuable; the partition is directory-shaped, and merging two systems moves compliance 67%→78% with zero code change.
3. **Biconnected-block gate** (v3, `12bfe08`) — blob 155 → 30, ratchet + red CI. Refuted: zero type-only modules exist so the advertised repair is a category error (155→156, it *rises*); monotone in sharing, so five copies beat one shared helper; refuses your literal "one new file plus one other" while appending to `registry.ts` is free; 30 is below the floor of 47; second 39-module block invisible, and this branch's own grant lives there.

## Already built and live in the repo

4. **`layer-check`** — one-way imports across five layers. Only gate never routed around. No exemption is possible. Permits cycles *within* a layer.
5. **`exhaustive.test.ts`** — checker-derived `never` guard on every discriminated-union switch. Green, 20 switches. Blind to bare string unions and arrays.
6. **Parser-as-codec** — 30 sites, 15 files, mutation-verified 12/12. Retires per-kind print spellings.
7. **Byte fixture** — printed corpus pinned at merge base, three assertions including the parse direction.
8. **`audit-status`** — partition completeness. **Currently red, 13 commits**; `merge-ready` cannot pass today.
9. **The audit protocol** — independent auditors, two triage passes, clause grading. Catches real defects. Produces 1188 findings against 2 questions.
10. **`tasks produces` / concept registry** — fails on its *key*, not its question: 78 of 149 names never registered, fires ~1 in 160, unwired from every brief.
11. **`npm run mutate`** — works; 8–20 min per run.
12. **"A spec is not cut into sub-tasks"** — worked by *deleting* the decompose step. One of only two mechanisms that ever changed behaviour here.
13. **Every reporting-only instrument** — `--breaches` (5/1583), grant drift, prior-art-on-writes, 28 standing `doctor` warnings, one friction record at 57 occurrences still unreviewed. All routed around.

## Measured, never built into anything

14. **Co-change coupling** — `referenceSites.ts` has never once changed without `serialize.ts` (13/13, no import). 32 of 72 high-co-change pairs have no import path. Files per `src`-touching branch: median 10, mean **16.2**, p90 32.
15. **Shape-out-degree** — Spearman 0.505, 2.6× v1. Ranks `serialize.ts` 2nd.
16. **The graph diagnosis** — 211 modules, 10 articulation points (5%), 157-blob, floor 47, four cycles (28 in `src/runtime`). Reproduces exactly.
17. **Feature-cost history** — systems median 2; `src` features 36% within budget vs tooling 97%.

## Rejected without building

18. Files-per-feature as a *forecast* — post-hoc, god-file-gameable. (The *historical* version is #14 and is fine.)
19. Hand-built capability graph — a manually-synced system.
20. Any stored baseline — merge-base derivation instead. **This is the one decision that survived all three rounds.**
21. Grandfather lists for existing cycles — manual sync.
22. Soft gate — ruled, then reversed by you.

## Never tried

23. **Generalise the compiler proof from discriminated unions to any closed set derived from `SCHEMAS`** — the six enumerators. The table already exists at `module.ts:48`, and `registry.ts` already imports it and hand-writes the switch anyway.
24. **Ban import cycles** — directionality below layer granularity. 4 violations; 1 of 18 branches would have failed.
25. **Gate the tag/release path** instead of every push — blocks shipping while above target, cannot deadlock reduction branches.
26. **Trend gate** — red when the number *stalls*, not when it's high.
27. **Touch-and-reduce** — a branch touching the blob must reduce it by ≥1.
28. **Wire `tasks produces` into the briefs** and re-key concepts off paths rather than authored prose.
29. **Make the auditor's mandatory question graded**, with "this spec is the wrong shape, stop" as a permitted answer.
30. **Require the ideal end-state as pseudocode** before implementation.
31. **Record per-close cost into the store** so any target is re-set from a series.
32. **Separate data from behaviour** — zero type-only modules exist today.
33. **Declare the 5 unowned files** so `merge-ready` can pass at all.

Two things fall out of the layout. Everything in group 4–13 that *worked* is a local rule about a single edge or a single switch (4, 5, 6, 12); everything that *failed* is a repo-wide number or a report (9's findings, 10, 13) — and all three of my attempts were repo-wide numbers. And #14 is the only measurement that scores both of your worked examples correctly and names the specific repair, and it's the one thing I've quoted three times and built into nothing.

---

# Agent 1's research

Nobody who has solved this at scale solved it with a repo-wide number. Your closing observation is the finding: everything that worked for you (`layer-check`, the `never` guard, parser-as-codec) is a local constraint on one edge or one switch, and everything that failed was a global scalar plus a gate. That's not an accident of your repo — it's the shape of every mechanism that large codebases actually rely on.

It helps to name the quantity you're trying to bound precisely, because it has a direct definition rather than a proxy. "How much must be understood to change module M" is the transitive closure of what M reaches, where each hop costs *the interface* of the dependency rather than its implementation. Two structural facts control that number:

1. **Cycles.** A cycle collapses all its members into a single indivisible unit — you cannot understand any member without all of them. So the closure is unbounded below layer granularity exactly where cycles exist.
2. **Interface width, and whether the interface is honest.** A hop is cheap only if the callee's public surface is small *and* nothing leaks around it.

Every metric you tried (import census, systems-touched, biconnected blocks) is a proxy for this. Proxies are gameable and have arbitrary thresholds, which is precisely how all three died. The direct version is local and per-edge.

## What large codebases actually do

**Default-deny visibility, granted one edge at a time.** This is the generalization of your `layer-check` — the one gate never routed around. Bazel makes every target private unless it grants visibility, and its own guidance is explicit that public default visibility is fine for prototyping but risky as a codebase grows, because public targets get created inadvertently. Go does it with `internal/`, enforced by the compiler; Rust does it with private-by-default modules where anything reachable externally must be `pub` at every level from the root down, and a single private link in the chain blocks access. The critical property for you: this is **monotone in the right direction**. Copying a helper five times doesn't buy you anything, because each copy still needs a grant to be imported. That was the failure mode that killed your v3.

**A checked-in digest of each boundary.** This is the mechanism most directly aimed at your actual problem, and it's the one missing from your list entirely. Angular tracks public API status in a golden file maintained by a public API guard; changing a public API fails CI with instructions to accept the new golden. Microsoft's API Extractor generates a Markdown pseudocode summary of the exported surface per package, and the design is deliberate: it enables a branch policy requiring stakeholder approval whenever a changeset touches an `.api.md` file, and the report is built so a diff only appears when a real contractual change happened — signature changes and exported declarations show up, function bodies and unexported declarations don't. Android's metalava does the same for the platform, and adds a useful escape from your ratchet problem: it records the current issue set into a baseline file so new violations are reported while existing ones aren't, and you regenerate the baseline as old ones get fixed.

For an agent, this is the whole game. "Read the 12 `.api.md` files" is a bounded context budget. "Read 211 modules" is not.

**Ownership declared in the tree, not derived from history.** Google's monorepo puts an owners file in each directory and requires approval from the owners of every directory a change touches, with the owners files themselves checked in and their modification also requiring owner approval. Note why this dodges your v2 refutation: ownership of a *new* file is inherited from its directory, so a file that didn't exist at the merge base is still owned. You don't need history to answer the question.

**The theory underneath.** Ousterhout's framing is literally yours: cognitive load is how much a developer must know to complete a task, and unknown unknowns — not knowing which code must change — is the worst of the three symptoms, because you find out only when bugs appear after the change. The remedy is deep modules (interface much simpler than implementation), and the red flag is *information leakage* — a design decision reflected or duplicated across several modules, which forces changes in all of them.

## Where your #14 fits — and the trap

Co-change is the leak detector. `referenceSites.ts` never changing without `serialize.ts` (13/13, no import edge) is a textbook leaked design decision, and it's invisible to every structural metric by construction. The research supports using it this way: change coupling correlates with defects, and co-changes crossing architectural module boundaries correlate with defects more than co-changes within a module — meaning a high-co-change pair straddling a boundary is evidence the boundary is in the wrong place.

But do not turn it into a gate with a threshold. That would be your fourth repo-wide number. Use it as **placement input**: cluster the 72 high-co-change pairs (especially the 32 with no import path), and let those clusters define where units go. Files that always change together belong in the same unit; the boundary goes where co-change is *absent*.

## The concrete assembly

Given your repo, the three mechanisms compose into one intervention:

1. **Place boundaries by co-change** (#14), not by directory. Your v2 died partly because the partition was directory-shaped — merging two systems moved compliance 67%→78% with no code change. Team Topologies calls the right seams *fracture planes*, and the litmus test is whether the resulting split reduces cognitive load and supports more autonomous ownership. A partition that changes its own score when you relabel it isn't a fracture plane.
2. **Enforce them per-edge with default-deny.** In TypeScript this is either real workspace packages with a `package.json` `exports` field, or a lint-level equivalent — Nx's `enforce-module-boundaries` rule defines which projects may depend on which, to prevent unplanned cross-dependencies, and dependency-cruiser or Sheriff do the same at folder granularity without requiring the Nx project model. One entry point per unit; everything else unreachable from outside.
3. **Publish each unit's surface as a committed digest**, CI-diffed. That's the bounded reading list, and the diff on the digest is your review signal instead of a number.
4. **Ban cycles** (your #24). Cheap — 4 violations, 1 of 18 branches — and it's the one rule that makes the closure finite at all. This should probably go first, before anything else, because it's a day's work and it's load-bearing for every other claim.
5. **Do #23.** Generating the six enumerators from `SCHEMAS` is the same family as your #5 and #6, both of which worked. It removes an entire axis of "understand the whole" by making the compiler the thing that knows.

The reason to expect this to survive where the others didn't: none of it stores a baseline (consistent with your #20, the decision that survived all three rounds), none of it has a threshold to argue about, and none of it can be moved by relabeling or by duplicating code. The grant diff and the API-digest diff are both *artifacts a reviewer reads*, not numbers a worker optimizes.

---




---

# Agent 2's thinking

I read the attached research. The central diagnosis is quite strong: you are trying to bound **the amount of global project knowledge an agent must acquire to make a local change**, and your experiments show that global scalar metrics don't actually control that quantity. Your own successful mechanisms are almost all *local invariants*—layer direction, exhaustive switches, parser-as-codec, and eliminating decomposition. 

I think the research points toward a somewhat different architecture than “better project metadata.” The important shift is:

> **Don't try to tell the agent how much of the repository it should understand. Make it structurally impossible for a local task to require understanding much of the repository.**

The most useful way I see to expand your research is below.

---

## 1. The actual quantity you want to minimize

Your document already has the right definition:

> “How much must be understood to change module M” is the transitive closure of what M reaches, with each hop costing the interface rather than the implementation. 

I'd sharpen this into an architectural objective:

### Local change context

For a change (C), define:

[
K(C) = \text{minimum information required to correctly implement and verify } C
]

This is **not** the same thing as:

* number of files touched
* number of imports
* number of systems touched
* number of dependencies
* graph centrality
* number of modules in a connected component

Those are measurements of the implementation graph.

What matters to the agent is closer to:

[
K(C) =
K(\text{target})

* K(\text{contracts})
* K(\text{invariants})
* K(\text{affected behavior})
  ]

And critically, **the last three should be discoverable locally.**

That gives you a much more useful architectural test:

> If implementing a change in module A requires reading implementation details from B, C, D, and E, then A's boundary has failed—even if the dependency graph looks beautifully modular.

This is essentially Ousterhout's “deep module” idea: a module should hide substantial implementation complexity behind a relatively simple interface. Information leakage is the inverse: the same design decision appearing in multiple modules means a change requires knowledge of multiple locations. ([Daniel Hofstetter's Books][1])

---

## 2. The missing distinction: dependency vs knowledge dependency

This may be the most important addition to your model.

There are really **two graphs**.

### Graph A — mechanical dependency

```text
A → B → C
```

This is what your import graph sees.

### Graph B — knowledge dependency

```text
A
├── must understand B's invariant
├── must understand C's serialization format
└── must understand D's lifecycle
```

Graph B can exist without Graph A.

Your `referenceSites.ts ↔ serialize.ts` example is exactly this phenomenon: they co-change despite having no import path. 

This suggests a useful conceptual equation:

[
\text{Architecture quality}
\neq
\text{low dependency coupling}
]

Instead:

[
\text{Architecture quality}
\approx
\text{low knowledge coupling}
]

where mechanical dependency is merely one contributor.

The empirical literature supports the significance of this distinction: semantic coupling and co-change are related but not identical, and studying both gives information that either alone misses. ([Springer][2])

This also explains why your import census was fundamentally doomed.

You were measuring **who can reach whom**.

You actually care about:

> **Who must know whose decisions?**

---

## 3. This leads to a much better boundary criterion

Instead of:

> “Module A may import modules B, C, D.”

Ask:

> **“What decisions is A allowed to know?”**

That's a substantially stronger boundary.

For example:

```text
Universe
├── entity representation
├── serialization
├── networking
├── persistence
└── rendering
```

Suppose rendering needs to know:

```ts
Entity {
    id
    position
    sprite
}
```

That's okay.

But if rendering needs to know:

```ts
Entity {
    id
    internal_registry_slot
    persistence_version
    network_replication_state
    serialization_tag
    dirty_mask
}
```

then you've leaked several other modules' decisions into rendering.

The problem isn't that rendering has five dependencies.

The problem is that **five other architectural decisions have become part of rendering's mental model.**

That gives you a much better design principle:

> **Interfaces should transmit concepts, not implementation decisions.**

This is very close to Ousterhout's information-hiding formulation: a module should encapsulate design decisions so that those decisions don't appear in its interface. ([Daniel Hofstetter's Books][1])

---

## 4. The architecture you are looking for already has a name

The closest established architecture family is:

## Modular monolith + bounded contexts + enforced visibility

This is worth taking particularly seriously because it addresses your exact problem without requiring microservices.

GitLab is currently doing something remarkably similar. Their modular-monolith work explicitly has the goals of:

* clear boundaries
* explicit contracts
* making modules “agent-ready”
* putting the context an agent needs into the repository
* explicitly declaring dependencies
* preventing undeclared coupling. ([The GitLab Handbook][3])

Their bounded-context work is especially relevant.

They don't simply say:

```text
src/
  users/
  projects/
  pipelines/
```

They define bounded contexts as actual architectural units and enforce the allowed set of contexts in code. ([The GitLab Handbook][4])

And importantly, they discovered that simply using product categories wasn't enough: strongly coupled areas had to be grouped into the same context, while some categories were too small to justify a context. ([The GitLab Handbook][4])

That directly supports your conclusion about **fracture planes rather than arbitrary directory partitions**.

---

## 5. The crucial concept: a module needs a *private world*

I think this is the architectural primitive you are missing.

Consider:

```text
                 ┌──────────────┐
                 │   Module A   │
                 │              │
                 │  40 files    │
                 │  12 helpers  │
                 │  3 internal  │
                 │  abstractions│
                 └──────┬───────┘
                        │
                    public API
                        │
                 ┌──────▼───────┐
                 │   Module B   │
                 └──────────────┘
```

B should not need to know the 40 files exist.

More importantly:

**A is allowed to reorganize those 40 files without B caring.**

That's the real boundary.

B's knowledge of A should be approximately:

```text
A exposes:
    createThing(...)
    destroyThing(...)
    queryThing(...)
```

not:

```text
A contains:
    ThingRegistry
    ThingFactory
    ThingStore
    ThingSerializer
    ThingManager
    ThingCache
    ...
```

This is why Bazel's visibility system is interesting. It doesn't merely document boundaries—it makes targets inaccessible unless explicitly granted visibility. Bazel explicitly recommends avoiding public-by-default targets in large codebases and using visibility to distinguish public API from implementation detail. ([Bazel Documentation][5])

That is basically your `layer-check` idea generalized from **direction** to **ownership of knowledge**.

---

## 6. I would make visibility the fundamental primitive

Your document says:

> **Default-deny visibility, granted one edge at a time.** 

I think this is even more important than the API digest.

The architecture should be something like:

```text
module/
    public/
        index.ts
        types.ts
    internal/
        ...
```

And mechanically:

```text
outside module
       │
       ▼
 public/index.ts
       │
       ▼
 internal/*
```

while:

```text
other module ──X──> internal/*
```

The important property is:

### The default state must be “you cannot know this.”

Not:

### “You may use this unless somebody notices.”

Bazel, Go's `internal`, Rust's privacy system, and similar mechanisms all embody this idea. Bazel's current documentation explicitly describes visibility as a way to distinguish public APIs from implementation details and enforce structure as the workspace grows. ([Bazel Documentation][6])

This also explains why your `layer-check` survives while reports don't.

A report says:

> “You probably shouldn't do this.”

A visibility failure says:

> “This code literally cannot do this.”

Agents are exceptionally good at exploiting the former.

---

## 7. But visibility alone isn't enough

Here's where I think your research should go one level deeper.

Suppose:

```text
A → B
A → C
A → D
A → E
```

and all four dependencies have perfectly clean APIs.

A can still have enormous cognitive load.

Why?

Because its public interfaces may be **wide**.

So you need two independent dimensions:

### Dependency breadth

```text
How many modules must I interact with?
```

### Interface width

```text
How much do I have to understand about each module?
```

Your ideal architecture is therefore:

```text
                narrow
                  │
                  ▼
A ──────────────► B
A ──────────────► C
A ──────────────► D
```

rather than:

```text
A ──► B (37 concepts)
A ──► C (21 concepts)
A ──► D (14 concepts)
```

This is why **deep modules** are so important. The objective isn't necessarily minimizing the number of dependencies. It is maximizing the amount of implementation complexity hidden behind each dependency's interface. ([Daniel Hofstetter's Books][1])

---

## 8. This suggests a better agent context model

I would *not* make the agent read:

```text
module-summary.md
dependency-summary.md
capability-map.md
architecture.md
ownership.md
...
```

before every task.

That's still recreating the global context problem in compressed form.

Instead, give each module a **contract packet**.

For example:

```text
runtime/
    API.md
    invariants.md
    ownership.ts
    index.ts
    internal/
```

But most of it should be **generated**.

The agent's normal context becomes:

```text
TASK
 ↓
target module
 ↓
module contract
 ↓
allowed dependencies
 ↓
tests/invariants
```

Only if it encounters an actual boundary does it expand:

```text
Module A
   │
   └── requires B.foo()
                  │
                  ▼
             B contract
```

So the context grows **on demand along explicitly sanctioned edges**, rather than globally.

That's much closer to how a compiler works.

---

## 9. The compiler analogy is surprisingly deep

Your `SCHEMAS → generated enumerators` idea is pointing toward something broader.

You have:

```text
SCHEMAS
   ↓
generated representations
   ↓
generated enumerators
   ↓
generated registries
```

Instead of:

```text
SCHEMAS
   ↓
human remembers to update six things
```

This is essentially **making architecture executable**.

The strongest architectural systems increasingly move decisions from documentation into machinery:

```text
architecture decision
        ↓
machine-readable declaration
        ↓
generated artifacts / compiler rules
        ↓
failure when violated
```

This is the same conceptual family as:

* Rust visibility
* Bazel visibility
* API golden files
* exhaustiveness checking
* schema generation
* architecture fitness functions

Fitness-function literature makes this explicit: architectural decisions become executable constraints rather than prose that developers must remember. ([Encyclopedia of Agentic Coding Patterns][7])

---

## 10. Your API digest idea is good—but I'd change what it represents

Your document proposes committed API digests. 

I agree, but I'd make the artifact more than an API listing.

Think:

```text
MODULE: serialization

PUBLIC CONTRACT

Inputs:
    serialize(Entity) -> bytes
    deserialize(bytes) -> Entity

Concepts:
    Entity
    SerializedEntity

Guarantees:
    serialize(deserialize(x)) == canonical(x)

Does NOT expose:
    Registry
    storage layout
    entity IDs
    parser internals

Allowed dependencies:
    schema
    entity-types

Tests:
    serialization.test.ts
    byte-fixture.test.ts
```

Now the agent has something dramatically more useful than:

```text
export function serialize(...)
export function deserialize(...)
```

It knows the **semantic boundary**.

This distinction matters because an API can be syntactically narrow while semantically enormous.

---

## 11. Treat API changes as architectural changes

This is where Angular/API Extractor/metalava-style golden files become useful.

Microsoft's API Extractor, for example, deliberately produces an API report where implementation changes don't appear, while changes to exported declarations do. This lets review focus on actual contractual changes. 

That gives you a very useful agent rule:

```text
internal change
    → normal tests

public contract change
    → architectural review
```

Not:

```text
211 modules
→ architectural review
```

That's a much better scaling property.

---

## 12. Your co-change analysis should become boundary discovery

I strongly agree with your existing conclusion here.

You found:

```text
referenceSites.ts ↔ serialize.ts
13/13 co-changes
no import path
```

That's almost a smoking gun for an architectural leak. 

But I'd extend the method.

Construct two graphs:

### Structural graph

```text
import(A,B)
```

### Evolutionary graph

```text
cochange(A,B)
```

Then classify edges:

| Structural | Co-change | Meaning                                |
| ---------- | --------- | -------------------------------------- |
| yes        | yes       | normal dependency                      |
| yes        | no        | possibly healthy abstraction           |
| no         | yes       | **information leak / hidden coupling** |
| no         | no        | independent                            |

The third category is the gold mine.

You don't need to eliminate every such edge.

Instead:

> **Every persistent high-strength no-import co-change edge is a candidate boundary failure.**

And importantly, **this should be used for architectural discovery, not as a CI threshold.**

Your own conclusion is exactly right here. 

---

## 13. There is an even better metric than “co-change”

I would investigate **change-set entropy**.

Suppose a module is changed by these historical features:

```text
A: {A, B}
B: {A, B}
C: {A, B}
D: {A, C}
E: {A, B}
```

A change to A usually predicts B.

But suppose:

```text
A: {A, B, C, D, E}
B: {A, B, F, G}
C: {A, C, H, I}
```

Then A is acting as a **context bridge**.

You can measure how much uncertainty about other modules is introduced by touching A.

Informally:

[
H(\text{other changes}\mid A\text{ changed})
]

The ideal module has:

* high internal cohesion
* predictable local consequences
* low cross-boundary entropy

This is more aligned with your actual objective than raw file count.

I wouldn't immediately turn this into a gate, though. I'd use it to discover fracture planes.

---

## 14. A very important negative result: microservices are not the solution

The research might initially point toward:

> “Just make every module a service.”

I don't think that's what you want.

Microservices create a physical boundary, but they introduce:

* serialization
* network protocols
* deployment boundaries
* distributed failure
* observability
* eventual consistency
* operational knowledge

You would replace:

```text
agent must understand 8 modules
```

with:

```text
agent must understand 4 modules
+
distributed systems semantics
```

A modular monolith gives you the useful part without paying the distributed-systems tax.

This is explicitly the direction GitLab is taking: broadly modularize in place and extract services selectively rather than making service extraction the default. ([The GitLab Handbook][3])

---

## 15. Bounded contexts are more important than layers

Your existing five-layer `layer-check` is valuable, but I would regard it as **secondary architecture**.

Layers answer:

> “What kind of thing may depend on what kind of thing?”

Bounded contexts answer:

> **“What knowledge belongs together?”**

Those are different questions.

For example:

```text
                UI
                 │
        ┌────────┴────────┐
        ▼                 ▼
    Combat             Inventory
        │                 │
        └───────┬─────────┘
                ▼
              Items
```

A layered architecture can enforce:

```text
UI → Domain → Infrastructure
```

while still leaving:

```text
Combat ↔ Inventory ↔ Items ↔ Serialization ↔ Persistence
```

as a giant conceptual knot.

Bounded contexts attack the second problem.

GitLab's experience is instructive: their domain code had historically been scattered across directories and namespaces, and they explicitly moved toward bounded contexts as top-level modules with enforcement. ([The University of Tokyo CNS][8])

---

## 16. The ideal architecture may therefore look like this

I'd aim for **two orthogonal graphs**.

### Horizontal: domain ownership

```text
┌────────────┐   ┌────────────┐   ┌────────────┐
│  Combat    │   │ Inventory  │   │ Networking │
│            │   │            │   │            │
│ private    │   │ private    │   │ private    │
│ world      │   │ world      │   │ world      │
└─────┬──────┘   └─────┬──────┘   └─────┬──────┘
      │                │                │
      └────────────────┼────────────────┘
                       ▼
                 narrow contracts
```

### Vertical: implementation layers inside each context

```text
Combat/
    public/
    domain/
    application/
    infrastructure/
    tests/
```

Thus:

**bounded context limits conceptual scope**

while

**layers limit dependency direction.**

That's substantially stronger than either by itself.

---

## 17. The really interesting part for agentic coding

There's a recent line of work specifically relevant to this.

Repository-aware coding agents are increasingly being given **machine-generated structural maps** rather than whole repositories. A repository map can expose symbols, dependencies, callers, tests, and boundaries without consuming the full source context. ([Encyclopedia of Agentic Coding Patterns][9])

More interestingly, a 2026 paper on a deterministic **Repository Intelligence Graph (RIG)** reports that giving coding agents an evidence-backed architectural graph improved mean repository-question accuracy by 12.2% and reduced completion time by 53.9% across eight repositories. ([arXiv][10])

But I think there's a crucial distinction between that work and what you're attempting:

### Repository maps solve

> “How do I find the relevant code?”

### Your architecture needs to solve

> **“Which code is legitimately relevant?”**

Those are not the same problem.

A perfect repository map can actually make your problem worse:

```text
Agent now knows how to discover
all 211 modules extremely efficiently.
```

You haven't reduced cognitive load.

You've merely made global traversal cheaper.

So I would use repository intelligence **after** enforcing architectural boundaries, not instead of them.

---

## 18. The architecture should form a retrieval hierarchy

This gives us what I think is the strongest model for your project:

```text
                    TASK
                      │
                      ▼
              ┌──────────────┐
              │ target module│
              └───────┬──────┘
                      │
                      ▼
                module contract
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
     local invariants        public APIs
          │                       │
          ▼                       ▼
      local tests            dependency B
                                  │
                                  ▼
                             B contract
                                  │
                           only if needed
                                  ▼
                            B implementation
```

The agent doesn't begin with:

```text
repository → search
```

It begins with:

```text
task → architectural unit → contract → permitted dependency → implementation
```

That is the structural solution to linear growth.

---

## 19. I would explicitly introduce “context expansion”

This could even become an agent protocol.

### Level 0 — task

```text
Implement X.
```

### Level 1 — module

Agent identifies:

```text
X belongs to Combat.
```

Reads:

```text
Combat/API
Combat/invariants
Combat/tests
```

### Level 2 — contracts

Agent discovers:

```text
Combat requires ItemCatalog.lookup()
```

Reads:

```text
ItemCatalog/API
```

### Level 3 — implementation

Only if the contract is insufficient:

```text
read ItemCatalog implementation
```

### Level 4 — cross-context investigation

Only if the task reveals a broken abstraction.

That last case should be **exceptional**.

And when it happens, it should be architecturally interesting.

---

## 20. This gives you a much better definition of an architecture violation

Instead of:

> “This feature touches too many systems.”

Use:

> **“This feature requires crossing a boundary that should have been sufficient to hide the required information.”**

That's a qualitative but mechanically testable distinction.

For example:

```text
Combat → Inventory API
```

is fine.

But:

```text
Combat → Inventory.internal/SlotAllocator
```

is a violation.

And:

```text
Combat
    changes Inventory serialization
    changes Inventory registry
    changes Inventory tests
```

even without imports is evidence of **semantic leakage**.

---

## 21. The most promising concrete system

If I were designing the next iteration of your experiment, I would build this—not another global metric.

### A. Explicit modules

```text
src/
    combat/
    inventory/
    serialization/
    networking/
```

Each is an architectural unit.

### B. Private by default

Everything inside the module is private.

Only:

```text
module/public/*
```

is externally reachable.

### C. Explicit dependency grants

Something like:

```text
combat → inventory
combat → items
```

No implicit dependencies.

This follows the same fundamental principle as Bazel visibility. ([Bazel Documentation][6])

### D. Generated contract

```text
combat/API.md
```

generated from the actual exports/types.

### E. Generated dependency manifest

```text
combat:
    depends-on:
        inventory
        items
```

Generated or mechanically checked rather than manually maintained where possible.

### F. Contract tests

The module's invariants live with the module.

### G. No cycles

Your #24 should probably be promoted to a foundational invariant. Your own graph has only four cycles, making this unusually cheap to attack. 

### H. Co-change analyzer

Run periodically—not as a gate.

Its output should be:

```text
Potential leakage:

combat/foo.ts
inventory/bar.ts
co-change: 0.91
imports: none

Likely shared design decision.
```

Then a human/agent decides:

```text
merge modules
or
create an abstraction
or
separate the design decisions
```

---

## 22. And I would add one more artifact: a module charter

Not a giant document.

Something like:

```text
MODULE: Inventory

Owns:
    item possession
    stack quantities
    inventory constraints

Does not own:
    item definitions
    persistence
    rendering
    networking

Public concepts:
    Inventory
    ItemId
    InventoryChange

Public operations:
    add()
    remove()
    contains()

Invariants:
    quantity >= 0
    capacity >= weight

Allowed dependencies:
    ItemCatalog

Forbidden:
    persistence/*
    rendering/*
    networking/*
```

This is substantially different from a README.

The key sections are **owns / does not own**.

Because the agent's hardest question is often:

> “Is this thing my module's responsibility or somebody else's?”

That is precisely the question your current metrics cannot answer.

---

## 23. One surprising implication: duplication may be good

Your v3 experiment discovered that duplication could improve the metric. 

I wouldn't necessarily treat that as a bug in the experiment.

Sometimes duplication is **exactly the correct architectural response**.

If two bounded contexts independently need:

```text
ItemName
```

and their semantics differ, sharing one `ItemName` type creates coupling.

You might actually want:

```text
CombatItemName
InventoryItemName
```

even if they happen to contain the same string.

The criterion should be:

> **Are these the same concept, or merely the same representation?**

This is one of the reasons bounded contexts are powerful. The same word can legitimately mean different things in different contexts.

So:

[
\text{DRY}
]

should not be applied across architectural boundaries blindly.

A little duplication can reduce **knowledge coupling**.

---

## 24. The architecture should optimize for “independent change,” not reuse

This is perhaps the biggest philosophical correction.

Traditional advice often asks:

> “How can we avoid duplicating code?”

For your use case, ask:

> **“How can we make unrelated changes remain unrelated?”**

Those produce different architectures.

Consider:

```text
              shared_utils
             /     |      \
            A      B       C
```

versus:

```text
       A        B        C
       │        │        │
     local    local    local
```

The first has less code.

The second has less **coordination**.

For an agent operating on a finite context window, coordination is arguably the more expensive resource.

---

## 25. Where your current experiments fit

I would reinterpret your results as follows:

| Existing experiment    | What it actually taught you                                           |
| ---------------------- | --------------------------------------------------------------------- |
| Import census          | Mechanical centrality ≠ cognitive dependency                          |
| Systems touched        | Directory partition ≠ architectural boundary                          |
| Biconnected blocks     | Graph connectivity ≠ conceptual cohesion                              |
| `layer-check`          | **Enforced local dependency direction works**                         |
| `never` guards         | **Compiler-enforced closed-world knowledge works**                    |
| parser-as-codec        | **One canonical representation eliminates knowledge duplication**     |
| byte fixtures          | **Concrete contracts can pin behavior**                               |
| audit                  | Reports discover problems but don't constrain agents                  |
| concept registry       | Metadata doesn't matter unless on the execution path                  |
| deleting decomposition | **Reducing transformations of the problem can reduce cognitive load** |
| co-change              | **Evolutionary coupling exposes hidden architectural boundaries**     |

That is actually a very coherent research result.

---

## 26. What I would *not* pursue

Based on your results, I'd stop investing heavily in:

### ❌ Global “complexity budget”

You have already demonstrated why this fails.

### ❌ Files-per-feature

Gameable and doesn't represent semantic scope.

### ❌ “Maximum N systems”

The partition itself becomes the thing being optimized.

### ❌ Biconnected component size

Useful diagnostic, bad architectural invariant.

### ❌ Manually maintained capability graphs

They decay and become another thing the agent has to understand.

### ❌ Giant architecture documents

They turn global knowledge into a compressed global knowledge problem.

### ❌ More sophisticated repo maps as the primary solution

Useful for navigation, but they don't reduce the amount of knowledge required.

---

## 27. What I would prioritize

In order:

### 1. **Ban cycles**

Cheap, foundational, and makes the dependency closure mathematically sane.

Your own data says this is only four violations. 

### 2. **Establish real module boundaries**

Not directories. Actual visibility boundaries.

### 3. **Default-deny everything**

Make crossing a module boundary an explicit architectural event.

### 4. **Define narrow public contracts**

Generated wherever possible.

### 5. **Make the contract the agent's default context**

Not the implementation.

### 6. **Use co-change to discover bad boundaries**

Especially no-import/high-co-change pairs.

### 7. **Generate anything that can be derived**

Your `SCHEMAS` work should continue.

### 8. **Only then build repository intelligence**

Use it as a navigation layer over the resulting architecture.

---

## 28. The ultimate test

I think you can reduce the entire architectural objective to a test that is much more meaningful than your previous metrics:

> **Can an agent implement a normal feature entirely inside one architectural context plus the contracts of its direct dependencies?**

If yes, you have achieved the thing you actually wanted.

If no, ask:

```text
Why?

A. The feature genuinely crosses domains.
B. A public contract is insufficient.
C. A design decision leaked across the boundary.
D. The boundary is in the wrong place.
E. The architecture is missing an abstraction.
```

Only **A** should be normal.

B–D are architecture problems.

And E is often the interesting one.

---

## The deeper conclusion

Your experiments don't look to me like evidence that the problem is difficult to measure.

They look like evidence that **measurement is the wrong control mechanism**.

The scalable solution is much closer to:

```text
                 GLOBAL REPOSITORY
                       │
             ┌─────────┴─────────┐
             │                   │
       architectural        repository
         boundaries            index
             │                   │
       ┌─────┴─────┐             │
       │           │             │
    private      contract       search
      world         │             │
       │            │             │
       └──────┬─────┘             │
              ▼                   │
         LOCAL CONTEXT ◄──────────┘
              │
              ▼
             TASK
```

**The repository map answers “where could the answer be?”**

**The architectural boundary answers “what am I allowed to need?”**

You need the second one to stop linear growth.

And I think your existing `layer-check`, `never` guards, parser-as-codec, generated schema work, and co-change analysis are all pointing toward the same architecture: **a modular monolith whose boundaries are explicit, private-by-default, contract-based, mechanically enforced, and discovered from evolutionary coupling rather than imposed by directory structure.**

That is also strikingly close to where large real-world systems are heading: GitLab's current modular-monolith work explicitly describes its goal as making modules “agent-ready,” with clear boundaries, explicit contracts, and enforced dependencies. ([The GitLab Handbook][3])

If you want to take this further, the most valuable next step would be to design **the actual module/contract/visibility system for your particular TypeScript repository**—including what should be generated, what should be hand-authored, and exactly what the coding agent would be permitted to see at each stage.

[1]: https://books.danielhofstetter.com/a-philosophy-of-software-design/?utm_source=chatgpt.com "A Philosophy of Software Design - by John Ousterhout"
[2]: https://link.springer.com/article/10.1007/s10664-017-9569-2?utm_source=chatgpt.com "An empirical study on the interplay between semantic coupling and co-change of software classes | Empirical Software Engineering | Springer Nature Link"
[3]: https://handbook.gitlab.com/handbook/engineering/architecture/design-documents/modular_monolith/?utm_source=chatgpt.com "Rails Monolith Decomposition | The GitLab Handbook"
[4]: https://handbook.gitlab.com/handbook/engineering/architecture/design-documents/modular_monolith/decisions/002_bounded_contexts_definition/?utm_source=chatgpt.com "Modular Monolith ADR 002: Define bounded contexts | The GitLab Handbook"
[5]: https://docs.bazel.build/versions/3.4.0/visibility.html?utm_source=chatgpt.com "Visibility - Bazel 3.4.0"
[6]: https://bazel.build/concepts/visibility?hl=en&utm_source=chatgpt.com "Visibility  |  Bazel"
[7]: https://aipatternbook.com/architecture-fitness-function/?utm_source=chatgpt.com "Architecture Fitness Function - Encyclopedia of Agentic Coding Patterns"
[8]: https://www.cns.s.u-tokyo.ac.jp/gitlab/help/architecture/blueprints/modular_monolith/bounded_contexts.md?utm_source=chatgpt.com "Bounded contexts · Modular monolith · Blueprints · Architecture · Help · GitLab"
[9]: https://aipatternbook.com/codebase-map/?utm_source=chatgpt.com "Codebase Map - Encyclopedia of Agentic Coding Patterns"
[10]: https://arxiv.org/abs/2601.10112?utm_source=chatgpt.com "Repository Intelligence Graph: Deterministic Architectural Map for LLM Code Assistants"

---

# Agent 3's research — the same questions, run against the tree

Agents 1 and 2 agree, and I think they are both wrong in the same place. Neither ran a number.
Everything above this line is argument from the literature plus your own prior measurements; the
proposals themselves (ban cycles first, place boundaries by co-change, default-deny visibility with
grants, committed API digests, module charters) arrive un-priced and un-refuted. This repository's
own discipline is that a proposal is refuted *before* dispatch — v1, v2 and v3 all died that way.
So I priced them.

Four of the recommendations do not survive. What survives is not on either agent's list, and it is
already sitting in your #23 marked *never tried*.

**Method.** Feature unit = merge commit; a branch's files are `diff(merge-base(p1,p2) .. p2)`. 139
merges, 51 touching non-test `src`, 46 usable (≥2 live modules). Import graph is 154 non-test
modules under `src` (your 211 counts tests), 817 edges, resolved through the same extensions the
bundler uses. Everything below reproduces from `git` and the tree alone — no stored state, per #20.
Scripts were scratch and are gone by design; the method is the artifact.

Calibration against your existing numbers, to show the harness is the same instrument: files per
`src`-touching branch median 9 / p90 32 (yours: 10 / 32, before excluding tests); four cycles with
28 modules in `src/runtime` (#16, exact); ~2 systems per feature (#17) reappears as 2.65 directories.

## 0. The closure is not repo-wide. It is two directories.

Median transitive import closure, per module, by directory:

| directory | modules | median closure | max |
|---|---|---|---|
| `src/grammar` | 14 | **3** | 10 |
| `src/content` | 42 | **12** | 51 |
| `src/runtime` | 42 | **82** | 87 |
| `src/ui` | 54 | **86** | 138 |

Repo-wide median 82 of 154. This is the quantity Agent 1 defined ("the transitive closure of what M
reaches") and it is the thing that grows. But it is *bimodal*, not linear-everywhere: `grammar` and
`content` are already bounded, and every repo-wide instrument you built averaged those two into the
score and reported a middling number that named nothing. The failure of #1/#2/#3 is over-determined
— they were not just repo-wide, they were repo-wide over a population that is two populations.

## 1. Refuted: "ban cycles, it's cheap, do it first"

Both agents make this priority #1 on the strength of your "4 violations". Four is the count of
strongly connected components, not the count of work. The `src/runtime` SCC has 28 modules and
**131 internal edges**. Greedy minimum-feedback-arc-set says making `src` acyclic requires cutting
or inverting **32 import edges**, 11 of them pointing at `runtime/state.ts`, spread over ~15 files
in the most entangled part of the codebase. That is not a day.

The prize is worse than the price. Counterfactual, holding everything else fixed:

| graph | median closure |
|---|---|
| today | 82 |
| after the 32-edge MFAS cut | 48 |
| **if all 131 intra-SCC edges vanished** (physically impossible upper bound) | **49** |

Even deleting every edge inside the blob — which would mean those 28 modules do not reference each
other at all — leaves the median module reaching 49 of 154. Banning cycles buys a constant factor
on an unbounded quantity. It is worth doing for the reason `layer-check` is worth having (it is
inexemptible, see §4), but it is not the intervention, and sequencing it first spends the branch's
budget on a 40% dent.

## 2. Refuted: "separate data from behaviour" pays 82 → 8

Your #32. I found it independently and it looked spectacular. Greedily severing the *outgoing* edges
of modules — making each a leaf, i.e. pure data — takes median closure 82 → 49 → 42 → 21 → 13 → **8**
after five modules (`runtime/command.ts`, `content/registry.ts`, `content/module.ts`,
`runtime/localized.ts`, `runtime/session.ts`).

That number is an artifact and I am reporting it only so nobody else finds it and believes it.
Severing outgoing edges is only realizable for consumers that import the module *as types*. Everyone
else calls the functions and still pulls the implementation closure. Actual consumer split:

| hub | consumers | type-only | value |
|---|---|---|---|
| `runtime/session.ts` | 22 | **19** | 3 |
| `runtime/localized.ts` | 37 | 20 | 17 |
| `content/registry.ts` | 38 | 9 | **29** |
| `runtime/state.ts` | 24 | 3 | **21** |
| `runtime/runtime.ts` | 5 | 0 | **5** |

Modelling the split honestly — `X.types.ts` as a new leaf, type-only consumers repointed, value
consumers unchanged — gives median 82 → **42**, and it **saturates after two hubs**. Splitting hubs
3 through 8 moves the median by zero. And p90 closure *rises* 91 → 98, because the split adds
modules. Same ceiling as cycle-breaking, from an unrelated direction.

Two independent structural interventions both stop at ~42–49. That is not a coincidence about the
interventions; it is a floor. The value-dependency structure of a game runtime is not going to let
the combat code stop transitively reaching the state representation, and no amount of graph surgery
changes that. **Transitive closure size is not the quantity to bound.** Agent 1 wrote the correct
version and then dropped it: each hop costs *the interface*, not the implementation. A closure of 82
through honest interfaces is free; a closure of 12 through leaky ones is not. Both agents then spent
the rest of their analysis optimizing |closure|.

## 3. Refuted, and this is the decisive one: co-change does not transfer

This is the load-bearing recommendation on both lists — Agent 1's "place boundaries by co-change,
not by directory", Agent 2's priority #6 — and it is your #14, the measurement you say scores both
worked examples correctly and have quoted three times.

Cluster the co-change graph, evaluate the partition by how many parts a feature touches. The trap
nobody applied: **train on the first half of history, test on the second.** Evaluated on held-out
features only:

| partition | mean parts touched | features fully contained |
|---|---|---|
| co-change, trained on **all** history (circular) | 2.17 | 43% |
| **directory (the 5 you already have)** | **2.65** | **17%** |
| random partition, sizes matched to directories | 3.64 | 3% |
| **co-change, trained on first half, tested on second** | **7.91** | **9%** |
| trivial 1-part partition (the relabel attack) | 1.00 | 100% |

Trained and tested on the same history it looks like a decisive win — 2.17 and 43%, beating
directories on both. Trained honestly it is **worse than random**. Swept across k = 3…30 it never
recovers. The 43% is memorization of the refactors it was fitted to.

Why, mechanically: co-change here is not stationary.

- Spearman between first-half and second-half pair weights, on the 226 pairs present in both: **0.166**. Your v1 import census was refuted at **0.195**. The signal you kept is a weaker predictor of *itself* than the metric you already threw away is of change frequency.
- Top-50 strongest pairs: 24% overlap between halves. Top-100: 18%.
- 3 of 46 features contribute **29%** of all pair observations. The graph is mostly a picture of three big refactors.

The directional form is better and still not enough. "A never changes without B" (confidence 1.0,
support ≥4) yields 119 rules over all history, 65 with no import edge. Learn them on the first half,
test on the second: **14–19% hold**, against a **5.5%** random-pair baseline. Three to four times
chance, and 80%+ false.

Your headline pair is real and survives every cut: `referenceSites.ts → serialize.ts`, support 19,
8 in the first half and 11 in the second, and `referenceSites.ts` has **never** changed without
`serialize.ts` in either. So #14 is sound *as a statement about that pair* and unsound as a ranking,
a clustering input, or a placement rule. That is the same shape as everything else that has worked
here — a specific local fact, not a gradient. The honest reading is that this history is too short
(46 features, 18 days) and its features too large for evolutionary coupling to locate boundaries,
and that will still be true in three months because the code will have moved.

## 4. The governance-artifact law — why all four remaining proposals die

v2 died on one sentence: *the escape is worker-issuable*. That is treated above as a fact about v2.
It is a law, and it is measurable. For each artifact that governs `src`, how often was it edited in
the same branch as `src` itself? (Base rate: 51 of 139 merges touch non-test `src`, so 37%.)

| governance artifact | merges editing it | also editing `src` | |
|---|---|---|---|
| `docs/audits/systems.json` — the v2 partition | 63 | **40** | **63%** |
| `docs/workflow.md` | 18 | 7 | 39% |
| `CLAUDE.md` / `AGENTS.md` | 18 | 6 | 33% |
| `scripts/layer-check.ts` | 2 | **0** | **0%** |
| every `scripts/*.ts` gate | 10 | **0** | **0%** |
| `exhaustive.test.ts` | 0 | 0 | — |

The partition a worker can edit to make its own diff compliant is edited alongside code at nearly
twice the base rate. The gates are never touched alongside code — 0 of 10, which at the 37% base
rate is a ~0.9% coincidence.

This is not "declarative loses to code". `layer-check` is 8 lines and has **no knob at all**: the
layer order is a 5-element total order, and no feature can want it different. `systems.json` has one
knob per file, and adding your new file to it is how you go green. The discriminator is whether
editing the artifact *helps you land your diff*.

Which prices the rest of the list, because every one of them is a knob-per-case artifact that a
worker edits to proceed:

- **Default-deny visibility with per-edge grants.** The grant file is `systems.json` with better manners. A worker that needs `inventory/internal/SlotAllocator` adds the grant, truthfully, in the same commit. Expect 63%. Bazel and Google's OWNERS work because the approver is *a different party with different incentives* — that is the load-bearing part, and Agent 1's citations all have it. You do not have one at grant time; your reviewer is the same agent that wants the grant. Nothing in the mechanism survives removing the human.
- **Committed API digests / golden files.** Same law, plus a direct collision with #20: a golden file *is* a stored baseline, and metalava's baseline-regeneration workflow — which Agent 1 cites approvingly — is the mechanism by which it gets rubber-stamped. Derive the digest at the merge base and diff, or don't build it.
- **Module charters with `owns` / `does not own` (Agent 2 §22).** Hand-authored prose, manually synced — the failure mode CLAUDE.md names twice in one paragraph, and your #19, already rejected. You have also already built it: `tasks produces` is the concept registry, and #10 records what happened — 78 of 149 names never registered, fires ~1 in 160.
- **Bounded contexts as the primary partition.** §3 says the data cannot place them, and v2 says a partition you can relabel is a partition that gets relabelled. Merging two systems moved compliance 67%→78% with zero code change; that property is intrinsic to any containment score, including every one in my §3 table.

Feasibility note if visibility is pursued anyway: `tsconfig.json` sets `moduleResolution: "Node"`,
which ignores `package.json` `exports` entirely. Real enforcement needs `bundler` or `node16` first.
An ESLint/dependency-cruiser rule instead is a knob-per-case artifact and lands back in this section.

## 5. What the measurements actually point at

Three files carry the answer. `content/referenceSites.ts`, `content/registry.ts` and
`content/serialize.ts` are the top co-change cluster in your #14 — and they are also the top three
holders of **hand-written members of a closed set that is defined somewhere else**:

```
286 literal section-kind names, across 41 of 154 modules
     80  src/content/referenceSites.ts        9  src/content/serialize.ts
     72  src/content/registry.ts              9  src/ui/xpNotes.ts
     23  src/runtime/session.ts               7  src/content/resolve.ts
     17  src/content/namespace.ts             7  src/runtime/planeReport.ts
```

The set is `SCHEMAS` at `content/module.ts:32`, and `SchemaKind = keyof typeof SCHEMAS` is already
exported on line 50. `referenceSites.ts` and `serialize.ts` co-change 19/19 with no import edge
because **they do not need one**: each holds its own hand-copied transcription of the same
enumeration. That is Ousterhout's information leakage in its most literal form, it is the mechanism
behind the one co-change finding that survives §3, and it is invisible to every structural metric by
construction — which is exactly why #1, #2 and #3 could not see it.

It predicts change frequency better than anything else measured here, *conditionally*:

| signal | Spearman vs change frequency (n=154) |
|---|---|
| lines of code | 0.563 |
| out-degree | 0.529 |
| kind-literal count | 0.360 |

As a global ranking it loses to counting lines — which is precisely how v1 died, and I am not going
to hand you a fourth repo-wide number. Controlled for size it inverts:

| stratum | enumerator modules | mean features touching | non-enumerators |
|---|---|---|---|
| LOC 2–36 | 0 | — | 1.41 |
| LOC 37–87 | 0 | — | 2.56 |
| LOC 88–171 | 5 | 4.20 | 2.53 |
| LOC 172–1408 | 9 | **14.67** | 5.29 |
| **≥300 LOC** | 6 | **19.17** | 6.46 |

Spearman within `≥300 LOC` rises to **0.695**. Among the modules where work actually happens,
whether a file transcribes the kind list is a 3× discriminator on how often it gets dragged into
somebody else's feature. Zero enumerators exist below 88 LOC, which suggests the transcription is
not merely correlated with size but substantially *is* the size.

And the blast radius is directly observable. Commits that added a kind to `SCHEMAS`:

```
0674b299  +slot                    ->   9 src modules touched
5c7a9cff  +passive, +cluster-jewel ->   7
d76154bd  +entitytype              ->  11
ae08d1bc  +event, +faction         ->  27
```

Against a median feature of 9 files. Adding one member to one table is a median-to-p90 feature.
*That* is the growth you are feeling, and it is not the import closure.

## 6. Recommendation

Do #23, at full scope, and do it before anything else on this page.

Generalise the `exhaustive.test.ts` proof from discriminated-union switches to **any closed set
derived from `SCHEMAS`**, and drive the 286 literals out of the 41 files by deriving them. It is the
only candidate that satisfies every constraint the repository has established:

- **It is #5 and #6 again**, the two mechanisms that worked, applied to the next closed set. `SCHEMAS` is already used this way in four test files ("read off `SCHEMAS` rather than written down"); the pattern is proven in-tree.
- **It is inexemptible (§4).** After the change there is no knob: a kind added to `SCHEMAS` either compiles everywhere or fails. Nothing to edit alongside your diff to go green — the property that separates `layer-check` (0%) from `systems.json` (63%).
- **It is a derived proof, not an enumeration** — CLAUDE.md's own rule. The proof walks `SCHEMAS` and covers the kind added next month.
- **It is not a repo-wide number, a threshold, a stored baseline, a partition, or a co-editable governance file** — the five shapes that have failed here six times between them.
- **It retires the strongest surviving finding in #14** by removing its cause rather than reporting it, and it does so without needing co-change to be stationary.

Sequence, and the reason: aim one `npm run mutate` manifest over the whole thing before the first
auditor is commissioned (the `the-gui-authors-through-the-same-door` lesson — 3.5 hours and 660k
tokens to relearn). Then `content/referenceSites.ts` and `content/registry.ts` first: 152 of the 286
literals, and they are the co-change pair, so the leak either closes or is proven not to be the
cause. That is a falsifiable prediction and it is cheap: if those two stop co-changing, the model
is right; if they keep co-changing, the leak is elsewhere and this page is wrong.

Then ban cycles (#24) — 32 edges, worth it for inexemptibility, not for the 40%. Split
`runtime/session.ts` (19 of 22 consumers are type-only, so it is nearly free) and stop, because §2
says hub 3 onward pays nothing. Leave visibility, digests, charters and bounded contexts alone until
there is a second party to approve a grant.

## 7. What would falsify this

- If `referenceSites.ts` and `registry.ts` still co-change after their literals are derived, §5 is wrong and the leak is elsewhere.
- If adding a kind after the change still touches >4 modules, the closed set was not the binding constraint.
- §3 rests on 46 features over 18 days. It is enough to refute "co-change locates boundaries *here, now*" and not enough to refute the technique in general; re-run the held-out split at ~150 features before reconsidering. Note that it will not become stationary by waiting — the code moves too.
- §4's 0-of-10 is a small sample. It is significant at the 37% base rate (~0.9%), and `systems.json`'s 40-of-63 is the stronger half of the claim.
- I did not verify agents 1's and 2's citations. Agent 2's arXiv:2601.10112 "Repository Intelligence Graph" carries a specific effect size (+12.2%, −53.9%) that nothing here depends on; check it before it is quoted again.
