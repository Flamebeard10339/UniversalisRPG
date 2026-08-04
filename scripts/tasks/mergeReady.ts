import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { checkBytes, type ByteFinding } from '../lib/bytes';
import { trackedFiles } from '../lib/sourceFiles';
import type { Flags } from './cli';
import { resolveConfig } from './context';

// The merge gate, spelled once. Every leg here is already required by CI —
// this command exists because every session hand-crafted the same shell
// line, and a hand-crafted gate drifts. It is a runner, not a new gate.
export interface Leg {
  name: string;
  command: string;
}

export const LEGS: Leg[] = [
  { name: 'tsc', command: 'npx tsc --noEmit' },
  { name: 'npm test', command: 'npm test -- --reporter=dot' },
  { name: 'layer-check', command: 'npm run layer-check' },
  { name: 'audit-status', command: 'npm run audit-status' },
  { name: 'doctor', command: 'npm run tasks -- doctor' },
];

export interface LegResult {
  name: string;
  ok: boolean;
  detail: string;
}

export type RunCommand = (command: string) => { status: number | null };

export interface MergeReadyDeps {
  run: RunCommand;
  trackedFiles: () => string[];
  read: (file: string) => Uint8Array | null;
  emit: (line: string) => void;
}

// The decision: run every leg even after one fails — a merge-readiness
// answer that stops at the first red leg costs a rerun per defect — and
// report one line each. Returns false when any leg is red.
export function runMergeReady(deps: MergeReadyDeps): boolean {
  const results: LegResult[] = [];

  for (const leg of LEGS) {
    const { status } = deps.run(leg.command);
    results.push({ name: leg.name, ok: status === 0, detail: status === 0 ? 'pass' : `exit=${status ?? 'null'}` });
  }

  let byteFindings: ByteFinding[];
  try {
    byteFindings = checkBytes(deps.trackedFiles(), deps.read);
  } catch (error) {
    byteFindings = [{ file: '(byte check)', issue: error instanceof Error ? error.message : String(error) }];
  }
  results.push({ name: 'bytes', ok: byteFindings.length === 0, detail: byteFindings.length === 0 ? 'pass — every tracked text file is valid UTF-8 with no NUL bytes' : `${byteFindings.length} corrupted file(s)` });

  for (const result of results) deps.emit(`  ${result.name.padEnd(14)} ${result.ok ? 'ok' : 'FAIL'}  ${result.detail}`);
  for (const finding of byteFindings) deps.emit(`    ${finding.file}: ${finding.issue}`);

  const failed = results.filter((result) => !result.ok);
  deps.emit(failed.length === 0 ? 'merge-ready: every leg passed' : `NOT merge-ready: ${failed.map((result) => result.name).join(', ')} failed`);
  return failed.length === 0;
}

export function cmdMergeReady(args: Flags): void {
  resolveConfig(args.flags);
  console.log('running the merge gate — the same legs CI runs, in order (several minutes):');
  const ok = runMergeReady({
    // shell: npm and npx are .cmd shims on Windows, unreachable without one.
    run: (command) => spawnSync(command, { shell: true, stdio: ['ignore', 'inherit', 'inherit'] }),
    trackedFiles,
    read: (file) => {
      try {
        return readFileSync(file);
      } catch {
        return null;
      }
    },
    emit: (line) => console.log(line),
  });
  if (!ok) process.exitCode = 1;
}
