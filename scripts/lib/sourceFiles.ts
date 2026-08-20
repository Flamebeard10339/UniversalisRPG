import { spawnSync } from 'node:child_process';
import { normalize } from 'node:path';

export function posix(path: string): string {
  return normalize(path).replace(/\\/g, '/');
}

export function trackedFiles(): string[] {
  const result = spawnSync('git', ['ls-files'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error('git ls-files failed — cannot enumerate tracked files');
  const text = result.stdout.trim();
  return text === '' ? [] : text.split('\n');
}
