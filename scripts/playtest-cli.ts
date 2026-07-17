import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createGameState, loadModule, type GameState } from '../src/game/contentDsl/runtime';
import { apply, startSession, view, type PlayView } from '../src/game/contentDsl/session';

const repoRoot = path.join(import.meta.dirname, '..');
const playtestRoot = path.join(repoRoot, '.playtests');

type Args = Map<string, string | boolean>;

const parseArgs = (argv: string[]): Args => {
  const args: Args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) {
      args.set(key, true);
    } else {
      args.set(key, next);
      index += 1;
    }
  }
  return args;
};

const requireArg = (args: Args, key: string): string => {
  const value = args.get(key);
  if (typeof value !== 'string') throw new Error(`Missing required --${key}`);
  return value;
};

const contentFilesArg = (args: Args) => requireArg(args, 'content').split(',').map((file) => file.trim()).filter(Boolean);

const loadContent = (files: string[]) => {
  const source = files.map((file) => readFileSync(path.resolve(repoRoot, file), 'utf8')).join('\n');
  return loadModule(source);
};

const startingState = (args: Args): GameState => {
  const base = createGameState();
  const statePath = args.get('state');
  if (typeof statePath !== 'string') return base;
  const overlay = JSON.parse(readFileSync(path.resolve(repoRoot, statePath), 'utf8')) as Partial<GameState>;
  return { ...base, ...overlay };
};

const describeView = (v: PlayView, lines: string[]) => {
  lines.push(`## At ${v.location.title} (${v.location.id})`);
  lines.push(v.location.description);
  lines.push(`Entities present (${v.entities.length}): ${v.entities.map((entity) => entity.title).join(', ') || 'none'}`);
  lines.push('Visible choices:');
  for (const choice of v.choices) lines.push(`- \`${choice.id}\` (${choice.kind}): ${choice.label}`);
};

const runScripted = (args: Args) => {
  const contentFiles = contentFilesArg(args);
  const label = requireArg(args, 'label');
  const scriptPath = path.resolve(repoRoot, requireArg(args, 'script'));
  const script = JSON.parse(readFileSync(scriptPath, 'utf8')) as string[];

  const registry = loadContent(contentFiles);
  const session = startSession(registry, startingState(args));

  const lines: string[] = [];
  const problems: string[] = [];
  lines.push(`# Playtest: ${label}`);
  lines.push(`Content: ${contentFiles.join(', ')}`);
  lines.push(`Mode: ${args.get('state') ? `from-state (${args.get('state')})` : 'from-start'}`);
  lines.push('');

  for (const choiceId of script) {
    const current = view(session);
    describeView(current, lines);

    const matched = current.choices.find((choice) => choice.id === choiceId);
    if (!matched) {
      const visible = current.choices.map((choice) => choice.id).join(', ') || 'none';
      problems.push(`Step "${choiceId}" not available at ${current.location.id}. Visible: ${visible}`);
      lines.push(`\n**FAILED STEP**: \`${choiceId}\` was not available here.\n`);
      break;
    }

    lines.push(`\n> Chose: \`${choiceId}\` — ${matched.label}\n`);
    const next = apply(session, choiceId);
    for (const said of next.said) lines.push(`  - ${said}`);
    lines.push('');
  }

  const state = session.state;
  lines.push(`## End state`);
  lines.push(`Location: ${state.location}`);
  lines.push(`Flags: ${JSON.stringify(state.flags)}`);
  lines.push(`Inventory: ${JSON.stringify(state.inventory)}`);
  lines.push(`XP: ${JSON.stringify(state.xp)}`);
  lines.push('');
  lines.push(problems.length === 0 ? 'RESULT: pass' : 'RESULT: fail');
  for (const problem of problems) lines.push(`FEEDBACK: ${problem}`);

  mkdirSync(playtestRoot, { recursive: true });
  const fileName = requireArg(args, 'out');
  const outPath = path.join(playtestRoot, fileName);
  writeFileSync(outPath, `${lines.join('\n')}\n`);
  console.log(JSON.stringify({ ok: problems.length === 0, log: path.relative(repoRoot, outPath), problems }, null, 2));
  if (problems.length > 0) process.exitCode = 1;
};

const main = () => {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (command === 'run') return runScripted(args);
  console.log('Usage: tsx scripts/playtest-cli.ts run --content <file[,file]> --script <path> --label <text> --out <filename> [--state <path>]');
};

main();
