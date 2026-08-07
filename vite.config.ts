import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const exclude = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.{idea,git,cache,output,temp}/**',
  '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,tsup,build}.config.*',
  // Agent-managed worktrees under .claude/ carry their own copies of the
  // repo (including test files); they are separate working trees, not
  // part of this run.
  '**/.claude/worktrees/**',
];

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
    // Every route into the suite reads its clock from here. Until 2026-08-07
    // three of them disagreed: a developer's `npm test` and CI both took
    // vitest's 5000ms default while merge-ready passed --testTimeout=20000,
    // so the gate that exists to predict CI's verdict ran a 4x longer clock
    // than CI and could not reproduce the band it was blind to. That band is
    // where the suite was actually failing.
    maxWorkers: 4,
    projects: [
      {
        extends: true,
        test: { name: 'app', include: ['src/**/*.test.{ts,tsx}'], exclude },
      },
      {
        // These pay real git, real subprocesses and a real temp directory per
        // case, so their duration tracks machine load rather than what they
        // assert: 4794ms is the worst on an idle 24-thread box, against
        // measured contention multipliers of 2.1x for a cold tsx spawn and
        // 4.9x for temp-dir churn. The longer clock and the worker cap are a
        // stopgap, not a fix — spec a-green-run-means-the-tree-is-green
        // removes the per-case cost, and its c8 is the measurement that lets
        // both numbers go.
        extends: true,
        test: { name: 'tools', include: ['scripts/**/*.test.ts'], exclude, testTimeout: 20000 },
      },
    ],
  },
});
