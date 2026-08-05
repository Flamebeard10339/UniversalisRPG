import { existsSync, readFileSync } from 'node:fs';
import { clauseStandings, outstandingSummary, parseSpecDoc } from '../lib/specDoc';
import { printWhere } from './architectureCmds';
import type { Flags } from './cli';
import { resolveConfig, specFile } from './context';

// The literal shape a clause has to be written in, printed rather than
// trusted to memory: `scanProofClauses` in `lib/specDoc.ts` only reads a
// top-level `- ` bullet under a line that says exactly `Proof:`, and only the
// `[cN]` tag survives rewording. A numbered markdown list (`1. clause`) is
// not a parse error — it is silently zero clauses, which is what sent a
// planner looking for the format inside the parser's own source.
function printClauseFormat(): void {
  console.log("Write proof clauses under `## Deliverable`, as a `Proof:` bullet list — one clause per top-level `- ` line:");
  console.log('  Proof:');
  console.log('  - [c1] a checkable clause');
  console.log('  - [c2] another one, with its own proof: command or proof: vitest target on the line below');
  console.log("The `[cN]` tag is optional on the way in — an untagged `- ` bullet is auto-numbered on next read — but the number is what `--discharges c1,c2` references from a task record, so writing it yourself is what keeps that reference pointed at the clause you mean. Anything that is not a `- ` bullet under a literal `Proof:` line is not a clause: `tasks spec show <slug>` reports its count, and 0 is what a numbered list or a bare paragraph gets.");
}

// The planner's whole brief, symmetric with `work-prompt` and `audit-prompt`:
// neither of those lists commands and trusts the role to run them, and this
// stops being the third one that does. `tasks spec new` used to print step
// 2's survey as text after creating the scaffold — advice, not a run — which
// is what let a planner run the whole documented survey and still miss a
// ruling sitting in a closed record's `reason`.
export function cmdPlanPrompt(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const slug = args.positional[0];
  if (!slug) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  const paths = args.positional.slice(1);

  console.log(`You are planning ${slug} on branch ${config.branch}.`);
  const path_ = specFile(config, slug);
  if (existsSync(path_)) {
    const doc = parseSpecDoc(readFileSync(path_, 'utf8'));
    const latest = doc.auditPasses[doc.auditPasses.length - 1];
    console.log(`Spec: ${path_} already exists — ${doc.proofClauses.length} proof clause(s) recorded, ${outstandingSummary(clauseStandings(doc.proofClauses, latest?.verdicts))}.`);
  } else {
    console.log(`No spec file yet at ${path_}. Survey below first; \`tasks spec new ${slug}\` never writes anything but the scaffold, and never before this branch's own capability decisions are on the page.`);
  }
  console.log('');

  console.log("Survey every region this branch will touch before writing the contract — ask by path, not only by name: a path is the same string for everyone, and a capability name is authored prose two people will not choose alike. This runs `tasks where` over each path named below, which is `tasks where`'s own claims and rulings both — everything that has ever written there, and everything ever ruled about it.");
  if (paths.length === 0) {
    console.log(`No paths were named on this command line. Naming none is not the same as surveying nothing: rerun as \`tasks plan-prompt ${slug} <path>...\` once you have even a provisional guess at the regions this branch touches — the survey is what the guess is for.`);
  } else {
    for (const target of paths) {
      console.log('');
      console.log(`--- ${target} ---`);
      printWhere(config, target);
    }
  }
  console.log('');

  printClauseFormat();
  console.log('');

  console.log("Decide, deliberately, which capabilities this branch adds, extends, takes over or retires, and record that reasoning in this spec's `## Decisions` — a survey that finds an owner is a success: reuse it, or write down why a second one is right. A ruling above that argues against the approach you were about to take is a stop, not a data point to work around.");
  console.log('');
  console.log('Then:');
  console.log('4. Decompose into tasks whose `--writes` regions are disjoint: `tasks add "<title>" --writes <paths> --produces "<capability>" --requires <ids> --discharges c1,c2` — the number after `--discharges` is the one from the `[cN]` tag above.');
  console.log('5. `tasks plan` grades the set for overlap, unstated dependencies and duplicated interfaces before anyone works it. It reports and refuses nothing.');
  console.log('6. Dispatch a worker with one instruction: run `npm run tasks -- work-prompt <id>` and do what it says.');
}
