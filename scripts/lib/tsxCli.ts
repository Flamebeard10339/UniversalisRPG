import { createRequire } from 'node:module';

// A worktree under .claude/worktrees/ has no node_modules of its own. Resolving
// upward from this file reaches the main checkout's, the same way every other
// import in the suite already finds its packages.
export const tsxCli = createRequire(import.meta.url).resolve('tsx/cli');
