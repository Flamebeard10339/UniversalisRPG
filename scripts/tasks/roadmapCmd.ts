import { roadmapView, type RoadmapView } from '../lib/roadmap';
import type { Flags } from './cli';
import { readStore, resolveConfig } from './context';
import { packGreedy, TERMINAL_WIDTH, truncateLine } from './render';

const SEVERITY_COLUMN = 8;
const ID_COLUMN = 40;
const WAITER_INDENT = ' '.repeat(10);
const SYSTEM_COUNT_SEPARATOR = ' · ';

export function fit(text: string, width: number): string {
  return truncateLine(text, width).padEnd(width);
}

function countLine(label: string, value: string, indent: number): string {
  return `${' '.repeat(indent)}${label.padEnd(28 - indent)}${value.padStart(4)}`;
}

export function renderRoadmap(view: RoadmapView): string[] {
  const { counts } = view;
  const lines: string[] = [];

  const heading = 'ROADMAP';
  const summary = `${counts.total} records · ${counts.heldBySpec} held by a spec`;
  lines.push(`${heading}${summary.padStart(TERMINAL_WIDTH - heading.length)}`);
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
    const id = `${fit(topic.task.id, ID_COLUMN - 1)} `;
    const system = topic.task.system ?? '(no system)';
    lines.push(`  ${severity}${id}${fit(system, TERMINAL_WIDTH - 2 - SEVERITY_COLUMN - ID_COLUMN).trimEnd()}`);
    for (const waiter of topic.unblocks) {
      const also = waiter.alsoWaitsOn.length > 0 ? ` (also waits on ${waiter.alsoWaitsOn.join(', ')})` : '';
      lines.push(`${WAITER_INDENT}${fit(`└─ unblocks ${waiter.id}${also}`, TERMINAL_WIDTH - WAITER_INDENT.length).trimEnd()}`);
    }
  }

  lines.push('');
  lines.push('EXCLUDED FROM THE LIST ABOVE');
  lines.push('');
  lines.push(footerRow(counts.blockedTasks, 'blocked', 'tasks list --deferred --kind task', counts.deferredTasks));
  lines.push(footerRow(counts.deferredFindings, 'findings', 'tasks list --deferred --kind finding', counts.deferredFindings));
  const systems = view.findingsBySystem.map(([system, count]) => `${system} ${count}`);
  for (const line of packGreedy(systems, SYSTEM_COUNT_SEPARATOR, TERMINAL_WIDTH - 6)) lines.push(`      ${line}`);
  if (counts.deferredOther > 0) lines.push(footerRow(counts.deferredOther, 'other kinds', 'tasks list --deferred', counts.deferred));
  return lines;
}

function footerRow(count: number, label: string, command: string, listed: number): string {
  const scope = listed === count ? '' : ` (${listed} listed)`;
  return `  ${String(count).padStart(3)} ${label}${scope} `.padEnd(28) + command;
}

export function cmdRoadmap(args: Flags): void {
  const config = resolveConfig(args.flags);
  for (const line of renderRoadmap(roadmapView(readStore(config)))) console.log(line);
}
