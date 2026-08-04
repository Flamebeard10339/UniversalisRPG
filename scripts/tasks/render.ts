import type { AuditVerdict, ProofClause } from '../lib/specDoc';
import { claimSummary, isBlocked, nearMatches, requirementStates, type Task } from '../lib/taskStore';
import { today } from './context';

// Every requirement is printed with why it does or does not hold the task
// up, because "BLOCKED" alone sent readers to the store to find out which
// edge it meant and whether that edge was still live.
export function requiresLine(task: Task, byId: Map<string, Task>): string {
  return `requires: ${requirementStates(task, byId)
    .map((requirement) => `${requirement.id} (${requirement.status})`)
    .join(', ')}`;
}

export type Detail = 'row' | 'brief' | 'full';

export interface RowStyle {
  // Prefixes the row and indents its continuation lines, so a bullet, a
  // list indent and a bare row are the same rendering at three margins.
  indent?: string;
  note?: string;
  withFiles?: boolean;
}

export function taskTag(task: Task): string {
  return [task.kind, task.state, task.severity].filter(Boolean).join('/');
}

// The whole prose field on one line. What separates this from `full` is the
// line breaks, not the words: a stored field carries newlines only where its
// author put them, and a row wants none of them. Every word survives, and the
// terminal soft-wraps what is left — a prose line has no structure under it
// for that wrap to destroy.
export function summarize(text: string): string {
  return text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0).join(' ');
}

// The one rendering of a task, at the three verbosities anything asking for
// one has ever needed: a `row` for a queue or a member list, a `brief`
// record whose prose is summarized, and the `full` record. Every command
// that shows a task goes through here, so a field added to a task appears
// everywhere a task appears, and `[kind/state/severity]` means the same
// thing in all of them.
export function renderTask(task: Task, byId: Map<string, Task>, detail: Detail, style: RowStyle = {}): string[] {
  const blocked = isBlocked(task, byId) ? '  BLOCKED' : '';
  const claim = claimSummary(task, today());

  if (detail === 'row') {
    const indent = style.indent ?? '';
    const note = style.note ? `  ${style.note}` : '';
    const rows = [`${indent}${task.id}  [${taskTag(task)}]${blocked}  ${task.system ?? '(no system)'}  ${task.title}${note}${claim ? `  ${claim}` : ''}`];
    if (style.withFiles && task.files.length > 0) rows.push(`${' '.repeat(indent.length)}    ${task.files.join('   ')}`);
    return rows;
  }

  const prose = detail === 'full' ? (text: string): string => text : summarize;
  const lines = [`${task.id}  [${taskTag(task)}]${blocked}`, task.title];
  if (task.system) lines.push(`system: ${task.system}`);
  lines.push(`spec: ${task.spec ?? '(deferred)'}`);
  if (task.discharges.length > 0) lines.push(`discharges: ${task.discharges.map((clause) => `c${clause}`).join(', ')}`);
  if (task.requires.length > 0) lines.push(requiresLine(task, byId));
  if (task.files.length > 0) lines.push(`files: ${task.files.join(', ')}`);
  // The kind rides with the grant, never on its own line: a reader deciding
  // whether these paths are a promise or a guess is looking at the paths.
  if (task.writes.length > 0) lines.push(`writes (${task.grant ?? 'kind unstated'}): ${task.writes.join(', ')}`);
  if (task.produces.length > 0) lines.push(`produces: ${task.produces.join(', ')}`);
  if (task.deliverable || task.evidence) lines.push('');
  if (task.deliverable) lines.push(`deliverable: ${prose(task.deliverable)}`);
  if (task.evidence) lines.push(`evidence: ${prose(task.evidence)}`);
  if (task.source) lines.push(`source: ${task.source.spec} pass ${task.source.pass}`);
  if (task.reason) lines.push(`reason: ${prose(task.reason)}`);
  if (task.closed) lines.push(`closed: ${task.closed}`);
  if (task.closedCommit) lines.push(`closedCommit: ${task.closedCommit}`);
  if (claim) lines.push(claim);
  return lines;
}

export function printTask(task: Task, byId: Map<string, Task>, detail: Detail): void {
  for (const line of renderTask(task, byId, detail)) console.log(line);
}

export function printRow(task: Task, byId: Map<string, Task>, style: RowStyle = {}): void {
  for (const line of renderTask(task, byId, 'row', style)) console.log(line);
}

// A read answers the question it was asked even when the id resolves to
// nothing — "no such task" plus the five nearest ids is an answer, and exits
// 0. A write has nothing to write to, so the same text is an error.
export function reportUnknownIds(ids: string[], tasks: Task[], emit: (line: string) => void): void {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  emit(`no such task${ids.length === 1 ? '' : '(s)'}: ${ids.join(', ')}`);
  for (const id of ids) {
    const near = nearMatches(id, tasks);
    if (near.length === 0) {
      emit(`  ${id}: no near match among ${tasks.length} record(s) — \`tasks list\` or \`tasks search <term>\` to browse`);
      continue;
    }
    emit(`  ${id} — did you mean:`);
    for (const task of near) for (const line of renderTask(task, byId, 'row', { indent: '    ' })) emit(line);
  }
}

export function refuseUnknownIds(ids: string[], tasks: Task[]): void {
  reportUnknownIds(ids, tasks, (line) => console.error(line.startsWith(' ') ? line : `error: ${line}`));
  process.exitCode = 1;
}

export const TERMINAL_WIDTH = 78;

const EVIDENCE_INDENT = '          ';
const EVIDENCE_WRAP_WIDTH = TERMINAL_WIDTH - EVIDENCE_INDENT.length;

export function packGreedy(parts: string[], separator: string, width: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const part of parts) {
    const candidate = current === '' ? part : `${current}${separator}${part}`;
    if (candidate.length > width && current !== '') {
      lines.push(current);
      current = part;
    } else {
      current = candidate;
    }
  }
  if (current !== '') lines.push(current);
  return lines;
}

// Greedy word wrap: text written through `add`/`edit` carries no line
// breaks of its own, so without this every finding's evidence or
// deliverable prints as one unbroken line.
export function wrapText(text: string, width: number): string[] {
  if (text.length <= width) return [text];
  return packGreedy(text.split(' '), ' ', width);
}

// No default: every caller left is writing a stored event note, where the
// bound is the log's own format — one event, one line — and not a guess about
// a terminal. Nothing a reader is shown goes through here.
export function truncateLine(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// A structured line — a tree branch, a numbered clause, a column row — is
// destroyed by the terminal's own soft wrap, which restarts at column 0 and
// makes a continuation look like a new entry. So a line too long for the
// report continues under its own structure instead. Nothing is cut: a word
// wider than the budget keeps its line whole rather than losing its tail.
export const MIN_WRAP_WIDTH = 24;

export function wrapUnder(text: string, first: string, hanging = ' '.repeat(first.length)): string[] {
  // Budgeted against whichever prefix is wider, because every line but the
  // first carries the hanging one: budgeting from `first` alone put a
  // 60-character hanging indent on top of a full-width line and returned a
  // 134-character line. No caller trips it today — five of them pass a
  // hanging indent no wider than their first — so the invariant this
  // function's shape implies held by coincidence.
  const [head, ...rest] = wrapText(text, Math.max(TERMINAL_WIDTH - Math.max(first.length, hanging.length), MIN_WRAP_WIDTH));
  return [`${first}${head}`, ...rest.map((line) => `${hanging}${line}`)];
}

// One rendering of "this clause stands like this", so `spec show` and
// `handoff` quote a clause identically. The number and the verdict are the
// structure a wrapped tail must not sit under, or the list stops being one.
export function clauseStandingLines(standing: AuditVerdict, clauses: ProofClause[]): string[] {
  return wrapUnder(clauses.find((clause) => clause.id === standing.clause)!.text, `  ${standing.clause}. [${standing.status}] `);
}

export function printEvidence(evidence: string | null, maxLines = 12): void {
  if (!evidence) return;
  const lines = evidence.split('\n').flatMap((line) => wrapText(line, EVIDENCE_WRAP_WIDTH));
  for (const line of lines.slice(0, maxLines)) console.log(`${EVIDENCE_INDENT}${line}`);
  if (lines.length > maxLines) console.log(`${EVIDENCE_INDENT}… (${lines.length - maxLines} more line(s), see \`tasks show\`)`);
}
