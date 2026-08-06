import { existsSync, readFileSync } from 'node:fs';
import { clauseStandings, outstandingSummary, parseSpecDoc } from '../lib/specDoc';
import { ORCHESTRATOR_LESSONS, printLessons } from './briefLessons';
import type { Flags } from './cli';
import { reportUnknownSpec, resolveConfig, specFile } from './context';

// Symmetric with `work-prompt`, `audit-prompt` and `plan-prompt`, and the
// fourth member of that family for the reason `run-an-orchestrator-over-
// three-parallel-tasks` c6 gave: the role is real and has failure modes
// nobody else has, observed rather than imagined. It takes no required
// argument, unlike the other three — an orchestrator is not working one
// spec, it is dispatching across several, so any slug named on the command
// line is a status check, not the subject of the brief.
export function cmdOrchestratePrompt(args: Flags, _usage: string): void {
  const config = resolveConfig(args.flags);
  const slugs = args.positional;

  console.log(`You are orchestrating on branch ${config.branch}.`);
  console.log('');
  printLessons("The orchestrator's lessons — carry them forward:", ORCHESTRATOR_LESSONS);
  console.log('');

  if (slugs.length === 0) {
    console.log('No spec named on the command line. `npm run tasks -- roadmap` answers the same question from any branch: every spec with live members, in dependency order, with its clause standing.');
  } else {
    console.log('Standing of the named spec(s):');
    for (const slug of slugs) {
      const path_ = specFile(config, slug);
      if (!existsSync(path_)) {
        reportUnknownSpec(config, slug, (line) => console.log(line));
        continue;
      }
      const doc = parseSpecDoc(readFileSync(path_, 'utf8'));
      const latest = doc.auditPasses[doc.auditPasses.length - 1];
      console.log(`- ${slug}: ${doc.proofClauses.length} clause(s), ${outstandingSummary(clauseStandings(doc.proofClauses, latest?.verdicts))}`);
    }
  }
  console.log('');
  console.log('Dispatch a worker with `npm run tasks -- work-prompt <id-or-spec>` and an auditor with `npm run tasks -- audit-prompt <spec>` — each is the one instruction, and both print their own brief.');
}
