import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { loadModule, RuntimeError, type GameState } from '../src/game/contentDsl/runtime';
import { apply, startSession, view, wait, type PlayChoice, type PlaySession, type PlayView } from '../src/game/contentDsl/session';

const repoRoot = path.join(import.meta.dirname, '..');
const defaultContent = 'content/tutorial-island.dsl';

export interface CommandResult {
  view?: PlayView;
  output: string[];
  quit: boolean;
}

const HELP_LINES = [
  'Commands:',
  '  <N>          choose option N',
  '  /wait <s>    advance simulated time by <s> seconds',
  '  /state       show location, elapsed sim-time, flags, inventory, xp',
  '  /help        show this help',
  '  /quit, /q    show final state and exit',
];

function formatChoices(choices: PlayChoice[]): string[] {
  return choices.map((choice, index) => {
    const detail = choice.detail ? ` — ${choice.detail}` : '';
    return `  ${index + 1}) ${choice.label}${detail}`;
  });
}

function formatView(v: PlayView): string[] {
  const lines: string[] = [];
  for (const said of v.said) lines.push(said);
  lines.push(`${v.location.title} (${v.location.id})`);
  lines.push(v.location.description);
  if (v.entities.length > 0) lines.push(`Here: ${v.entities.map((entity) => entity.title).join(', ')}`);
  lines.push(...formatChoices(v.choices));
  lines.push(`[time: ${v.time}s]`);
  return lines;
}

function formatState(state: GameState): string[] {
  const inventory = Object.fromEntries(Object.entries(state.inventory).filter(([, count]) => count > 0));
  return [
    `Location: ${state.location}`,
    `Elapsed simulated time: ${state.time}s`,
    `Flags: ${JSON.stringify(state.flags)}`,
    `Inventory: ${JSON.stringify(inventory)}`,
    `XP: ${JSON.stringify(state.xp)}`,
  ];
}

export function handleCommand(session: PlaySession, currentView: PlayView, line: string): CommandResult {
  const trimmed = line.trim();

  if (trimmed === '') {
    return { output: formatChoices(currentView.choices), quit: false };
  }

  if (trimmed === '/help') {
    return { output: HELP_LINES, quit: false };
  }

  if (trimmed === '/state') {
    return { output: formatState(session.state), quit: false };
  }

  if (trimmed === '/quit' || trimmed === '/q') {
    return { output: formatState(session.state), quit: true };
  }

  if (trimmed.startsWith('/wait')) {
    const rest = trimmed.slice('/wait'.length).trim();
    const seconds = Number(rest);
    if (rest === '' || Number.isNaN(seconds) || seconds < 0) {
      return { output: [`Error: /wait requires a non-negative number of seconds, got ${JSON.stringify(rest)}`], quit: false };
    }
    try {
      const next = wait(session, seconds);
      return { view: next, output: formatView(next), quit: false };
    } catch (err) {
      if (err instanceof RuntimeError) return { output: [`Error: ${err.message}`], quit: false };
      throw err;
    }
  }

  if (trimmed.startsWith('/')) {
    return { output: [`Error: unknown command: ${trimmed}`], quit: false };
  }

  const index = Number(trimmed);
  if (!Number.isInteger(index) || index < 1 || index > currentView.choices.length) {
    return { output: [`Error: invalid choice: ${JSON.stringify(trimmed)}`], quit: false };
  }
  const choice = currentView.choices[index - 1];
  try {
    const next = apply(session, choice.id);
    return { view: next, output: formatView(next), quit: false };
  } catch (err) {
    if (err instanceof RuntimeError) return { output: [`Error: ${err.message}`], quit: false };
    throw err;
  }
}

function loadContent(files: string[]): string {
  return files.map((file) => readFileSync(path.resolve(repoRoot, file), 'utf8')).join('\n');
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  const files = (arg ?? defaultContent).split(',').map((file) => file.trim()).filter(Boolean);
  const registry = loadModule(loadContent(files));
  const session = startSession(registry);

  let current = view(session);
  console.log(formatView(current).join('\n'));

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    process.stdout.write('> ');
    for await (const line of rl) {
      const result = handleCommand(session, current, line);
      if (result.output.length > 0) console.log(result.output.join('\n'));
      if (result.view) current = result.view;
      if (result.quit) break;
      process.stdout.write('> ');
    }
  } finally {
    rl.close();
  }
}

const isEntryPoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  main();
}
