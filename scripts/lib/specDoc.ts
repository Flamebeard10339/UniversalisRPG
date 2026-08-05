export interface ProofClause {
  // A name, not a position: ids need be neither sequential nor in order.
  id: number;
  text: string;
  proofTargets?: string[];
}

// `unmet` is "we checked and it fails"; `unknown` is "nobody looked". They
// are different facts about a clause and no reader of this module may
// collapse them.
export type Verdict = 'met' | 'unmet' | 'unknown';

export const VERDICTS: readonly Verdict[] = ['met', 'unmet', 'unknown'];

export interface AuditVerdict {
  clause: number;
  status: Verdict;
  evidence: string | null;
}

export interface AuditPass {
  pass: number;
  date: string;
  base: string;
  head: string;
  verdicts: AuditVerdict[];
}

export interface SpecDoc {
  deliverableSection: string;
  proofClauses: ProofClause[];
  auditPasses: AuditPass[];
}

function sectionText(lines: string[], heading: string): { text: string; startIndex: number; endIndex: number } | null {
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return null;
  const end = lines.findIndex((line, index) => index > start && /^## /.test(line));
  const endIndex = end === -1 ? lines.length : end;
  return { text: lines.slice(start, endIndex).join('\n').trimEnd(), startIndex: start, endIndex };
}

const CLAUSE_TAG = /^\[c(\d+)\] (.*)$/;

interface ScannedClause {
  // Only stampClauseIds needs this, and needing it is why scanning is
  // separate from parsing.
  line: number;
  tag: number | null;
  text: string;
  proofTargets: string[];
}

// "Proof:" introduces a bullet list within ## Deliverable; each top-level
// `- ` line is one clause, and any following non-bullet lines are its
// wrapped continuation, joined back into one sentence.
function scanProofClauses(deliverableSection: string): ScannedClause[] {
  const lines = deliverableSection.split('\n');
  const proofIndex = lines.findIndex((line) => line.trim() === 'Proof:');
  if (proofIndex === -1) return [];

  const clauses: ScannedClause[] = [];
  let current: string[] | null = null;
  // A markdown example inside the deliverable — Slice 3 documents `proof:`
  // syntax with one — must not have its own `- ` lines and `proof:` lines
  // read as real clauses and real targets. `fence` holds the open fence's
  // character (` or ~) until a matching close, and every line in between is
  // skipped rather than scanned.
  let fence: string | null = null;
  const flush = (): void => {
    if (current) clauses[clauses.length - 1].text = current.join(' ').trim();
  };
  for (let i = proofIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const fenceMatch = /^(`{3,}|~{3,})/.exec(trimmed);
    if (fence !== null) {
      if (fenceMatch && fenceMatch[1][0] === fence) fence = null;
      continue;
    }
    if (fenceMatch) {
      fence = fenceMatch[1][0];
      continue;
    }

    // A heading ends the clause it follows. Without this a `###` subsection
    // written under the last clause becomes part of that clause's text —
    // which is its identity, what an auditor is asked to grade, and what an
    // undelivered task is titled with.
    if (/^#{1,6}\s/.test(trimmed)) {
      flush();
      current = null;
      continue;
    }

    const bullet = /^- (.*)$/.exec(line);
    const proof = /^proof:\s*(.+)$/.exec(trimmed);
    if (bullet) {
      flush();
      const tagged = CLAUSE_TAG.exec(bullet[1]);
      clauses.push({ line: i, tag: tagged ? Number(tagged[1]) : null, text: '', proofTargets: [] });
      current = [tagged ? tagged[2] : bullet[1]];
    } else if (current && proof) {
      clauses[clauses.length - 1].proofTargets.push(proof[1].trim());
    } else if (current && trimmed !== '') {
      current.push(trimmed);
    }
  }
  flush();
  return clauses;
}

function auditedClauseIds(text: string): number[] {
  return parseAuditPasses(text).flatMap((pass) => pass.verdicts.map((verdict) => verdict.clause));
}

function resolveIds(clauses: ScannedClause[], reserved: number[] = []): number[] {
  const claimed = new Set([...reserved, ...clauses.map((clause) => clause.tag).filter((tag): tag is number => tag !== null)]);
  let next = 1;
  return clauses.map((clause) => {
    if (clause.tag !== null) return clause.tag;
    while (claimed.has(next)) next++;
    claimed.add(next);
    return next;
  });
}

function parseProofClauses(deliverableSection: string, reserved: number[] = []): ProofClause[] {
  const scanned = scanProofClauses(deliverableSection);
  const ids = resolveIds(scanned, reserved);
  return scanned.map((clause, i) => ({
    id: ids[i],
    text: clause.text,
    ...(clause.proofTargets.length > 0 ? { proofTargets: clause.proofTargets } : {}),
  }));
}

// Every reader and writer here anchors regexes to line ends, so a carriage
// return defeats them silently — a CRLF spec reported having no recorded
// passes at all. One normalization at each entry beats a trim per regex.
const lfOnly = (text: string): string => text.replace(/\r\n/g, '\n');

// Turns each clause's id from something derived — position in the list —
// into something written down, which is what rewording and reordering then
// leave alone.
export function stampClauseIds(rawText: string): string {
  const text = lfOnly(rawText);
  const lines = text.split('\n');
  const section = sectionText(lines, '## Deliverable');
  if (!section) return text;

  const scanned = scanProofClauses(section.text);
  const ids = resolveIds(scanned, auditedClauseIds(text));
  const stamped = [...lines];
  scanned.forEach((clause, i) => {
    if (clause.tag !== null) return;
    const at = section.startIndex + clause.line;
    stamped[at] = stamped[at].replace(/^(\s*)- /, `$1- [c${ids[i]}] `);
  });
  return stamped.join('\n');
}

// An id two clauses answer to is worse than no id: every lookup through it
// finds one of them and reports success.
export function duplicateClauseIds(clauses: ProofClause[]): number[] {
  const ids = clauses.map((clause) => clause.id);
  return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
}

const PASS_HEADING = /^### Pass (\d+) — (.+)$/;

function parseAuditPasses(text: string): AuditPass[] {
  const section = sectionText(text.split('\n'), '## Audit passes');
  if (!section) return [];
  const lines = section.text.split('\n');
  const starts: { index: number; pass: number; date: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = PASS_HEADING.exec(lines[i]);
    if (match) starts.push({ index: i, pass: Number(match[1]), date: match[2].trim() });
  }

  return starts.map((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : lines.length;
    const body = lines.slice(start.index + 1, end);
    const base = /^- base: `(.+)`$/;
    const head = /^- head: `(.+)`$/;
    const proof = new RegExp(`^- proof (\\d+): (${VERDICTS.join('|')})(?: — (.*))?$`);
    let baseSha = '';
    let headSha = '';
    const verdicts: AuditVerdict[] = [];
    for (const line of body) {
      const trimmed = line.trim();
      const baseMatch = base.exec(trimmed);
      const headMatch = head.exec(trimmed);
      const proofMatch = proof.exec(trimmed);
      if (baseMatch) baseSha = baseMatch[1];
      else if (headMatch) headSha = headMatch[1];
      else if (proofMatch) verdicts.push({ clause: Number(proofMatch[1]), status: proofMatch[2] as Verdict, evidence: proofMatch[3] ?? null });
    }
    return { pass: start.pass, date: start.date, base: baseSha, head: headSha, verdicts };
  });
}

export function parseSpecDoc(rawText: string): SpecDoc {
  const text = lfOnly(rawText);
  const lines = text.split('\n');
  const deliverable = sectionText(lines, '## Deliverable');
  const deliverableSection = deliverable ? deliverable.text : '';
  return {
    deliverableSection,
    proofClauses: parseProofClauses(deliverableSection, auditedClauseIds(text)),
    auditPasses: parseAuditPasses(text),
  };
}

export function renderAuditPass(pass: AuditPass): string {
  const lines = [`### Pass ${pass.pass} — ${pass.date}`, '', `- base: \`${pass.base}\``, `- head: \`${pass.head}\``];
  for (const verdict of pass.verdicts) {
    const evidence = verdict.evidence ? ` — ${verdict.evidence}` : '';
    lines.push(`- proof ${verdict.clause}: ${verdict.status}${evidence}`);
  }
  return lines.join('\n');
}

// Appends inside the existing `## Audit passes` section if present, else
// creates it at the end of the document — never touches ## Deliverable,
// ## Decisions or ## Open questions, since those are what a human reads.
export function appendAuditPass(rawText: string, pass: AuditPass): string {
  const rendered = renderAuditPass(pass);
  const lines = lfOnly(rawText).trimEnd().split('\n');
  const headingIndex = lines.findIndex((line) => line.trim() === '## Audit passes');
  if (headingIndex === -1) {
    return `${lines.join('\n')}\n\n## Audit passes\n\n${rendered}\n`;
  }
  const nextHeading = lines.findIndex((line, index) => index > headingIndex && /^## /.test(line));
  const insertAt = nextHeading === -1 ? lines.length : nextHeading;
  const before = lines.slice(0, insertAt);
  const after = lines.slice(insertAt);
  const needsBlank = before[before.length - 1]?.trim() !== '';
  return [...before, ...(needsBlank ? [''] : []), rendered, '', ...after].join('\n').trimEnd() + '\n';
}

// A clause the pass never graded is `unknown` — the pass says nothing about
// it, and the reader is owed that as a stated fact rather than an omission.
export function clauseStandings(clauses: ProofClause[], graded: AuditVerdict[] = []): AuditVerdict[] {
  return clauses.map((clause) => graded.find((verdict) => verdict.clause === clause.id) ?? { clause: clause.id, status: 'unknown', evidence: null });
}

// Completeness as names, never as a ratio or a bit: which clause is
// outstanding is the actionable part, and each keeps its own status so
// "nobody looked" is never read as "we checked and it fails".
export function outstandingSummary(verdicts: AuditVerdict[]): string {
  if (verdicts.length === 0) return 'no clause to grade';
  const outstanding = verdicts.filter((verdict) => verdict.status !== 'met');
  if (outstanding.length === 0) return 'no clause outstanding';
  return `outstanding: ${outstanding.map((verdict) => `c${verdict.clause} (${verdict.status})`).join(', ')}`;
}
