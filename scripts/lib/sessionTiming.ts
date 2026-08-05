// Where a session's wall clock went: waiting on tools, generating, or waiting
// on a human. The question this answers is whether a slow audit is slow because
// the tools are slow, and no other record in this repo can answer it — the store
// holds what a session decided, never what it cost.
//
// The input is Claude Code's own transcript, which is written whether or not
// anyone intends to measure it. Nothing here asks the session under measurement
// to cooperate, because a session told to log itself is doing two jobs.

export interface ToolUse {
  id: string;
  name: string;
  label: string;
}

export interface TranscriptEntry {
  at: number;
  isUserPrompt: boolean;
  uses: ToolUse[];
  resultIds: string[];
}

export interface ToolCall extends ToolUse {
  startedAt: number;
  endedAt: number | null;
}

// Tool uses issued in one assistant turn run concurrently, so their costs
// overlap. Summing them would report more waiting than the session spent.
export interface Batch {
  startedAt: number;
  endedAt: number;
  calls: ToolCall[];
}

export interface CommandCost {
  label: string;
  name: string;
  waitMs: number;
  count: number;
}

export interface SessionTiming {
  startedAt: number;
  endedAt: number;
  spanMs: number;
  waitMs: number;
  generateMs: number;
  idleMs: number;
  callCount: number;
  unfinished: number;
  byTool: CommandCost[];
  hottest: CommandCost[];
  concentration: number;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

// A `cd "<somewhere>" && ` prefix is how an agent pins its working directory and
// is never what made a command slow; keeping it pushes the real command past the
// width of any report.
export function normalizeCommand(command: string): string {
  return command
    .replace(/^\s*cd\s+(?:"[^"]*"|'[^']*'|\S+)\s*&&\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function labelOf(name: string, input: Record<string, unknown> | null): string {
  if (input === null) return name;
  for (const key of ['command', 'file_path', 'pattern', 'prompt', 'description'] as const) {
    const value = input[key];
    if (typeof value === 'string' && value !== '') return key === 'command' ? normalizeCommand(value) : value.replace(/\s+/g, ' ').trim();
  }
  return name;
}

// A transcript is appended to by a process that can be killed mid-line, so a
// line that will not parse is a line to skip rather than a reason to fail.
export function parseTranscript(text: string): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const entry = asRecord(parsed);
    if (entry === null) continue;
    const at = Date.parse(String(entry.timestamp ?? ''));
    if (Number.isNaN(at)) continue;

    const message = asRecord(entry.message);
    const content = message?.content;
    const uses: ToolUse[] = [];
    const resultIds: string[] = [];
    // A prompt carries its text as a bare string; a tool result arrives in the
    // same `user` slot but as blocks. Only the first is a human waiting.
    const isUserPrompt = entry.type === 'user' && typeof content === 'string' && content.trim() !== '';

    if (Array.isArray(content)) {
      for (const raw of content) {
        const block = asRecord(raw);
        if (block === null) continue;
        if (block.type === 'tool_use' && typeof block.id === 'string') {
          uses.push({ id: block.id, name: String(block.name ?? 'tool'), label: labelOf(String(block.name ?? 'tool'), asRecord(block.input)) });
        }
        if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') resultIds.push(block.tool_use_id);
      }
    }
    entries.push({ at, isUserPrompt, uses, resultIds });
  }
  return entries;
}

export function batchesOf(entries: readonly TranscriptEntry[]): Batch[] {
  const finishedAt = new Map<string, number>();
  for (const entry of entries) for (const id of entry.resultIds) if (!finishedAt.has(id)) finishedAt.set(id, entry.at);

  const batches: Batch[] = [];
  for (const entry of entries) {
    if (entry.uses.length === 0) continue;
    const calls = entry.uses.map((use) => ({ ...use, startedAt: entry.at, endedAt: finishedAt.get(use.id) ?? null }));
    const ends = calls.map((call) => call.endedAt).filter((end): end is number => end !== null);
    batches.push({ startedAt: entry.at, endedAt: ends.length === 0 ? entry.at : Math.max(...ends), calls });
  }
  return batches.sort((a, b) => a.startedAt - b.startedAt);
}

function rank(costs: Map<string, CommandCost>): CommandCost[] {
  return [...costs.values()].sort((a, b) => b.waitMs - a.waitMs);
}

// The gap before a batch is generation time unless a human spoke inside it, in
// which case the session was waiting on a person. Charging that to the model
// would make every interactive session look like it spent an hour thinking.
export function summarize(entries: readonly TranscriptEntry[]): SessionTiming | null {
  const batches = batchesOf(entries);
  if (batches.length === 0) return null;

  const prompts = entries.filter((entry) => entry.isUserPrompt).map((entry) => entry.at);
  const startedAt = batches[0].startedAt;
  const endedAt = Math.max(...batches.map((batch) => batch.endedAt));

  let waitMs = 0;
  let generateMs = 0;
  let idleMs = 0;
  let previousEnd = startedAt;
  for (const batch of batches) {
    const gap = Math.max(0, batch.startedAt - previousEnd);
    if (prompts.some((at) => at >= previousEnd && at <= batch.startedAt)) idleMs += gap;
    else generateMs += gap;
    waitMs += Math.max(0, batch.endedAt - batch.startedAt);
    previousEnd = Math.max(previousEnd, batch.endedAt);
  }

  const byTool = new Map<string, CommandCost>();
  const byCommand = new Map<string, CommandCost>();
  let callCount = 0;
  let unfinished = 0;
  for (const batch of batches) {
    for (const call of batch.calls) {
      callCount += 1;
      if (call.endedAt === null) unfinished += 1;
      const cost = call.endedAt === null ? 0 : call.endedAt - call.startedAt;
      for (const [map, key] of [
        [byTool, call.name],
        [byCommand, call.label],
      ] as const) {
        const seen = map.get(key) ?? { label: key, name: call.name, waitMs: 0, count: 0 };
        map.set(key, { ...seen, waitMs: seen.waitMs + cost, count: seen.count + 1 });
      }
    }
  }

  const hottest = rank(byCommand);
  const topThree = hottest.slice(0, 3).reduce((total, cost) => total + cost.waitMs, 0);
  const measured = hottest.reduce((total, cost) => total + cost.waitMs, 0);

  return {
    startedAt,
    endedAt,
    spanMs: endedAt - startedAt,
    waitMs,
    generateMs,
    idleMs,
    callCount,
    unfinished,
    byTool: rank(byTool),
    hottest,
    concentration: measured === 0 ? 0 : topThree / measured,
  };
}

export const minutes = (ms: number): string => `${(ms / 60000).toFixed(1)}m`;
export const seconds = (ms: number): string => `${Math.round(ms / 1000)}s`;
export const percent = (part: number, whole: number): string => `${whole === 0 ? 0 : Math.round((part / whole) * 100)}%`;

const clock = (at: number): string => new Date(at).toISOString().replace('T', ' ').slice(0, 16);
const clip = (text: string, width: number): string => (text.length <= width ? text : `${text.slice(0, width - 1)}…`);

// Enough of a session id to name one and to pass back as a prefix, which is all
// a 36-character uuid is ever used for here.
export const shortId = (id: string): string => (id.startsWith('agent-') ? id.slice(0, 14) : id.slice(0, 8));

// A shell command says what it is; every other tool needs its name, or a report
// row reads as a bare file path with no hint of what was done to it.
const describe = (cost: CommandCost): string => (cost.name === 'Bash' ? cost.label : `${cost.name}: ${cost.label}`);

export interface SessionRow {
  id: string;
  kind: 'session' | 'subagent';
  parent?: string;
  timing: SessionTiming;
}

export function formatIndex(rows: readonly SessionRow[]): string {
  if (rows.length === 0) return 'no transcripts found for this repository.';
  const lines = ['session               started            span    wait  model   idle  calls  slowest command', ''];
  for (const row of rows) {
    const { timing } = row;
    const name = clip(row.kind === 'subagent' ? `${shortId(row.id)} (sub)` : shortId(row.id), 21);
    lines.push(
      [
        name.padEnd(21),
        clock(timing.startedAt),
        minutes(timing.spanMs).padStart(8),
        percent(timing.waitMs, timing.spanMs).padStart(6),
        percent(timing.generateMs, timing.spanMs).padStart(6),
        percent(timing.idleMs, timing.spanMs).padStart(6),
        String(timing.callCount).padStart(6),
        `  ${clip(timing.hottest[0] === undefined ? '' : describe(timing.hottest[0]), 44)}`,
      ].join(' '),
    );
  }
  lines.push('', 'Pass a session id to break one down. `wait` is time the session sat waiting on a tool;');
  lines.push('a high one is a tooling problem, a high `model` is a reasoning-length problem.');
  return lines.join('\n');
}

export function formatSession(row: SessionRow, topCommands = 8): string {
  const { timing } = row;
  const lines = [
    `${row.id}${row.kind === 'subagent' ? `  (subagent of ${row.parent})` : ''}`,
    `${clock(timing.startedAt)} → ${clock(timing.endedAt)}   ${minutes(timing.spanMs)}   ${timing.callCount} tool calls`,
    '',
    `  waiting on tools  ${minutes(timing.waitMs).padStart(8)}  ${percent(timing.waitMs, timing.spanMs).padStart(4)}`,
    `  model generating  ${minutes(timing.generateMs).padStart(8)}  ${percent(timing.generateMs, timing.spanMs).padStart(4)}`,
    `  waiting on a human${minutes(timing.idleMs).padStart(8)}  ${percent(timing.idleMs, timing.spanMs).padStart(4)}`,
    '',
    'where the waiting went',
  ];
  for (const cost of timing.hottest.slice(0, topCommands)) {
    if (cost.waitMs === 0) break;
    const times = cost.count > 1 ? ` (×${cost.count})` : '';
    lines.push(`  ${seconds(cost.waitMs).padStart(6)}  ${percent(cost.waitMs, timing.waitMs).padStart(4)}  ${clip(describe(cost), 76)}${times}`);
  }
  lines.push('', `the three costliest commands are ${percent(timing.concentration, 1)} of all waiting`);
  lines.push('', 'by tool');
  for (const cost of timing.byTool) lines.push(`  ${cost.name.padEnd(12)} ${String(cost.count).padStart(4)} calls  ${seconds(cost.waitMs).padStart(7)}`);
  if (timing.unfinished > 0) lines.push('', `${timing.unfinished} call(s) never reported a result — the session was interrupted, and their cost is counted as zero.`);
  return lines.join('\n');
}
