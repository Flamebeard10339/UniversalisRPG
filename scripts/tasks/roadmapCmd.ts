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
  lines.push(countLine('unblocked', String(counts.unblocked), 4));
  lines.push(countLine('kind=task', String(counts.unblockedTasks), 6));
  lines.push(countLine('kind=finding', String(counts.unblockedFindings), 6));
  lines.push(countLine('blocked', String(counts.blocked), 4));
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
  lines.push(`  ${String(view.blockedTopics.length).padStart(3)} blocked topics`.padEnd(28) + 'tasks list --deferred --kind task');
  lines.push(`  ${String(counts.unblockedFindings).padStart(3)} open findings`.padEnd(28) + 'tasks list --deferred --kind finding');
  const systems = view.findingsBySystem.map(([system, count]) => `${system} ${count}`);
  for (const line of packed(systems, WIDTH - 6)) lines.push(`      ${line}`);
  return lines;
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

// The question `tasks next` cannot answer: it is spec-scoped and refuses a
// null spec on purpose, so from main there was no view of the deferred
// backlog at all. Reports and exits 0, like every other read.
export function cmdRoadmap(args: Flags): void {
  const config = resolveConfig(args.flags);
  for (const line of renderRoadmap(roadmapView(readStore(config)))) console.log(line);
}
