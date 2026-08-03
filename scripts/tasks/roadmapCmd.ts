import { roadmapView, type RoadmapView } from '../lib/roadmap';
import type { Flags } from './cli';
import { readStore, resolveConfig } from './context';

export const WIDTH = 78;

const SEVERITY_COLUMN = 8;
const ID_COLUMN = 40;
const WAITER_INDENT = ' '.repeat(10);

// Truncating, never wrapping: a wrapped row destroys the column alignment
// that makes two dozen rows scannable in one glance, and the id is a lookup
// key rather than prose — the record verbs take a prefix, so a cut id still
// resolves against the store.
export function fit(text: string, width: number): string {
  return text.length > width ? `${text.slice(0, width - 1)}…` : text.padEnd(width);
}

function countLine(label: string, value: string, indent: number): string {
  return `${' '.repeat(indent)}${label.padEnd(28 - indent)}${value.padStart(4)}`;
}

export function renderRoadmap(view: RoadmapView): string[] {
  const { counts } = view;
  const lines: string[] = [];

  const heading = 'ROADMAP';
  const summary = `${counts.total} records · ${counts.heldBySpec} held by a spec`;
  lines.push(`${heading}${summary.padStart(WIDTH - heading.length)}`);
  lines.push('');
  lines.push(countLine('open, deferred backlog', String(counts.deferred), 2));
  lines.push(countLine('tasks', String(counts.deferredTasks), 4));
  lines.push(countLine('ready', String(counts.readyTasks), 6));
  lines.push(countLine('blocked', String(counts.blockedTasks), 6));
  lines.push(countLine('findings', String(counts.deferredFindings), 4));
  if (counts.deferredOther > 0) lines.push(countLine('other kinds', String(counts.deferredOther), 4));
  lines.push(countLine('unreviewed', String(counts.unreviewed), 2));
  lines.push(countLine('in progress', String(counts.inProgress), 2));
  lines.push('');

  if (view.topics.length === 0) {
    lines.push('NO TOPICS READY — every deferred task is blocked or the backlog is empty');
  } else {
    lines.push(`${view.topics.length} TOPICS READY TO BRANCH ON`);
    lines.push('');
  }

  for (const topic of view.topics) {
    const severity = fit(topic.task.severity ?? '-', SEVERITY_COLUMN);
    // One column narrower than the slot, so a truncated id keeps a space
    // between it and the system rather than running into it.
    const id = `${fit(topic.task.id, ID_COLUMN - 1)} `;
    const system = topic.task.system ?? '(no system)';
    lines.push(`  ${severity}${id}${fit(system, WIDTH - 2 - SEVERITY_COLUMN - ID_COLUMN).trimEnd()}`);
    for (const waiter of topic.unblocks) {
      const also = waiter.alsoWaitsOn.length > 0 ? ` (also waits on ${waiter.alsoWaitsOn.join(', ')})` : '';
      lines.push(`${WAITER_INDENT}${fit(`└─ unblocks ${waiter.id}${also}`, WIDTH - WAITER_INDENT.length).trimEnd()}`);
    }
  }

  lines.push('');
  lines.push('EXCLUDED FROM THE LIST ABOVE');
  lines.push('');
  // Each row's count is what the row is about; the parenthetical is what its
  // command actually returns, which is a superset because no filter narrows
  // to blocked alone. Stating both is what keeps the row honest without
  // widening `tasks list` for this one caller.
  lines.push(footerRow(counts.blockedTasks, `blocked (${counts.deferredTasks} listed)`, 'tasks list --deferred --kind task'));
  lines.push(footerRow(counts.deferredFindings, 'findings', 'tasks list --deferred --kind finding'));
  const systems = view.findingsBySystem.map(([system, count]) => `${system} ${count}`);
  for (const line of packed(systems, WIDTH - 6)) lines.push(`      ${line}`);
  if (counts.deferredOther > 0) lines.push(footerRow(counts.deferredOther, 'other kinds', 'tasks list --deferred'));
  return lines;
}

function footerRow(count: number, label: string, command: string): string {
  return `  ${String(count).padStart(3)} ${label}`.padEnd(28) + command;
}

// The per-system finding counts are the one part of the footer whose length
// is not known ahead of time, so they are packed into as many lines as they
// need rather than cut — a count a reader cannot see is a count that does
// not do its job.
export function packed(parts: string[], width: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const part of parts) {
    const candidate = current === '' ? part : `${current} · ${part}`;
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

export function cmdRoadmap(args: Flags): void {
  const config = resolveConfig(args.flags);
  for (const line of renderRoadmap(roadmapView(readStore(config)))) console.log(line);
}
