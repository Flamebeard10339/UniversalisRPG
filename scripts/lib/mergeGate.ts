import type { SpecDoc } from './specDoc';
import type { Task } from './taskStore';

export interface MergeGateInput {
  spec: string | null;
  specExists: boolean;
  doc: SpecDoc | null;
  // null means "no prior text to compare" — either the merge-base lookup
  // could not run, or the spec file did not exist there (a spec opened on
  // this branch has nothing to have drifted from).
  deliverableAtMergeBase: string | null;
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

  if (doc.auditPasses.length === 0) {
    issues.push(`${input.spec} has no recorded audit pass`);
  } else {
    const latest = doc.auditPasses[doc.auditPasses.length - 1];
    for (const clause of doc.proofClauses) {
      const verdict = latest.verdicts.find((v) => v.clause === clause.index);
      if (!verdict) issues.push(`proof clause ${clause.index} has no verdict in the latest audit pass (pass ${latest.pass})`);
      else if (verdict.status === 'unmet') issues.push(`proof clause ${clause.index} is unmet as of pass ${latest.pass}`);
    }
  }

  if (input.deliverableAtMergeBase !== null && input.deliverableAtMergeBase.trim() !== doc.deliverableSection.trim()) {
    issues.push(`${input.spec}'s ## Deliverable text differs from its state at the branch's merge-base`);
  }

  const unreviewed = input.members.filter((task) => task.state === 'unreviewed');
  if (unreviewed.length > 0) issues.push(`finding(s) on ${input.spec} still unreviewed: ${unreviewed.map((task) => task.id).join(', ')}`);

  const notClosed = input.members.filter((task) => task.state !== 'done' && task.state !== 'declined');
  if (notClosed.length > 0) issues.push(`member(s) of ${input.spec} neither done nor declined: ${notClosed.map((task) => task.id).join(', ')}`);

  return issues;
}
