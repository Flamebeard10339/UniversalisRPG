# DSL modules — reconciliation of two independent audits, 2026-07-29

Two audits of the same push (`e56b25d`..`731c3a6`, DSL module deliverable chunks 1–8) ran without
knowledge of each other:

- **A** — `docs/audits/dsl-modules-2026-07-29-full.md`. Full-system pass, deliberately crossed out of
  `src/grammar` + `src/content` into `src/runtime/save.ts` and `scripts/`, because engine
  requirement 6 is implemented outside the DSL load path's declared paths.
- **B** — `docs/audits/dsl-modules-2026-07-29-codex-independent.md`. Independent pass in an isolated
  worktree at `17c011d`, confirming the intervening commit was docs-only before starting.

This document reconciles them. Ranking is by **agreement first**: a defect two independent passes
found from different directions is the one most worth spending the next commit on.

Every claim below was re-reproduced during reconciliation against the working tree at `1d13661`;
reproductions are quoted inline. Where a reproduction differs from what either audit reported, the
difference is called out.

---

## Tier 1 — found by both audits

### R1 — `stats:` is a broken collection field (A-H2 + A-M1, B-M2)

The single highest-confidence item in the set: both audits found it, from different directions, and
both independently proposed the same fix.

One root cause, `src/content/entity.ts:30`:

```ts
const statBlock: Parser<Record<string, Range>> = {
  parse: (cursor) => Object.fromEntries(list(statAssignment).parse(cursor)),
};
```

`statBlock` calls `list(statAssignment).parse` and throws away the `ListParser` around it — both the
`parseBlock` that `src/grammar/section.ts:76` requires for block form and the `element` that
`isListField` (`section.ts:42`) requires for granular merge. Three symptoms follow:

| Symptom | Found by | Reproduced |
| --- | --- | --- |
| Patching one stat deletes the rest of the sheet | A-H2 | `base.rat` = `attack 4, defence 9`; patch `stats: attack 7` → `{"base.attack":{"min":7,"max":7}}` — **defence gone, silently** |
| `stats:` rejects block form | A-M1, B-M2 | `this field cannot be written as a block`, while the control `flags:` block loads clean |
| `+stats` / `-stats` rejected | A-M1 | `stats is not a list` |

A frames the merge half as H (it fails module requirement 2 of the deliverable — "edit an entry owned
by another module, down to a single key" — and the design's own "fields it does not list are
untouched"). B frames the grammar half as M and names the reuse miss precisely: `list(statAssignment)`
plus an object conversion is the existing pattern that should have been used.

Both are the same commit's work. Making `statBlock` a real `ListParser` over `[statId, Range]` pairs
closes all three.

**Note on provenance:** A records that this is the failure an agent authoring against the grammar hit
and misdiagnosed as its own error. That an independent audit then found the same field from a cold
start is strong evidence the inconsistency is discoverable only by tripping it.

### R2 — the registry and the namespace describe different universes (A-H1, B-M3)

Both audits found a defect in the same seam, in **opposite directions**. That is what makes this
structural rather than a typo.

**A-H1 — the namespace knows about content the registry prune does not.** `src/runtime/save.ts:120`:

```ts
pruneRecord(state.flags, 'flags', (id) => registry.flags.has(id), 'flag', warnings);
pruneRecord(state.visits, 'visits', (id) => registry.namespace.has('node', id), 'dialogue node', warnings);
```

`registry.flags` holds only `# flag` sections. Flags declared by `flags:` on an entity or location —
and `discovered`, which `src/content/resolve.ts:57` declares on *every* location — live in
`registry.namespace` alone. The `visits` line one row below already reads the namespace; the `flags`
line does not. Reproduced:

```
registry.flags has w.home.unlocked : false
namespace has  w.home.unlocked     : true
namespace has  w.cave.discovered   : true
flags after prune : {}
WARN Removed flags w.home.unlocked because its flag is not loaded.
WARN Removed flags w.cave.discovered because its flag is not loaded.
```

Every object-owned flag and **all map discovery** is deleted on `/load` and on every accepted `/dsl`
edit. This is the defect class chunk 5 was built to prevent, inverted: it quietly removes content
that is present.

**B-M3 — the registry prune leaves content in the namespace that is gone.** Optional-dependency
pruning deletes registry map entries (`registry.ts:342,350,357,364`) but never calls
`namespace.undeclare`, which exists (`namespace.ts:58`). B's smoke:

```
dialogues (none)
node declared true
no warnings
visits {"base.chat.greet":2}
```

**Reconciled reading.** A found "the prune trusts the registry where it should trust the namespace";
B found "the prune mutates the registry and leaves the namespace stale". Neither is a wrong predicate
in isolation — together they say **there is no invariant that the two structures describe the same
surviving universe**, and each prune path picks whichever one happens to be convenient.

Flipping `registry.flags` to `registry.namespace.has('flag', id)` fixes A-H1's symptom and is
verified green, but it is not the fix for R2 — it makes the prune trust a structure that B proves is
not maintained. **Establish the invariant, then pick the predicate.**

**Status check:** A reports applying the one-line fix and re-running (419/419 green). That fix was
**not committed** — `save.ts:120` in the working tree still reads `registry.flags`. Confirmed above.

### R3 — modportal `sync` writes before it validates, and leaves broken state behind (A-M2 + A-M3, B-M4)

Three findings across two audits describing one lifecycle bug.

- **B-M4:** `sync` materializes issues, writes DSL files and writes the manifest *before* validating
  the resulting enabled set (`scripts/modportal.ts:157-165`), and `upsertModportalEntries` defaults
  new entries to enabled (`src/content/modportal.ts:87-100`). A bad approved issue therefore exits
  non-zero having already left a broken **enabled** mod in `content/modportal.local`.
- **A-M3:** the escape hatch does not work either. `loadUniverseWithDiagnostics` parses disabled
  sources to recover their ids and records diagnostics for them (`registry.ts:524-533`), `play-cli`
  prints those every launch, and `validateEnabled` — despite the name — is called with *all* entries
  and exits 1 on any diagnostic. So disabling the broken mod neither silences it nor unblocks `sync`.
- **A-M2:** and the resulting cache cannot be repaired through the tool, because a corrupt
  `manifest.json` takes down `modportal list/enable/disable` too (below).

Taken together: sync can create a broken state, disabling is not an exit from it, and the repair
tool shares the failure mode. Order the fix that way — validate before committing state, make
`validateEnabled` honour its name, then the crash guard.

### R4 — the modportal manifest read path lacks the guard play-cli already applies (A-M2, B-L2)

Both audits flagged `scripts/modportal.ts` reading manifest-supplied file paths directly
(`:134`, `:135`, `:198-205`) where `scripts/play-cli.ts:750-773` guards the same data with an
`inside()` check before reading.

They differ only in the consequence emphasised, and the two are complementary:

- **A-M2 (availability):** unguarded `JSON.parse` + `manifest.entries` iteration at
  `play-cli.ts:760` and `modportal.ts:97`. `malformed json → SyntaxError`, `no entries key →
  TypeError: manifest.entries is not iterable`. A truncated write or interrupted `sync` takes down
  `npm run play` with a stack trace, *before* the tolerant loader is ever reached — routing around
  the chunk-4 guarantee that bad content cannot reach an unrecoverable state.
- **B-L2 (containment):** a corrupted manifest can make `modportal show` or validation read outside
  the cache directory.

One fix serves both: parse and validate the manifest through a single guarded reader that both
call-sites share. B correctly notes the traversal risk is currently theoretical — sync-generated
filenames are built from sanitized issue data — which is why this is one item, ranked on A's
availability impact.

### R5 — the GUI half of engine requirement 2 is unmet and being recorded as done (B-H2, A "Residual risk")

Both audits say the deliverable is closing a requirement it did not meet. `src/main.tsx` is still a
placeholder ("GUI pending"), so "create new content of every DSL type, from both CLI and GUI"
(`docs/dsl-modules/deliverable-log.md:26`) is half-met by construction.

**Disagreement, resolved.** B files this as H2. A files it as residual risk, not a finding. The
reconciled position is A's severity with B's insistence on an action: this is not a code defect —
nobody is going to build the GUI as part of this deliverable — it is a **bookkeeping** defect. The
deliverable log should state requirement 2 is half-met rather than marking chunk 6 as closing it
outright. That is a one-line edit and it is worth making, because the alternative is a deliverable
archived as complete against a criterion it never met.

Overlaps **BD-H2** already open in `backlog.md` (a tag push would publish the placeholder). Same
placeholder, two systems' audits. Do not file twice.

### R6 — `/dsl <kind>` has no discovery path (B-L1, A "Decision wanted")

Both raise it, both at low priority, and it is already captured in `backlog.md` under *Decision
wanted, not a defect* with the implementation analysis (`SCHEMAS` can generate the help, but
`AnySchema` carries only field names and would need widening to expose `keyword`/`keywords`/
`clauses`/`bare`). Independent agreement does not change the design call — it confirms the gap is
real rather than a matter of taste. No new item; the existing entry stands.

---

## Tier 2 — found by one audit, promoted after reconciliation

### R7 — `~` dependencies do not work at all (B-H1 only) — **verified, promote to top of Tier 1 work**

The most severe finding either audit produced that the other missed, and it survived reproduction
cleanly.

`docs/dsl-modules/deliverable-log.md:305` documents `~` as "required, but **does not affect load
order** — for breaking dependency cycles". The implementation declares module ids up front
(`registry.ts:436,443`) but resolves each module's *sections* inside `resolveModule` as that module
is reached, in topological/name order. A module resolving earlier therefore cannot see a later
module's ids, and `~` explicitly opts out of the ordering that would guarantee it.

Reproduced with two runs whose content is **byte-identical except the module name**:

```
### ~ dep, referrer sorts FIRST (aref < target)
  loaded  : ["target"]
  disabled: ["aref"]
  diags   : ["aref/resolve: # entity aref.npc action \"use\" give: names an unknown item: target.gem"]

### ~ dep, referrer sorts LAST (zref > target)
  loaded  : ["target","zref"]
  disabled: []
  diags   : []
```

The advertised escape hatch for cyclic references works only by alphabetical accident. Real cyclic
content cannot use it.

**Corroborating evidence B did not cite.** `src/content/resolve.ts:92` already throws a bespoke
`~`-aware error for one case:

```
# remove ... edits <owner>, but ~ dependencies do not load before this module.
Use a load-order dependency for patches.
```

The code therefore *knows* about this exact ordering hazard and handles precisely one instance of it
(`# remove`), leaving every ordinary reference to fail by name order. That converts B's finding from
"a feature is broken" to "a known hazard was fixed in one place and not the general case", which is
the stronger version of the claim.

**Why A missed it.** A audited the deliverable's implemented and exercised surface. `~` is a
documented feature with no test and no shipped content using it, so nothing in the suite or in
`content/` points at it. This is a coverage lesson as much as a defect: the audit that read the
*spec* for unexercised promises found what the audit that read the *code* did not.

**Fix direction** (B's, and it looks right): a pre-resolution declaration pass over all loaded
modules before any reference rewriting. That also makes B's `# remove` special-case redundant.

### R8 — sub-parsers accept trailing garbage (B-M1) — verified, but **this is a re-discovery, not a new finding**

Verified, 4 for 4:

```
LOADED  requires: has coin typo
LOADED  time: 1 typo
LOADED  accuracy: attack typo
LOADED  give: coin typo
control (generic section engine) -> REJECTED
```

`parseActionLine` returns without requiring end-of-line consumption (`src/grammar/action.ts:45,50`),
and dialogue conditions/effects (`src/content/dialogue.ts:83,87,110,115`) and test `assert:`
(`src/content/test.ts:40,88,89`) parse with fresh cursors and never check for leftovers.

**Reconciliation note — the important part.** This is **DSL-M2 from the 2026-07-28 audit**, already
open in `backlog.md`: *"`action.ts` is a second, laxer copy of the section field engine. 89 of its
147 lines… `time: 1e3` → `1`, `speed: s garbage`… all load clean where the section engine rejects
the equivalents."* Same root cause, same file, overlapping examples.

Do **not** file it twice. What reconciliation adds is priority: an independent audit rediscovered it
from a cold start on a later baseline, which confirms it is still open, still reachable, and still
costing author-visible correctness. B also extends its blast radius beyond `action.ts` to
`dialogue.ts` and `test.ts`, which the 2026-07-28 finding did not cover — fold those two files into
the existing item's scope.

### R9 — contribution/modportal code is owned by no system (B-M5)

`docs/audits/systems.json:19-23` still records "Contribution system" with `paths: []` and the note
"Unbuilt: editor, validation/merge engine", while that system's code now demonstrably exists:
`scripts/publish-local-changes.ts`, `scripts/squash-local-changes.ts`, `scripts/modportal.ts`,
`src/content/contribution.ts`.

Consequence: changes to contribution behaviour are charged to the broad `scripts` coverage under
Testing Procedure, not to the system they implement — weakening exactly the architecture signal the
audit gate exists to produce.

Subsumed in theme by **TP-M5** already in `backlog.md` (*systems.json membership is not a
partition*), but B contributes a specific and immediately actionable instance that TP-M5 stated only
in aggregate. Keep it as its own line under TP-M5.

**Sequencing warning.** Giving this system real paths while its `lastAudit` is `null` will make
`npm run audit-status` exit non-zero immediately, and CI with it. That is arguably correct — the code
is genuinely unaudited — but it is a deliberate choice about turning the repo red, not a
tidy-up. Land it with either a first contribution-system audit or an explicit baseline SHA.

---

## Tier 3 — single-source, accepted as filed

Unique to **A**, unchallenged by B, and left at A's severities: **M5** (the prune map has no
exhaustiveness guard, unlike `SAVE_FIELDS` in the same file), **M6** (approved-mod re-identification
is a global text substitution over untrusted content, rewriting prose and `# save` JSON alike),
**M7** (the prune tests restate the implementation — the H1 fix leaves the suite green), **L1**
(`extractContributionDsl` takes the *first* ```dsl fence, which contributor notes precede), **L2**
(`serialize.ts:25` `n()` has two identical branches — confirmed still present), **L3** (two prune
rules coexist in one function under one name), **L4** (`visits` is not reserved and misparses as a
dialogue-node counter; `skills` is reserved but is not an engine root), **L5**
(`Namespace.resolve` materializes every key of a kind per reference).

B raised no finding that contradicts any of these.

---

## Convergent non-finding: the prune is not over-complex

Recording this because it settles a question the user asked, and because **both audits answered it
the same way without conferring** — which is worth more than either answer alone.

- **A-M5:** "This is the structural answer to *is the pruning more complicated than it needs to be?*
  — **it is not.** Strip `activeAction` and `activeBuffs` and what remains is literally the naive
  rule." The two exceptions are earned: `location` needs a *replacement* because "nowhere" is not a
  playable state, and `activeAction` is a compound in-flight record whose actors, cadences and
  resources are each separately prunable.
- **B, Requested Concern Notes:** "I am not filing *pruning is too complex* by itself. The explicit
  pass covers runtime state that is not representable as simple content ids, especially active
  actions, actor resources, buffs, and current location."

**Settled: the prune's shape is right.** What both audits then say is that its *predicates* are
wrong (R2) and its *type discipline* is missing (A-M5's exhaustiveness guard). Fix those; do not
rewrite the pass.

---

## Where the audits disagreed

Only two places, and neither is a factual conflict:

1. **Severity of the GUI gap** (R5) — B: H2. A: residual risk, not filed. Resolved as a bookkeeping
   defect: A's severity, B's insistence that it get an action.
2. **Default-enabled approved mods** — B-M4 treats defaulting new entries to enabled as compounding
   a failure mode; A-M6 records it as an unstated but defensible design position (DSL-only, no code
   execution, `approved-mod` is a maintainer gate). Reconciled: **compatible**. The design position
   is defensible for a mod that *passes* validation, and indefensible for one that fails it. Keep
   the default; make it conditional on validation succeeding — which is R3's fix anyway.

No finding in either audit was contradicted by the other.

---

## Coverage comparison — for future audit practice

Recorded because running two independent audits over one push is expensive, and the value showed up
in a specific and repeatable place.

| | A (full-system) | B (independent) |
| --- | --- | --- |
| Method | read the implementation and its cross-system surfaces | read the spec, then probed the loader in an isolated worktree |
| Unique high findings | H1 (flag prune / map discovery loss) | H1 (`~` dependencies do not work) |
| Total findings | 2H 7M 5L | 2H 5M 2L |
| Found by both | R1–R6 (6 items) | |

The overlap was ~40%, and each pass found a **HIGH** the other missed. The two misses have opposite
causes and that is the transferable lesson:

- A missed `~` because it audited what the code *does*; `~` is a documented promise with no test and
  no shipped content exercising it. **Read the spec for unexercised claims.**
- B missed the flag-prune data loss because it stayed nearer the DSL load path's declared paths;
  the defect lives in `src/runtime/save.ts`. **Cross the system boundary when the acceptance
  criteria do.**

Both lessons already have a home: the first argues for a test over every documented grammar feature,
the second is why A's `systems.json` note explicitly records that crossing into `src/runtime` does
*not* certify the Runtime system.

---

## Reconciled work order

Written to `backlog.md` as the DSL-modules section. Reproduced here as the audit's recommendation:

1. **R2** registry/namespace invariant — player-visible data loss, two independent confirmations,
   and A's tested one-liner is not sufficient on its own. Land with the `# test` A-M7 asks for.
2. **R1** `stats:` as a real `ListParser` — closes three symptoms in one change, highest agreement.
3. **R7** `~` dependency pre-declaration pass — a documented feature that does not work.
4. **R3** modportal sync lifecycle, then **R4** the shared guarded manifest reader.
5. **R8** folded into the existing DSL-M2 item, scope extended to `dialogue.ts` and `test.ts`.
6. **R5** deliverable-log correction; **R9** under TP-M5 with the sequencing warning attached.
7. Tier 3 as filed.
