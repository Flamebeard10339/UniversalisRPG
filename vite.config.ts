import { execFileSync } from 'node:child_process';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Which build a page is. A playtest run recorded against a tree nobody can name is a list of
// findings nobody can check, so the commit rides into the bundle and out again on the run's own
// first line. A checkout without git says so rather than guessing.
function builtFrom(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

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
  define: { __BUILT_FROM__: JSON.stringify(builtFrom()) },
  plugins: [react()],
  server: {
    headers: {
      'Cache-Control': 'no-store',
    },
  },
  test: {
    // Every route into the suite — `npm test`, CI, merge-ready — reads its
    // clock and worker count from here, unqualified, so no route can run a
    // gentler suite than the one it claims to predict.
    //
    // This is how long the runner waits for a test that will never finish, and
    // it is not a budget for how long a test may take. Several agents run this
    // suite on one machine at once, so a wall-clock number tight enough to
    // police a test's cost measures who else was running instead — every red
    // it produced here was a timeout and none was an assertion. What the suite
    // costs is read off the run's own Duration.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    projects: [
      {
        extends: true,
        test: { name: 'app', include: ['src/**/*.test.{ts,tsx}'], exclude },
      },
      {
        extends: true,
        test: { name: 'tools', include: ['scripts/**/*.test.ts'], exclude },
      },
    ],
  },
});
