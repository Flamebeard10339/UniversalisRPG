import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  applyChoice,
  contextFromBundle,
  createTranslator,
  describeLocation,
  freshState,
  loadStagedBundle,
  visibleChoices,
  type TranscriptEvent,
} from './playtestEngine';
import type { UniversePlayState } from '../src/game/types';

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

const moduleIdsArg = (args: Args) => requireArg(args, 'modules').split(',').map((id) => id.trim()).filter(Boolean);
const moduleDirsArg = (args: Args) => requireArg(args, 'module-dir').split(',').map((dir) => path.resolve(repoRoot, dir.trim())).filter(Boolean);

// Lets a script force a deterministic outcome for chance-based actions:
// --force-random 0 always takes the success branch, --force-random 0.99 always fails.
const randomArg = (args: Args): (() => number) => {
  const value = args.get('force-random');
  if (typeof value !== 'string') return Math.random;
  const fixed = Number(value);
  return () => fixed;
};

const startingState = (bundle: ReturnType<typeof loadStagedBundle>['bundle'], args: Args): UniversePlayState => {
  const base = freshState(bundle);
  const profilePath = args.get('profile');
  if (typeof profilePath !== 'string') return base;
  const overlay = JSON.parse(readFileSync(path.resolve(repoRoot, profilePath), 'utf8')) as Partial<UniversePlayState>;
  return { ...base, ...overlay };
};

const formatChoice = (choice: ReturnType<typeof visibleChoices>[number]) =>
  `- \`${choice.choiceId}\` (${choice.kind}${choice.entityId ? ` on ${choice.entityId}` : ''}): ${choice.title}${choice.requirementsMet ? '' : ' [requirements not met]'}`;

const runScripted = (args: Args) => {
  const moduleDir = moduleDirsArg(args);
  const moduleIds = moduleIdsArg(args);
  const label = requireArg(args, 'label');
  const scriptPath = path.resolve(repoRoot, requireArg(args, 'script'));
  const script = JSON.parse(readFileSync(scriptPath, 'utf8')) as string[];

  const { bundle, issues } = loadStagedBundle(moduleDir, moduleIds);
  const context = contextFromBundle(bundle);
  const t = createTranslator(bundle);
  const random = randomArg(args);
  let state = startingState(bundle, args);

  const lines: string[] = [];
  const problems: string[] = [];
  lines.push(`# Playtest: ${label}`);
  lines.push(`Modules: ${moduleIds.join(', ')}`);
  lines.push(`Mode: ${args.get('profile') ? `from-profile (${args.get('profile')})` : 'from-start'}`);
  lines.push('');

  for (const issue of issues.filter((candidate) => candidate.severity === 'error')) {
    problems.push(`Module load error: ${issue.path} - ${issue.message}`);
  }

  for (const location of bundle.locations) {
    const count = location.entities?.length ?? 0;
    if (count > 5) problems.push(`Location ${location.id} has ${count} entities visible at once (max 5).`);
  }

  for (const choiceId of script) {
    const loc = describeLocation(bundle, state, t);
    lines.push(`## At ${loc.title} (${loc.id})`);
    lines.push(loc.description);
    lines.push(`Entities present (${loc.entityCount}): ${loc.entityNames.join(', ') || 'none'}`);
    const choices = visibleChoices(bundle, context, state, t);
    lines.push('Visible choices:');
    for (const choice of choices) lines.push(formatChoice(choice));

    const matched = choices.find((choice) => choice.choiceId === choiceId);
    if (!matched) {
      problems.push(`Step "${choiceId}" was not a visible choice at ${loc.id}. Visible: ${choices.map((c) => c.choiceId).join(', ') || 'none'}`);
      lines.push(`\n**FAILED STEP**: \`${choiceId}\` was not available here.\n`);
      break;
    }
    if (!matched.requirementsMet) {
      problems.push(`Step "${choiceId}" was visible but its requirements were not met at ${loc.id}.`);
    }

    lines.push(`\n> Chose: \`${choiceId}\` — ${matched.title}\n`);
    const events: TranscriptEvent[] = [];
    state = applyChoice(bundle, context, state, choiceId, t, events, Date.now(), random);
    for (const event of events) lines.push(`  - ${event.text}`);
    lines.push('');
  }

  const finalLoc = describeLocation(bundle, state, t);
  lines.push(`## End state`);
  lines.push(`Location: ${finalLoc.title} (${finalLoc.id})`);
  lines.push(`Flags: ${JSON.stringify(state.flags)}`);
  lines.push(`Inventory: ${JSON.stringify(state.inventory)}`);
  lines.push(`Bank: ${JSON.stringify(state.bank)}`);
  lines.push(`Character name: ${JSON.stringify(state.characterName)}`);
  lines.push(`Spawn location: ${state.spawnLocationId ?? '(default)'}`);
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

const runState = (args: Args) => {
  const moduleDir = moduleDirsArg(args);
  const moduleIds = moduleIdsArg(args);
  const { bundle } = loadStagedBundle(moduleDir, moduleIds);
  const context = contextFromBundle(bundle);
  const t = createTranslator(bundle);
  const statePath = path.resolve(repoRoot, requireArg(args, 'state'));

  let state: UniversePlayState;
  try {
    state = JSON.parse(readFileSync(statePath, 'utf8')) as UniversePlayState;
  } catch {
    state = startingState(bundle, args);
    mkdirSync(path.dirname(statePath), { recursive: true });
    writeFileSync(statePath, JSON.stringify(state));
  }

  const loc = describeLocation(bundle, state, t);
  const choices = visibleChoices(bundle, context, state, t);
  console.log(JSON.stringify({ location: loc, choices }, null, 2));
};

const runStep = (args: Args) => {
  const moduleDir = moduleDirsArg(args);
  const moduleIds = moduleIdsArg(args);
  const { bundle } = loadStagedBundle(moduleDir, moduleIds);
  const context = contextFromBundle(bundle);
  const t = createTranslator(bundle);
  const statePath = path.resolve(repoRoot, requireArg(args, 'state'));
  const choiceId = requireArg(args, 'choice');

  const state = JSON.parse(readFileSync(statePath, 'utf8')) as UniversePlayState;
  const events: TranscriptEvent[] = [];
  const next = applyChoice(bundle, context, state, choiceId, t, events, Date.now(), randomArg(args));
  writeFileSync(statePath, JSON.stringify(next));

  const transcriptPath = args.get('transcript');
  if (typeof transcriptPath === 'string') {
    const resolvedTranscriptPath = path.resolve(repoRoot, transcriptPath);
    mkdirSync(path.dirname(resolvedTranscriptPath), { recursive: true });
    const loc = describeLocation(bundle, next, t);
    const line = `- chose \`${choiceId}\` -> now at ${loc.id}${events.length ? `: ${events.map((e) => e.text).join(' | ')}` : ''}\n`;
    writeFileSync(resolvedTranscriptPath, line, { flag: 'a' });
  }

  console.log(JSON.stringify({ ok: true, events, location: describeLocation(bundle, next, t) }, null, 2));
};

const main = () => {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (command === 'run') return runScripted(args);
  if (command === 'state') return runState(args);
  if (command === 'step') return runStep(args);
  console.log('Usage: tsx scripts/playtest-cli.ts <run|state|step> --modules <ids> --module-dir <dir> ...');
};

main();
