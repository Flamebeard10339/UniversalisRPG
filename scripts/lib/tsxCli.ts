import { createRequire } from 'node:module';

export const tsxCli = createRequire(import.meta.url).resolve('tsx/cli');
