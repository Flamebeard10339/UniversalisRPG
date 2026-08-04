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

// The whole prose field on one line, cut at a character budget: store text
// carries no line breaks of its own, so a summary that shortens by line
// shortens nothing.
export function summarize(text: string): string {
  return truncateLine(text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0).join(' '));
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
  if (task.requires.length > 0) lines.push(requiresLine(task, byId));
  if (task.files.length > 0) lines.push(`files: ${task.files.join(', ')}`);
  if (task.writes.length > 0) lines.push(`writes: ${task.writes.join(', ')}`);
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

export function truncateLine(text: string, max = 100): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function printEvidence(evidence: string | null, maxLines = 12): void {
  if (!evidence) return;
  const lines = evidence.split('\n').flatMap((line) => wrapText(line, EVIDENCE_WRAP_WIDTH));
  for (const line of lines.slice(0, maxLines)) console.log(`${EVIDENCE_INDENT}${line}`);
  if (lines.length > maxLines) console.log(`${EVIDENCE_INDENT}… (${lines.length - maxLines} more line(s), see \`tasks show\`)`);
}
