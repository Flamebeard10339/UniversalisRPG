import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

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
