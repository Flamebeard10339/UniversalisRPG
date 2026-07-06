// Drives the real content editor (via scripts/mod-editor-cli.mjs) to author
// every Tutorial Island module from scripts/tutorialIslandModules.mjs, then
// stages each authored module's JSON (as produced by the app itself) for the
// headless playtest harness. Nothing here writes game content directly.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { tutorialIslandModules } from './tutorialIslandModules.mjs';

const repoRoot = path.join(import.meta.dirname, '..');
const commandsPath = path.join(repoRoot, '.playtests', 'tmp', 'author-commands.json');
const stagedDir = path.join(repoRoot, '.playtests', 'staged-modules');

const commands = [
  { op: 'enableContributionMode' },
  ...tutorialIslandModules.flatMap((module) => [
    { op: 'authorModule', module },
    { op: 'dumpModule', moduleId: module.id },
  ]),
];

await mkdir(path.dirname(commandsPath), { recursive: true });
await writeFile(commandsPath, JSON.stringify(commands, null, 2));

let output;
let cliError;
try {
  output = execFileSync(
    process.execPath,
    ['scripts/mod-editor-cli.mjs', '--commands', path.relative(repoRoot, commandsPath)],
    { cwd: repoRoot, encoding: 'utf8', env: { ...process.env, BASE_URL: process.env.BASE_URL ?? 'http://127.0.0.1:5173/' } },
  );
} catch (error) {
  output = String(error.stdout ?? '');
  cliError = error.stderr ? String(error.stderr) : error.message;
}

// Each `dumpModule` command printed one pretty-printed JSON object to stdout;
// the final summary object is also JSON. Split on the top-level `}\n{` seam.
const jsonBlocks = output
  .split(/(?<=\n\})\n(?=\{)/)
  .map((block) => block.trim())
  .filter(Boolean);

await mkdir(stagedDir, { recursive: true });
const staged = [];
for (const block of jsonBlocks) {
  const parsed = JSON.parse(block);
  if (!parsed || typeof parsed !== 'object' || !parsed.id || !parsed.data) continue;
  await writeFile(path.join(stagedDir, `${parsed.id}.json`), `${JSON.stringify(parsed, null, 2)}\n`);
  staged.push(parsed.id);
}

console.log(JSON.stringify({ ok: !cliError, staged, stagedDir: path.relative(repoRoot, stagedDir), cliError }, null, 2));
if (cliError) process.exitCode = 1;
