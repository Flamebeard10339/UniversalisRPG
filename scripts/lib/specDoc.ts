export interface ProofClause {
  // A name, not a position: ids need be neither sequential nor in order.
  id: number;
  text: string;
}

export type Verdict = 'met' | 'unmet';

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

export interface Amendment {
  date: string;
  reason: string;
  // The archived `## Deliverable` section, in the same shape as
  // SpecDoc.deliverableSection — directly comparable to it.
  deliverableText: string;
}

export interface SpecDoc {
  deliverableSection: string;
  proofClauses: ProofClause[];
  auditPasses: AuditPass[];
  amendments: Amendment[];
  baseline: string | null;
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
  const flush = (): void => {
    if (current) clauses[clauses.length - 1].text = current.join(' ').trim();
  };
  for (let i = proofIndex + 1; i < lines.length; i++) {
    const bullet = /^- (.*)$/.exec(lines[i].trim());
    if (bullet) {
      flush();
      const tagged = CLAUSE_TAG.exec(bullet[1]);
      clauses.push({ line: i, tag: tagged ? Number(tagged[1]) : null, text: '' });
      current = [tagged ? tagged[2] : bullet[1]];
    } else if (current && lines[i].trim() !== '') {
      current.push(lines[i].trim());
    }
  }
  flush();
  return clauses;
}

function resolveIds(clauses: ScannedClause[]): number[] {
  const claimed = new Set(clauses.map((clause) => clause.tag).filter((tag): tag is number => tag !== null));
  let next = 1;
  return clauses.map((clause) => {
    if (clause.tag !== null) return clause.tag;
    while (claimed.has(next)) next++;
    claimed.add(next);
    return next;
  });
}

function parseProofClauses(deliverableSection: string): ProofClause[] {
  const scanned = scanProofClauses(deliverableSection);
  const ids = resolveIds(scanned);
  return scanned.map((clause, i) => ({ id: ids[i], text: clause.text }));
}

// Turns each clause's id from something derived — position in the list —
// into something written down, which is what rewording and reordering then
// leave alone.
export function stampClauseIds(text: string): string {
  const lines = text.split('\n');
  const section = sectionText(lines, '## Deliverable');
  if (!section) return text;

  const scanned = scanProofClauses(section.text);
  const ids = resolveIds(scanned);
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
    const proof = /^- proof (\d+): (met|unmet)(?: — (.*))?$/;
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

const AMENDMENT_HEADING = /^### (\d{4}-\d{2}-\d{2}) — (.+)$/;

// Mirrors parseAuditPasses' shape, but each entry's body is the archived
// `## Deliverable` text — stored with its heading demoted to `#### ` so it
// cannot be mistaken for a real section boundary by sectionText's `^## `
// scan, then promoted back here for the caller.
function parseAmendments(text: string): Amendment[] {
  const section = sectionText(text.split('\n'), '## Amendments');
  if (!section) return [];
  const lines = section.text.split('\n');
  const starts: { index: number; date: string; reason: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = AMENDMENT_HEADING.exec(lines[i]);
    if (match) starts.push({ index: i, date: match[1], reason: match[2].trim() });
  }
  return starts.map((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : lines.length;
    const body = lines
      .slice(start.index + 1, end)
      .join('\n')
      .trim();
    return { date: start.date, reason: start.reason, deliverableText: body.replace(/^#### Deliverable/, '## Deliverable') };
  });
}

function parseBaseline(text: string): string | null {
  const section = sectionText(text.split('\n'), '## Baseline');
  if (!section) return null;
  const body = section.text
    .split('\n')
    .slice(1)
    .join('\n')
    .trim();
  return body ? body.replace(/^#### Deliverable/, '## Deliverable') : null;
}

export function parseSpecDoc(text: string): SpecDoc {
  const deliverable = sectionText(text.split('\n'), '## Deliverable');
  const deliverableSection = deliverable ? deliverable.text : '';
  return {
    deliverableSection,
    proofClauses: parseProofClauses(deliverableSection),
    auditPasses: parseAuditPasses(text),
    amendments: parseAmendments(text),
    baseline: parseBaseline(text),
  };
}

export function renderAuditPass(pass: AuditPass): string {
  const lines = [`### Pass ${pass.pass} — ${pass.date}`, '', `- base: \`${pass.base}\``, `- head: \`${pass.head}\``];
  for (const verdict of pass.verdicts) {
    // Evidence is rendered for any verdict that carries it, met or unmet:
    // this gate exists to stop false completion claims, so a measurement
    // backing a `met` verdict is exactly what should survive, not be
    // thrown away while an `unmet` one is kept.
    const evidence = verdict.evidence ? ` — ${verdict.evidence}` : '';
    lines.push(`- proof ${verdict.clause}: ${verdict.status}${evidence}`);
  }
  return lines.join('\n');
}

// Appends inside the existing `## Audit passes` section if present, else
// creates it at the end of the document — never touches ## Deliverable,
// ## Decisions or ## Open questions, since those are what a human reads.
export function appendAuditPass(text: string, pass: AuditPass): string {
  const rendered = renderAuditPass(pass);
  const lines = text.trimEnd().split('\n');
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

export function renderAmendment(amendment: Amendment): string {
  const demoted = amendment.deliverableText.replace(/^## Deliverable/, '#### Deliverable');
  return [`### ${amendment.date} — ${amendment.reason}`, '', demoted].join('\n');
}

// Same append-or-create shape as appendAuditPass, targeting `## Amendments`
// instead. Never touches ## Deliverable itself — the live section stays
// exactly where and what it was, this only archives a copy of it.
export function appendAmendment(text: string, amendment: Amendment): string {
  const rendered = renderAmendment(amendment);
  const lines = text.trimEnd().split('\n');
  const headingIndex = lines.findIndex((line) => line.trim() === '## Amendments');
  if (headingIndex === -1) {
    return `${lines.join('\n')}\n\n## Amendments\n\n${rendered}\n`;
  }
  const nextHeading = lines.findIndex((line, index) => index > headingIndex && /^## /.test(line));
  const insertAt = nextHeading === -1 ? lines.length : nextHeading;
  const before = lines.slice(0, insertAt);
  const after = lines.slice(insertAt);
  const needsBlank = before[before.length - 1]?.trim() !== '';
  return [...before, ...(needsBlank ? [''] : []), rendered, '', ...after].join('\n').trimEnd() + '\n';
}

export function appendBaseline(text: string, deliverableText: string): string {
  const rendered = ['## Baseline', '', deliverableText.replace(/^## Deliverable/, '#### Deliverable')].join('\n');
  const lines = text.trimEnd().split('\n');
  const headingIndex = lines.findIndex((line) => line.trim() === '## Baseline');
  if (headingIndex !== -1) return text;

  const insertBefore = lines.findIndex((line) => line.trim() === '## Audit passes' || line.trim() === '## Amendments');
  const insertAt = insertBefore === -1 ? lines.length : insertBefore;
  const before = lines.slice(0, insertAt);
  const after = lines.slice(insertAt);
  const needsBlankBefore = before[before.length - 1]?.trim() !== '';
  return [...before, ...(needsBlankBefore ? [''] : []), rendered, '', ...after].join('\n').trimEnd() + '\n';
}
