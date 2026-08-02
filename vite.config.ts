import { existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// scripts/tasks.test.ts's vitest-backed proof-target tests write a fixture
// file under scripts/proof-fixtures for the life of one spawnSync call
// (under a second, measured) and remove it in a `finally`. A file that
// outlives that can only be one an earlier run left behind — Ctrl-C, crash,
// OOM before the `finally` ran. `test.exclude` can't hide that directory
// from npm test instead: exclude suppresses a file even when it's named
// explicitly as a vitest run target, not only during glob discovery
// (verified by hand), so excluding the directory would also stop the
// deliberate single-file invocation from ever finding what it just wrote.
// Sweeping anything old before collection runs is the mechanism actually
// available, gated on VITEST so a plain `vite build`/`dev` never touches it.
function sweepStaleProofFixtures(): void {
  const dir = path.join(import.meta.dirname, 'scripts/proof-fixtures');
  if (!existsSync(dir)) return;
  const now = Date.now();
  for (const name of readdirSync(dir)) {
    const created = Number(/^__proof_fixture_(\d+)_/.exec(name)?.[1]);
    if (!Number.isFinite(created) || now - created > 60_000) rmSync(path.join(dir, name), { force: true });
  }
}
if (process.env.VITEST) sweepStaleProofFixtures();

export default defineConfig({
  // Relative, so the same bundle works under itch.io's subdirectory hosting and
  // inside the Capacitor WebView. An absolute /assets/... 404s under both.
  base: './',
  plugins: [react()],
  server: {
    headers: {
      'Cache-Control': 'no-store',
    },
  },
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,tsup,build}.config.*',
      // Agent-managed worktrees under .claude/ carry their own copies of the
      // repo (including test files); they are separate working trees, not
      // part of this run.
      '**/.claude/worktrees/**',
    ],
  },
});
