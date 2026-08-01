import { duplicateClauseIds, stampClauseIds, type SpecDoc } from './specDoc';
import type { Task } from './taskStore';

export interface MergeGateInput {
  spec: string | null;
  specExists: boolean;
  doc: SpecDoc | null;
  // The text the live ## Deliverable is checked against: the most recent
  // amendment's archived text when the spec has been amended, else its
  // text at the branch's merge-base. null means "no prior text to compare"
  // — no amendment recorded, and either the merge-base lookup could not
  // run or the spec file did not exist there. That second case is the
  // common one, since rule 1 opens one spec per branch on that branch, so
  // an un-amended spec's drift check is a no-op until its first amendment.
  deliverableBaseline: string | null;
  members: Task[];
}

// The five refusal conditions from docs/specs/task-system-v2.md's Merge gate
// section, as plain strings rather than an exit code — the caller decides
// how loud to be.
//
// A branch with no active spec has made no promise this gate can check, so
// it passes vacuously rather than refusing — this runs on every
// pull_request (rule 9's "It cannot redden main"), and the workflow is
// opt-in per branch: forcing every PR to open a spec first, on pain of a
// red merge gate, is a far heavier requirement than the design describes
// and would turn "the only gate being added" into one that blocks the team
// far more broadly than the timer it replaces ever did.
export function checkMergeGate(input: MergeGateInput): string[] {
  if (input.spec === null) return [];
  if (!input.specExists || !input.doc) return [`spec file missing: docs/specs/${input.spec}.md`];

  const issues: string[] = [];
  const doc = input.doc;

  for (const id of duplicateClauseIds(doc.proofClauses)) {
    issues.push(`${input.spec} tags more than one proof clause [c${id}] — a clause id names exactly one clause`);
  }

  if (doc.auditPasses.length === 0) {
    issues.push(`${input.spec} has no recorded audit pass`);
  } else {
    const latest = doc.auditPasses[doc.auditPasses.length - 1];
    for (const clause of doc.proofClauses) {
      const verdict = latest.verdicts.find((v) => v.clause === clause.id);
      if (!verdict) issues.push(`proof clause ${clause.id} has no verdict in the latest audit pass (pass ${latest.pass})`);
      else if (verdict.status === 'unmet') issues.push(`proof clause ${clause.id} is unmet as of pass ${latest.pass}`);
    }
    // The other direction, which is what catches a tag edited after the
    // pass was recorded: renumbering a clause leaves its verdict pointing
    // at nothing, and walking only clauses to verdicts never reads it.
    for (const verdict of latest.verdicts) {
      if (!doc.proofClauses.some((clause) => clause.id === verdict.clause)) {
        issues.push(`pass ${latest.pass} graded proof clause ${verdict.clause}, which is no longer in the deliverable`);
      }
    }
  }

  // Stamping ids onto a baseline that predates them is the one edit a
  // machine makes to a frozen deliverable, so it is the one difference
  // accepted here. A tag altered by hand is the branch rewriting the
  // mapping its own verdicts resolve through, and reads as drift.
  const baseline = input.deliverableBaseline;
  if (baseline !== null && doc.deliverableSection.trim() !== baseline.trim() && doc.deliverableSection.trim() !== stampClauseIds(baseline).trim()) {
    issues.push(`${input.spec}'s ## Deliverable text differs from its most recent amendment (or its state at the branch's merge-base, if never amended)`);
  }

  const unreviewed = input.members.filter((task) => task.state === 'unreviewed');
  if (unreviewed.length > 0) issues.push(`finding(s) on ${input.spec} still unreviewed: ${unreviewed.map((task) => task.id).join(', ')}`);

  const notClosed = input.members.filter((task) => task.state !== 'done' && task.state !== 'declined');
  if (notClosed.length > 0) issues.push(`member(s) of ${input.spec} neither done nor declined: ${notClosed.map((task) => task.id).join(', ')}`);

  return issues;
}
