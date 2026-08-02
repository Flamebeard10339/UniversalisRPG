import { duplicateClauseIds, stampClauseIds, type SpecDoc } from './specDoc';
import type { Task } from './taskStore';

export interface MergeGateInput {
  // The spec file(s) this branch's own diff — merge-base..HEAD — adds or
  // modifies. Content-derived, not name-derived: a rename cannot change
  // this list, which is what c4 requires and a docs/specs/<branch-name>.md
  // lookup cannot survive. Exactly one candidate is the branch's spec, and
  // the caller loads specExists/doc/deliverableBaseline/members for that
  // one candidate; those fields are ignored below when the list's length
  // is not exactly 1.
  specCandidates: string[];
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

// The refusal conditions from docs/specs/task-system-v2.md's Merge gate
// section, as plain strings rather than an exit code — the caller decides
// how loud to be.
//
// A branch whose diff touches no spec file has made no promise this gate
// can check, so it passes vacuously rather than refusing — this runs on
// every pull_request (rule 9's "It cannot redden main"), and the workflow
// is opt-in per branch: forcing every PR to open a spec first, on pain of
// a red merge gate, is a far heavier requirement than the design describes
// and would turn "the only gate being added" into one that blocks the team
// far more broadly than the timer it replaces ever did.
//
// A branch whose diff touches more than one spec file is ambiguous rather
// than vacuous: picking one candidate over the other — most recently
// edited, alphabetical, whatever — would silently grade the wrong spec, or
// worse, the wrong one on different runs. Report it and let a human split
// the change or say which spec this branch is proving.
export function checkMergeGate(input: MergeGateInput): string[] {
  if (input.specCandidates.length === 0) return [];
  if (input.specCandidates.length > 1) {
    return [`branch's diff touches more than one spec file (${input.specCandidates.join(', ')}) — a branch proves exactly one spec; split the change or resolve which spec this branch is for`];
  }
  const spec = input.specCandidates[0];

  if (!input.specExists || !input.doc) return [`spec file missing: docs/specs/${spec}.md`];

  const issues: string[] = [];
  const doc = input.doc;

  for (const id of duplicateClauseIds(doc.proofClauses)) {
    issues.push(`${spec} tags more than one proof clause [c${id}] — a clause id names exactly one clause`);
  }

  if (doc.auditPasses.length === 0) {
    issues.push(`${spec} has no recorded audit pass`);
  } else {
    const latest = doc.auditPasses[doc.auditPasses.length - 1];
    for (const clause of doc.proofClauses) {
      const verdict = latest.verdicts.find((v) => v.clause === clause.id);
      if (!verdict) issues.push(`proof clause ${clause.id} has no verdict in the latest audit pass (pass ${latest.pass})`);
      else if (verdict.status === 'unmet') issues.push(`proof clause ${clause.id} is unmet as of pass ${latest.pass}`);
    }
    // Both directions, because the walk above never reads a verdict whose
    // clause is gone — which is exactly what renumbering a tag produces.
    for (const verdict of latest.verdicts) {
      if (!doc.proofClauses.some((clause) => clause.id === verdict.clause)) {
        issues.push(`pass ${latest.pass} graded proof clause ${verdict.clause}, which is no longer in the deliverable`);
      }
    }
  }

  // Stamping ids onto a baseline that predates them is the only edit a
  // machine makes to a frozen deliverable, so it is the only difference
  // accepted — a tag altered by hand is drift like any other.
  const baseline = input.deliverableBaseline;
  if (baseline !== null && doc.deliverableSection.trim() !== baseline.trim() && doc.deliverableSection.trim() !== stampClauseIds(baseline).trim()) {
    issues.push(`${spec}'s ## Deliverable text differs from its most recent amendment (or its state at the branch's merge-base, if never amended)`);
  }

  const unreviewed = input.members.filter((task) => task.state === 'unreviewed');
  if (unreviewed.length > 0) issues.push(`finding(s) on ${spec} still unreviewed: ${unreviewed.map((task) => task.id).join(', ')}`);

  const notClosed = input.members.filter((task) => task.state !== 'done' && task.state !== 'declined');
  if (notClosed.length > 0) issues.push(`member(s) of ${spec} neither done nor declined: ${notClosed.map((task) => task.id).join(', ')}`);

  return issues;
}
