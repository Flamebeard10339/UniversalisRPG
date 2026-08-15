import { existsSync, readFileSync } from 'node:fs';
import { clauseStandings, outstandingSummary, parseSpecDoc } from '../lib/specDoc';
import { architecture, printWhere } from './architectureCmds';
import { PLANNER_LESSONS, printLessons } from './briefLessons';
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
  console.log("The `[cN]` tag is optional on the way in — an untagged `- ` bullet is auto-numbered on next read — but the number is what an audit pass grades, what a deferral names, and what the spec's own member discharges, so writing it yourself is what keeps every one of those pointed at the clause you mean. Anything that is not a `- ` bullet under a literal `Proof:` line is not a clause: `tasks spec show <slug>` reports its count, and 0 is what a numbered list or a bare paragraph gets.");
  console.log("Every clause carries a `proof:` target on the line below it — `proof: vitest <path>` or `proof: command`. `audit-prompt` builds the mutation manifest from those targets, and a spec of pure prose hands an auditor nothing: 37 recorded occurrences, 25 to 45 minutes of hand-aiming per pass, across at least eight specs. It is the largest measured cost in this repository and it is paid at spec-writing time.");
  console.log("If a clause says *every*, its proof derives its own subjects. A test that enumerates cannot grow when the code does, so an enumerated proof under a universal clause guarantees an audit grades the list rather than the sentence — which is how one clause was graded unmet across six consecutive passes, on a new surface each time.");
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
    console.log(`Spec: ${path_} already exists — ${doc.proofClauses.length} proof clause(s) recorded, ${outstandingSummary(clauseStandings(doc.proofClauses, doc.auditPasses))}.`);
  } else {
    console.log(`No spec file yet at ${path_}. Survey below first; \`tasks spec new ${slug}\` never writes anything but the scaffold, and never before this branch's own capability decisions are on the page.`);
  }
  console.log('');

  console.log("Survey every region this branch will touch before writing the contract — ask by path, not only by name: a path is the same string for everyone, and a capability name is authored prose two people will not choose alike. This runs `tasks where` over each path named below, which is `tasks where`'s own claims and rulings both — everything that has ever written there, and everything ever ruled about it.");
  if (paths.length === 0) {
    console.log(`No paths were named on this command line. Naming none is not the same as surveying nothing: rerun as \`tasks plan-prompt ${slug} <path>...\` once you have even a provisional guess at the regions this branch touches — the survey is what the guess is for.`);
  } else {
    const arch = architecture(config);
    for (const target of paths) {
      console.log('');
      console.log(`--- ${target} ---`);
      printWhere(config, target, arch);
    }
  }
  console.log('');

  printClauseFormat();
  console.log('');

  console.log("Decide, deliberately, which capabilities this branch adds, extends, takes over or retires, and record that reasoning in this spec's `## Decisions` — a survey that finds an owner is a success: reuse it, or write down why a second one is right. A ruling above that argues against the approach you were about to take is a stop, not a data point to work around.");
  console.log('');
  printLessons('What repeated specs had to learn the hard way — carry it forward:', PLANNER_LESSONS);
  console.log('');
  console.log('Then:');
  console.log('3. Register the spec as its own single member — a spec is the unit of work and is never cut into sub-tasks: `tasks add "<title>" --spec <slug> --writes <paths> --produces "<capability>" --discharges c1,c2,...` naming EVERY clause the spec has. Discharge them all: a member discharging none passes the clauses leg of `merge-ready` on nothing, so a missing number is a gate that goes green over a clause nobody answered.');
  console.log('4. `tasks plan` grades the open specs against each other for overlap, unstated dependencies and duplicated interfaces before anyone is dispatched. It reports and refuses nothing.');
  console.log('5. Dispatch a worker with one instruction: run `npm run tasks -- work-prompt <id>` and do what it says.');
}
