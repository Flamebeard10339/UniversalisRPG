# brief-builds-the-manifest

## Deliverable

The auditor's brief already holds everything a mutation manifest is built from — the spec's proof
targets, the diff range, and the test tree — and still hands the auditor a blank. Eight recorded
passes across four specs in one 3.5-hour run each spent about ten minutes joining those three by
hand; roughly eighty minutes, the single largest repeated cost in the friction log. The join is
mechanical and the brief is where it belongs.

The reason it does not happen is one regex. `resolveTarget` accepts only `vitest <file> "<name>"`,
returns `null` for anything else, and `mutationManifest` skips a `null` without a word — so the
form nearly every clause in this repository actually writes, a target naming test files and no test
name, produces neither an entry nor a complaint. This branch makes a target that names files
resolve to the tests in those files, and makes every target that still cannot resolve say so.

The invariant across all five clauses is the same one: **the brief never asks the auditor to
reconstruct something the brief already knows, and never discards an input without saying it did.**
That second half is what turns the first from a convenience into a contract — a manifest that
silently omits half a spec's targets is worse than no manifest, because the auditor has no way to
tell an empty target list from an unread one.

Two folded records are the same invariant one layer down, in the filing half of the same command:
a finding's own fields are taken untrimmed, so a whitespace-only value satisfies a required check
and the guard reports nothing; and `--args-from` refuses a bare slug on the file's first line with
a message that is true and unactionable.

Proof:

- [c1] A proof target that names test files and no test name resolves to the tests declared in
  those files. The property is that a target resolves to whatever the auditor would run for it —
  naming a file means naming its tests, and naming more than one file means naming all of theirs,
  because a target carrying two paths is a form this repository's own specs already use. Which
  surface forms count as "names files" is the open question below; that no form a spec actually
  writes today is silently unparseable is the clause.
  proof: over every `proof:` line in `docs/specs/*.md` whose value begins `vitest`, count those
  that yield at least one manifest entry. Record the count at this branch's base and at its head,
  and record the total number of such lines. At head every target the branch decides names test
  files is in that set, and every target that resolved at base still does — a resolver that gains
  the new form by losing the old one meets neither half.
  proof: vitest scripts/tasks/auditPrompt.test.ts

- [c2] No proof target is discarded in silence. For every target a clause writes, the brief emits
  either a manifest entry or a named omission carrying that target's text and why it did not
  resolve. There is no third outcome, and in particular no path where a target is read and then
  dropped without appearing in either list — which is what `resolveTarget` returning `null` does
  today. The count the brief reports is over targets, not over the subset it happened to
  understand.
  proof: over the same `docs/specs/*.md` corpus as c1, every `vitest` target appears in exactly one
  of the manifest entries or the omitted list, with the two counts summing to the corpus total.
  Record all three numbers.
  proof: vitest scripts/tasks/auditPrompt.test.ts

- [c3] Every reason the brief gives for an unresolved target names a form that would resolve. The
  present messages name what failed and never what would succeed, which leaves a reader who has
  just written a clause with no way to fix it without reading the parser. Each distinct failure the
  brief can report — including the unparseable case c2 adds — states the writable form for that
  case. The clause is over the set of reachable messages, not over a list of them: a failure state
  added later without a remedy sentence is a violation of this clause.
  proof: enumerate every string the brief can print for a target that did not produce an entry, by
  reading the code that produces them, and show each names a target form. Record the enumeration in
  the pass so a later reader can check it against the code's failure states.
  proof: vitest scripts/tasks/auditPrompt.test.ts

- [c4] A finding's title, deliverable and evidence are trimmed where they are assembled, so a
  whitespace-only value is refused by the same guard that refuses an absent one. The guard already
  tests truthiness and is correct; the value reaching it untrimmed is the defect, and the fix goes
  at the assignment and not at the guard. The property is that no required field of a finding can
  be satisfied by whitespace, by any route that assembles one.
  proof: vitest scripts/tasks/audit.test.ts

- [c5] An `--args-from` parse error names an action its reader can take. A value line before any
  flag is reported today with a true and unactionable sentence; the reader has just written a whole
  pass file and cannot tell from the message that the slug belongs on the command line. Where the
  offending line is a bare spec slug — the one value a reader plausibly puts there that is not a
  flag — the message says so. Naming the likely cause is the clause; the slug is the instance that
  motivates it.
  proof: vitest scripts/tasks/audit.test.ts

## Goal

Stop the brief from making an auditor rebuild the join it already has the inputs for, and make
every input it declines to use say so out loud.

## Decisions

- No new capability is registered. `proof target resolution` is already registered to the Task
  system over `scripts/tasks/auditPrompt.ts` and produced by `targets-resolve-across-files`; making
  it resolve a second target form extends that concept rather than adding one. A second concept
  named for the manifest would be a new name for the thing `generated auditor brief` and
  `proof target resolution` already divide between them.

- The write grant is widened from `auditPrompt.ts` to include `scripts/tasks/audit.ts` and
  `scripts/tasks/audit.test.ts`. c4 and c5 are folded records whose fix sites were recorded as
  `audit.ts` before `audit-splits-at-its-seam` drew the seam, and both stayed on the filing side of
  it: the untrimmed assignment is `audit.ts:192`/`:207` and the parse error is `audit.ts:244`. The
  fold was correct and the grant was written against the pre-split file list. No other branch in
  this push writes `audit.ts`.

- c1 and c2 are two clauses rather than one because they fail independently. A resolver that
  handles file-only targets still discards every other unparseable form silently, and a brief that
  reports every omission is an improvement even for targets it will never resolve. Merging them
  would let a branch satisfy the visible half and leave the silent-drop path intact, which is the
  half that made the defect invisible for eight passes.

## Open questions

- Which surface forms of a target count as "names test files". At minimum a bare path and a
  space-separated list of paths, since `audit-splits-at-its-seam` c2 writes two paths in one
  target. Backtick-wrapped paths also appear in the corpus, because a spec is markdown and an
  author writes code spans. Survey `docs/specs/*.md` for the `proof:` lines that begin `vitest`,
  report the distinct shapes and their counts in the pass, and decide from the corpus rather than
  from a guess — a form appearing once may be a typo worth refusing loudly rather than a dialect
  worth parsing.

- Whether a file-only target that names a file with no tests is an omission or an empty success.
  Both are defensible: it resolved, and it produced nothing to run. Pick one and say why. The
  constraint from c2 is only that it cannot be silent.

- Whether the whole-corpus count c1 and c2 ask for should be produced by a script the branch
  leaves behind or by an ad-hoc read at pass time. `npm run inspect` exists for exactly the second
  and leaves no file; prefer it unless the count is something a later pass will want to re-run, in
  which case it is a test and belongs in the suite.

## Audit passes

### Pass 1 — 2026-08-08

- base: `fbf475fe1786cc51ccb1a2c7f1f3619ed5006d2a`
- head: `b315a39c21236f141a142c876e85ba3e421ac3cf`
- proof 1: met — Read every `vitest`-prefixed proof: target across docs/specs/*.md (258 total: 117 quoted-name, 141 file-only). Simulated base behavior (resolveNamedTarget's regex/logic is unchanged by this branch, so a target's fate under the old single-object resolveTarget is identical to its fate under head's quoted-name path today): base resolves 108/258, omits 150/258. At head, resolveTarget (scripts/tasks/auditPrompt.ts:156) resolves 237/258, omits 21/258. Every one of the 108 base-resolved targets still resolves at head (checked directly: iterating all 117 quoted-name targets and confirming resolution is unchanged; the only 9 that fail to resolve at head are quoted-name targets that were already broken pre-branch — same regex, same read/search — not a regression). The 129 newly-resolved targets are all file-only ("names test files and no test name"), which is exactly the form the clause names. Reproduce: `npm run inspect -- "(async () => { const {readdirSync,readFileSync}=await import('node:fs'); const path=await import('node:path'); const {parseSpecDoc}=await load('scripts/lib/specDoc.ts'); const ap=await load('scripts/tasks/auditPrompt.ts'); const dir=path.join(process.cwd(),'docs','specs'); const targets=readdirSync(dir).filter(n=>n.endsWith('.md')).flatMap(n=>parseSpecDoc(readFileSync(path.join(dir,n),'utf8')).proofClauses.flatMap(c=>c.proofTargets??[])).filter(t=>/^vitest(\s|$)/.test(t)); let r=0,o=0; for (const t of targets){const rs=ap.resolveTarget(t); (rs.some(x=>x.state==='found'||x.state==='moved')?r++:o++);} return JSON.stringify({total:targets.length,r,o});})()"` -> {"total":258,"r":237,"o":21}. Also mutation-verified at the file-list split (scripts/tasks/auditPrompt.ts:115, `return body.split(/\s+/);`) via a hand-aimed manifest: KILLED by "c1: a target naming two files, bare or backtick-wrapped, resolves to every test across both" (scripts/tasks/auditPrompt.test.ts).
- proof 2: met — Over the same 258-target corpus: resolved 237 + omitted 21 = 258, matching the total exactly (no target vanishes). mutationManifest (scripts/tasks/auditPrompt.ts:333) never returns early on an unrecognised form — the old `if (resolution === null) continue;` path is gone, and resolveTarget always returns a non-empty array for any `vitest`-prefixed target (unparseable targets get `[{state:'unparseable',...}]` rather than `[]`). Mutation-verified: reverting `if (files === null) return [{ state: 'unparseable', target }];` (scripts/tasks/auditPrompt.ts:162) to `return [];` KILLED "c2: a vitest target matching no recognised form is reported as unparseable rather than dropped" (scripts/tasks/auditPrompt.test.ts). Caveat recorded, not filed as a finding: a hand-built multi-file target where one file resolves and another does not (e.g. `vitest good.test.ts bad.test.ts` with bad.test.ts absent) appears in *both* the manifest entries and the omitted list simultaneously — verified via `npm run inspect`. This is strictly more informative than either alone (nothing is lost) and the current corpus contains no such mixed target (both multi-file targets in docs/specs resolve every file cleanly), but it means the proof's literal "exactly one of" wording is imprecise at the resolution granularity vs. the target granularity. Not blocking; noted for whoever next touches this wording.
- proof 3: met — describeResolution (scripts/tasks/auditPrompt.ts:171) is the single place every failure sentence is written (grepped every caller of TargetResolution/describeResolution in scripts/tasks/auditPrompt.ts — mutationManifest's omitted-list and unresolvedTarget's display note both route through it, nothing else prints a resolution-derived sentence), and TypeScript's exhaustive switch (no default, non-void return type) means an unhandled future state fails tsc, not just review. Enumerated all 6 non-`found` messages (scripts/tasks/auditPrompt.test.ts "c3: every reported reason names the target form that would resolve it"): no-such-file -> "write a target naming a file this checkout has"; nowhere -> "quote the exact title of a test that exists, or drop the quotes to name every test in the file"; unsearchable -> "quote the title exactly as it is written in the file"; no-tests -> "name a file that has at least one `it(...)`, or drop it from the target"; unparseable -> "write `vitest <file> \"<test name>\"` ... or `vitest <file> [<file> ...]`". (`moved` is excluded from this enumeration on purpose: it is a successful resolution with a redirect note, not a failure needing a remedy, and it never appears in the omitted list — only in the interactive display alongside a target that already resolved.) Mutation-verified: replacing the unparseable message's text (scripts/tasks/auditPrompt.ts:184) with a form-free string KILLED "c3: every reported reason names the target form that would resolve it".
- proof 4: unmet — --deliverable and --evidence are trimmed and guarded correctly: parseAuditArgs trims both at assignment (scripts/tasks/audit.ts:192 `current.evidence = (value ?? '').trim();`, :207 `current.deliverable = value?.trim() ?? null;`), and filedFindings' existing truthiness guards (scripts/tasks/audit.ts:348, :352) now refuse a whitespace-only value. Mutation-verified: reverting either trim KILLED "c4: audit refuses a --finding whose --deliverable or --evidence is only whitespace, recording nothing" (scripts/tasks/audit.test.ts). But the clause names three fields ("A finding's title, deliverable and evidence") and title is untouched: `current = { title: value ?? '', ... }` at scripts/tasks/audit.ts:194 is not trimmed, and filedFindings (scripts/tasks/audit.ts:339-361) checks severity/deliverable/evidence for truthiness but has no check on finding.title at all — not even the pre-existing untrimmed guard c4 says "is already correct" for the other two fields. Reproduced: `npm run inspect -- "(async () => { const m = await load('scripts/tasks/audit.ts'); const p = m.parseAuditArgs(['demo-spec','--finding','   ','--severity','high','--deliverable','fix it','--evidence','observed']); return JSON.stringify(p.findings); })()"` -> `[{"title":"   ", ... }]`, and a follow-on `tasks audit` call with this finding would file a task titled "   " into the store with no refusal at all. Filed as a finding below.
- proof 5: met — LOOKS_LIKE_SLUG (scripts/tasks/audit.ts:234) matches slugify's own output shape, and the remedy sentence (scripts/tasks/audit.ts:252) is appended only when the offending line matches it, naming both the diagnosis ("if \"<line>\" is the spec slug") and the fix ("it belongs on the command line: npm run tasks -- audit <line> --args-from <label>"). A non-slug-shaped line (e.g. a sentence with spaces) gets no remedy appended, per "c5: says nothing about a slug when the offending line does not look like one" (scripts/tasks/audit.test.ts). Mutation-verified: forcing `remedy` to always be `''` KILLED "c5: names the command-line fix when the offending line looks like a bare spec slug" (scripts/tasks/audit.test.ts).

### Pass 2 — 2026-08-08

- base: `fbf475fe1786cc51ccb1a2c7f1f3619ed5006d2a`
- head: `6abee22f482c2bb043061439c6bf5dca2a72f073`
- proof 1: met — Re-ran pass 1's corpus survey at this branch's current head and got the identical numbers: 258 vitest-prefixed proof: targets across docs/specs/*.md, 237 resolved, 21 omitted. Reproduce: npm run inspect -- "(async () => { const {readdirSync,readFileSync}=await import('node:fs'); const path=await import('node:path'); const {parseSpecDoc}=await load('scripts/lib/specDoc.ts'); const ap=await load('scripts/tasks/auditPrompt.ts'); const dir=path.join(process.cwd(),'docs','specs'); const targets=readdirSync(dir).filter(n=>n.endsWith('.md')).flatMap(n=>parseSpecDoc(readFileSync(path.join(dir,n),'utf8')).proofClauses.flatMap(c=>c.proofTargets??[])).filter(t=>/^vitest(\s|$)/.test(t)); let r=0,o=0; for (const t of targets){const rs=ap.resolveTarget(t); (rs.some(x=>x.state==='found'||x.state==='moved')?r++:o++);} return JSON.stringify({total:targets.length,r,o});})()" -> {"total":258,"r":237,"o":21}. Read resolveTarget (scripts/tasks/auditPrompt.ts:156-164): a quoted-name target still goes through resolveNamedTarget unchanged from base, and a bare or backtick-wrapped file list goes through parseFileList/resolveFileTests, which is the new form. Own hand-aimed mutation manifest (see pass file's mutation section) reverted the file-list split at auditPrompt.ts:115 (`return body.split(/\s+/);` -> `return [body];`) and it KILLED "c1: a target naming two files, bare or backtick-wrapped, resolves to every test across both" (scripts/tasks/auditPrompt.test.ts) at whole-suite scope (1 failed of 64). This independently reconfirms pass 1's verdict against the current head; nothing regressed between pass 1 and pass 2 on this clause.
- proof 2: met — Same 258-target corpus: 237 resolved + 21 omitted = 258, the total exactly (re-verified above under c1). mutationManifest (scripts/tasks/auditPrompt.ts:334-364) has no early-return path for an unresolved resolution; resolveTarget always returns a non-empty array for a vitest-prefixed target, including {state:'unparseable',...} rather than []. Hand-aimed mutation: reverted the unparseable fallthrough at auditPrompt.ts:162 (`if (files === null) return [{ state: 'unparseable', target }];` -> `return [];`) and it KILLED "c2: a vitest target matching no recognised form is reported as unparseable rather than dropped" (scripts/tasks/auditPrompt.test.ts) at whole-suite scope (1 failed of 64).
- proof 3: met — Enumerated the 6 non-found messages describeResolution (scripts/tasks/auditPrompt.ts:171-186) can print, matching pass 1's enumeration exactly: no-such-file -> "write a target naming a file this checkout has"; nowhere -> "quote the exact title of a test that exists, or drop the quotes to name every test in the file"; unsearchable -> "quote the title exactly as it is written in the file"; no-tests -> "name a file that has at least one `it(...)`, or drop it from the target"; unparseable -> "write `vitest <file> \"<test name>\"` ... or `vitest <file> [<file> ...]`"; moved is excluded (a successful resolution with a redirect note, not a failure). describeResolution is the single place every such message is written (both the manifest's omitted line and the per-clause display note in unresolvedTarget route through it), and its switch has no default with a non-void return, so TypeScript's exhaustiveness check fails tsc on any new state left without a case. Hand-aimed mutation: replaced the unparseable branch's message text at auditPrompt.ts:184 with a form-free string and it KILLED "c3: every reported reason names the target form that would resolve it" (scripts/tasks/auditPrompt.test.ts) at whole-suite scope (1 failed of 64).
- proof 4: met — Pass 1 found this unmet: --deliverable and --evidence were trimmed at assignment and guarded, but title was left untouched (`current = { title: value ?? '', ... }`, no truthiness check in filedFindings), so a whitespace-only --finding title passed silently and would file a task titled "   ". Commit c581de4 closes the gap the same way the other two fields were already closed: title is now trimmed at assignment (audit.ts:194, `current = { title: (value ?? '').trim(), ... }`) and filedFindings refuses an empty title ahead of the severity check (audit.ts:347, `if (!finding.title) return refuse('needs a --finding title, not only whitespace');`). Verified both the unit-level trim and the end-to-end refusal directly: npm run inspect -- "(async () => { const m = await load('scripts/tasks/audit.ts'); const p = m.parseAuditArgs(['demo-spec','--finding','   ','--severity','high','--deliverable','fix it','--evidence','observed']); return JSON.stringify(p.findings); })()" now returns [{"title":"", ...}] (was "   " before the fix), which fails the truthiness guard. Hand-aimed mutation, both lines independently: reverting the trim at audit.ts:194 KILLED "c4: parseAuditArgs strips a finding's title of its outer whitespace" (1 failed of 71, whole-suite scope); removing the guard at audit.ts:347 KILLED "c4: audit refuses a --finding whose title is only whitespace, recording nothing" (1 failed of 71, whole-suite scope) — both in scripts/tasks/audit.test.ts. The clause's three named fields (title, deliverable, evidence) are now all trimmed at assembly and all guarded; no field is left satisfiable by whitespace.
- proof 5: met — Unchanged since pass 1, re-verified at this head. LOOKS_LIKE_SLUG (audit.ts:234) matches slugify's own output shape, and parseAuditFile (audit.ts:246-258) appends the remedy sentence only when the offending first-flag-less line matches it, naming the diagnosis and the fix: `if "<line>" is the spec slug, it belongs on the command line: npm run tasks -- audit <line> --args-from <label>`. A non-slug-shaped line gets no remedy appended. Hand-aimed mutation: forced `remedy` to always be '' at audit.ts:252 and it KILLED "c5: names the command-line fix when the offending line looks like a bare spec slug" (scripts/tasks/audit.test.ts) at whole-suite scope (1 failed of 71).
